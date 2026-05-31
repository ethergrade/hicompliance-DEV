/*
  SurfaceScan360 DNS Lookup Scanner
  Runtime target: Supabase Edge Functions / Deno-compatible TypeScript

  Purpose:
  - Resolve external DNS records for a domain asset.
  - Evaluate DNS/email/TLS policy posture for SurfaceScan360.
  - Return normalized records, findings, score, grade, and report-ready remediation data.

  Notes:
  - Default resolver uses DNS-over-HTTPS because it gives TTL and works over fetch().
  - Deno.resolveDns can be added as a secondary mode, but DoH is simpler and portable in Edge Functions.
  - Only scan domains explicitly present in the customer-approved SurfaceScan360 scope.
*/

export type DnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "NS"
  | "TXT"
  | "CAA"
  | "SOA"
  | "DS"
  | "SRV";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus = "pass" | "warn" | "fail" | "info";

export interface DnsAnswer {
  name: string;
  type: DnsRecordType | string;
  ttl?: number;
  data: string;
}

export interface DnsRecordSet {
  query: string;
  type: DnsRecordType;
  answers: DnsAnswer[];
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

export interface DnsFinding {
  id: string;
  category: "resolution" | "nameserver" | "email-security" | "certificate-policy" | "dnssec" | "exposure" | "resilience";
  title: string;
  severity: Severity;
  status: FindingStatus;
  description: string;
  evidence?: Record<string, unknown>;
  recommendation: string;
  reportSummary: string;
}

export interface DnsLookupOptions {
  domain: string;
  resolverUrl?: string;
  timeoutMs?: number;
  recordTypes?: DnsRecordType[];
  includeEmailSecurityChecks?: boolean;
  includeDkimSelectorChecks?: boolean;
  dkimSelectors?: string[];
  includeWildcardCheck?: boolean;
  userAgent?: string;
}

export interface DnsLookupResult {
  scanner: "dns-lookup";
  version: string;
  domain: string;
  normalizedDomain: string;
  resolver: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  records: Record<string, DnsRecordSet>;
  additionalRecords: Record<string, DnsRecordSet>;
  findings: DnsFinding[];
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    hasWebResolution: boolean;
    hasMailExchange: boolean;
    hasSpf: boolean;
    hasDmarc: boolean;
    hasCaa: boolean;
    hasDnssecDelegation: boolean;
  };
}

const DEFAULT_RESOLVER_URL = "https://cloudflare-dns.com/dns-query";

const DEFAULT_RECORD_TYPES: DnsRecordType[] = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "CAA",
  "SOA",
  "DS",
];

const DEFAULT_DKIM_SELECTORS = [
  "default",
  "selector1",
  "selector2",
  "google",
  "k1",
  "s1",
  "s2",
  "mail",
  "smtp",
];

const DNS_TYPE_BY_CODE: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  33: "SRV",
  43: "DS",
  257: "CAA",
};

export function normalizeDomain(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Domain is required");
  }

  let candidate = input.trim();
  if (!candidate) throw new Error("Domain is empty");

  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    candidate = url.hostname;
  } else {
    candidate = candidate.split("/")[0] ?? candidate;
    candidate = candidate.split(":")[0] ?? candidate;
  }

  candidate = candidate.trim().replace(/\.$/, "").toLowerCase();

  if (!candidate || candidate.length > 253) {
    throw new Error("Invalid domain length");
  }

  if (isIpAddress(candidate)) {
    throw new Error("DNS lookup scanner expects a domain, not an IP address. Use PTR mode for IP assets.");
  }

  // Conservative public-domain style validation. Allows punycode domains.
  const labels = candidate.split(".");
  if (labels.length < 2) {
    throw new Error("Domain must include at least a second-level domain and TLD");
  }

  for (const label of labels) {
    if (!label || label.length > 63) throw new Error(`Invalid DNS label: ${label}`);
    if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`Unsupported DNS label characters: ${label}`);
    if (label.startsWith("-") || label.endsWith("-")) throw new Error(`Invalid DNS label hyphen placement: ${label}`);
  }

  return candidate;
}

function isIpAddress(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":");
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

