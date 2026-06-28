import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertIntelXBaseUrl,
  IntelXConfigurationError,
  IntelXHttpClient,
  IntelXHttpError,
  type IntelXRuntime,
} from './intelx-http-client.ts';
import {
  IntelXSearchAdapter,
  IntelXSearchContractError,
} from './intelx-search-adapter.ts';
import {
  INTELX_PRIVATE_LEAKS_BUCKET,
  IntelXLeaksAdapter,
  IntelXLeaksContractError,
} from './intelx-leaks-adapter.ts';
import { intelXRecordFingerprint } from './intelx-record-fingerprint.ts';
import { normalizeIntelXScopeSelector } from './intelx-selector.ts';

interface RecordedCall {
  url: URL;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

function fakeRuntime(responses: Array<Response | Error>): {
  runtime: IntelXRuntime;
  calls: RecordedCall[];
  sleeps: number[];
  advance: (ms: number) => void;
} {
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  const sleeps: number[] = [];
  let now = 0;
  return {
    calls,
    sleeps,
    advance: (ms) => {
      now += ms;
    },
    runtime: {
      fetch: async (input, init = {}) => {
        calls.push({ url: new URL(String(input)), init });
        const response = queue.shift();
        if (!response) throw new Error('Unexpected fake IntelX request');
        if (response instanceof Error) throw response;
        return response;
      },
      sleep: (ms) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
      now: () => now,
      random: () => 0,
    },
  };
}

function header(call: RecordedCall, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}

Deno.test('IntelX endpoints are pinned and 4.intelx.io is prohibited', () => {
  assertEquals(assertIntelXBaseUrl('search', 'https://2.intelx.io'), 'https://2.intelx.io');
  assertEquals(assertIntelXBaseUrl('leaks', 'https://3.intelx.io'), 'https://3.intelx.io');
  assertRejects(
    async () => assertIntelXBaseUrl('leaks', 'https://4.intelx.io'),
    IntelXConfigurationError,
  );
});

Deno.test('scope selectors remove a legacy leading @ and preserve bare IPs', () => {
  assertEquals(normalizeIntelXScopeSelector('@Example.COM.'), {
    value: 'example.com',
    type: 'domain',
  });
  assertEquals(normalizeIntelXScopeSelector('203.40.9.1'), {
    value: '203.40.9.1',
    type: 'ipv4',
  });
});

Deno.test('Search adapter follows statuses 3, 0, 1 and counts without exposing details', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'search-1', status: 0, softselectorwarning: false }),
    jsonResponse({ status: 3, records: [] }),
    jsonResponse({ status: 0, records: [
      { systemid: 'A', bucket: 'pastes', name: 'first' },
      { systemid: 'A', bucket: 'pastes', name: 'duplicate' },
    ] }),
    jsonResponse({ status: 1, records: [
      { systemid: 'B', bucket: 'pastes', name: 'last record on terminal status' },
    ] }),
  ]);
  const adapter = new IntelXSearchAdapter({
    apiKey: 'secret-key',
    userAgent: 'HiCompliance-DarkRisk360/2.0',
    maxResults: 2,
    maxPollRounds: 5,
    runtime: fake.runtime,
  });

  const result = await adapter.count('@CereriaTerenzi.com');
  assertEquals(result, { selector: 'cereriaterenzi.com', count: 2, atLeast: true });
  assertEquals(fake.calls.length, 4);
  assertEquals(fake.calls[0].url.origin, 'https://2.intelx.io');
  assertEquals(fake.calls[0].url.pathname, '/intelligent/search');
  const body = JSON.parse(String(fake.calls[0].init.body));
  assertEquals(body.term, 'cereriaterenzi.com');
  assertEquals(body.lookuplevel, 0);
  assertEquals(body.maxresults, 2);
  assertEquals(header(fake.calls[0], 'x-key'), 'secret-key');
  assertEquals(header(fake.calls[0], 'user-agent'), 'HiCompliance-DarkRisk360/2.0');
  assertEquals(fake.calls[0].url.searchParams.get('k'), null);
  assert(fake.sleeps.filter((ms) => ms >= 1000).length >= 3);
});

Deno.test('Search adapter rejects soft selectors and terminates their submitted job', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'soft-job', status: 0, softselectorwarning: true }),
    jsonResponse({ status: 0 }),
  ]);
  const adapter = new IntelXSearchAdapter({
    apiKey: 'key',
    userAgent: 'agent',
    runtime: fake.runtime,
  });
  await assertRejects(
    () => adapter.search('example.com'),
    IntelXSearchContractError,
    'intelx_soft_selector_rejected',
  );
  assertEquals(fake.calls[1].url.pathname, '/intelligent/search/terminate');
});

