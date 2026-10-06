// Motore IDS/IPS demo: eventi, rilevamento STORM e correlazione a pattern/behaviour.
export type IdsProduct = 'endpoint' | 'firewall' | 'detect' | 'mail' | 'mobile';
export type IdsSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type IdsStage = 'Ricognizione' | 'Accesso iniziale' | 'Sfruttamento' | 'Movimento laterale' | 'Comando e controllo' | 'Esfiltrazione';

export interface IdsEvent {
  id: string; timestamp: string; ts: number; sid: number; signature: string; category: string; stage: IdsStage;
  source: string; destination: string; port: string; protocol: string; severity: IdsSeverity; action: 'Bloccato' | 'Rilevato' | 'Consentito';
  stormId: string;
}
export interface IdsStorm {
  id: string; source: string; type: string; start: string; end: string; events: number; targets: number; peakPerMin: number; severity: IdsSeverity; action: string;
}
export interface IdsCorrelation {
  id: string; rule: string; kind: 'Pattern' | 'Behaviour'; entity: string; description: string; events: number; stages: string; severity: IdsSeverity; confidence: number;
}

type Sig = { sid: number; name: string; category: string; stage: IdsStage; port: string; proto: string; sev: IdsSeverity };
const SIGS: Record<IdsProduct, Sig[]> = {
  firewall: [
    { sid: 2001219, name: 'ET SCAN Potential SSH Scan', category: 'Port scan', stage: 'Ricognizione', port: '22', proto: 'TCP', sev: 'Medium' },
    { sid: 2010935, name: 'ET SCAN MS SQL Server probe', category: 'Port scan', stage: 'Ricognizione', port: '1433', proto: 'TCP', sev: 'Medium' },
    { sid: 2024792, name: 'RDP brute force attempt', category: 'Brute force', stage: 'Accesso iniziale', port: '3389', proto: 'TCP', sev: 'High' },
    { sid: 2034647, name: 'Apache Log4j RCE attempt (CVE-2021-44228)', category: 'Exploit', stage: 'Sfruttamento', port: '443', proto: 'TCP', sev: 'Critical' },
    { sid: 2018959, name: 'SYN flood volumetrico', category: 'DoS', stage: 'Accesso iniziale', port: '80', proto: 'TCP', sev: 'High' },
    { sid: 2027865, name: 'Cobalt Strike beacon C2', category: 'C2', stage: 'Comando e controllo', port: '443', proto: 'TCP', sev: 'Critical' },
  ],
  endpoint: [
    { sid: 3100101, name: 'SMB lateral movement (PsExec)', category: 'Lateral movement', stage: 'Movimento laterale', port: '445', proto: 'TCP', sev: 'High' },
    { sid: 3100102, name: 'Mimikatz LSASS access', category: 'Credential theft', stage: 'Sfruttamento', port: '-', proto: 'Host', sev: 'Critical' },
    { sid: 3100103, name: 'Powershell download cradle', category: 'Execution', stage: 'Accesso iniziale', port: '443', proto: 'TCP', sev: 'High' },
    { sid: 3100104, name: 'WMI remote exec', category: 'Lateral movement', stage: 'Movimento laterale', port: '135', proto: 'TCP', sev: 'Medium' },
    { sid: 3100105, name: 'DNS tunneling sospetto', category: 'C2', stage: 'Comando e controllo', port: '53', proto: 'UDP', sev: 'High' },
  ],
  detect: [
    { sid: 4200001, name: 'NDR: host discovery ARP sweep', category: 'Discovery', stage: 'Ricognizione', port: '-', proto: 'ARP', sev: 'Low' },
    { sid: 4200002, name: 'NDR: Kerberoasting TGS burst', category: 'Credential theft', stage: 'Sfruttamento', port: '88', proto: 'TCP', sev: 'High' },
    { sid: 4200003, name: 'NDR: traffico verso dominio DGA', category: 'C2', stage: 'Comando e controllo', port: '443', proto: 'TCP', sev: 'Critical' },
    { sid: 4200004, name: 'NDR: upload anomalo verso cloud storage', category: 'Exfiltration', stage: 'Esfiltrazione', port: '443', proto: 'TCP', sev: 'High' },
    { sid: 4200005, name: 'NDR: SMB enumeration', category: 'Discovery', stage: 'Movimento laterale', port: '445', proto: 'TCP', sev: 'Medium' },
  ],
  mail: [
    { sid: 5300001, name: 'SMTP AUTH brute force', category: 'Brute force', stage: 'Accesso iniziale', port: '587', proto: 'TCP', sev: 'High' },
    { sid: 5300002, name: 'Directory harvest attack', category: 'Ricognizione', stage: 'Ricognizione', port: '25', proto: 'TCP', sev: 'Medium' },
    { sid: 5300003, name: 'Allegato con macro malevola', category: 'Malware', stage: 'Accesso iniziale', port: '25', proto: 'TCP', sev: 'Critical' },
    { sid: 5300004, name: 'Link phishing a dominio lookalike', category: 'Phishing', stage: 'Accesso iniziale', port: '25', proto: 'TCP', sev: 'High' },
  ],
  mobile: [
    { sid: 6400001, name: 'Wi-Fi rogue / MITM rilevato', category: 'Network attack', stage: 'Accesso iniziale', port: '-', proto: 'WLAN', sev: 'High' },
    { sid: 6400002, name: 'SSL stripping su hotspot', category: 'Network attack', stage: 'Sfruttamento', port: '443', proto: 'TCP', sev: 'High' },
    { sid: 6400003, name: 'Connessione a server C2 da app sideload', category: 'C2', stage: 'Comando e controllo', port: '8443', proto: 'TCP', sev: 'Critical' },
    { sid: 6400004, name: 'Scansione porte da rete pubblica', category: 'Port scan', stage: 'Ricognizione', port: '-', proto: 'TCP', sev: 'Low' },
  ],
};
const PREFIX: Record<IdsProduct, string> = { endpoint: 'EP', firewall: 'FW', detect: 'DT', mail: 'ML', mobile: 'MB' };

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const fmt = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

