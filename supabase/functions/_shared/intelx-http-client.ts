export const INTELX_SEARCH_API_ORIGIN = 'https://2.intelx.io';
export const INTELX_LEAKS_API_ORIGIN = 'https://3.intelx.io';

export type IntelXService = 'search' | 'leaks';

export type IntelXFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface IntelXRuntime {
  fetch: IntelXFetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

export interface IntelXHttpClientOptions {
  apiKey: string;
  userAgent: string;
  service: IntelXService;
  baseUrl?: string;
  minRequestIntervalMs?: number;
  maxAttempts?: number;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  runtime?: Partial<IntelXRuntime>;
}

export class IntelXConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntelXConfigurationError';
  }
}

export class IntelXHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(params: {
    status: number;
    message: string;
    retryable: boolean;
    retryAfterMs?: number | null;
  }) {
    super(params.message);
    this.name = 'IntelXHttpError';
    this.status = params.status;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs ?? null;
  }
}

const DEFAULT_RUNTIME: IntelXRuntime = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
};

function resolveRuntime(runtime?: Partial<IntelXRuntime>): IntelXRuntime {
  if (
    runtime?.fetch
    && runtime.sleep
    && runtime.now
    && runtime.random
  ) {
    return runtime as IntelXRuntime;
  }
  return runtime ? { ...DEFAULT_RUNTIME, ...runtime } : DEFAULT_RUNTIME;
}

function expectedOrigin(service: IntelXService): string {
  return service === 'search' ? INTELX_SEARCH_API_ORIGIN : INTELX_LEAKS_API_ORIGIN;
}

export function assertIntelXBaseUrl(service: IntelXService, baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntelXConfigurationError(`Invalid IntelX ${service} API URL`);
  }

  const expected = expectedOrigin(service);
  if (
    parsed.origin !== expected
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search
    || parsed.hash
  ) {
    throw new IntelXConfigurationError(
      `IntelX ${service} API must use ${expected}`,
    );
  }
  return expected;
}

function retryAfterMs(response: Response, nowMs: number): number | null {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}

function statusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'invalid_request';
    case 401:
      return 'not_authorized';
    case 402:
      return 'credits_exhausted';
    case 404:
      return 'not_found';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'provider_unavailable' : 'request_failed';
  }
}

class RequestRateGate {
  private nextStartAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly runtime: IntelXRuntime,
  ) {}

  async waitForTurn(): Promise<void> {
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const waitMs = Math.max(0, this.nextStartAt - this.runtime.now());
      if (waitMs > 0) await this.runtime.sleep(waitMs);
      this.nextStartAt = this.runtime.now() + this.minIntervalMs;
    } finally {
      release();
    }
  }
}

const sharedRateGates = new WeakMap<IntelXRuntime, Map<string, RequestRateGate>>();

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  lastStatus: number;
}

const sharedCircuitStates = new WeakMap<IntelXRuntime, Map<string, CircuitState>>();

function opaqueKeyFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function circuitState(runtime: IntelXRuntime, origin: string, apiKey: string): CircuitState {
  let statesByKey = sharedCircuitStates.get(runtime);
  if (!statesByKey) {
    statesByKey = new Map<string, CircuitState>();
    sharedCircuitStates.set(runtime, statesByKey);
  }
  const stateKey = `${origin}:${opaqueKeyFingerprint(apiKey)}`;
  let state = statesByKey.get(stateKey);
  if (!state) {
    state = { consecutiveFailures: 0, openUntil: 0, lastStatus: 0 };
    statesByKey.set(stateKey, state);
  }
  return state;
}

function sharedRateGate(
  runtime: IntelXRuntime,
  origin: string,
  apiKey: string,
  minIntervalMs: number,
): RequestRateGate {
  let gatesByOrigin = sharedRateGates.get(runtime);
  if (!gatesByOrigin) {
    gatesByOrigin = new Map<string, RequestRateGate>();
    sharedRateGates.set(runtime, gatesByOrigin);
  }
  const gateKey = `${origin}:${opaqueKeyFingerprint(apiKey)}`;
  let gate = gatesByOrigin.get(gateKey);
  if (!gate) {
    gate = new RequestRateGate(minIntervalMs, runtime);
    gatesByOrigin.set(gateKey, gate);
  }
  return gate;
}

