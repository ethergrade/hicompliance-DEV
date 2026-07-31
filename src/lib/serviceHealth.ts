import { securityEventsTableData, overviewData as hiLogOverview } from '@/components/service-dashboards/hilog/mockData';

/**
 * Health score engine per i servizi HiSolution.
 *
 * I singoli servizi non espongono uno score nativo: qui vengono estratte le
 * metriche gia' presenti nelle rispettive dashboard e normalizzate con un
 * modello comune:
 *
 *   score = 0.5 * coverage + 0.5 * hygiene - threatPenalty
 *
 * - coverage : quanto del perimetro e' effettivamente protetto/monitorato
 * - hygiene  : quanto e' pulito lo stato operativo (patch, compliance, errori)
 * - penalty  : peso delle minacce/anomalie ancora aperte
 */

export type ServiceHealth = {
  code: string;
  healthScore: number;
  issues: number;
  coverage: number;
  hygiene: number;
  penalty: number;
  drivers: string[];
};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

const compose = (
  code: string,
  coverage: number,
  hygiene: number,
  penalty: number,
  issues: number,
  drivers: string[],
): ServiceHealth => ({
  code,
  coverage: clamp(coverage),
  hygiene: clamp(hygiene),
  penalty: Math.round(penalty),
  issues,
  healthScore: clamp(0.5 * coverage + 0.5 * hygiene - penalty),
  drivers,
});

/* ---------------------------------- HiFirewall --------------------------------- */
const firewallHealth = (): ServiceHealth => {
  const activeRules = 247;
  const totalRules = 6; // regole censite in dashboard, tutte attive
  const activeRuleRatio = 100; // 6/6 Active
  const blockedConnections = 1842;
  const threatsBlocked = 156;
  const critical = 3;
  const high = 3;
  const medium = 2;

  const coverage = 0.7 * activeRuleRatio + 0.3 * pct(threatsBlocked, threatsBlocked + critical + high);
  const hygiene = 100 - pct(critical + high + medium, Math.max(1, blockedConnections / 100));
  const penalty = critical * 5 + high * 2.5 + medium * 1;

  return compose('hi_firewall', coverage, hygiene, penalty, critical + high, [
    `${activeRules} regole attive`,
    `${threatsBlocked} minacce bloccate`,
    `${critical} eventi critici recenti`,
  ]);
};

/* ---------------------------------- HiEndpoint --------------------------------- */
const endpointHealth = (): ServiceHealth => {
  const total = 156;
  const protectedEp = 142;
  const atRisk = 14;
  const pendingUpdates = 28;
  const avgCompliance = (98 + 100 + 72 + 95 + 85 + 68 + 45 + 100) / 8;
  const critical = 1;
  const high = 2;
  const pendingThreats = 1;

  const coverage = pct(protectedEp, total);
  const hygiene = 0.6 * (100 - pct(pendingUpdates, total)) + 0.4 * avgCompliance;
  const penalty = critical * 6 + high * 3 + pendingThreats * 2;

  return compose('hi_endpoint', coverage, hygiene, penalty, atRisk, [
    `${protectedEp}/${total} endpoint protetti`,
    `${pendingUpdates} aggiornamenti pendenti`,
    `${critical + high} minacce rilevanti aperte`,
  ]);
};

/* ------------------------------------ HiMail ----------------------------------- */
const mailHealth = (): ServiceHealth => {
  const processed = 45892;
  const delivered = 42156;
  const spam = 2847;
  const phishing = 156;
  const malware = 48;
  const quarantined = 685;
  const critical = 3;
  const high = 1;

  const handled = delivered + spam + phishing + malware + quarantined;
  const coverage = pct(Math.min(handled, processed), processed);
  const hygiene = 100 - pct(phishing + malware, processed) * 10;
  const penalty = critical * 2 + high * 1;

  return compose('hi_mail', coverage, hygiene, penalty, critical + high, [
    `${processed.toLocaleString('it-IT')} messaggi analizzati`,
    `${(phishing + malware).toLocaleString('it-IT')} phishing/malware bloccati`,
    `${quarantined} messaggi in quarantena`,
  ]);
};

/* ------------------------------------ HiLog ------------------------------------ */
const logHealth = (): ServiceHealth => {
  const events = Array.isArray(securityEventsTableData) ? securityEventsTableData : [];
  const count = (sev: string) => events.filter((e: any) => e?.severity === sev).length;
  const critical = count('Critical');
  const high = count('High');
  const medium = count('Medium');
  const hosts = hiLogOverview?.hostsWindows ?? 0;

  const coverage = hosts > 0 ? 100 : 0;
  const hygiene = 100 - pct(critical * 3 + high * 2 + medium, Math.max(1, events.length) * 3) * 100 / 100;
  const penalty = Math.min(30, critical * 1.5 + high * 0.7);

  return compose('hi_log', coverage, hygiene, penalty, critical + high, [
    `${hosts} host in raccolta log`,
    `${events.length} eventi di sicurezza / 90gg`,
    `${critical} eventi critici`,
  ]);
};