Deno.test('Search status 2 is a terminal search-id error', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'missing-search', status: 0, softselectorwarning: false }),
    jsonResponse({ status: 2, records: [] }),
    jsonResponse({ status: 0 }),
  ]);
  const adapter = new IntelXSearchAdapter({
    apiKey: 'key',
    userAgent: 'agent',
    runtime: fake.runtime,
  });
  await assertRejects(
    () => adapter.search('example.com'),
    IntelXSearchContractError,
    'intelx_search_id_not_found',
  );
  assertEquals(fake.calls.at(-1)?.url.pathname, '/intelligent/search/terminate');
});

Deno.test('Search deterministic fallback is stable SHA-256 independent of key order', async () => {
  const first = await intelXRecordFingerprint('example.com', { z: 2, a: 'x' });
  const second = await intelXRecordFingerprint('example.com', { a: 'x', z: 2 });
  assertEquals(first, second);
  assert(first.startsWith('example.com|sha256:'));
  assertEquals(first.split(':').at(-1)?.length, 64);
});

Deno.test('Leaks live adapter uses only private bucket, filters responses, and keeps final status-2 records', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'live-1', status: 0 }),
    jsonResponse({ status: 1, records: [] }),
    jsonResponse({ status: 0, records: [
      { linea: 'private', item: { bucket: INTELX_PRIVATE_LEAKS_BUCKET, systemid: 'one' } },
      { linea: 'public', item: { bucket: 'leaks.public.general', systemid: 'two' } },
    ] }),
    jsonResponse({ status: 2, records: [
      { linea: 'final', item: { bucket: INTELX_PRIVATE_LEAKS_BUCKET, systemid: 'three' } },
    ] }),
  ]);
  const adapter = new IntelXLeaksAdapter({
    apiKey: 'identity-key',
    userAgent: 'HiCompliance-DarkRisk360/2.0',
    maxPollRounds: 5,
    runtime: fake.runtime,
  });

  const result = await adapter.searchLines('203.40.9.1');
  assertEquals(result.count, 2);
  assertEquals(result.droppedOutOfBucket, 1);
  assertEquals(result.terminalStatus, 2);
  assertEquals(fake.calls[0].url.origin, 'https://3.intelx.io');
  assertEquals(fake.calls[0].url.pathname, '/live/search/internal');
  assertEquals(fake.calls[0].url.searchParams.get('selector'), '203.40.9.1');
  assertEquals(fake.calls[0].url.searchParams.get('bucket'), INTELX_PRIVATE_LEAKS_BUCKET);
  assertEquals(fake.calls[0].url.searchParams.get('skipinvalid'), 'true');
  assertEquals(fake.calls[0].url.searchParams.get('analyze'), 'false');
  assertEquals(fake.calls[0].url.searchParams.get('k'), null);
  assert(fake.calls.every((call) => call.url.hostname === '3.intelx.io'));
});

Deno.test('Leaks accounts use asynchronous accounts/csv, never accounts/1, and enforce client limit', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'csv-1', status: 0 }),
    jsonResponse({ status: 0, records: [
      { user: 'a@example.com', password: 'one', bucket: INTELX_PRIVATE_LEAKS_BUCKET },
      { user: 'b@example.com', password: 'two', bucket: INTELX_PRIVATE_LEAKS_BUCKET },
    ] }),
    new Response(null, { status: 204 }),
  ]);
  const adapter = new IntelXLeaksAdapter({
    apiKey: 'identity-key',
    userAgent: 'agent',
    limit: 1,
    runtime: fake.runtime,
  });

  const result = await adapter.exportAccounts('@example.com');
  assertEquals(result.count, 1);
  assertEquals(result.capped, true);
  assertEquals(result.terminalStatus, null);
  assertEquals(fake.calls[0].url.pathname, '/accounts/csv');
  assertEquals(fake.calls.at(-1)?.url.pathname, '/live/search/terminate');
  assert(fake.calls.every((call) => call.url.pathname !== '/accounts/1'));
});

Deno.test('Leaks status 3 is a terminal search-id error', async () => {
  const fake = fakeRuntime([
    jsonResponse({ id: 'missing-live', status: 0 }),
    jsonResponse({ status: 3, records: [] }),
    new Response(null, { status: 204 }),
  ]);
  const adapter = new IntelXLeaksAdapter({
    apiKey: 'identity-key',
    userAgent: 'agent',
    runtime: fake.runtime,
  });
  await assertRejects(
    () => adapter.searchLines('example.com'),
    IntelXLeaksContractError,
    'intelx_leaks_search_id_not_found',
  );
  assertEquals(fake.calls.at(-1)?.url.pathname, '/live/search/terminate');
});