const EXT = ['185.220.101.34', '45.155.205.12', '91.240.118.7', '194.26.29.81', '103.75.190.4', '5.188.86.172'];
const INT = Array.from({ length: 24 }, (_, i) => `10.10.${Math.floor(i / 8) + 1}.${20 + i}`);
const MOBILE = Array.from({ length: 12 }, (_, i) => `MOB-${String(i + 1).padStart(3, '0')}`);

const SEV_RANK: Record<IdsSeverity, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
const maxSev = (a: IdsSeverity[]) => a.reduce((m, s) => (SEV_RANK[s] > SEV_RANK[m] ? s : m), 'Low' as IdsSeverity);

const BASE = Date.UTC(2026, 9, 6, 6, 0, 0);

export function buildIds(product: IdsProduct) {
  const r = rng(product.length * 7919 + product.charCodeAt(0));
  const sigs = SIGS[product];
  const targets = product === 'mobile' ? MOBILE : INT;
  const raw: Omit<IdsEvent, 'id' | 'stormId'>[] = [];
  const push = (ts: number, sig: Sig, src: string, dst: string) => raw.push({
    ts, timestamp: fmt(ts), sid: sig.sid, signature: sig.name, category: sig.category, stage: sig.stage,
    source: src, destination: dst, port: sig.port, protocol: sig.proto, severity: sig.sev,
    action: sig.sev === 'Critical' || sig.sev === 'High' ? 'Bloccato' : r() > 0.4 ? 'Rilevato' : 'Consentito',
  });
  // rumore di fondo
  for (let i = 0; i < 70; i++) push(BASE + Math.floor(r() * 6 * 3600e3), pick(r, sigs), pick(r, EXT), pick(r, targets));
  // 3 STORM: raffiche dalla stessa sorgente
  for (let s = 0; s < 3; s++) {
    const src = EXT[s]; const sig = sigs[s % sigs.length]; const start = BASE + (s + 1) * 5400e3;
    const n = 25 + Math.floor(r() * 30);
    for (let i = 0; i < n; i++) push(start + Math.floor(r() * 240e3), sig, src, pick(r, targets));
  }
  // catena comportamentale: stessa sorgente percorre le fasi
  const chainSrc = EXT[4]; const victim = targets[3];
  [...sigs].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)).forEach((sig, i) => push(BASE + 2 * 3600e3 + i * 600e3, sig, chainSrc, victim));

  raw.sort((a, b) => b.ts - a.ts);
  const events: IdsEvent[] = raw.map((e, i) => ({ ...e, id: `IDS-${PREFIX[product]}-${String(raw.length - i).padStart(4, '0')}`, stormId: '' }));
  const storms = detectStorms(events, product);
  const correlations = correlate(events, product);
  return { events, storms, correlations };
}

const STAGES: IdsStage[] = ['Ricognizione', 'Accesso iniziale', 'Sfruttamento', 'Movimento laterale', 'Comando e controllo', 'Esfiltrazione'];

