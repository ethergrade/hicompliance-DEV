import type { HipatchDashboardData } from "@/hooks/useHipatch";
import type { HipatchAsset, HipatchCve, HipatchCveAsset } from "@/lib/api/hipatch";

// Dati dimostrativi statici per Innovatech Group S.r.l. (nessun cliente reale).
const ASSETS_RAW: [string, string, string, string, string][] = [
  ["INV-DC01", "10.10.1.10", "Windows Server 2022 Standard", "Server", "Critical"],
  ["INV-DC02", "10.10.1.11", "Windows Server 2022 Standard", "Server", "Critical"],
  ["INV-FS01", "10.10.1.20", "Windows Server 2019 Datacenter", "Server", "Critical"],
  ["INV-SQL01", "10.10.1.30", "Windows Server 2019 Standard", "Server", "Critical"],
  ["INV-ERP01", "10.10.1.40", "Windows Server 2022 Standard", "Server", "Critical"],
  ["INV-BKP01", "10.10.1.50", "Windows Server 2019 Standard", "Server", "High"],
  ["INV-WEB01", "10.10.2.10", "Ubuntu 22.04 LTS", "Server", "High"],
  ["INV-RDS01", "10.10.1.60", "Windows Server 2016 Standard", "Server", "High"],
  ["INV-PRINT01", "10.10.1.70", "Windows Server 2016 Standard", "Server", "Medium"],
  ["INV-HV01", "10.10.0.5", "Windows Server 2022 Datacenter", "Server", "Critical"],
  ["INV-HV02", "10.10.0.6", "Windows Server 2022 Datacenter", "Server", "Critical"],
  ["INV-LNX-MON", "10.10.2.20", "Debian 12", "Server", "Medium"],
  ["NB-AMM-014", "10.10.20.14", "Windows 11 Pro 23H2", "Workstation", "Medium"],
  ["NB-AMM-022", "10.10.20.22", "Windows 11 Pro 23H2", "Workstation", "Medium"],
  ["NB-COM-031", "10.10.21.31", "Windows 11 Pro 22H2", "Workstation", "Medium"],
  ["NB-COM-037", "10.10.21.37", "Windows 10 Pro 22H2", "Workstation", "Low"],
  ["PC-PROD-102", "10.10.30.102", "Windows 10 Enterprise LTSC", "Workstation", "High"],
  ["PC-PROD-108", "10.10.30.108", "Windows 10 Enterprise LTSC", "Workstation", "High"],
  ["PC-UT-201", "10.10.22.201", "Windows 11 Pro 23H2", "Workstation", "Medium"],
  ["PC-UT-207", "10.10.22.207", "Windows 11 Pro 23H2", "Workstation", "Medium"],
  ["NB-DIR-001", "10.10.20.1", "macOS Sonoma 14.6", "Workstation", "High"],
  ["NB-IT-005", "10.10.23.5", "Windows 11 Pro 23H2", "Workstation", "High"],
  ["PC-LOG-301", "10.10.31.1", "Windows 10 Pro 22H2", "Workstation", "Low"],
  ["PC-LOG-305", "10.10.31.5", "Windows 10 Pro 22H2", "Workstation", "Low"],
];

