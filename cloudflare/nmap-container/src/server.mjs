import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = String(process.env.NMAP_SHARED_SECRET || '').trim();
const HTTPX_BINARY = String(process.env.HTTPX_BINARY || 'httpx').trim();
const DEFAULT_TIMEOUT_SECONDS = clampInt(process.env.NMAP_TIMEOUT_SECONDS, 60, 10, 180);
const MAX_TIMEOUT_SECONDS = clampInt(process.env.NMAP_MAX_TIMEOUT_SECONDS, 180, 10, 600);
const MAX_CIDR_PREFIX_V4 = clampInt(process.env.NMAP_MAX_CIDR_PREFIX_V4, 28, 24, 32);
const DEFAULT_PROFILE = String(process.env.NMAP_DEFAULT_PROFILE || 'web_top').trim();
const BUILD_ID = String(process.env.NMAP_CONTAINER_BUILD || 'dev').trim();
const ALLOWED_HOSTS = csv(process.env.NMAP_ALLOWED_HOSTS || '*');
const DENIED_HOSTS = csv(process.env.NMAP_DENIED_HOSTS || '');
const MAX_BODY_BYTES = 64 * 1024;

const PROFILE_CONFIG = {
  web_top: {
    description: 'TCP connect scan on common web ports, no scripts.',
    args: ['-sT', '-Pn', '-n', '--open', '-T3', '--max-retries', '1', '-p', '80,443,8080,8443,8000,3000,5000,9443'],
    defaultTimeout: 60,
  },
  tcp_top_100: {
    description: 'TCP connect scan on Nmap top 100 ports, no scripts.',
    args: ['-sT', '-Pn', '-n', '--open', '-T3', '--max-retries', '1', '--top-ports', '100'],
    defaultTimeout: 120,
  },
  service_light: {
    description: 'TCP connect scan with light service/version detection, no vuln scripts.',
    args: ['-sT', '-Pn', '-n', '--open', '-T3', '--max-retries', '1', '-sV', '--version-light', '--version-intensity', '2', '-p', '80,443,8080,8443,8000,3000,5000,9443'],
    defaultTimeout: 120,
  },
  custom_tcp: {
    description: 'TCP connect scan on explicit caller-provided ports, no scripts.',
    args: ['-sT', '-Pn', '-n', '--open', '-T3', '--max-retries', '1'],
    requiresPorts: true,
    defaultTimeout: 90,
  },
};

const PRIVATE_IPV4_RANGES = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
];

const WEB_PORT_PROTOCOLS = {
  80: 'http',
  443: 'https',
  8080: 'http',
  8443: 'https',
  8000: 'http',
  3000: 'http',
  5000: 'http',
  9443: 'https',
};

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

function normalizeTarget(rawTarget) {
  const input = textOf(rawTarget);
  let raw = input;
  if (/^https?:\/\//i.test(input)) {
    try {
      raw = new URL(input).hostname;
    } catch {
      return null;
    }
  }
  raw = raw.toLowerCase();
  if (!raw || raw.length > 253 || raw.includes('@') || raw.includes(':')) return null;
  const cidrMatch = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (cidrMatch) {
    const ip = normalizeIpv4(cidrMatch[1]);
    const prefix = Number(cidrMatch[2]);
    if (!ip || prefix < MAX_CIDR_PREFIX_V4 || prefix > 32) return null;
    return { value: `${ip}/${prefix}`, host: ip, kind: 'ipv4_cidr', prefix };
  }
  const ip = normalizeIpv4(raw);
  if (ip) return { value: ip, host: ip, kind: 'ipv4', prefix: 32 };
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(raw)) {
    return { value: raw, host: raw, kind: 'domain', prefix: null };
  }
  return null;
}

function normalizeIpv4(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4) return '';
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return '';
  return nums.join('.');
}

function isBlockedTarget(target) {
  const host = target.host.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'private_or_local_target';
  if (PRIVATE_IPV4_RANGES.some((regex) => regex.test(host))) return 'private_or_local_target';
  if (DENIED_HOSTS.some((pattern) => wildcardMatch(pattern, host))) return 'denied_target';
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.some((pattern) => wildcardMatch(pattern, host))) return 'target_not_allowed';
  return '';
}

