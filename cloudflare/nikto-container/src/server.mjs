import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { promisify } from 'node:util';
import net from 'node:net';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = String(process.env.NIKTO_SHARED_SECRET || '').trim();
const NIKTO_HOME = String(process.env.NIKTO_HOME || '/opt/nikto').trim();
const NIKTO_BINARY = String(process.env.NIKTO_BINARY || `${NIKTO_HOME}/nikto.pl`).trim();
const BUILD_ID = String(process.env.NIKTO_CONTAINER_BUILD || 'dev').trim();
const DEFAULT_TIMEOUT_SECONDS = clampInt(process.env.NIKTO_TIMEOUT_SECONDS, 180, 30, 240);
const MAX_TIMEOUT_SECONDS = clampInt(process.env.NIKTO_MAX_TIMEOUT_SECONDS, 240, 30, 300);
const DEFAULT_TUNING = sanitizeTuning(process.env.NIKTO_TUNING || '123be') || '123be';
const ALLOWED_HOSTS = csv(process.env.NIKTO_ALLOWED_HOSTS || '*');
const DENIED_HOSTS = csv(process.env.NIKTO_DENIED_HOSTS || '');
const MAX_BODY_BYTES = 64 * 1024;

const PRIVATE_IPV4_RANGES = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

const PRIVATE_IPV6_VALUES = new Set(['::', '::1']);

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function textOf(value) {
  return String(value || '').trim();
}

function sanitizeTuning(value) {
  const raw = textOf(value).toLowerCase();
  if (!raw || !/^[0-9a-fx]+$/.test(raw)) return '';
  if (raw.includes('6')) return raw.replace(/6/g, '');
  return raw;
}

function wildcardMatch(pattern, hostname) {
  if (!pattern || pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) || hostname === suffix.slice(1);
  }
  if (!pattern.includes('*')) return hostname === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(hostname);
}

function isPrivateIpv4(ip) {
  return PRIVATE_IPV4_RANGES.some((regex) => regex.test(ip));
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  return PRIVATE_IPV6_VALUES.has(normalized)
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.');
}

function isPrivateOrLocalHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const ipType = net.isIP(normalized);
  if (ipType === 4) return isPrivateIpv4(normalized);
  if (ipType === 6) return isPrivateIpv6(normalized);
  return false;
}

async function assertPublicResolution(hostname) {
  if (net.isIP(hostname)) return;
  let records = [];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return;
  }
  for (const record of records) {
    const address = String(record.address || '').toLowerCase();
    if ((record.family === 4 && isPrivateIpv4(address)) || (record.family === 6 && isPrivateIpv6(address))) {
      throw new Error('private_or_local_target');
    }
  }
}

async function normalizeTargetUrl(rawTarget) {
  const input = textOf(rawTarget);
  if (!input) throw new Error('invalid_target');
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error('invalid_target');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalid_target_protocol');
  if (parsed.username || parsed.password) throw new Error('invalid_target');
  parsed.hash = '';
  if (!parsed.pathname) parsed.pathname = '/';
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || isPrivateOrLocalHost(hostname)) throw new Error('private_or_local_target');
  if (DENIED_HOSTS.some((pattern) => wildcardMatch(pattern, hostname))) throw new Error('denied_target');
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.some((pattern) => wildcardMatch(pattern, hostname))) throw new Error('target_not_allowed');
  await assertPublicResolution(hostname);
  return {
    url: parsed.toString(),
    hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
    tls: parsed.protocol === 'https:',
  };
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

