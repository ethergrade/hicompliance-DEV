import {
  IntelXHttpClient,
  type IntelXHttpClientOptions,
} from './intelx-http-client.ts';
import { intelXRecordFingerprint } from './intelx-record-fingerprint.ts';
import {
  normalizeIntelXAccountSelector,
  normalizeIntelXScopeSelector,
} from './intelx-selector.ts';

export const INTELX_PRIVATE_LEAKS_BUCKET = 'leaks.private.general';

export interface IntelXLeakLineRecord extends Record<string, unknown> {
  linea?: string;
  lineraw?: string;
  positionline?: number;
  positionsize?: number;
  item?: Record<string, unknown>;
}

export interface IntelXLeakedAccount extends Record<string, unknown> {
  user?: string;
  password?: string;
  passwordtype?: string;
  bucket?: string;
  date?: string;
  sourceshort?: string;
  sourcelong?: string;
  systemid?: string;
}

interface LiveSubmitResponse {
  status?: number;
  id?: string;
}

interface LiveResultResponse<T> {
  status?: number;
  records?: T[];
}

export interface IntelXLeaksResult<T> {
  selector: string;
  records: T[];
  count: number;
  droppedOutOfBucket: number;
  capped: boolean;
  terminalStatus: 2 | null;
}

export interface IntelXLeaksAdapterOptions
  extends Omit<IntelXHttpClientOptions, 'service'> {
  limit?: number;
  maxPollRounds?: number;
}

export class IntelXLeaksContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'IntelXLeaksContractError';
    this.code = code;
  }
}

function asRecords<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is T => Boolean(entry) && typeof entry === 'object')
    : [];
}

function lineRecordBucket(record: IntelXLeakLineRecord): string {
  return String(record.item?.bucket || '').trim().toLowerCase();
}

class ExclusiveOperationGate {
  private queue: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

const sharedIdentityOperationGate = new ExclusiveOperationGate();

export class IntelXLeaksAdapter {
  private readonly client: IntelXHttpClient;
  private readonly limit: number;
  private readonly maxPollRounds: number;
  private readonly operationGate = sharedIdentityOperationGate;

  constructor(options: IntelXLeaksAdapterOptions) {
    this.limit = Math.max(1, Math.min(1000, options.limit ?? 1000));
    this.maxPollRounds = Math.max(1, Math.min(120, options.maxPollRounds ?? 30));
    this.client = new IntelXHttpClient({ ...options, service: 'leaks' });
  }

  async searchLines(selectorInput: string): Promise<IntelXLeaksResult<IntelXLeakLineRecord>> {
    const selector = normalizeIntelXScopeSelector(selectorInput).value;
    return await this.operationGate.run(() => this.runJob<IntelXLeakLineRecord>({
      selector,
      submitPath: '/live/search/internal',
      submitParams: {
        selector,
        limit: String(this.limit),
        bucket: INTELX_PRIVATE_LEAKS_BUCKET,
        skipinvalid: 'true',
        analyze: 'false',
      },
      bucketOf: lineRecordBucket,
    }));
  }

  async exportAccounts(selectorInput: string): Promise<IntelXLeaksResult<IntelXLeakedAccount>> {
    const selector = normalizeIntelXAccountSelector(selectorInput);
    return await this.operationGate.run(() => this.runJob<IntelXLeakedAccount>({
      selector,
      submitPath: '/accounts/csv',
      submitParams: {
        selector,
        limit: String(this.limit),
        bucket: INTELX_PRIVATE_LEAKS_BUCKET,
      },
      bucketOf: (record) => String(record.bucket || '').trim().toLowerCase(),
    }));
  }

  private async runJob<T extends Record<string, unknown>>(params: {
    selector: string;
    submitPath: '/live/search/internal' | '/accounts/csv';
    submitParams: Record<string, string>;
    bucketOf: (record: T) => string;
  }): Promise<IntelXLeaksResult<T>> {
    const submitQuery = new URLSearchParams(params.submitParams);
    const submit = await this.client.requestJson<LiveSubmitResponse>(
      `${params.submitPath}?${submitQuery.toString()}`,
    );
    if (submit.status === 2) throw new IntelXLeaksContractError('intelx_leaks_selector_invalid');
    if (submit.status !== 0 || !String(submit.id || '').trim()) {
      throw new IntelXLeaksContractError('intelx_leaks_submit_invalid_response');
    }

    const searchId = String(submit.id).trim();
    const records: T[] = [];
    const seen = new Set<string>();
    let droppedOutOfBucket = 0;
    let capped = false;
    let terminal = false;

    try {
      for (let round = 0; round < this.maxPollRounds; round += 1) {
        const resultQuery = new URLSearchParams({ id: searchId, format: '1' });
        const result = await this.client.requestJson<LiveResultResponse<T>>(
          `/live/search/result?${resultQuery.toString()}`,
        );
        const status = Number(result.status);

        for (const record of asRecords<T>(result.records)) {
          if (params.bucketOf(record) !== INTELX_PRIVATE_LEAKS_BUCKET) {
            droppedOutOfBucket += 1;
            continue;
          }
          const fingerprint = await intelXRecordFingerprint(params.selector, record, {
            preferSystemId: false,
          });
          if (seen.has(fingerprint)) continue;
          seen.add(fingerprint);
          if (records.length >= this.limit) {
            capped = true;
            continue;
          }
          records.push(record);
        }

        if (status === 2) {
          terminal = true;
          break;
        }
        if (status === 3) throw new IntelXLeaksContractError('intelx_leaks_search_id_not_found');
        if (status !== 0 && status !== 1) {
          throw new IntelXLeaksContractError('intelx_leaks_unknown_status');
        }
        if (records.length >= this.limit) {
          capped = true;
          break;
        }
      }

      if (!terminal && !capped) throw new IntelXLeaksContractError('intelx_leaks_poll_timeout');
    } finally {
      if (!terminal) {
        const terminateQuery = new URLSearchParams({ id: searchId });
        await this.client.request(`/live/search/terminate?${terminateQuery.toString()}`).catch(() => undefined);
      }
    }

    return {
      selector: params.selector,
      records,
      count: records.length,
      droppedOutOfBucket,
      capped,
      terminalStatus: terminal ? 2 : null,
    };
  }
}