function normalizePorts(value) {
  const raw = textOf(value);
  if (!raw) return '';
  const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length > 128) return '';
  const normalized = [];
  for (const entry of entries) {
    const range = entry.match(/^(\d{1,5})-(\d{1,5})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!validPort(start) || !validPort(end) || start > end || end - start > 200) return '';
      normalized.push(`${start}-${end}`);
      continue;
    }
    const port = Number(entry);
    if (!validPort(port)) return '';
    normalized.push(String(port));
  }
  return normalized.join(',');
}

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
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

async function getNmapVersion() {
  try {
    const { stdout } = await execFileAsync('nmap', ['--version'], { timeout: 5000 });
    return String(stdout || '').split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

async function getHttpxVersion() {
  try {
    const { stdout, stderr } = await execFileAsync(HTTPX_BINARY, ['-version'], { timeout: 5000 });
    const raw = String(`${stdout || ''}\n${stderr || ''}`).replace(/\u001b\[[0-9;]*m/g, '');
    return raw.match(/\bv\d+\.\d+\.\d+\b/i)?.[0] || raw.split('\n').map((line) => line.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

function xmlDecode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function attr(block, name) {
  const match = block.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? xmlDecode(match[1]) : null;
}

function parseNmapXml(xml) {
  const hosts = [];
  const hostBlocks = xml.match(/<host\b[\s\S]*?<\/host>/g) || [];
  for (const hostBlock of hostBlocks) {
    const addressBlock = hostBlock.match(/<address\b[^>]*>/i)?.[0] || '';
    const address = attr(addressBlock, 'addr');
    const hostname = hostBlock.match(/<hostname\b[^>]*name="([^"]+)"/i)?.[1] || null;
    const ports = [];
    const portBlocks = hostBlock.match(/<port\b[\s\S]*?<\/port>/g) || [];
    for (const portBlock of portBlocks) {
      const portOpen = /<state\b[^>]*state="open"/i.test(portBlock);
      if (!portOpen) continue;
      const portHeader = portBlock.match(/<port\b[^>]*>/i)?.[0] || '';
      const serviceBlock = portBlock.match(/<service\b[^>]*>/i)?.[0] || '';
      const cpes = [...portBlock.matchAll(/<cpe>([^<]+)<\/cpe>/gi)].map((match) => xmlDecode(match[1]));
      ports.push({
        protocol: attr(portHeader, 'protocol') || 'tcp',
        port: Number(attr(portHeader, 'portid') || 0),
        state: 'open',
        service: attr(serviceBlock, 'name'),
        product: attr(serviceBlock, 'product'),
        version: attr(serviceBlock, 'version'),
        extrainfo: attr(serviceBlock, 'extrainfo'),
        cpe: cpes,
      });
    }
    hosts.push({
      address,
      hostname: hostname ? xmlDecode(hostname) : null,
      open_ports: ports,
    });
  }
  return hosts;
}

function safeHostname(value) {
  const raw = textOf(value).toLowerCase();
  if (!raw || raw.includes('@')) return '';
  return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

function buildUrlCandidates(openPorts, fallbackHost) {
  const candidates = [];
  for (const port of openPorts) {
    const portNumber = Number(port.port);
    const protocol = WEB_PORT_PROTOCOLS[portNumber];
    if (!protocol) continue;
    const host = safeHostname(port.hostname || fallbackHost || port.host);
    if (!host) continue;
    const defaultPort = protocol === 'https' ? 443 : 80;
    const portSuffix = portNumber === defaultPort ? '' : `:${portNumber}`;
    candidates.push({
      url: `${protocol}://${host}${portSuffix}/`,
      host,
      port: portNumber,
      protocol,
    });
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).slice(0, 8);
}

function parseTechnology(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const name = textOf(value.name || value.technology || value.app || value.slug);
    const version = textOf(value.version);
    if (!name) return null;
    return { name, version: version || null };
  }
  const raw = textOf(value).replace(/\s+/g, ' ');
  if (!raw) return null;
  const colonMatch = raw.match(/^([^:]+):(.+)$/);
  if (colonMatch) {
    return { name: colonMatch[1].trim(), version: colonMatch[2].trim() || null };
  }
  const versionMatch = raw.match(/^(.+?)\s+v?(\d+(?:\.\d+){1,4}(?:[-+][\w.-]+)?)$/i);
  if (versionMatch) {
    return { name: versionMatch[1].trim(), version: versionMatch[2].trim() || null };
  }
  return { name: raw, version: null };
}

function normalizeHttpxRecord(event, candidateByUrl) {
  const url = textOf(event.url || event.input || event.host);
  const candidate = candidateByUrl.get(url) || candidateByUrl.get(url.replace(/\/+$/, '/')) || {};
  const rawTech = Array.isArray(event.tech) ? event.tech : Array.isArray(event.technologies) ? event.technologies : [];
  const technologies = rawTech
    .map(parseTechnology)
    .filter(Boolean)
    .map((tech) => ({
      ...tech,
      source: 'httpx_wappalyzer',
      confidence: tech.version ? 'medium' : 'low',
      category: null,
      evidence: {
        url,
        status_code: event.status_code ?? event.statusCode ?? null,
        title: event.title || null,
        webserver: event.webserver || event.server || null,
        content_type: event.content_type || event.contentType || null,
        favicon_hash: event.favicon || event.favicon_hash || event.favicon_mmh3 || null,
        body_hash: event.hash || null,
      },
    }));

  return {
    url,
    input: event.input || null,
    host: candidate.host || event.host || null,
    port: candidate.port || Number(event.port || 0) || null,
    protocol: candidate.protocol || null,
    status_code: event.status_code ?? event.statusCode ?? null,
    title: event.title || null,
    webserver: event.webserver || event.server || null,
    content_type: event.content_type || event.contentType || null,
    content_length: event.content_length ?? event.contentLength ?? null,
    response_time: event.response_time || event.time || null,
    favicon_hash: event.favicon || event.favicon_hash || event.favicon_mmh3 || null,
    technologies,
    raw: event,
  };
}

function parseHttpxJsonLines(stdout, candidates) {
  const candidateByUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  const recordByUrl = new Map();
  const warnings = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      const record = normalizeHttpxRecord(event, candidateByUrl);
      const key = String(record.url || record.input || record.host || recordByUrl.size).trim().replace(/\/+$/, "");
      const existing = recordByUrl.get(key);
      if (!existing) {
        recordByUrl.set(key, record);
      } else {
        const seenTech = new Set((existing.technologies || []).map((tech) => `${String(tech.name || '').toLowerCase()}:${tech.version || ''}`));
        for (const tech of record.technologies || []) {
          const techKey = `${String(tech.name || '').toLowerCase()}:${tech.version || ''}`;
          if (seenTech.has(techKey)) continue;
          seenTech.add(techKey);
          existing.technologies.push(tech);
        }
      }
    } catch {
      warnings.push(`httpx_parse:${trimmed.slice(0, 160)}`);
    }
  }
  return { records: Array.from(recordByUrl.values()), warnings: warnings.slice(0, 20) };
}

async function runTechnologyFingerprint(openPorts, fallbackHost) {
  const startedAt = Date.now();
  const candidates = buildUrlCandidates(openPorts, fallbackHost);
  if (candidates.length === 0) {
    return {
      status: 'skipped',
      url_candidates: [],
      technology_fingerprints: [],
      technology_count: 0,
      fingerprint_duration_ms: Date.now() - startedAt,
      fingerprint_warnings: ['httpx_no_web_url_candidates'],
      httpx_version: await getHttpxVersion(),
    };
  }

  const args = [
    '-json',
    '-silent',
    '-no-color',
    '-no-stdin',
    '-follow-redirects',
    '-max-redirects',
    '2',
    '-status-code',
    '-title',
    '-tech-detect',
    '-web-server',
    '-content-type',
    '-content-length',
    '-favicon',
    '-hash',
    'mmh3',
    '-response-time',
    '-timeout',
    '8',
    '-retries',
    '0',
    '-rate-limit',
    '2',
    '-u',
    candidates.map((candidate) => candidate.url).join(','),
  ];

  try {
    const { stdout, stderr } = await execFileAsync(HTTPX_BINARY, args, {
      timeout: 45000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = parseHttpxJsonLines(stdout, candidates);
    const technologyCount = parsed.records.reduce((sum, record) => sum + (record.technologies?.length || 0), 0);
    const warnings = [
      ...parsed.warnings,
      ...String(stderr || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20),
    ];
    return {
      status: 'completed',
      url_candidates: candidates,
      technology_fingerprints: parsed.records,
      technology_count: technologyCount,
      fingerprint_duration_ms: Date.now() - startedAt,
      fingerprint_warnings: Array.from(new Set(warnings)).slice(0, 40),
      httpx_version: await getHttpxVersion(),
      httpx_command_sanitized: `${HTTPX_BINARY} ${args.map((arg) => arg.includes('://') ? '<targets>' : arg).join(' ')}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'httpx_failed');
    return {
      status: /timeout/i.test(message) ? 'timeout' : 'failed',
      url_candidates: candidates,
      technology_fingerprints: [],
      technology_count: 0,
      fingerprint_duration_ms: Date.now() - startedAt,
      fingerprint_warnings: [`httpx:${message.slice(0, 180)}`],
      httpx_version: await getHttpxVersion(),
    };
  }
}

function buildArgs(body, target) {
  const profileName = textOf(body.profile || DEFAULT_PROFILE);
  const profile = PROFILE_CONFIG[profileName];
  if (!profile) throw new Error('unsupported_profile');
  const args = [...profile.args];
  const ports = normalizePorts(body.ports);
  if (profile.requiresPorts) {
    if (!ports) throw new Error('invalid_ports');
    args.push('-p', ports);
  } else if (ports) {
    const portIndex = args.indexOf('-p');
    if (portIndex >= 0) args.splice(portIndex, 2, '-p', ports);
    else args.push('-p', ports);
  }
  const timeoutSeconds = clampInt(body.timeout_seconds, profile.defaultTimeout || DEFAULT_TIMEOUT_SECONDS, 10, MAX_TIMEOUT_SECONDS);
  args.push('--host-timeout', `${timeoutSeconds}s`, '-oX', '-', target.value);
  return { args, profileName, timeoutSeconds, commandSanitized: `nmap ${args.map((arg) => arg === target.value ? '<target>' : arg).join(' ')}` };
}

async function runScan(body) {
  const startedAt = Date.now();
  const target = normalizeTarget(body.target);
  if (!target) throw new Error('invalid_target');
  const blockReason = isBlockedTarget(target);
  if (blockReason) throw new Error(blockReason);
  const { args, profileName, timeoutSeconds, commandSanitized } = buildArgs(body, target);
  const { stdout, stderr } = await execFileAsync('nmap', args, {
    timeout: Math.min(MAX_TIMEOUT_SECONDS + 20, timeoutSeconds + 20) * 1000,
    maxBuffer: 6 * 1024 * 1024,
  });
  const hosts = parseNmapXml(String(stdout || ''));
  const openPorts = hosts.flatMap((host) => (host.open_ports || []).map((port) => ({
    host: host.address,
    hostname: host.hostname,
    ...port,
  })));
  const fingerprint = await runTechnologyFingerprint(openPorts, target.kind === 'domain' ? target.value : '');
  return {
    target: target.value,
    build_id: BUILD_ID,
    profile: profileName,
    hosts,
    open_ports: openPorts,
    open_port_count: openPorts.length,
    warnings: [
      ...String(stderr || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20),
      ...(fingerprint.fingerprint_warnings || []),
    ].slice(0, 60),
    duration_ms: Date.now() - startedAt,
    nmap_version: await getNmapVersion(),
    httpx_version: fingerprint.httpx_version,
    nmap_command_sanitized: commandSanitized,
    fingerprint_status: fingerprint.status,
    fingerprint_duration_ms: fingerprint.fingerprint_duration_ms,
    fingerprint_warnings: fingerprint.fingerprint_warnings,
    technology_fingerprints: fingerprint.technology_fingerprints,
    technology_count: fingerprint.technology_count,
    httpx_command_sanitized: fingerprint.httpx_command_sanitized,
  };
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    return json(res, 200, { ok: true, build_id: BUILD_ID, nmap_version: await getNmapVersion(), httpx_version: await getHttpxVersion() });
  }
  if (req.method !== 'POST' || req.url !== '/nmap/scan') {
    return json(res, 404, { error: 'not_found' });
  }
  if (!SHARED_SECRET) {
    return json(res, 503, { error: 'nmap_shared_secret_not_configured' });
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
    const status = /timeout/i.test(message) ? 504 : /invalid|unsupported|private|denied|allowed|required/.test(message) ? 400 : 500;
    return json(res, status, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SurfaceScan360 Nmap container listening on ${PORT}`);
});
