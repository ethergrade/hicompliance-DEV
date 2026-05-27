import type { NormalizedSslResult } from '../pentestToolsTypes.ts';

function toIsoDate(value: unknown): string | undefined {
  const str = String(value || '').trim();
  if (!str) return undefined;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseHostAndPort(targetUrl: string): { host: string; port: number } {
  try {
    const parsed = new URL(targetUrl);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 443;
    return { host: parsed.hostname.toLowerCase(), port: Number.isFinite(port) ? Number(port) : 443 };
  } catch {
    return { host: targetUrl.toLowerCase(), port: 443 };
  }
}

export function normalizeSslOutput(output: unknown, targetUrl: string): NormalizedSslResult {
  const root = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const outputData = (root.output_data && typeof root.output_data === 'object'
    ? root.output_data
    : (root.data && typeof root.data === 'object' ? (root.data as any).output_data : {})) as Record<string, unknown>;

  const { host, port } = parseHostAndPort(targetUrl);

  const findings = Array.isArray(outputData.findings) ? outputData.findings : [];
  const weakProtocols = new Set<string>();
  const weakCiphers = new Set<string>();

  for (const findingEntry of findings) {
    const finding = (findingEntry && typeof findingEntry === 'object' ? findingEntry : {}) as Record<string, unknown>;
    const name = String(finding.name || finding.vuln_id || '').toLowerCase();
    const desc = String(finding.vuln_description || finding.risk_description || '').toLowerCase();
    if (/tls\s*1\.0|tls\s*1\.1|sslv2|sslv3/.test(name + ' ' + desc)) {
      weakProtocols.add(name || desc);
    }
    if (/cipher|cbc|rc4|3des|sweet32/.test(name + ' ' + desc)) {
      weakCiphers.add(name || desc);
    }
  }

  const cert = (outputData.certificate && typeof outputData.certificate === 'object'
    ? outputData.certificate
    : {}) as Record<string, unknown>;

  const result: NormalizedSslResult = {
    host,
    port,
    protocol: 'https',
    certificate_subject: String(cert.subject || outputData.certificate_subject || '').trim() || undefined,
    certificate_issuer: String(cert.issuer || outputData.certificate_issuer || '').trim() || undefined,
    not_before: toIsoDate(cert.not_before || cert.valid_from || outputData.certificate_not_before),
    not_after: toIsoDate(cert.not_after || cert.valid_to || outputData.certificate_not_after),
    grade: String(outputData.grade || outputData.score_label || '').trim() || undefined,
    weak_protocols: Array.from(weakProtocols),
    weak_ciphers: Array.from(weakCiphers),
    raw: outputData,
  };

  return result;
}