/** STORM = ≥15 eventi dalla stessa sorgente in una finestra di 5 minuti. */
export function detectStorms(events: IdsEvent[], product: IdsProduct): IdsStorm[] {
  const bySrc = new Map<string, IdsEvent[]>();
  events.forEach(e => bySrc.set(e.source, [...(bySrc.get(e.source) || []), e]));
  const storms: IdsStorm[] = [];
  bySrc.forEach((list, src) => {
    const asc = [...list].sort((a, b) => a.ts - b.ts);
    let i = 0;
    while (i < asc.length) {
      let j = i;
      while (j + 1 < asc.length && asc[j + 1].ts - asc[i].ts <= 300e3) j++;
      const win = asc.slice(i, j + 1);
      if (win.length >= 15) {
        const id = `STORM-${PREFIX[product]}-${String(storms.length + 1).padStart(2, '0')}`;
        win.forEach(e => (e.stormId = id));
        const mins = Math.max(1, (win[win.length - 1].ts - win[0].ts) / 60e3);
        const cat = win[0].category;
        storms.push({
          id, source: src, start: win[0].timestamp, end: win[win.length - 1].timestamp, events: win.length,
          targets: new Set(win.map(e => e.destination)).size, peakPerMin: Math.round(win.length / mins),
          type: cat === 'Port scan' || cat === 'Discovery' || cat === 'Ricognizione' ? 'Scansione massiva' : cat === 'Brute force' ? 'Brute force distribuito' : cat === 'DoS' ? 'Flood volumetrico' : `Raffica ${cat}`,
          severity: maxSev(win.map(e => e.severity)), action: win.every(e => e.action === 'Bloccato') ? 'Sorgente bloccata' : 'Da bloccare',
        });
        i = j + 1;
      } else i++;
    }
  });
  return storms;
}

/** Correlazioni semplici: pattern (stessa firma, molti target / molte sorgenti) e behaviour (catena di fasi). */
export function correlate(events: IdsEvent[], product: IdsProduct): IdsCorrelation[] {
  const out: IdsCorrelation[] = [];
  const add = (c: Omit<IdsCorrelation, 'id'>) => out.push({ ...c, id: `COR-${PREFIX[product]}-${String(out.length + 1).padStart(2, '0')}` });
  const group = (k: (e: IdsEvent) => string) => { const m = new Map<string, IdsEvent[]>(); events.forEach(e => m.set(k(e), [...(m.get(k(e)) || []), e])); return m; };

  group(e => `${e.source}|${e.sid}`).forEach((l, k) => {
    const t = new Set(l.map(e => e.destination)).size;
    if (t >= 5) add({ rule: 'P1 Firma ripetuta su più target', kind: 'Pattern', entity: k.split('|')[0], description: `${l[0].signature} su ${t} destinazioni`, events: l.length, stages: l[0].stage, severity: maxSev(l.map(e => e.severity)), confidence: Math.min(95, 50 + t * 3) });
  });
  group(e => `${e.destination}|${e.sid}`).forEach((l, k) => {
    const s = new Set(l.map(e => e.source)).size;
    if (s >= 3) add({ rule: 'P2 Attacco distribuito su un asset', kind: 'Pattern', entity: k.split('|')[0], description: `${s} sorgenti diverse con ${l[0].signature}`, events: l.length, stages: l[0].stage, severity: maxSev(l.map(e => e.severity)), confidence: Math.min(90, 45 + s * 10) });
  });
  group(e => `${e.source}|${e.destination}`).forEach((l, k) => {
    const st = STAGES.filter(s => l.some(e => e.stage === s));
    if (st.length >= 3) add({ rule: 'B1 Catena di attacco (kill chain)', kind: 'Behaviour', entity: k.replace('|', ' → '), description: `Progressione in ${st.length} fasi entro ${Math.round((Math.max(...l.map(e => e.ts)) - Math.min(...l.map(e => e.ts))) / 60e3)} min`, events: l.length, stages: st.join(' → '), severity: 'Critical', confidence: Math.min(98, 60 + st.length * 8) });
  });
  group(e => e.source).forEach((l, src) => {
    const allowed = l.filter(e => e.action === 'Consentito').length;
    if (l.some(e => e.action === 'Bloccato') && allowed >= 2) add({ rule: 'B2 Sorgente bloccata ma ancora attiva', kind: 'Behaviour', entity: src, description: `${allowed} eventi consentiti dopo blocchi: verificare regole`, events: l.length, stages: Array.from(new Set(l.map(e => e.stage))).slice(0, 3).join(', '), severity: 'High', confidence: 70 });
  });
  return out.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.confidence - a.confidence);
}
