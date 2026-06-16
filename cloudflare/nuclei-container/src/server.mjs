import { createServer } from 'node:http';
import { access, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = String(process.env.NUCLEI_SHARED_SECRET || '').trim();
const NUCLEI_BINARY = String(process.env.NUCLEI_BINARY || 'nuclei').trim();
const OFFICIAL_TEMPLATES_DIR = String(process.env.NUCLEI_TEMPLATES_DIR || '/root/nuclei-templates').trim();
const CUSTOM_TEMPLATES_DIR = String(process.env.SURFACESCAN_NUCLEI_TEMPLATES_DIR || '/opt/surfacescan360-nuclei-templates').trim();
const MAX_TIMEOUT_SECONDS = clampInt(process.env.NUCLEI_MAX_TIMEOUT_SECONDS, 120, 10, 600);
const DEFAULT_TIMEOUT_SECONDS = clampInt(process.env.NUCLEI_TIMEOUT_SECONDS, 45, 10, MAX_TIMEOUT_SECONDS);
const DEFAULT_RATE_LIMIT = clampInt(process.env.NUCLEI_RATE_LIMIT, 5, 1, 25);
const DEFAULT_MAX_FINDINGS = clampInt(process.env.NUCLEI_MAX_FINDINGS, 100, 1, 500);
const EGRESS_PROXY_MODE = String(process.env.SURFACESCAN_EGRESS_PROXY_MODE || 'direct').trim();
const MAX_BODY_BYTES = 128 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EXCLUDED_PUBLIC_TAGS = ['dos', 'bruteforce', 'intrusive', 'destructive'];
const EXCLUDED_AUTHORIZED_TAGS = ['dos', 'bruteforce', 'destructive'];

const PROFILE_CONFIG = {
  baseline_headers: {
    templatePaths: [
      { root: 'custom', path: 'http/exposures' },
      { root: 'official', path: 'ssl' },
    ],
    severities: ['info', 'low', 'medium', 'high', 'critical'],
    types: ['http', 'ssl'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    requestTimeoutSeconds: 6,
  },
  exposure_medium: {
    templatePaths: [
      { root: 'custom', path: 'http/exposure-medium/exposed-backup-files.yaml' },
      { root: 'custom', path: 'http/exposure-medium/exposed-env-file.yaml' },
      { root: 'custom', path: 'http/exposure-medium/exposed-git-config.yaml' },
      { root: 'custom', path: 'http/exposure-medium/public-debug-surfaces.yaml' },
      { root: 'official', path: 'http/exposures/apis/openapi.yaml' },
      { root: 'official', path: 'http/exposures/apis/swagger-api.yaml' },
      { root: 'official', path: 'http/exposures/apis/wsdl-api.yaml' },
      { root: 'official', path: 'http/exposures/files/crossdomain-xml.yaml' },
      { root: 'official', path: 'http/exposures/files/database-credentials.yaml' },
      { root: 'official', path: 'http/exposures/files/ds-store-file.yaml' },
      { root: 'official', path: 'http/exposures/files/gitlab-ci-yml.yaml' },
      { root: 'official', path: 'http/exposures/files/google-api-private-key.yaml' },
      { root: 'official', path: 'http/exposures/files/next-js-config-file.yaml' },
      { root: 'official', path: 'http/exposures/files/oauth-credentials-json.yaml' },
      { root: 'official', path: 'http/exposures/files/readme-md.yaml' },
      { root: 'official', path: 'http/exposures/files/service-account-credentials.yaml' },
      { root: 'official', path: 'http/exposures/files/wp-cli-exposure.yaml' },
      { root: 'official', path: 'http/exposures/configs/config-json.yaml' },
      { root: 'official', path: 'http/exposures/configs/docker-compose-config.yaml' },
      { root: 'official', path: 'http/exposures/configs/exposed-svn.yaml' },
      { root: 'official', path: 'http/exposures/configs/git-config.yaml' },
      { root: 'official', path: 'http/exposures/configs/nginx-config.yaml' },
      { root: 'official', path: 'http/exposures/configs/phpinfo-files.yaml' },
      { root: 'official', path: 'http/exposures/configs/server-private-keys.yaml' },
      { root: 'official', path: 'http/exposures/configs/web-config.yaml' },
      { root: 'official', path: 'http/exposures/logs/access-log-file.yaml' },
      { root: 'official', path: 'http/exposures/logs/error-logs.yaml' },
      { root: 'official', path: 'http/exposures/logs/git-logs-exposure.yaml' },
      { root: 'official', path: 'http/exposures/logs/production-log.yaml' },
      { root: 'official', path: 'http/exposures/logs/production-logs.yaml' },
      { root: 'official', path: 'http/misconfiguration/debug' },
      { root: 'official', path: 'http/misconfiguration/graphql' },
      { root: 'official', path: 'http/misconfiguration/google' },
      { root: 'official', path: 'http/exposed-panels/apache' },
      { root: 'official', path: 'http/exposed-panels/tomcat' },
      { root: 'official', path: 'http/exposed-panels/unauth' },
      { root: 'official', path: 'http/technologies/apache' },
      { root: 'official', path: 'http/technologies/aws' },
      { root: 'official', path: 'http/technologies/google' },
      { root: 'official', path: 'http/technologies/graphql' },
      { root: 'official', path: 'http/technologies/microsoft' },
      { root: 'official', path: 'http/technologies/nginx' },
    ],
    severities: ['info', 'low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    requestTimeoutSeconds: 8,
  },
  web_vuln_safe: {
    templatePaths: [
      { root: 'official', path: 'http/vulnerabilities' },
      { root: 'official', path: 'http/cves' },
    ],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    requestTimeoutSeconds: 8,
  },
  web_cve_recent: {
    templatePaths: [
      { root: 'official', path: 'http/cves/2026' },
      { root: 'official', path: 'http/cves/2025' },
    ],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_cve_2026: {
    templatePaths: [{ root: 'official', path: 'http/cves/2026' }],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_cve_2025: {
    templatePaths: [{ root: 'official', path: 'http/cves/2025' }],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_cve_2024: {
    templatePaths: [{ root: 'official', path: 'http/cves/2024' }],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_cve_2023: {
    templatePaths: [{ root: 'official', path: 'http/cves/2023' }],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_cve_2022: {
    templatePaths: [{ root: 'official', path: 'http/cves/2022' }],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_PUBLIC_TAGS,
    concurrency: 2,
    requestTimeoutSeconds: 8,
  },
  web_vuln_authorized: {
    templatePaths: [
      { root: 'official', path: 'http/vulnerabilities' },
      { root: 'official', path: 'http/cves' },
      { root: 'official', path: 'http/fuzzing' },
      { root: 'official', path: 'dast' },
    ],
    severities: ['low', 'medium', 'high', 'critical'],
    types: ['http'],
    excludedTags: EXCLUDED_AUTHORIZED_TAGS,
    requiresAuthorization: true,
    enableDast: true,
    maxRateLimit: 2,
    requestTimeoutSeconds: 6,
  },
};

const URL_PROTOCOL_REGEX = /^https?:$/;
const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

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

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.username = '';
    url.password = '';
    if (!URL_PROTOCOL_REGEX.test(url.protocol)) return '';
    if (!url.hostname || url.hostname.length > 253) return '';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]') return '';
    if (PRIVATE_IPV4_RANGES.some((range) => range.test(host))) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function templateRoot(root) {
  return root === 'custom' ? CUSTOM_TEMPLATES_DIR : OFFICIAL_TEMPLATES_DIR;
}

function resolveTemplatePaths(profileConfig) {
  return profileConfig.templatePaths.map((entry) => ({
    ...entry,
    absolute: join(templateRoot(entry.root), entry.path),
  }));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function countTemplateFiles(paths) {
  let count = 0;
  const missing = [];

  async function walk(path) {
    if (!(await pathExists(path))) {
      missing.push(path);
      return;
    }
    const entryStat = await stat(path);
    if (entryStat.isFile()) {
      if (/\.ya?ml$/i.test(path)) count += 1;
      return;
    }
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) count += 1;
    }
  }

  for (const path of paths) await walk(path);
  return { count, missing };
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

async function getNucleiVersion() {
  try {
    const { stdout, stderr } = await execFileAsync(NUCLEI_BINARY, ['-version'], { timeout: 5000 });
    const raw = String(stdout || stderr || process.env.NUCLEI_VERSION || '').replace(/\u001b\[[0-9;]*m/g, '');
    const version = raw.match(/\bv\d+\.\d+\.\d+\b/)?.[0];
    return version || raw.trim() || null;
  } catch {
    return process.env.NUCLEI_VERSION || null;
  }
}

async function resolveRedirectTarget(target) {
  const warnings = [];
  let current = target;
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: {
          'user-agent': 'SurfaceScan360-Nuclei/1.0',
          accept: '*/*',
        },
      });
      if (!REDIRECT_STATUSES.has(response.status)) {
        const currentUrl = new URL(current);
        const contentType = response.headers.get('content-type') || '';
        if (
          response.status === 200 &&
          currentUrl.hostname === 'google-gruyere.appspot.com' &&
          currentUrl.pathname === '/start' &&
          contentType.includes('text/html')
        ) {
          const html = await response.text();
          const gruyereStart = html.match(/href=["'](\/\d+\/?)["']/i)?.[1];
          if (gruyereStart) {
            const next = normalizeUrl(new URL(gruyereStart, current).toString());
            if (next) return { resolvedTargetUrl: next, warnings };
          }
        }
        return { resolvedTargetUrl: current, warnings };
      }
      const location = response.headers.get('location');
      if (!location) return { resolvedTargetUrl: current, warnings: [...warnings, 'redirect_without_location'] };
      const next = normalizeUrl(new URL(location, current).toString());
      if (!next) return { resolvedTargetUrl: current, warnings: [...warnings, 'redirect_target_rejected'] };
      current = next;
    } catch (error) {
      warnings.push(`redirect_resolution_failed:${String(error?.message || error).slice(0, 120)}`);
      return { resolvedTargetUrl: current, warnings };
    }
  }
  warnings.push('redirect_limit_reached');
  return { resolvedTargetUrl: current, warnings };
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function parseJsonLines(text, maxFindings) {
  const findings = [];
  const stats = [];
  const warnings = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event.duration && event.templates) {
        stats.push(event);
        continue;
      }
      const templateId = event['template-id'] || event.templateID || null;
      if (!templateId) continue;
      findings.push({
        template_id: templateId,
        matcher_name: event['matcher-name'] || null,
        name: event.info?.name || null,
        severity: event.info?.severity || null,
        type: event.type || null,
        matched_at: event['matched-at'] || event.host || null,
        extracted_results: Array.isArray(event['extracted-results']) ? event['extracted-results'].slice(0, 10) : [],
        tags: Array.isArray(event.info?.tags) ? event.info.tags : String(event.info?.tags || '').split(',').filter(Boolean),
      });
    } catch {
      const clean = stripAnsi(trimmed);
      if (/^\[(ERR|WRN|INF)\]/.test(clean)) warnings.push(clean.slice(0, 300));
    }
    if (findings.length >= maxFindings) break;
  }
  return { findings, stats, warnings: warnings.slice(0, 40) };
}

function parseDebugSummary(stdout, stderr) {
  const combined = stripAnsi([stdout || '', stderr || ''].join('\n'));
  const lines = combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const stats = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.duration && event.templates) stats.push(event);
    } catch {
      // not a stats line
    }
  }
  const templatesLoaded = combined.match(/Templates loaded for current scan:\s*(\d+)/i)?.[1];
  const targetsLoaded = combined.match(/Targets loaded for current scan:\s*(\d+)/i)?.[1];
  const templatesClustered = combined.match(/Templates clustered:\s*([^\n]+)/i)?.[1];
  const scanCompleted = combined.match(/Scan completed in\s*([^\n]+)/i)?.[1];
  const warningLines = lines.filter((line) => /^\[(ERR|WRN)\]/.test(line)).slice(0, 30);
  return {
    templates_loaded_log: templatesLoaded ? Number(templatesLoaded) : null,
    targets_loaded: targetsLoaded ? Number(targetsLoaded) : null,
    templates_clustered: templatesClustered || null,
    scan_completed: scanCompleted || null,
    stats_last: stats.at(-1) || null,
    warnings: warningLines,
  };
}

function sanitizeCommand(args, targetsPath) {
  return [basename(NUCLEI_BINARY), ...args.map((arg) => (arg === targetsPath ? '<targets-file>' : arg))].join(' ');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runNuclei(body) {
  const target = normalizeUrl(body.target_url || body.url || body.target);
  const profile = String(body.profile || 'baseline_headers').trim();
  const timeoutSeconds = clampInt(body.timeout_seconds, DEFAULT_TIMEOUT_SECONDS, 10, MAX_TIMEOUT_SECONDS);
  const requestedRateLimit = clampInt(body.rate_limit, DEFAULT_RATE_LIMIT, 1, 25);
  const maxFindings = clampInt(body.max_findings, DEFAULT_MAX_FINDINGS, 1, 500);
  const authorizedScan = body.authorized_scan === true;

  if (!target) return { status: 400, payload: { error: 'valid_http_target_required' } };
  const profileConfig = PROFILE_CONFIG[profile];
  if (!profileConfig) return { status: 400, payload: { error: 'unsupported_profile' } };
  if (profileConfig.requiresAuthorization && !authorizedScan) {
    return { status: 403, payload: { error: 'authorized_scan_required' } };
  }

  const redirectResult = await resolveRedirectTarget(target);
  const resolvedTargetUrl = redirectResult.resolvedTargetUrl;
  const templateDescriptors = resolveTemplatePaths(profileConfig);
  const allTemplatePaths = templateDescriptors.map((entry) => entry.absolute);
  const templateCount = await countTemplateFiles(allTemplatePaths);
  const templatePaths = [];
  for (const templatePath of allTemplatePaths) {
    if (await pathExists(templatePath)) templatePaths.push(templatePath);
  }
  if (templatePaths.length === 0) {
    return {
      status: 503,
      payload: {
        error: 'no_templates_available',
        profile,
        template_paths: allTemplatePaths,
        warnings: templateCount.missing.map((path) => `template_path_missing:${path}`),
      },
    };
  }
  const effectiveRateLimit = Math.min(requestedRateLimit, profileConfig.maxRateLimit || requestedRateLimit);

  const started = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), 'nuclei-'));
  const targetsPath = join(workdir, 'targets.txt');
  await writeFile(targetsPath, `${resolvedTargetUrl}\n`, 'utf8');

  const templateArgs = templatePaths.flatMap((templatePath) => ['-templates', templatePath]);
  const args = [
    '-list',
    targetsPath,
    ...templateArgs,
    '-jsonl',
    '-silent=false',
    '-no-color',
    '-no-stdin',
    '-disable-update-check',
    '-stats',
    '-stats-json',
    '-si',
    '1',
    '-no-interactsh',
    '-follow-redirects',
    '-max-redirects',
    '2',
    '-exclude-tags',
    profileConfig.excludedTags.join(','),
    '-severity',
    profileConfig.severities.join(','),
    '-type',
    profileConfig.types.join(','),
    '-rate-limit',
    String(effectiveRateLimit),
    '-concurrency',
    String(profileConfig.concurrency || (profileConfig.enableDast ? 2 : 5)),
    '-retries',
    '0',
    '-timeout',
    String(profileConfig.requestTimeoutSeconds || Math.min(8, Math.max(3, Math.ceil(timeoutSeconds / 3)))),
  ];
  if (profileConfig.enableDast) {
    const origin = new URL(resolvedTargetUrl).origin;
    args.push('-dast', '-fuzz-aggression', 'low', '-fuzz-scope', `^${escapeRegex(origin)}`);
  }

  const nucleiCommandSanitized = sanitizeCommand(args, targetsPath);

  try {
    const { stdout, stderr } = await execFileAsync(NUCLEI_BINARY, args, {
      cwd: workdir,
      timeout: timeoutSeconds * 1000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const parsed = parseJsonLines(stdout, maxFindings);
    const debugSummary = parseDebugSummary(stdout, stderr);
    const templatesExecuted = Number(debugSummary.stats_last?.templates || debugSummary.templates_loaded_log || 0);
    const warnings = [
      ...redirectResult.warnings,
      ...parsed.warnings,
      ...debugSummary.warnings,
      ...templateCount.missing.map((path) => `template_path_missing:${path}`),
    ];
    if (templatesExecuted < 10) warnings.push('nuclei_less_than_10_templates_executed');

    return {
      status: 200,
      payload: {
        target_url: target,
        resolved_target_url: resolvedTargetUrl,
        profile,
        findings: parsed.findings,
        warnings: Array.from(new Set(warnings)).slice(0, 80),
        duration_ms: Date.now() - started,
        nuclei_version: await getNucleiVersion(),
        egress_proxy: EGRESS_PROXY_MODE,
        templates_loaded_count: debugSummary.templates_loaded_log || templateCount.count,
        templates_executed_count: templatesExecuted || parsed.stats.at(-1)?.templates || 0,
        template_paths: templatePaths,
        nuclei_command_sanitized: nucleiCommandSanitized,
        debug_summary: debugSummary,
      },
    };
  } catch (error) {
    const killedByTimeout = error?.killed || /timed out|timeout/i.test(String(error?.message || ''));
    const parsed = parseJsonLines(error?.stdout || '', maxFindings);
    const debugSummary = parseDebugSummary(error?.stdout || '', error?.stderr || '');
    const templatesExecuted = Number(debugSummary.stats_last?.templates || debugSummary.templates_loaded_log || 0);
    const warnings = [
      killedByTimeout ? 'nuclei_timeout' : 'nuclei_execution_failed',
      ...redirectResult.warnings,
      ...parsed.warnings,
      ...debugSummary.warnings,
      ...templateCount.missing.map((path) => `template_path_missing:${path}`),
    ];
    if (templatesExecuted < 10) warnings.push('nuclei_less_than_10_templates_executed');

    if (parsed.findings.length > 0) {
      return {
        status: 200,
        payload: {
          target_url: target,
          resolved_target_url: resolvedTargetUrl,
          profile,
          findings: parsed.findings,
          warnings: Array.from(new Set(warnings)).slice(0, 80),
          duration_ms: Date.now() - started,
          nuclei_version: await getNucleiVersion(),
          egress_proxy: EGRESS_PROXY_MODE,
          templates_loaded_count: debugSummary.templates_loaded_log || templateCount.count,
          templates_executed_count: templatesExecuted || parsed.stats.at(-1)?.templates || 0,
          template_paths: templatePaths,
          nuclei_command_sanitized: nucleiCommandSanitized,
          debug_summary: debugSummary,
        },
      };
    }
    return {
      status: killedByTimeout ? 504 : 502,
      payload: {
        error: killedByTimeout ? 'nuclei_timeout' : 'nuclei_execution_failed',
        message: String(error?.message || error).slice(0, 500),
        target_url: target,
        resolved_target_url: resolvedTargetUrl,
        profile,
        warnings: Array.from(new Set(warnings)).slice(0, 80),
        duration_ms: Date.now() - started,
        egress_proxy: EGRESS_PROXY_MODE,
        templates_loaded_count: debugSummary.templates_loaded_log || templateCount.count,
        templates_executed_count: templatesExecuted || parsed.stats.at(-1)?.templates || 0,
        template_paths: templatePaths,
        nuclei_command_sanitized: nucleiCommandSanitized,
        debug_summary: debugSummary,
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
        nuclei_version: await getNucleiVersion(),
        egress_proxy: EGRESS_PROXY_MODE,
      });
    }
    if (req.method !== 'POST' || url.pathname !== '/nuclei/scan') {
      return json(res, 404, { error: 'not_found' });
    }
    if (!SHARED_SECRET) {
      return json(res, 503, { error: 'nuclei_shared_secret_not_configured' });
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth !== `Bearer ${SHARED_SECRET}`) {
      return json(res, 401, { error: 'unauthorized' });
    }
    const body = await readJsonBody(req);
    const result = await runNuclei(body);
    return json(res, result.status, result.payload);
  } catch (error) {
    return json(res, 500, {
      error: 'internal_error',
      message: String(error?.message || error).slice(0, 500),
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SurfaceScan360 Nuclei container listening on :${PORT}`);
});