async function getNiktoVersion() {
  try {
    const { stdout, stderr } = await execFileAsync(NIKTO_BINARY, ['-Version'], { timeout: 5000 });
    const raw = `${stdout || ''}\n${stderr || ''}`;
    return raw.match(/\b\d+\.\d+\.\d+\b/)?.[0] || raw.split('\n').map((line) => line.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

function inferSeverity(message, references, id) {
  const raw = `${message || ''} ${references || ''} ${id || ''}`.toLowerCase();
  if (/\b(cve-|remote command|command execution|sql injection|authentication bypass|rce|shell)\b/.test(raw)) return 'high';
  if (/\b(admin|default file|misconfig|directory indexing|backup|credential|password|token|secret|private key)\b/.test(raw)) return 'medium';
  if (/\b(header|disclosure|version|banner|cookie|options method|interesting file)\b/.test(raw)) return 'low';
  return 'info';
}

function inferCategory(message, references) {
  const raw = `${message || ''} ${references || ''}`.toLowerCase();
  if (/\b(admin|console|manager|phpmyadmin)\b/.test(raw)) return 'administrative_console';
  if (/\b(default|misconfig|missing|not set|allowed methods|x-frame-options|content-security-policy)\b/.test(raw)) return 'misconfiguration';
  if (/\b(version|banner|disclosure|leak|path|interesting file|readme|changelog)\b/.test(raw)) return 'information_disclosure';
  if (/\bsoftware|identified|powered by\b/.test(raw)) return 'software_identification';
  return 'web_exposure';
}

function splitReferences(value) {
  return textOf(value)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeFinding(host, finding, index) {
  const message = textOf(finding?.msg || finding?.message || finding?.description);
  const references = textOf(finding?.references || finding?.refs);
  const uri = textOf(finding?.url || finding?.uri || finding?.path) || '/';
  const method = textOf(finding?.method || finding?.httpmethod) || 'GET';
  const id = textOf(finding?.id || finding?.nikto_id || finding?.testid) || `nikto-${index + 1}`;
  return {
    nikto_id: id,
    severity: inferSeverity(message, references, id),
    category: inferCategory(message, references),
    method,
    uri,
    message,
    references: splitReferences(references),
    host: textOf(host?.host || host?.hostname),
    ip: textOf(host?.ip),
    port: Number(host?.port || 0) || null,
    tls: Boolean(Number(host?.tls || 0)) || String(host?.port || '') === '443',
    raw_finding: finding || {},
  };
}

function parseNiktoJson(rawJson) {
  if (!textOf(rawJson)) return { hosts: [], findings: [], warnings: ['nikto_empty_json_output'] };
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'json_parse_failed');
    return { hosts: [], findings: [], warnings: [`nikto_json_parse:${message}`], raw_parse_failed: rawJson.slice(0, 4000) };
  }

  const hosts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.hosts) ? parsed.hosts : [parsed];
  const findings = [];
  for (const host of hosts) {
    const vulnerabilities = Array.isArray(host?.vulnerabilities)
      ? host.vulnerabilities
      : Array.isArray(host?.items)
        ? host.items
        : [];
    vulnerabilities.forEach((finding, index) => findings.push(normalizeFinding(host, finding, findings.length + index)));
  }
  return { hosts, findings, warnings: [] };
}

function buildSummary(findings) {
  const bySeverity = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});
  const byCategory = findings.reduce((acc, finding) => {
    acc[finding.category] = (acc[finding.category] || 0) + 1;
    return acc;
  }, {});
  const maxSeverity = ['critical', 'high', 'medium', 'low', 'info'].find((severity) => bySeverity[severity]) || 'none';
  return { by_severity: bySeverity, by_category: byCategory, max_severity: maxSeverity };
}

function buildArgs(target, body, outputPath) {
  const timeoutSeconds = clampInt(body.timeout_seconds, DEFAULT_TIMEOUT_SECONDS, 30, MAX_TIMEOUT_SECONDS);
  const tuning = sanitizeTuning(body.tuning || DEFAULT_TUNING) || DEFAULT_TUNING;
  const args = [
    '-h',
    target.url,
    '-Format',
    'json',
    '-output',
    outputPath,
    '-nointeractive',
    '-nocheck',
    '-followredirects',
    '-timeout',
    '8',
    '-maxtime',
    String(timeoutSeconds),
    '-Tuning',
    tuning,
    '-Plugins',
    '@@ALL',
    '-Cgidirs',
    'none',
  ];
  return {
    args,
    timeoutSeconds,
    tuning,
    commandSanitized: `${NIKTO_BINARY} ${args.map((arg) => arg === target.url ? '<target_url>' : arg === outputPath ? '<output.json>' : arg).join(' ')}`,
  };
}

