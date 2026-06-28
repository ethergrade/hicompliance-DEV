import {
  IntelXHttpClient,
  type IntelXHttpClientOptions,
} from './intelx-http-client.ts';
import { intelXRecordFingerprint } from './intelx-record-fingerprint.ts';
import { normalizeIntelXScopeSelector } from './intelx-selector.ts';

export interface IntelXSearchRecord extends Record<string, unknown> {
  systemid?: string;
  bucket?: string;
}

interface SearchSubmitResponse {
  id?: string;
  status?: number;
  softselectorwarning?: boolean;
}

interface SearchResultResponse {
  status?: number;
  records?: IntelXSearchRecord[];
}

export interface IntelXSearchResult {
  selector: string;
  records: IntelXSearchRecord[];
  count: number;
  atLeast: boolean;
  terminalStatus: 1;
}

export interface IntelXSearchCount {
  selector: string;
  count: number;
  atLeast: boolean;
}

export interface IntelXSearchAdapterOptions
  extends Omit<IntelXHttpClientOptions, 'service'> {
  maxResults?: number;
  maxPollRounds?: number;
}

export class IntelXSearchContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'IntelXSearchContractError';
    this.code = code;
  }
}

function asRecords(value: unknown): IntelXSearchRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is IntelXSearchRecord => Boolean(entry) && typeof entry === 'object')
    : [];
}

export class IntelXSearchAdapter {
  private readonly client: IntelXHttpClient;
  private readonly maxResults: number;
  private readonly maxPollRounds: number;

  constructor(options: IntelXSearchAdapterOptions) {
    this.maxResults = Math.max(1, Math.min(1000, options.maxResults ?? 1000));
    this.maxPollRounds = Math.max(1, Math.min(60, options.maxPollRounds ?? 12));
    this.client = new IntelXHttpClient({ ...options, service: 'search' });
  }

  async count(selectorInput: string): Promise<IntelXSearchCount> {
    const result = await this.search(selectorInput);
    return {
      selector: result.selector,
      count: result.count,
      atLeast: result.atLeast,
    };
  }

  async search(selectorInput: string): Promise<IntelXSearchResult> {
    const selector = normalizeIntelXScopeSelector(selectorInput).value;
    const submit = await this.client.requestJson<SearchSubmitResponse>(
      '/intelligent/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: selector,
          buckets: [],
          lookuplevel: 0,
          maxresults: this.maxResults,
          timeout: 0,
          datefrom: '',
          dateto: '',
          sort: 2,
          media: 0,
          terminate: [],
        }),
      },
    );

    if (submit.softselectorwarning === true) {
      const submittedId = String(submit.id || '').trim();
      if (submittedId) {
        const params = new URLSearchParams({ id: submittedId });
        await this.client.request(`/intelligent/search/terminate?${params.toString()}`).catch(() => undefined);
      }
      throw new IntelXSearchContractError('intelx_soft_selector_rejected');
    }
    if (submit.status === 1) throw new IntelXSearchContractError('intelx_invalid_term');
    if (submit.status === 2) throw new IntelXSearchContractError('intelx_concurrent_search_limit');
    if (submit.status !== 0 || !String(submit.id || '').trim()) {
      throw new IntelXSearchContractError('intelx_search_submit_invalid_response');
    }

    const searchId = String(submit.id).trim();
    const records: IntelXSearchRecord[] = [];
    const seen = new Set<string>();
    const countsByBucket = new Map<string, number>();
    let terminal = false;

    try {
      for (let round = 0; round < this.maxPollRounds; round += 1) {
        const params = new URLSearchParams({
          id: searchId,
          limit: String(this.maxResults),
        });
        const response = await this.client.requestJson<SearchResultResponse>(
          `/intelligent/search/result?${params.toString()}`,
        );
        const status = Number(response.status);

        for (const record of asRecords(response.records)) {
          const fingerprint = await intelXRecordFingerprint(selector, record, {
            preferSystemId: true,
          });
          if (seen.has(fingerprint)) continue;
          seen.add(fingerprint);
          records.push(record);
          const bucket = String(record.bucket || '').trim().toLowerCase() || '_unknown';
          countsByBucket.set(bucket, (countsByBucket.get(bucket) || 0) + 1);
        }

        if (status === 1) {
          terminal = true;
          break;
        }
        if (status === 2) {
          throw new IntelXSearchContractError('intelx_search_id_not_found');
        }
        if (status !== 0 && status !== 3) {
          throw new IntelXSearchContractError('intelx_search_unknown_status');
        }
      }

      if (!terminal) throw new IntelXSearchContractError('intelx_search_poll_timeout');
    } finally {
      if (!terminal) {
        const params = new URLSearchParams({ id: searchId });
        await this.client.request(`/intelligent/search/terminate?${params.toString()}`).catch(() => undefined);
      }
    }

    const atLeast = [...countsByBucket.values()].some((count) => count >= this.maxResults)
      || (countsByBucket.size === 0 && records.length >= this.maxResults);

    return {
      selector,
      records,
      count: records.length,
      atLeast,
      terminalStatus: 1,
    };
  }
}