Deno.test('HTTP client honors Retry-After for 429 and preserves auth headers', async () => {
  const fake = fakeRuntime([
    jsonResponse({ error: 'rate' }, 429, { 'retry-after': '2' }),
    jsonResponse({ ok: true }),
  ]);
  const client = new IntelXHttpClient({
    apiKey: 'key',
    userAgent: 'agent',
    service: 'search',
    runtime: fake.runtime,
  });
  assertEquals(await client.requestJson('/health'), { ok: true });
  assert(fake.sleeps.includes(2000));
  assertEquals(header(fake.calls[1], 'x-key'), 'key');
  assertEquals(header(fake.calls[1], 'user-agent'), 'agent');
});

Deno.test('HTTP circuit opens immediately on 401 and is shared without exposing the key', async () => {
  const fake = fakeRuntime([
    jsonResponse({ error: 'unauthorized' }, 401),
  ]);
  const options = {
    apiKey: 'top-secret-intelx-key',
    userAgent: 'agent',
    service: 'search' as const,
    circuitCooldownMs: 5000,
    runtime: fake.runtime,
  };
  const firstClient = new IntelXHttpClient(options);
  const secondClient = new IntelXHttpClient(options);

  const firstError = await assertRejects(
    () => firstClient.request('/first'),
    IntelXHttpError,
    'intelx_not_authorized',
  );
  assertEquals(firstError.status, 401);
  const circuitError = await assertRejects(
    () => secondClient.request('/second'),
    IntelXHttpError,
    'intelx_circuit_open',
  );
  assertEquals(circuitError.status, 401);
  assertEquals(fake.calls.length, 1);
  assertEquals(circuitError.message.includes('top-secret-intelx-key'), false);
});

Deno.test('HTTP circuit opens immediately when IntelX credits return 402', async () => {
  const fake = fakeRuntime([
    jsonResponse({ error: 'credits exhausted' }, 402),
  ]);
  const options = {
    apiKey: 'credits-key',
    userAgent: 'agent',
    service: 'search' as const,
    runtime: fake.runtime,
  };
  const client = new IntelXHttpClient(options);
  const creditsError = await assertRejects(
    () => client.request('/credits'),
    IntelXHttpError,
    'intelx_credits_exhausted',
  );
  assertEquals(creditsError.status, 402);
  await assertRejects(
    () => new IntelXHttpClient(options).request('/blocked'),
    IntelXHttpError,
    'intelx_circuit_open',
  );
  assertEquals(fake.calls.length, 1);
});

Deno.test('HTTP circuit opens after three 5xx failures and closes after cooldown', async () => {
  const fake = fakeRuntime([
    jsonResponse({ error: 'one' }, 503),
    jsonResponse({ error: 'two' }, 503),
    jsonResponse({ error: 'three' }, 503),
    jsonResponse({ ok: true }),
  ]);
  const options = {
    apiKey: 'provider-key-5xx',
    userAgent: 'agent',
    service: 'search' as const,
    maxAttempts: 3,
    circuitFailureThreshold: 3,
    circuitCooldownMs: 5000,
    runtime: fake.runtime,
  };
  const client = new IntelXHttpClient(options);

  await assertRejects(
    () => client.request('/unstable'),
    IntelXHttpError,
    'intelx_provider_unavailable',
  );
  assertEquals(fake.calls.length, 3);
  await assertRejects(
    () => new IntelXHttpClient(options).request('/still-open'),
    IntelXHttpError,
    'intelx_circuit_open',
  );
  assertEquals(fake.calls.length, 3);

  fake.advance(5001);
  assertEquals(await client.requestJson('/recovered'), { ok: true });
  assertEquals(fake.calls.length, 4);
});

Deno.test('HTTP circuit counts network failures and suppresses provider calls after threshold', async () => {
  const fake = fakeRuntime([
    new Error('socket failure one'),
    new Error('socket failure two'),
    new Error('socket failure three'),
  ]);
  const options = {
    apiKey: 'provider-key-network',
    userAgent: 'agent',
    service: 'leaks' as const,
    maxAttempts: 3,
    circuitFailureThreshold: 3,
    runtime: fake.runtime,
  };
  const client = new IntelXHttpClient(options);
  const failure = await assertRejects(
    () => client.request('/network-failure'),
    IntelXHttpError,
  );
  assert(
    failure.message === 'intelx_network_error'
      || failure.message === 'intelx_circuit_open',
  );
  assertEquals(fake.calls.length, 3);
  await assertRejects(
    () => new IntelXHttpClient(options).request('/blocked'),
    IntelXHttpError,
    'intelx_circuit_open',
  );
  assertEquals(fake.calls.length, 3);
});