async function runScan(body) {
  const startedAt = Date.now();
  const target = await normalizeTargetUrl(body.target_url || body.url || body.target);
  const outputPath = join(tmpdir(), `nikto-${randomUUID()}.json`);
  const { args, timeoutSeconds, tuning, commandSanitized } = buildArgs(target, body, outputPath);
  const warnings = [];
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    const result = await execFileAsync(NIKTO_BINARY, args, {
      timeout: (timeoutSeconds + 30) * 1000,
      maxBuffer: 8 * 1024 * 1024,
      cwd: NIKTO_HOME,
      env: { ...process.env, NIKTOUSERAGENT: 'HiCompliance-SurfaceScan360-Nikto-LAB' },
    });
    stdout = String(result.stdout || '');
    stderr = String(result.stderr || '');
  } catch (error) {
    stdout = String(error?.stdout || '');
    stderr = String(error?.stderr || error?.message || '');
    exitCode = Number(error?.code || (/timeout/i.test(stderr) ? 124 : 1));
    warnings.push(`nikto_exit:${exitCode}`);
  }

  let rawJson = '';
  try {
    rawJson = await fs.readFile(outputPath, 'utf8');
  } catch {
    try {
      rawJson = await fs.readFile(`${outputPath}.json`, 'utf8');
    } catch {
      rawJson = stdout.trim().startsWith('[') || stdout.trim().startsWith('{') ? stdout.trim() : '';
    }
  } finally {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    await fs.rm(`${outputPath}.json`, { force: true }).catch(() => {});
  }

  const parsed = parseNiktoJson(rawJson);
  const combinedWarnings = [
    ...warnings,
    ...parsed.warnings,
    ...String(stderr || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20),
  ];
  const findings = parsed.findings.slice(0, clampInt(body.max_findings, 200, 1, 500));
  return {
    target_url: target.url,
    resolved_target_url: target.url,
    target_host: target.hostname,
    target_port: target.port,
    build_id: BUILD_ID,
    profile: 'lab_safe',
    tuning,
    findings,
    findings_count: findings.length,
    summary: buildSummary(findings),
    warnings: Array.from(new Set(combinedWarnings)).slice(0, 60),
    duration_ms: Date.now() - startedAt,
    nikto_version: await getNiktoVersion(),
    nikto_command_sanitized: commandSanitized,
    exit_code: exitCode,
    raw_result: {
      hosts: parsed.hosts,
      stdout_tail: stdout.split('\n').slice(-20),
      stderr_tail: stderr.split('\n').slice(-20),
      raw_parse_failed: parsed.raw_parse_failed || null,
    },
  };
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    return json(res, 200, { ok: true, build_id: BUILD_ID, nikto_version: await getNiktoVersion() });
  }
  if (req.method !== 'POST' || req.url !== '/nikto/scan') {
    return json(res, 404, { error: 'not_found' });
  }
  if (!SHARED_SECRET) {
    return json(res, 503, { error: 'nikto_shared_secret_not_configured' });
  }
  if (String(req.headers.authorization || '').trim() !== `Bearer ${SHARED_SECRET}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  try {
    const body = await readJsonBody(req);
    const result = await runScan(body);
    return json(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'scan_failed');
    const status = /timeout|aborted/i.test(message) ? 504 : /invalid|private|denied|allowed|required/.test(message) ? 400 : 500;
    return json(res, status, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SurfaceScan360 Nikto container listening on ${PORT}`);
});