/* ----------------------------------- HiPatch ----------------------------------- */
const patchHealth = (): ServiceHealth => {
  const vulnHigh = 7;
  const vulnMedium = 3;
  const vulnLow = 1;
  const osPending = 3;
  const osInstalled = 4;
  const osFailed = 2;
  const swRejected = 6;
  const swInstalled = 5;
  const swFailed = 1;

  const coverage = 0.5 * pct(osInstalled - osFailed, osInstalled + osPending) +
    0.5 * pct(swInstalled - swFailed, swInstalled + swRejected);
  const hygiene = 100 - pct(osFailed + swFailed, Math.max(1, osInstalled + swInstalled)) * 0.8;
  const penalty = vulnHigh * 3 + vulnMedium * 1.5 + vulnLow * 0.5 + swRejected * 1.5;

  return compose('hi_patch', coverage, hygiene, penalty, vulnHigh + osPending, [
    `${vulnHigh + vulnMedium + vulnLow} vulnerabilita' aperte`,
    `${osPending} patch di sistema pendenti`,
    `${swRejected} patch software rifiutate`,
  ]);
};

/* ----------------------------------- HiTrack ----------------------------------- */
const trackHealth = (): ServiceHealth => {
  const total = 78;
  const online = 72;
  const warning = 3;
  const offline = 3;
  const avgUptime = 99.2;

  const coverage = pct(online, total);
  const hygiene = 0.7 * avgUptime + 0.3 * (100 - pct(warning, total));
  const penalty = offline * 2 + warning * 1.5;

  return compose('hi_track', coverage, hygiene, penalty, warning + offline, [
    `${online}/${total} dispositivi online`,
    `Uptime medio ${avgUptime}%`,
    `${warning} dispositivi in warning`,
  ]);
};

/* ----------------------------------- HiDetect ---------------------------------- */
const detectHealth = (): ServiceHealth => {
  const total = 245;
  const monitored = 238;
  const critical = 8;
  const high = 24;
  const medium = 45;
  const low = 50;
  const totalThreats = critical + high + medium + low;

  const coverage = pct(monitored, total);
  const hygiene = 100 - pct(critical + high, totalThreats);
  const penalty = critical * 1.5 + high * 0.4;

  return compose('hi_detect', coverage, hygiene, penalty, critical + high, [
    `${monitored}/${total} endpoint monitorati H24`,
    `${totalThreats} rilevazioni gestite`,
    `${critical} rilevazioni critiche`,
  ]);
};

/* ----------------------------------- HiMobile ---------------------------------- */
const mobileHealth = (): ServiceHealth => {
  const total = 342;
  const enrolled = 328;
  const compliant = 298;
  const nonCompliant = 30;
  const pendingEnrollment = 14;

  const coverage = pct(enrolled, total);
  const hygiene = pct(compliant, Math.max(1, enrolled));
  const penalty = nonCompliant * 0.2 + pendingEnrollment * 0.3;

  return compose('hi_mobile', coverage, hygiene, penalty, nonCompliant, [
    `${enrolled}/${total} device arruolati`,
    `${compliant} device compliant`,
    `${pendingEnrollment} arruolamenti pendenti`,
  ]);
};

const BUILDERS: Record<string, () => ServiceHealth> = {
  hi_firewall: firewallHealth,
  hi_endpoint: endpointHealth,
  hi_mail: mailHealth,
  hi_log: logHealth,
  hi_patch: patchHealth,
  hi_track: trackHealth,
  hi_detect: detectHealth,
  hi_mobile: mobileHealth,
};

export const getServiceHealth = (code: string): ServiceHealth =>
  (BUILDERS[code] ?? (() => compose(code, 0, 0, 0, 0, [])))();

export const getAllServiceHealth = (codes: string[]): ServiceHealth[] => codes.map(getServiceHealth);

/** Media degli health score: base per il True Risk Score. */
export const getAverageHealth = (codes: string[]): number => {
  const list = getAllServiceHealth(codes);
  if (!list.length) return 0;
  return Math.round(list.reduce((acc, s) => acc + s.healthScore, 0) / list.length);
};

/** True Risk Score = complemento della salute media dei servizi. */
export const getTrueRiskFromHealth = (codes: string[]): number => clamp(100 - getAverageHealth(codes));

export const getTotalIssues = (codes: string[]): number =>
  getAllServiceHealth(codes).reduce((acc, s) => acc + s.issues, 0);