const toAsset = ([name, ip, os, type, imp]: typeof ASSETS_RAW[number], i: number): HipatchCveAsset & HipatchAsset => ({
  "data.id": `inv-${i + 1}`,
  "data.name": name,
  "data.host_name": `${name.toLowerCase()}.innovatech.local`,
  "data.ip": ip,
  "data.os_full_name": os,
  "data.os_name": os.split(" ")[0],
  "data.asset_type": type,
  "data.importance": imp,
  "data.status": "online",
  "data.last_ping_time": `2026-09-24 ${String(8 + (i % 9)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
  "data.last_discovered_time": "2026-09-23 22:00",
  "data.mac": `00:15:5D:0A:${(16 + i).toString(16).toUpperCase()}:${(40 + i).toString(16).toUpperCase()}`,
});

const ASSETS = ASSETS_RAW.map(toAsset);
const byName = (n: string) => ASSETS.find((a) => a["data.name"] === n)!;
const servers = ASSETS.filter((a) => a["data.asset_type"] === "Server" && a["data.os_name"] === "Windows");
const clients = ASSETS.filter((a) => a["data.asset_type"] === "Workstation" && a["data.os_name"] === "Windows");

const CVES_RAW: [string, number, number, string, string, HipatchCveAsset[]][] = [
  ["CVE-2024-38063", 0.9412, 9.8, "Critical", "Esecuzione di codice remoto nello stack TCP/IP IPv6.", servers.slice(0, 7)],
  ["CVE-2024-21413", 0.9321, 9.8, "Critical", "Esecuzione di codice remoto nel client di posta tramite link malevolo.", clients.slice(0, 6)],
  ["CVE-2023-23397", 0.9254, 9.8, "Critical", "Elevazione privilegi nel client di posta tramite promemoria contraffatto.", clients.slice(2, 8)],
  ["CVE-2024-43461", 0.8876, 8.8, "High", "Spoofing della piattaforma MSHTML sfruttato attivamente.", clients],
  ["CVE-2024-38193", 0.8531, 7.8, "High", "Elevazione privilegi nel driver di funzione ausiliaria WinSock.", [...servers.slice(3, 6), ...clients.slice(0, 4)]],
  ["CVE-2024-30088", 0.8120, 7.0, "High", "Elevazione privilegi del kernel tramite race condition.", servers.slice(4)],
  ["CVE-2024-6387", 0.7944, 8.1, "High", "Race condition nel servizio di accesso remoto sicuro (regreSSHion).", [byName("INV-WEB01"), byName("INV-LNX-MON")]],
  ["CVE-2024-49138", 0.7210, 7.8, "High", "Elevazione privilegi nel driver Common Log File System.", servers],
  ["CVE-2025-21333", 0.6843, 7.8, "High", "Heap overflow nel provider di virtualizzazione.", [byName("INV-HV01"), byName("INV-HV02")]],
  ["CVE-2024-43491", 0.6102, 9.8, "Critical", "Rollback di patch di sicurezza nello stack di manutenzione.", [byName("PC-PROD-102"), byName("PC-PROD-108")]],
  ["CVE-2024-38112", 0.5721, 7.5, "High", "Spoofing MSHTML tramite file di collegamento internet.", clients.slice(4)],
  ["CVE-2025-24054", 0.4890, 6.5, "Medium", "Divulgazione hash NTLM tramite file manipolato.", [...servers.slice(0, 3), ...clients.slice(0, 5)]],
  ["CVE-2024-21338", 0.4412, 7.8, "High", "Elevazione privilegi nel kernel tramite driver AppLocker.", clients.slice(6)],
  ["CVE-2024-26169", 0.3920, 7.8, "High", "Elevazione privilegi nel servizio segnalazione errori.", servers.slice(5)],
  ["CVE-2023-36884", 0.3511, 7.5, "High", "Esecuzione di codice remoto tramite documenti Office.", clients.slice(0, 3)],
  ["CVE-2024-38080", 0.2870, 7.8, "High", "Elevazione privilegi nell'hypervisor.", [byName("INV-HV01"), byName("INV-HV02"), byName("INV-ERP01")]],
  ["CVE-2024-30051", 0.2310, 7.8, "High", "Heap overflow nella libreria core di Desktop Window Manager.", clients.slice(1, 7)],
  ["CVE-2024-38217", 0.1840, 5.4, "Medium", "Bypass della funzione di sicurezza Mark of the Web.", clients],
  ["CVE-2024-38014", 0.1520, 7.8, "High", "Elevazione privilegi nel servizio Installer.", [byName("INV-RDS01"), byName("INV-PRINT01")]],
  ["CVE-2023-4863", 0.1210, 8.8, "High", "Heap overflow nella libreria di decodifica immagini WebP.", [...clients.slice(0, 8), byName("NB-DIR-001")]],
  ["CVE-2024-20666", 0.0870, 6.6, "Medium", "Bypass della crittografia disco in avvio.", clients.slice(3, 9)],
  ["CVE-2024-38178", 0.0640, 7.5, "High", "Corruzione memoria del motore di scripting.", clients.slice(0, 4)],
  ["CVE-2024-43572", 0.0510, 7.8, "High", "Esecuzione di codice tramite console di gestione.", servers.slice(0, 4)],
  ["CVE-2024-21302", 0.0320, 6.7, "Medium", "Elevazione privilegi in modalità protetta virtuale.", servers.slice(6)],
  ["CVE-2024-38202", 0.0210, 7.3, "High", "Elevazione privilegi nello stack di aggiornamento.", clients.slice(5)],
  ["CVE-2024-3094", 0.0180, 10.0, "Critical", "Backdoor nella libreria di compressione xz.", [byName("INV-LNX-MON")]],
  ["CVE-2024-37085", 0.0140, 6.8, "Medium", "Bypass autenticazione su hypervisor aggiunto al dominio.", [byName("INV-HV01")]],
  ["CVE-2023-44487", 0.0098, 5.3, "Medium", "Denial of service HTTP/2 Rapid Reset.", [byName("INV-WEB01")]],
  ["CVE-2024-29988", 0.0071, 8.8, "High", "Bypass SmartScreen tramite archivio compresso.", clients.slice(0, 2)],
  ["CVE-2024-20698", 0.0042, 7.8, "High", "Elevazione privilegi del kernel.", clients.slice(8)],
  ["CVE-2024-21320", 0.0031, 6.5, "Medium", "Spoofing temi con divulgazione credenziali.", clients.slice(2, 5)],
  ["CVE-2024-26234", 0.0024, 6.7, "Medium", "Spoofing del driver proxy.", servers.slice(8)],
  ["CVE-2024-21307", 0.0015, 7.5, "High", "Esecuzione di codice nel client desktop remoto.", clients.slice(0, 3)],
  ["CVE-2024-20674", 0.0012, 3.8, "Low", "Bypass autenticazione Kerberos in scenari limitati.", servers.slice(0, 2)],
  ["CVE-2024-21316", 0.0008, 2.9, "Low", "Divulgazione informazioni nel servizio di stampa.", [byName("INV-PRINT01")]],
];

const CVES: HipatchCve[] = CVES_RAW.map(([id, epss, base, sev, desc, assets]) => ({
  problem_name: id,
  epss_score: epss,
  base_score: base,
  exploitability_score: Math.min(3.9, +(base / 2.6).toFixed(1)),
  severity: sev,
  description: desc,
  company_id: "innovatech",
  company_name: "Innovatech Group S.r.l.",
  first_vul_discovered: "2026-06-12",
  last_vul_discovered: "2026-09-24",
  total_count: assets.length,
  assets,
}));

const count = (s: string) => CVES.filter((c) => c.severity === s).length;
const avg = CVES.reduce((s, c) => s + Number(c.base_score), 0) / CVES.length;

const OS_PENDING = [
  ["INV-RDS01", "Aggiornamento cumulativo 2026-09 per Windows Server 2016", "KB5065427", "Critical"],
  ["INV-PRINT01", "Aggiornamento cumulativo 2026-09 per Windows Server 2016", "KB5065427", "Critical"],
  ["PC-PROD-102", "Aggiornamento cumulativo 2026-09 per Windows 10 LTSC", "KB5065429", "Critical"],
  ["PC-PROD-108", "Aggiornamento cumulativo 2026-09 per Windows 10 LTSC", "KB5065429", "Critical"],
  ["NB-COM-037", "Aggiornamento cumulativo 2026-09 per Windows 10 22H2", "KB5065429", "Important"],
  ["PC-LOG-301", "Aggiornamento cumulativo 2026-09 per Windows 10 22H2", "KB5065429", "Important"],
  ["PC-LOG-305", "Aggiornamento cumulativo 2026-09 per Windows 10 22H2", "KB5065429", "Important"],
  ["INV-HV01", "Aggiornamento stack di manutenzione Windows Server 2022", "KB5065306", "Important"],
  ["INV-HV02", "Aggiornamento stack di manutenzione Windows Server 2022", "KB5065306", "Important"],
  ["NB-COM-031", "Aggiornamento .NET Framework 4.8.1", "KB5064401", "Moderate"],
  ["PC-UT-207", "Aggiornamento definizioni antimalware", "KB2267602", "Low"],
].map(([d, n, kb, s], i) => ({ id: `osp-${i}`, device_name: d, name: n, kbNumber: kb, severity: s, status: "PENDING", type: "PATCH" }));

const OS_INSTALLED = ASSETS.slice(0, 18).map((a, i) => ({
  id: `osi-${i}`, device_name: a["data.name"], name: "Aggiornamento cumulativo 2026-08", kbNumber: `KB50637${10 + i}`,
  severity: "Critical", status: i === 3 || i === 11 ? "FAILED" : "INSTALLED", type: "PATCH",
  installedAt: `2026-09-${String(10 + (i % 12)).padStart(2, "0")}T0${i % 9}:30:00Z`,
}));

const SW_PENDING = [
  ["INV-SQL01", "Aggiornamento di sicurezza database server 2019 (KB5042749)", "Critical"],
  ["INV-ERP01", "Aggiornamento di sicurezza database server 2022 (KB5042578)", "Critical"],
  ["NB-AMM-014", "Browser aziendale 129.0 aggiornamento di sicurezza", "Critical"],
  ["NB-AMM-022", "Browser aziendale 129.0 aggiornamento di sicurezza", "Critical"],
  ["PC-UT-201", "Lettore PDF 24.003 aggiornamento di sicurezza", "Critical"],
  ["NB-IT-005", "Client VPN 7.4.2", "Recommended"],
  ["INV-BKP01", "Agente di backup 12.2 hotfix", "Recommended"],
  ["INV-FS01", "Runtime Visual C++ 14.40 (X64)", "Recommended"],
  ["PC-PROD-102", "Runtime Java 8u421", "Critical"],
  ["NB-DIR-001", "Suite Office 16.89", "Recommended"],
  ["INV-HV01", "Strumenti di integrazione virtualizzazione (X64)", "Optional"],
].map(([d, t, imp], i) => ({ id: `swp-${i}`, device_name: d, title: t, impact: imp, status: "Approved", type: "PATCH" }));

const SW_INSTALLED = clients.map((a, i) => ({
  id: `swi-${i}`, device_name: a["data.name"], title: "Browser aziendale 128.0", impact: "Critical",
  status: i === 5 ? "FAILED" : "INSTALLED", type: "PATCH", installedAt: `2026-09-${String(12 + i).padStart(2, "0")}T10:00:00Z`,
}));

export const HIPATCH_DEMO_DATA: HipatchDashboardData = {
  summary: {
    last_updated: "2026-09-24_08-00-00",
    avg_risk_score: +avg.toFixed(1),
    max_risk_score: 10,
    cve_by_severity: { critical: count("Critical"), high: count("High"), medium: count("Medium"), low: count("Low"), info: 0 },
    total_cves: CVES.length,
    total_assets: ASSETS.length,
    pending_os_patches: OS_PENDING.length,
    patch_risk_percent: 38.4,
  },
  assets: ASSETS,
  osPatchesPending: OS_PENDING,
  osPatchesInstalled: OS_INSTALLED,
  softwarePatchesPending: SW_PENDING,
  softwarePatchesInstalled: SW_INSTALLED,
  remediations: [],
  cves: CVES,
  epssVulnerabilities: CVES.filter((c) => Number(c.epss_score) >= 0.1),
};