export class IntelXHttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly maxAttempts: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitCooldownMs: number;
  private readonly circuit: CircuitState;
  private readonly runtime: IntelXRuntime;
  private readonly rateGate: RequestRateGate;

  constructor(options: IntelXHttpClientOptions) {
    const apiKey = options.apiKey.trim();
    const userAgent = options.userAgent.trim();
    if (!apiKey) throw new IntelXConfigurationError('IntelX API key is required');
    if (!userAgent) throw new IntelXConfigurationError('IntelX User-Agent is required');

    this.baseUrl = assertIntelXBaseUrl(
      options.service,
      options.baseUrl || expectedOrigin(options.service),
    );
    this.apiKey = apiKey;
    this.userAgent = userAgent;
    this.maxAttempts = Math.max(1, Math.min(6, options.maxAttempts ?? 3));
    this.circuitFailureThreshold = Math.max(
      1,
      Math.min(10, options.circuitFailureThreshold ?? 3),
    );
    this.circuitCooldownMs = Math.max(
      1000,
      Math.min(30 * 60 * 1000, options.circuitCooldownMs ?? 60_000),
    );
    this.runtime = resolveRuntime(options.runtime);
    this.circuit = circuitState(this.runtime, this.baseUrl, this.apiKey);
    this.rateGate = sharedRateGate(
      this.runtime,
      this.baseUrl,
      this.apiKey,
      Math.max(1000, options.minRequestIntervalMs ?? 1000),
    );
  }

  async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    try {
      return await response.json() as T;
    } catch {
      throw new IntelXHttpError({
        status: response.status,
        message: 'intelx_invalid_json_response',
        retryable: false,
      });
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== this.baseUrl) {
      throw new IntelXConfigurationError('IntelX request cannot leave the configured API origin');
    }

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      this.assertCircuitClosed();
      await this.rateGate.waitForTurn();
      try {
        const headers = new Headers(init.headers);
        headers.set('x-key', this.apiKey);
        headers.set('User-Agent', this.userAgent);
        const response = await this.runtime.fetch(url, { ...init, headers });
        if (response.ok) {
          this.resetCircuit();
          return response;
        }

        const canRetry = response.status === 429 || response.status >= 500;
        const providerRetryAfter = retryAfterMs(response, this.runtime.now());
        const error = new IntelXHttpError({
          status: response.status,
          message: `intelx_${statusMessage(response.status)}`,
          retryable: canRetry,
          retryAfterMs: providerRetryAfter,
        });
        if (response.status === 401 || response.status === 402) {
          this.openCircuit(response.status);
        } else if (response.status >= 500) {
          this.recordProviderFailure(response.status);
        } else if (response.status !== 429) {
          this.resetCircuit();
        }
        if (!canRetry || attempt === this.maxAttempts - 1) throw error;
        this.assertCircuitClosed();

        const exponentialMs = 1000 * 2 ** attempt;
        const jitterMs = Math.floor(this.runtime.random() * 250);
        await this.runtime.sleep(Math.max(providerRetryAfter ?? 0, exponentialMs + jitterMs));
      } catch (error) {
        if (error instanceof IntelXHttpError) throw error;
        this.recordProviderFailure(0);
        if (attempt === this.maxAttempts - 1) break;
        this.assertCircuitClosed();
        const exponentialMs = 1000 * 2 ** attempt;
        const jitterMs = Math.floor(this.runtime.random() * 250);
        await this.runtime.sleep(exponentialMs + jitterMs);
      }
    }

    throw new IntelXHttpError({
      status: 0,
      message: 'intelx_network_error',
      retryable: true,
    });
  }

  private assertCircuitClosed(): void {
    const now = this.runtime.now();
    if (this.circuit.openUntil > now) {
      throw new IntelXHttpError({
        status: this.circuit.lastStatus,
        message: 'intelx_circuit_open',
        retryable: this.circuit.lastStatus === 0 || this.circuit.lastStatus >= 500,
      });
    }
    if (this.circuit.openUntil > 0) this.resetCircuit();
  }

  private recordProviderFailure(status: number): void {
    this.circuit.consecutiveFailures += 1;
    this.circuit.lastStatus = status;
    if (this.circuit.consecutiveFailures >= this.circuitFailureThreshold) {
      this.openCircuit(status);
    }
  }

  private openCircuit(status: number): void {
    this.circuit.lastStatus = status;
    this.circuit.openUntil = this.runtime.now() + this.circuitCooldownMs;
  }

  private resetCircuit(): void {
    this.circuit.consecutiveFailures = 0;
    this.circuit.openUntil = 0;
    this.circuit.lastStatus = 0;
  }
}