async function queryDoH(
  query: string,
  type: DnsRecordType,
  resolverUrl: string,
  timeoutMs: number,
  userAgent?: string,
): Promise<DnsRecordSet> {
  const started = Date.now();
  const timeout = withTimeout(timeoutMs);
  const url = new URL(resolverUrl);
  url.searchParams.set("name", query);
  url.searchParams.set("type", type);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/dns-json",
        ...(userAgent ? { "user-agent": userAgent } : {}),
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      return {
        query,
        type,
        answers: [],
        error: `DoH resolver returned HTTP ${response.status}`,
        durationMs: Date.now() - started,
      };
    }

    const body = await response.json() as {
      Status?: number;
      Answer?: Array<{ name: string; type: number; TTL?: number; data: string }>;
      Question?: Array<{ name: string; type: number }>;
      Comment?: string;
    };

    const answers: DnsAnswer[] = (body.Answer ?? [])
      .filter((answer) => DNS_TYPE_BY_CODE[answer.type] === type || type === "TXT")
      .map((answer) => ({
        name: trimTrailingDot(answer.name),
        type: DNS_TYPE_BY_CODE[answer.type] ?? String(answer.type),
        ttl: answer.TTL,
        data: normalizeRecordData(answer.data),
      }));

    return {
      query,
      type,
      answers,
      statusCode: body.Status,
      error: body.Status && body.Status !== 0 && body.Status !== 3 ? `DNS status ${body.Status}${body.Comment ? `: ${body.Comment}` : ""}` : undefined,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      query,
      type,
      answers: [],
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  } finally {
    timeout.cancel();
  }
}

function trimTrailingDot(value: string): string {
  return value.replace(/\.$/, "");
}

