import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = String(process.env.AMASS_SHARED_SECRET || '').trim();
const AMASS_BINARY = String(process.env.AMASS_BINARY || 'amass').trim();
const MAX_TIMEOUT_SECONDS = clampInt(process.env.AMASS_MAX_TIMEOUT_SECONDS, 120, 10, 600);
const DEFAULT_TIMEOUT_SECONDS = clampInt(process.env.AMASS_TIMEOUT_SECONDS, 45, 10, MAX_TIMEOUT_SECONDS);
const DEFAULT_MAX_NAMES = clampInt(process.env.AMASS_MAX_NAMES, 250, 1, 500);
const EGRESS_PROXY_MODE = String(process.env.SURFACESCAN_EGRESS_PROXY_MODE || 'direct').trim();
const MAX_BODY_BYTES = 64 * 1024;

const HOSTNAME_REGEX = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;
const IPV4_EXACT_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
const IPV6_REGEX = /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function normalizeDomain(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  if (!normalized || normalized.length > 253) return '';
  if (IPV4_EXACT_REGEX.test(normalized)) return '';
  if (!/^[a-z0-9.-]+$/.test(normalized)) return '';
  if (!normalized.includes('.')) return '';
  if (!normalized.split('.').every((label) => label.length > 0 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'))) {
    return '';
  }
  return normalized;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function getAmassVersion() {
  try {
    const { stdout, stderr } = await execFileAsync(AMASS_BINARY, ['-version'], { timeout: 5000 });
    return String(stdout || stderr || process.env.AMASS_VERSION || '').trim() || null;
  } catch {
    return process.env.AMASS_VERSION || null;
  }
}

function extractResults(text, rootDomain, maxNames) {
  const hostnames = new Set();
  const ips = new Set();
  const normalizedRoot = normalizeDomain(rootDomain);

  for (const match of text.matchAll(HOSTNAME_REGEX)) {
    const host = normalizeDomain(match[0]);
    if (!host) continue;
    if (normalizedRoot && host !== normalizedRoot && !host.endsWith(`.${normalizedRoot}`)) continue;
    hostnames.add(host);
  }
  for (const match of text.matchAll(IPV4_REGEX)) {
    ips.add(match[0].toLowerCase());
  }
  for (const match of text.matchAll(IPV6_REGEX)) {
    ips.add(match[0].toLowerCase());
  }

  return {
    subdomains: Array.from(hostnames).sort().slice(0, maxNames),
    ips: Array.from(ips).sort().slice(0, maxNames),
  };
}

async function runAmass(body) {
  const target = normalizeDomain(body.target);
  const rootDomain = normalizeDomain(body.root_domain || target);
  const timeoutSeconds = clampInt(body.timeout_seconds, DEFAULT_TIMEOUT_SECONDS, 10, MAX_TIMEOUT_SECONDS);
  const maxNames = clampInt(body.max_names, DEFAULT_MAX_NAMES, 1, 500);

  if (!target || !rootDomain) {
    return { status: 400, payload: { error: 'target_and_root_domain_required' } };
  }
  if (body.mode !== 'active_light') {
    return { status: 400, payload: { error: 'unsupported_mode' } };
  }

  const started = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), 'amass-'));
  const timeoutMinutes = Math.max(1, Math.floor(Math.max(60, timeoutSeconds - 5) / 60));
  const args = [
    'enum',
    '-active',
    '-norecursive',
    '-silent',
    '-d',
    rootDomain,
    '-timeout',
    String(timeoutMinutes),
  ];

  try {
    const { stdout, stderr } = await execFileAsync(AMASS_BINARY, args, {
      cwd: workdir,
      timeout: timeoutSeconds * 1000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = extractResults([stdout, stderr].join('\n'), rootDomain, maxNames);
    return {
      status: 200,
      payload: {
        target,
        root_domain: rootDomain,
        mode: 'active_light',
        ...parsed,
        warnings: [],
        duration_ms: Date.now() - started,
        amass_version: await getAmassVersion(),
        egress_proxy: EGRESS_PROXY_MODE,
      },
    };
  } catch (error) {
    const killedByTimeout = error?.killed || /timed out|timeout/i.test(String(error?.message || ''));
    const partialText = [
      error?.stdout || '',
      error?.stderr || '',
    ].join('\n');
    const parsed = extractResults(partialText, rootDomain, maxNames);
    if (parsed.subdomains.length > 0 || parsed.ips.length > 0) {
      return {
        status: 200,
        payload: {
          target,
          root_domain: rootDomain,
          mode: 'active_light',
          ...parsed,
          warnings: [killedByTimeout ? 'amass_timeout_partial_results' : 'amass_error_partial_results'],
          duration_ms: Date.now() - started,
          amass_version: await getAmassVersion(),
          egress_proxy: EGRESS_PROXY_MODE,
        },
      };
    }
    return {
      status: killedByTimeout ? 504 : 502,
      payload: {
        error: killedByTimeout ? 'amass_timeout' : 'amass_execution_failed',
        message: String(error?.message || error).slice(0, 500),
        duration_ms: Date.now() - started,
        egress_proxy: EGRESS_PROXY_MODE,
      },
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        amass_version: await getAmassVersion(),
        egress_proxy: EGRESS_PROXY_MODE,
      });
    }
    if (req.method !== 'POST' || url.pathname !== '/amass/enum') {
      return json(res, 404, { error: 'not_found' });
    }
    if (!SHARED_SECRET) {
      return json(res, 503, { error: 'amass_shared_secret_not_configured' });
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth !== `Bearer ${SHARED_SECRET}`) {
      return json(res, 401, { error: 'unauthorized' });
    }
    const body = await readJsonBody(req);
    const result = await runAmass(body);
    return json(res, result.status, result.payload);
  } catch (error) {
    return json(res, 500, {
      error: 'internal_error',
      message: String(error?.message || error).slice(0, 500),
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SurfaceScan360 Amass container listening on :${PORT}`);
});