function normalizeRecordData(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/^"|"$/g, "")
    .replace(/"\s+"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function runLimited<T>(limit: number, items: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await items[current]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function scanDnsLookup(options: DnsLookupOptions): Promise<DnsLookupResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const normalizedDomain = normalizeDomain(options.domain);
  const resolverUrl = options.resolverUrl ?? DEFAULT_RESOLVER_URL;
  const timeoutMs = options.timeoutMs ?? 5000;
  const recordTypes = options.recordTypes ?? DEFAULT_RECORD_TYPES;
  const includeEmail = options.includeEmailSecurityChecks ?? true;
  const includeDkim = options.includeDkimSelectorChecks ?? false;
  const includeWildcard = options.includeWildcardCheck ?? true;

  const primaryTasks = recordTypes.map((type) => async () => queryDoH(
    normalizedDomain,
    type,
    resolverUrl,
    timeoutMs,
    options.userAgent,
  ));

  const primarySets = await runLimited(5, primaryTasks);
  const records: Record<string, DnsRecordSet> = Object.fromEntries(
    primarySets.map((set) => [set.type, set]),
  );

  const additionalTasks: Array<() => Promise<DnsRecordSet>> = [];
  const additionalKeys: string[] = [];

  if (includeEmail) {
    additionalKeys.push("_dmarc.TXT");
    additionalTasks.push(() => queryDoH(`_dmarc.${normalizedDomain}`, "TXT", resolverUrl, timeoutMs, options.userAgent));

    additionalKeys.push("_mta-sts.TXT");
    additionalTasks.push(() => queryDoH(`_mta-sts.${normalizedDomain}`, "TXT", resolverUrl, timeoutMs, options.userAgent));

    additionalKeys.push("_smtp._tls.TXT");
    additionalTasks.push(() => queryDoH(`_smtp._tls.${normalizedDomain}`, "TXT", resolverUrl, timeoutMs, options.userAgent));
  }

  if (includeDkim) {
    const selectors = options.dkimSelectors ?? DEFAULT_DKIM_SELECTORS;
    for (const selector of selectors) {
      additionalKeys.push(`dkim.${selector}.TXT`);
      additionalTasks.push(() => queryDoH(`${selector}._domainkey.${normalizedDomain}`, "TXT", resolverUrl, timeoutMs, options.userAgent));
    }
  }

  if (includeWildcard) {
    const randomLabel = `ss360-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    additionalKeys.push("wildcard.A");
    additionalTasks.push(() => queryDoH(`${randomLabel}.${normalizedDomain}`, "A", resolverUrl, timeoutMs, options.userAgent));
    additionalKeys.push("wildcard.AAAA");
    additionalTasks.push(() => queryDoH(`${randomLabel}.${normalizedDomain}`, "AAAA", resolverUrl, timeoutMs, options.userAgent));
  }

  const additionalSets = await runLimited(5, additionalTasks);
  const additionalRecords: Record<string, DnsRecordSet> = {};
  additionalSets.forEach((set, idx) => {
    additionalRecords[additionalKeys[idx]] = set;
  });

  const findings = evaluateDnsPosture(normalizedDomain, records, additionalRecords);
  const score = calculateScore(findings);
  const completedAtMs = Date.now();

  return {
    scanner: "dns-lookup",
    version: "1.0.0",
    domain: options.domain,
    normalizedDomain,
    resolver: resolverUrl,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    score,
    grade: gradeFromScore(score),
    records,
    additionalRecords,
    findings,
    summary: summarize(records, additionalRecords, findings),
  };
}

function evaluateDnsPosture(
  domain: string,
  records: Record<string, DnsRecordSet>,
  additional: Record<string, DnsRecordSet>,
): DnsFinding[] {
  const findings: DnsFinding[] = [];
  const a = records.A?.answers ?? [];
  const aaaa = records.AAAA?.answers ?? [];
  const cname = records.CNAME?.answers ?? [];
  const mx = records.MX?.answers ?? [];
  const ns = records.NS?.answers ?? [];
  const txt = records.TXT?.answers ?? [];
  const caa = records.CAA?.answers ?? [];
  const soa = records.SOA?.answers ?? [];
  const ds = records.DS?.answers ?? [];

  const spfRecords = txt.map((r) => r.data).filter((value) => /^v=spf1\b/i.test(value));
  const dmarcRecords = (additional["_dmarc.TXT"]?.answers ?? [])
    .map((r) => r.data)
    .filter((value) => /^v=DMARC1\b/i.test(value));
  const mtaStsRecords = (additional["_mta-sts.TXT"]?.answers ?? [])
    .map((r) => r.data)
    .filter((value) => /^v=STSv1\b/i.test(value));
  const tlsRptRecords = (additional["_smtp._tls.TXT"]?.answers ?? [])
    .map((r) => r.data)
    .filter((value) => /^v=TLSRPTv1\b/i.test(value));

  if (a.length || aaaa.length || cname.length) {
    findings.push(pass("dns-resolution-present", "resolution", "Il dominio risolve correttamente", "Sono presenti record A, AAAA o CNAME per il dominio.", { A: a, AAAA: aaaa, CNAME: cname }));
  } else {
    findings.push(fail(
      "dns-resolution-missing",
      "resolution",
      "Il dominio non risolve su A/AAAA/CNAME",
      "high",
      "Il dominio non espone record di risoluzione web rilevabili dal resolver configurato.",
      { domain },
      "Verificare zona DNS, record A/AAAA/CNAME, stato del dominio e provider DNS. Se il dominio non deve risolvere, marcarlo come asset non-web nel perimetro.",
    ));
  }

  if (cname.length && !a.length && !aaaa.length) {
    findings.push(warn(
      "cname-without-address",
      "resolution",
      "CNAME presente senza risoluzione finale A/AAAA",
      "medium",
      "Il dominio ha un CNAME ma il lookup non ha prodotto record finali A/AAAA nello stesso set di risultati. Potrebbe essere normale per alcuni resolver, ma va verificato per evitare CNAME dangling.",
      { CNAME: cname },
      "Verificare manualmente la destinazione CNAME e controllare che il servizio terzo sia ancora attivo e rivendicato dal cliente.",
    ));
  }

  if (ns.length >= 2) {
    findings.push(pass("nameserver-redundancy", "nameserver", "Ridondanza nameserver presente", "Sono presenti almeno due nameserver autorevoli.", { NS: ns }));
  } else if (ns.length === 1) {
    findings.push(warn(
      "single-nameserver",
      "nameserver",
      "Un solo nameserver rilevato",
      "medium",
      "La zona sembra esporre un solo nameserver. Questo riduce resilienza e disponibilità DNS.",
      { NS: ns },
      "Configurare almeno due nameserver autorevoli su reti e infrastrutture distinte.",
    ));
  } else {
    findings.push(warn(
      "nameserver-missing",
      "nameserver",
      "Nameserver non rilevati",
      "medium",
      "Il resolver non ha restituito record NS per il dominio.",
      { domain },
      "Verificare delega DNS e record NS presso registrar e provider DNS.",
    ));
  }

  if (soa.length) {
    findings.push(info("soa-present", "nameserver", "SOA rilevato", "Il record SOA è presente e può essere usato per troubleshooting DNS.", { SOA: soa }));
  }

  if (mx.length) {
    findings.push(pass("mx-present", "email-security", "MX rilevati", "Il dominio espone record MX e sembra usare posta elettronica in ingresso.", { MX: mx }));
  } else {
    findings.push(info("mx-missing", "email-security", "MX non rilevati", "Il dominio non espone record MX. Se non invia/riceve email può essere normale, ma va confermato.", { domain }));
  }

  evaluateSpf(spfRecords, mx.length > 0, findings);
  evaluateDmarc(dmarcRecords, mx.length > 0, findings);

  if (mtaStsRecords.length > 0) {
    findings.push(pass("mta-sts-present", "email-security", "MTA-STS pubblicato", "Il dominio pubblica un record MTA-STS TXT.", { records: mtaStsRecords }));
  } else if (mx.length > 0) {
    findings.push(warn(
      "mta-sts-missing",
      "email-security",
      "MTA-STS non rilevato",
      "low",
      "Il dominio usa MX ma non pubblica un record _mta-sts. Non è obbligatorio, ma migliora la postura TLS per la posta.",
      { domain },
      "Valutare l'adozione di MTA-STS e policy HTTPS dedicata se il servizio email lo supporta.",
    ));
  }

  if (tlsRptRecords.length > 0) {
    findings.push(pass("tls-rpt-present", "email-security", "TLS-RPT pubblicato", "Il dominio pubblica reportistica TLS per email.", { records: tlsRptRecords }));
  } else if (mx.length > 0) {
    findings.push(info("tls-rpt-missing", "email-security", "TLS-RPT non rilevato", "Il dominio usa MX ma non pubblica record TLS-RPT. È un controllo migliorativo, non bloccante.", { domain }));
  }

  if (caa.length > 0) {
    findings.push(pass("caa-present", "certificate-policy", "CAA rilevato", "Il dominio pubblica record CAA per limitare le CA autorizzate all'emissione di certificati.", { CAA: caa }));
  } else {
    findings.push(warn(
      "caa-missing",
      "certificate-policy",
      "CAA non rilevato",
      "low",
      "Il dominio non pubblica record CAA. In assenza di CAA, l'emissione certificati non è limitata a specifiche Certification Authority.",
      { domain },
      "Pubblicare record CAA coerenti con le CA effettivamente usate, ad esempio issue e issuewild, più iodef per notifiche.",
    ));
  }

  if (ds.length > 0) {
    findings.push(pass("dnssec-delegation-present", "dnssec", "Delegazione DNSSEC rilevata", "Sono presenti record DS, indicatore di delegazione DNSSEC al parent.", { DS: ds }));
  } else {
    findings.push(warn(
      "dnssec-delegation-missing",
      "dnssec",
      "Delegazione DNSSEC non rilevata",
      "medium",
      "Il lookup DS non ha restituito record. Questo indica assenza di delegazione DNSSEC o mancata visibilità dal resolver usato.",
      { domain },
      "Verificare se il registrar e il provider DNS supportano DNSSEC e valutare l'attivazione con corretta gestione delle chiavi.",
    ));
  }

  const wildcardA = additional["wildcard.A"]?.answers ?? [];
  const wildcardAAAA = additional["wildcard.AAAA"]?.answers ?? [];
  if (wildcardA.length || wildcardAAAA.length) {
    findings.push(warn(
      "wildcard-dns-detected",
      "exposure",
      "Wildcard DNS rilevato",
      "low",
      "Un sottodominio casuale ha restituito record A/AAAA. La wildcard può essere legittima, ma aumenta il rischio di esposizioni involontarie e falsi positivi negli asset discovery.",
      { A: wildcardA, AAAA: wildcardAAAA },
      "Confermare che la wildcard DNS sia intenzionale, documentata e coperta da controlli di routing, TLS e hardening applicativo.",
    ));
  } else {
    findings.push(info("wildcard-dns-not-detected", "exposure", "Wildcard DNS non rilevato", "Il controllo su sottodominio casuale non ha restituito record A/AAAA.", { domain }));
  }

  const exposedTxt = txt
    .map((r) => r.data)
    .filter((value) => /verification|site-verification|MS=|apple-domain-verification|atlassian-domain-verification|facebook-domain-verification/i.test(value));
  if (exposedTxt.length) {
    findings.push(info("public-verification-records", "exposure", "Record TXT di verifica pubblici rilevati", "Sono presenti record TXT usati da servizi terzi per verifica dominio. Non sono vulnerabilità di per sé, ma aiutano la mappatura dei fornitori.", { records: exposedTxt }));
  }

  return findings;
}

function evaluateSpf(spfRecords: string[], hasMx: boolean, findings: DnsFinding[]): void {
  if (spfRecords.length === 0) {
    findings.push((hasMx ? warn : info)(
      "spf-missing",
      "email-security",
      "SPF non rilevato",
      hasMx ? "high" : "low",
      hasMx
        ? "Il dominio usa MX ma non pubblica un record SPF. Questo aumenta il rischio di spoofing del dominio."
        : "Il dominio non pubblica SPF. Se non invia email può essere accettabile, altrimenti va configurato.",
      {},
      "Pubblicare un record TXT SPF coerente con i sistemi autorizzati all'invio email, preferibilmente con policy finale -all dopo validazione.",
    ));
    return;
  }

  if (spfRecords.length > 1) {
    findings.push(fail(
      "spf-multiple-records",
      "email-security",
      "Record SPF multipli rilevati",
      "high",
      "Sono presenti più record SPF. Questo genera errori di valutazione SPF e può impattare deliverability e protezione anti-spoofing.",
      { records: spfRecords },
      "Consolidare tutti i meccanismi autorizzati in un singolo record SPF TXT.",
    ));
    return;
  }

  const spf = spfRecords[0];
  const dnsLookupEstimate = estimateSpfDnsLookups(spf);
  const status = spfPolicyStatus(spf);

  if (status === "pass") {
    findings.push(pass("spf-strong-policy", "email-security", "SPF presente con policy restrittiva", "Il record SPF termina con una policy restrittiva compatibile con hard fail.", { record: spf, estimatedDnsLookups: dnsLookupEstimate }));
  } else if (status === "soft") {
    findings.push(warn(
      "spf-softfail-policy",
      "email-security",
      "SPF presente ma in softfail",
      "medium",
      "Il record SPF usa ~all. È utile in fase di transizione, ma meno forte di -all.",
      { record: spf, estimatedDnsLookups: dnsLookupEstimate },
      "Validare tutti i mittenti legittimi e passare a -all quando il dominio è pronto.",
    ));
  } else if (status === "neutral") {
    findings.push(warn(
      "spf-neutral-policy",
      "email-security",
      "SPF presente ma policy neutrale",
      "medium",
      "Il record SPF usa ?all o non conclude con una policy restrittiva efficace.",
      { record: spf, estimatedDnsLookups: dnsLookupEstimate },
      "Rendere la policy più restrittiva dopo validazione dei mittenti autorizzati.",
    ));
  } else {
    findings.push(fail(
      "spf-allow-all-policy",
      "email-security",
      "SPF consente qualunque mittente",
      "high",
      "Il record SPF contiene +all o una configurazione equivalente troppo permissiva.",
      { record: spf, estimatedDnsLookups: dnsLookupEstimate },
      "Rimuovere +all e definire solo IP, include e provider autorizzati. Chiudere con -all dopo validazione.",
    ));
  }

  if (dnsLookupEstimate > 10) {
    findings.push(fail(
      "spf-dns-lookup-limit-exceeded",
      "email-security",
      "SPF supera il limite indicativo di lookup DNS",
      "high",
      "La stima dei meccanismi SPF che richiedono query DNS supera 10. Questo può causare permerror SPF.",
      { record: spf, estimatedDnsLookups: dnsLookupEstimate },
      "Ridurre include, a, mx, ptr, exists e redirect. Usare flattening SPF controllato o razionalizzare i provider di invio.",
    ));
  }
}

function evaluateDmarc(dmarcRecords: string[], hasMx: boolean, findings: DnsFinding[]): void {
  if (dmarcRecords.length === 0) {
    findings.push((hasMx ? warn : info)(
      "dmarc-missing",
      "email-security",
      "DMARC non rilevato",
      hasMx ? "high" : "low",
      hasMx
        ? "Il dominio usa MX ma non pubblica DMARC. Questo lascia più spazio a spoofing, phishing e abuso del dominio."
        : "DMARC non rilevato. Se il dominio non invia email può essere accettabile, ma va confermato.",
      {},
      "Pubblicare _dmarc con policy progressiva: iniziare da p=none con rua, poi passare a quarantine/reject dopo analisi dei report.",
    ));
    return;
  }

  if (dmarcRecords.length > 1) {
    findings.push(fail(
      "dmarc-multiple-records",
      "email-security",
      "Record DMARC multipli rilevati",
      "high",
      "Sono presenti più record DMARC. I receiver possono considerarli non validi.",
      { records: dmarcRecords },
      "Consolidare la configurazione in un solo record TXT su _dmarc.",
    ));
    return;
  }

  const dmarc = dmarcRecords[0];
  const policy = parseTag(dmarc, "p")?.toLowerCase();
  const pct = parseTag(dmarc, "pct");
  const rua = parseTag(dmarc, "rua");

  if (policy === "reject" || policy === "quarantine") {
    findings.push(pass("dmarc-enforcing-policy", "email-security", "DMARC presente con policy enforcement", "DMARC è configurato con policy quarantine o reject.", { record: dmarc, policy, pct, rua }));
  } else if (policy === "none") {
    findings.push(warn(
      "dmarc-monitoring-only",
      "email-security",
      "DMARC in sola osservazione",
      "medium",
      "DMARC è presente ma con p=none. È utile per monitoraggio, ma non blocca o mette in quarantena abusi.",
      { record: dmarc, policy, pct, rua },
      "Usare i report DMARC per bonificare i mittenti, poi passare a p=quarantine e infine p=reject.",
    ));
  } else {
    findings.push(fail(
      "dmarc-invalid-policy",
      "email-security",
      "Policy DMARC mancante o non valida",
      "high",
      "Il record DMARC non contiene una policy p valida.",
      { record: dmarc, policy },
      "Configurare p=none, p=quarantine o p=reject secondo la fase progettuale.",
    ));
  }

  if (pct && Number.parseInt(pct, 10) < 100) {
    findings.push(warn(
      "dmarc-partial-percentage",
      "email-security",
      "DMARC applicato a percentuale parziale",
      "low",
      "Il tag pct è inferiore a 100. Può essere corretto in rollout, ma va documentato.",
      { record: dmarc, pct },
      "Portare pct=100 quando il rollout DMARC è completato.",
    ));
  }

  if (!rua) {
    findings.push(warn(
      "dmarc-rua-missing",
      "email-security",
      "DMARC senza report aggregati rua",
      "low",
      "Il record DMARC non contiene rua. Senza report aggregati è più difficile governare il passaggio a enforcement.",
      { record: dmarc },
      "Aggiungere rua=mailto:... verso una mailbox o piattaforma di analisi DMARC autorizzata.",
    ));
  }
}

function parseTag(record: string, tag: string): string | undefined {
  const parts = record.split(";").map((part) => part.trim());
  const prefix = `${tag.toLowerCase()}=`;
  const match = parts.find((part) => part.toLowerCase().startsWith(prefix));
  return match?.slice(prefix.length).trim();
}

function estimateSpfDnsLookups(spf: string): number {
  const tokens = spf.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  let count = 0;
  for (const token of tokens) {
    const cleaned = token.replace(/^[+~?-]/, "").toLowerCase();
    if (cleaned.startsWith("include:")) count += 1;
    else if (cleaned === "a" || cleaned.startsWith("a:")) count += 1;
    else if (cleaned === "mx" || cleaned.startsWith("mx:")) count += 1;
    else if (cleaned.startsWith("ptr")) count += 1;
    else if (cleaned.startsWith("exists:")) count += 1;
    else if (cleaned.startsWith("redirect=")) count += 1;
  }
  return count;
}

function spfPolicyStatus(spf: string): "pass" | "soft" | "neutral" | "allow" {
  const lower = spf.toLowerCase();
  if (/(^|\s)\+all(\s|$)/.test(lower)) return "allow";
  if (/(^|\s)-all(\s|$)/.test(lower)) return "pass";
  if (/(^|\s)~all(\s|$)/.test(lower)) return "soft";
  return "neutral";
}

function pass(
  id: string,
  category: DnsFinding["category"],
  title: string,
  description: string,
  evidence?: Record<string, unknown>,
): DnsFinding {
  return {
    id,
    category,
    title,
    severity: "info",
    status: "pass",
    description,
    evidence,
    recommendation: "Nessuna azione obbligatoria. Mantenere il controllo in monitoraggio periodico.",
    reportSummary: title,
  };
}

function info(
  id: string,
  category: DnsFinding["category"],
  title: string,
  description: string,
  evidence?: Record<string, unknown>,
): DnsFinding {
  return {
    id,
    category,
    title,
    severity: "info",
    status: "info",
    description,
    evidence,
    recommendation: "Usare l'informazione come contesto di asset inventory e troubleshooting.",
    reportSummary: title,
  };
}

function warn(
  id: string,
  category: DnsFinding["category"],
  title: string,
  severity: Exclude<Severity, "critical">,
  description: string,
  evidence: Record<string, unknown>,
  recommendation: string,
): DnsFinding {
  return {
    id,
    category,
    title,
    severity,
    status: "warn",
    description,
    evidence,
    recommendation,
    reportSummary: `${title}: ${recommendation}`,
  };
}

function fail(
  id: string,
  category: DnsFinding["category"],
  title: string,
  severity: Severity,
  description: string,
  evidence: Record<string, unknown>,
  recommendation: string,
): DnsFinding {
  return {
    id,
    category,
    title,
    severity,
    status: "fail",
    description,
    evidence,
    recommendation,
    reportSummary: `${title}: ${recommendation}`,
  };
}

function calculateScore(findings: DnsFinding[]): number {
  const penalties: Record<Severity, number> = {
    critical: 35,
    high: 20,
    medium: 10,
    low: 4,
    info: 0,
  };

  const totalPenalty = findings.reduce((sum, finding) => {
    if (finding.status === "pass" || finding.status === "info") return sum;
    const multiplier = finding.status === "warn" ? 0.75 : 1;
    return sum + penalties[finding.severity] * multiplier;
  }, 0);

  return Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));
}

function gradeFromScore(score: number): DnsLookupResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function summarize(
  records: Record<string, DnsRecordSet>,
  additional: Record<string, DnsRecordSet>,
  findings: DnsFinding[],
): DnsLookupResult["summary"] {
  const countSeverity = (severity: Severity) => findings.filter((f) => f.severity === severity && f.status !== "pass").length;
  const txt = records.TXT?.answers ?? [];
  const spfRecords = txt.map((r) => r.data).filter((value) => /^v=spf1\b/i.test(value));
  const dmarcRecords = (additional["_dmarc.TXT"]?.answers ?? [])
    .map((r) => r.data)
    .filter((value) => /^v=DMARC1\b/i.test(value));

  return {
    totalFindings: findings.length,
    critical: countSeverity("critical"),
    high: countSeverity("high"),
    medium: countSeverity("medium"),
    low: countSeverity("low"),
    info: findings.filter((f) => f.severity === "info" && f.status !== "pass").length,
    hasWebResolution: Boolean((records.A?.answers.length ?? 0) || (records.AAAA?.answers.length ?? 0) || (records.CNAME?.answers.length ?? 0)),
    hasMailExchange: Boolean(records.MX?.answers.length),
    hasSpf: spfRecords.length === 1,
    hasDmarc: dmarcRecords.length === 1,
    hasCaa: Boolean(records.CAA?.answers.length),
    hasDnssecDelegation: Boolean(records.DS?.answers.length),
  };
}

// Optional local smoke test:
// deno run --allow-net dnsLookupScanner.ts example.com
if (import.meta.main) {
  const domain = Deno.args[0] ?? "example.com";
  const result = await scanDnsLookup({ domain, includeDkimSelectorChecks: false });
  console.log(JSON.stringify(result, null, 2));
}
