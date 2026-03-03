// All data is anonymized per privacy requirements
// Extended with 90 days of realistic historical data

// Helper to generate dates going back N days from a reference
const refDate = new Date(2026, 0, 28); // 28 Jan 2026

const fmt = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
};

const daysAgo = (n: number, h = 10, m = 0, s = 0) => {
  const d = new Date(refDate);
  d.setDate(d.getDate() - n);
  d.setHours(h, m, s, 0);
  return fmt(d);
};

const shortDate = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

export const overviewData = {
  refCode: 'HST-SIEM-0004',
  activationDate: '21/07/2025',
  hostsWindows: 84,
  hostsLinux: 0,
  logsSize: {
    baseLogs: '9.20 GB',
    customApp: '0.00 B',
    syslogStandard: '0.00 B',
    syslogFree: '0.00 B',
    webServers: '0.00 B',
    dlp: '22.51 GB',
    microsoft365: '3.86 GB',
    securityEvents: '2.86 MB',
    nas: '0.00 B',
    firewall: '581.57 MB',
    total: '36.14 GB',
  }
};

export const usbDrivesData = [
  { date: '15/12/2025', whitelist: 3, notWhitelist: 42 },
  { date: '22/12/2025', whitelist: 1, notWhitelist: 18 },
  { date: '29/12/2025', whitelist: 4, notWhitelist: 55 },
  { date: '05/01/2026', whitelist: 2, notWhitelist: 33 },
  { date: '12/01/2026', whitelist: 6, notWhitelist: 47 },
  { date: '19/01/2026', whitelist: 1, notWhitelist: 22 },
  { date: '26/01/2026', whitelist: 2, notWhitelist: 65 },
  { date: '27/01/2026', whitelist: 5, notWhitelist: 28 },
  { date: '28/01/2026', whitelist: 1, notWhitelist: 8 },
];

export const securityEventsData = [
  { name: 'Low', value: 3, color: '#fcd34d', lastReceived: '28/01/2026 09:12' },
  { name: 'Medium', value: 4, color: '#fb923c', lastReceived: '28/01/2026 10:17' },
  { name: 'High', value: 2, color: '#f87171', lastReceived: '27/01/2026 15:41' },
  { name: 'Critical', value: 1, color: '#dc2626', lastReceived: '28/01/2026 08:03' },
];

// Extended chart data with ~6 months of realistic data points
export const windowsLogsData = [
  { date: '26/07', login: 150, remoteLogin: 20, logout: 100, authFailure: 5 },
  { date: '07/08', login: 200, remoteLogin: 30, logout: 150, authFailure: 10 },
  { date: '19/08', login: 180, remoteLogin: 25, logout: 120, authFailure: 8 },
  { date: '31/08', login: 220, remoteLogin: 35, logout: 180, authFailure: 15 },
  { date: '12/09', login: 250, remoteLogin: 40, logout: 200, authFailure: 12 },
  { date: '28/09', login: 195, remoteLogin: 28, logout: 155, authFailure: 7 },
  { date: '15/10', login: 310, remoteLogin: 55, logout: 260, authFailure: 22 },
  { date: '30/10', login: 280, remoteLogin: 48, logout: 230, authFailure: 18 },
  { date: '15/11', login: 15000, remoteLogin: 380, logout: 13500, authFailure: 150 },
  { date: '23/11', login: 20000, remoteLogin: 500, logout: 18000, authFailure: 200 },
  { date: '05/12', login: 19000, remoteLogin: 450, logout: 17000, authFailure: 180 },
  { date: '20/12', login: 8500, remoteLogin: 210, logout: 7800, authFailure: 65 },
  { date: '04/01', login: 17500, remoteLogin: 420, logout: 16000, authFailure: 155 },
  { date: '18/01', login: 21000, remoteLogin: 530, logout: 19200, authFailure: 210 },
];

const hostnames = ['WS-PC001','WS-PC002','WS-PC003','WS-PC005','WS-PC008','WS-PC010','WS-PC012','WS-PC015','WS-PC018','WS-PC020','WS-PC022','WS-PC025','WS-PC028','WS-PC030','WS-MOBILE01','SRV-DC01','SRV-APP01','SRV-APP02','SRV-APP03','SRV-BACKUP01'];
const users = ['user001','user002','user003','user004','user005','user006','user007','user008','user009','user010','user011','user012','user013','user014','user015','user016','user017','user018','user019','user020','admin01','svc_backup'];
const actions = ['User Logged In','User Logged In With Cached Credentials','User Login Failure','User Logged Off'];
const types = ['Admin','Standard User','NA','Service Account'];
const ips = ['192.168.100.10','192.168.100.11','192.168.100.13','192.168.100.15','192.168.101.20','192.168.101.22','192.168.100.25','192.168.100.28','192.168.101.30','192.168.100.32','192.168.100.35','192.168.101.38','192.168.101.40','192.168.40.5','10.0.0.1','10.0.0.10','10.0.0.11','10.0.0.12','10.0.0.50','203.0.113.45'];

// Generate 90 days of Windows logs (3-5 events per day)
const generateWindowsLogs = () => {
  const logs: any[] = [];
  for (let day = 0; day < 90; day++) {
    const eventsPerDay = 3 + Math.floor(Math.random() * 3);
    for (let e = 0; e < eventsPerDay; e++) {
      const h = 7 + Math.floor(Math.random() * 12);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      const hi = Math.floor(Math.random() * hostnames.length);
      const ui = Math.floor(Math.random() * users.length);
      const ai = Math.floor(Math.random() * actions.length);
      const ti = actions[ai] === 'User Login Failure' ? 2 : (users[ui].startsWith('admin') || users[ui].startsWith('svc_') ? 0 : 1);
      logs.push({
        datetime: daysAgo(day, h, m, s),
        hostname: hostnames[hi],
        domain: 'DOMAIN',
        username: `${users[ui]}@company.local`,
        action: actions[ai],
        sourceIp: actions[ai] === 'User Logged Off' ? '-' : ips[Math.floor(Math.random() * ips.length)],
        type: types[ti],
      });
    }
  }
  return logs.sort((a, b) => {
    const pa = a.datetime.split(/[/ :]/);
    const pb = b.datetime.split(/[/ :]/);
    const da = new Date(+pa[2], +pa[1]-1, +pa[0], +pa[3], +pa[4], +pa[5]);
    const db = new Date(+pb[2], +pb[1]-1, +pb[0], +pb[3], +pb[4], +pb[5]);
    return db.getTime() - da.getTime();
  });
};

export const windowsLogsTableData = generateWindowsLogs();

// Entra ID chart data extended
export const entraIdLogsData = [
  { date: '07/08', success: 1200, interrupted: 100, failure: 50 },
  { date: '24/09', success: 1800, interrupted: 200, failure: 150 },
  { date: '06/10', success: 1500, interrupted: 150, failure: 100 },
  { date: '30/10', success: 300, interrupted: 50, failure: 20 },
  { date: '15/11', success: 950, interrupted: 90, failure: 55 },
  { date: '23/11', success: 800, interrupted: 80, failure: 40 },
  { date: '10/12', success: 1300, interrupted: 120, failure: 75 },
  { date: '17/12', success: 1100, interrupted: 100, failure: 60 },
  { date: '02/01', success: 650, interrupted: 45, failure: 25 },
  { date: '15/01', success: 1400, interrupted: 130, failure: 85 },
  { date: '25/01', success: 1600, interrupted: 160, failure: 95 },
];

const entraApps = ['Microsoft Account Controls V2','One Outlook Web','Azure Active Directory PowerShell','Microsoft Teams','SharePoint Online','Microsoft Graph API','Azure Portal'];
const entraStatuses = ['Success','Success','Success','Success','Failure','Interrupted'];
const entraLocations = ['Milano, IT','Milano, IT','Milano, IT','Roma, IT','Napoli, IT','Londra, UK','Mosca, RU','Pechino, CN','Los Angeles, California, US','San Pietroburgo, RU'];
const entraIps = ['80.19.100.10','80.19.100.11','80.19.100.12','80.19.100.13','80.19.100.14','80.19.100.15','80.19.100.16','80.19.100.17','80.19.100.18','80.19.100.19','80.19.100.20','151.38.20.5','151.38.20.6','2.36.80.5','185.45.30.8','95.173.200.55','216.24.50.10','114.55.80.33','91.220.160.22'];

const generateEntraIdLogs = () => {
  const logs: any[] = [];
  for (let day = 0; day < 90; day++) {
    const eventsPerDay = 2 + Math.floor(Math.random() * 4);
    for (let e = 0; e < eventsPerDay; e++) {
      const h = 7 + Math.floor(Math.random() * 13);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      const ui = Math.floor(Math.random() * users.length);
      const status = entraStatuses[Math.floor(Math.random() * entraStatuses.length)];
      const locIdx = status === 'Failure' ? (5 + Math.floor(Math.random() * 5)) : Math.floor(Math.random() * 5);
      logs.push({
        datetime: daysAgo(day, h, m, s),
        username: `${users[ui]}@company.local`,
        application: entraApps[Math.floor(Math.random() * entraApps.length)],
        status,
        location: entraLocations[locIdx],
        sourceIp: entraIps[Math.floor(Math.random() * entraIps.length)],
      });
    }
  }
  return logs.sort((a, b) => {
    const pa = a.datetime.split(/[/ :]/);
    const pb = b.datetime.split(/[/ :]/);
    const da = new Date(+pa[2], +pa[1]-1, +pa[0], +pa[3], +pa[4], +pa[5]);
    const db = new Date(+pb[2], +pb[1]-1, +pb[0], +pb[3], +pb[4], +pb[5]);
    return db.getTime() - da.getTime();
  });
};

export const entraIdTableData = generateEntraIdLogs();

export const sharePointLogsData = [
  { date: '19/08', opening: 40000, adding: 20000, deleting: 2000 },
  { date: '05/09', opening: 55000, adding: 28000, deleting: 3500 },
  { date: '18/10', opening: 150000, adding: 30000, deleting: 5000 },
  { date: '11/11', opening: 20000, adding: 40000, deleting: 8000 },
  { date: '28/11', opening: 75000, adding: 22000, deleting: 4200 },
  { date: '15/12', opening: 48000, adding: 18000, deleting: 2800 },
  { date: '05/01', opening: 62000, adding: 31000, deleting: 4500 },
  { date: '22/01', opening: 35000, adding: 25000, deleting: 3000 },
];

// Security events extended with 90 days
const secSeverities = ['Low','Medium','High','Critical'];
const secEvents = [
  { event: 'Ransomware behavior detected', source: 'Windows', category: 'Malware', severity: 'Critical' },
  { event: 'Spike of failed remote logons', source: 'Windows', category: 'Login', severity: 'High' },
  { event: 'Installation or use of Remote Desktop software', source: 'Windows', category: 'Processes', severity: 'Low' },
  { event: 'Microsoft 365 sign-in from unusual location', source: 'Microsoft365', category: 'Login', severity: 'Medium' },
  { event: 'Privilege escalation attempt', source: 'Windows', category: 'Security', severity: 'High' },
  { event: 'USB policy violation - unauthorized device', source: 'Windows', category: 'DLP', severity: 'Medium' },
  { event: 'After-hours login detected', source: 'Windows', category: 'Login', severity: 'Low' },
  { event: 'Lateral movement detected', source: 'Windows', category: 'Network', severity: 'Medium' },
  { event: 'Service account login from new IP', source: 'Windows', category: 'Login', severity: 'Low' },
  { event: 'Brute force attack on RDP', source: 'Windows', category: 'Login', severity: 'Medium' },
  { event: 'Data exfiltration attempt', source: 'Microsoft365', category: 'DLP', severity: 'High' },
  { event: 'Password policy violation', source: 'Windows', category: 'Security', severity: 'Low' },
  { event: 'Suspicious PowerShell execution', source: 'Windows', category: 'Processes', severity: 'Medium' },
  { event: 'New admin account created', source: 'Windows', category: 'Security', severity: 'Low' },
  { event: 'Multiple failed logins followed by success', source: 'Windows', category: 'Login', severity: 'Critical' },
  { event: 'Unusual outbound traffic volume', source: 'Windows', category: 'Network', severity: 'Medium' },
  { event: 'Credential dumping tool detected', source: 'Windows', category: 'Malware', severity: 'Critical' },
  { event: 'DNS tunneling activity', source: 'Windows', category: 'Network', severity: 'High' },
  { event: 'Unauthorized registry modification', source: 'Windows', category: 'Processes', severity: 'Medium' },
  { event: 'Abnormal service installation', source: 'Windows', category: 'Security', severity: 'Medium' },
];

const secMessages: Record<string, string[]> = {
  'Ransomware behavior detected': ['Mass file encryption detected in C:\\Users\\{user}\\Documents', 'Suspicious file rename pattern detected on {host}'],
  'Spike of failed remote logons': ['Failed logons count: {n} in 5 minutes from {ip}', '{n} RDP failures from external IP {ip}'],
  'Privilege escalation attempt': ['{user} attempted to add self to Domain Admins group', 'Token elevation detected for {user} on {host}'],
  'Brute force attack on RDP': ['{n} failed login attempts from external IP {ip}', 'Sustained brute force from {ip} over 30 minutes'],
  'Data exfiltration attempt': ['{user} downloaded {n}GB from SharePoint in 15 minutes', 'Bulk email forwarding rule created by {user}'],
  'Multiple failed logins followed by success': ['{n} failures then successful login for {user} from {ip}'],
  'Credential dumping tool detected': ['Mimikatz signature detected on {host}', 'LSASS memory dump detected on {host}'],
  'DNS tunneling activity': ['High-entropy DNS queries from {host} to suspicious domain', 'Unusual TXT record queries from {ip}'],
};

const generateSecurityEvents = () => {
  const logs: any[] = [];
  for (let day = 0; day < 90; day++) {
    const count = day < 3 ? 3 : (Math.random() < 0.3 ? 2 : (Math.random() < 0.5 ? 1 : 0));
    for (let e = 0; e < count; e++) {
      const h = Math.floor(Math.random() * 24);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      const se = secEvents[Math.floor(Math.random() * secEvents.length)];
      const ui = Math.floor(Math.random() * users.length);
      const hi = Math.floor(Math.random() * hostnames.length);
      const ip = ips[Math.floor(Math.random() * ips.length)];
      const msgs = secMessages[se.event] || [`${se.event} on ${hostnames[hi]} by ${users[ui]}@company.local`];
      const msg = msgs[Math.floor(Math.random() * msgs.length)]
        .replace('{user}', `${users[ui]}@company.local`)
        .replace('{host}', hostnames[hi])
        .replace('{ip}', ip)
        .replace('{n}', String(5 + Math.floor(Math.random() * 50)));
      logs.push({
        datetime: daysAgo(day, h, m, s),
        severity: se.severity,
        event: se.event,
        source: se.source,
        category: se.category,
        hostname: se.source === 'Microsoft365' ? '-' : hostnames[hi],
        message: msg,
        username: `${users[ui]}@company.local`,
        sourceIp: ip,
      });
    }
  }
  return logs.sort((a, b) => {
    const pa = a.datetime.split(/[/ :]/);
    const pb = b.datetime.split(/[/ :]/);
    const da = new Date(+pa[2], +pa[1]-1, +pa[0], +pa[3], +pa[4], +pa[5]);
    const db = new Date(+pb[2], +pb[1]-1, +pb[0], +pb[3], +pb[4], +pb[5]);
    return db.getTime() - da.getTime();
  });
};

export const securityEventsTableData = generateSecurityEvents();

// Startup/shutdown extended
export const startupShutdownData = [
  { date: '01/10', startup: 180, unexpected: 30, shutdown: 220 },
  { date: '15/10', startup: 220, unexpected: 45, shutdown: 280 },
  { date: '30/10', startup: 200, unexpected: 50, shutdown: 300 },
  { date: '11/11', startup: 350, unexpected: 80, shutdown: 400 },
  { date: '23/11', startup: 400, unexpected: 100, shutdown: 500 },
  { date: '05/12', startup: 450, unexpected: 120, shutdown: 550 },
  { date: '17/12', startup: 300, unexpected: 60, shutdown: 350 },
  { date: '29/12', startup: 250, unexpected: 40, shutdown: 300 },
  { date: '10/01', startup: 350, unexpected: 70, shutdown: 400 },
  { date: '22/01', startup: 280, unexpected: 50, shutdown: 320 },
];

const startupOps = ['Startup (Fast Startup)','Shutdown (Fast Startup)','Previous Shutdown Was Unexpected','Startup'];

const generateStartupLogs = () => {
  const logs: any[] = [];
  for (let day = 0; day < 90; day++) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let e = 0; e < count; e++) {
      const h = 6 + Math.floor(Math.random() * 16);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      logs.push({
        datetime: daysAgo(day, h, m, s),
        hostname: hostnames[Math.floor(Math.random() * hostnames.length)],
        operation: startupOps[Math.floor(Math.random() * startupOps.length)],
      });
    }
  }
  return logs.sort((a, b) => {
    const pa = a.datetime.split(/[/ :]/);
    const pb = b.datetime.split(/[/ :]/);
    const da = new Date(+pa[2], +pa[1]-1, +pa[0], +pa[3], +pa[4], +pa[5]);
    const db = new Date(+pb[2], +pb[1]-1, +pb[0], +pb[3], +pb[4], +pb[5]);
    return db.getTime() - da.getTime();
  });
};

export const startupShutdownTableData = generateStartupLogs();

// Firewall logs extended
const fwActions = ['IPS Alert','Firewall Rule','Web Filter','VPN','NAT','Config Change','User Management','GeoIP Block','Application Control'];
const fwActionTypes = ['Block','Drop','Allow','Edit','Info'];
const fwSeverities = ['Critical','High','Medium','Information','Notice'];
const fwMessages = [
  "Intrusion attempt from {ip} - signature: ET SCAN Nmap",
  "Blocked outbound connection to known C2 server 198.51.100.22:4443",
  "Blocked access to malicious URL category from {ip}",
  "VPN tunnel established: {user} from {ip}",
  "SNAT applied: {ip} -> 80.19.100.1:443 (HTTPS)",
  "SQL injection attempt detected from {ip} to 10.0.0.10:443",
  "Blocked SSH brute force from {ip} (50 attempts)",
  "Firewall Rule 'VPN Access' was updated by {user}",
  "Blocked inbound from CN IP range to SRV-DC01",
  "Port scan detected from {ip} targeting 10.0.0.0/24",
  "Blocked BitTorrent traffic from {ip}",
  "New firewall rule 'Block_CN_RU' created",
  "DDoS mitigation activated for {ip}",
  "Certificate mismatch on outbound TLS from {ip}",
];

const generateFirewallLogs = () => {
  const logs: any[] = [];
  for (let day = 0; day < 90; day++) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let e = 0; e < count; e++) {
      const h = Math.floor(Math.random() * 24);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      const actionIdx = Math.floor(Math.random() * fwActions.length);
      const ip = ips[Math.floor(Math.random() * ips.length)];
      const ui = Math.floor(Math.random() * users.length);
      const msg = fwMessages[Math.floor(Math.random() * fwMessages.length)]
        .replace('{ip}', ip)
        .replace('{user}', `${users[ui]}@company.local`);
      logs.push({
        datetime: daysAgo(day, h, m, s),
        hostname: 'SFW-001',
        severity: fwSeverities[Math.floor(Math.random() * fwSeverities.length)],
        username: actionIdx >= 5 ? `${users[ui]}` : 'system',
        actionType: fwActionTypes[Math.min(actionIdx, fwActionTypes.length - 1)],
        action: fwActions[actionIdx],
        message: msg,
        sourceIp: ip,
      });
    }
  }
  return logs.sort((a, b) => {
    const pa = a.datetime.split(/[/ :]/);
    const pb = b.datetime.split(/[/ :]/);
    const da = new Date(+pa[2], +pa[1]-1, +pa[0], +pa[3], +pa[4], +pa[5]);
    const db = new Date(+pb[2], +pb[1]-1, +pb[0], +pb[3], +pb[4], +pb[5]);
    return db.getTime() - da.getTime();
  });
};

export const firewallLogsTableData = generateFirewallLogs();

export const hostsTableData = [
  { hostname: 'WS-PC001', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.10'], issues: 6 },
  { hostname: 'WS-PC002', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.11'], issues: 7 },
  { hostname: 'WS-PC003', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '24H2', ipAddresses: ['192.168.100.13'], issues: 7 },
  { hostname: 'WS-PC005', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.15'], issues: 3 },
  { hostname: 'WS-PC008', domain: 'COMPANY SPA', osName: 'Windows 10 Pro', osVersion: '22H2', ipAddresses: ['192.168.101.20'], issues: 12 },
  { hostname: 'WS-PC010', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.101.22'], issues: 4 },
  { hostname: 'WS-PC012', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.25'], issues: 2 },
  { hostname: 'WS-PC015', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '24H2', ipAddresses: ['192.168.100.25'], issues: 5 },
  { hostname: 'WS-PC018', domain: 'COMPANY SPA', osName: 'Windows 10 Pro', osVersion: '22H2', ipAddresses: ['192.168.100.28'], issues: 9 },
  { hostname: 'WS-PC020', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.101.30'], issues: 8 },
  { hostname: 'WS-PC022', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.32'], issues: 1 },
  { hostname: 'WS-PC025', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.35'], issues: 15 },
  { hostname: 'WS-PC028', domain: 'COMPANY SPA', osName: 'Windows 10 Pro', osVersion: '22H2', ipAddresses: ['192.168.101.38'], issues: 11 },
  { hostname: 'WS-PC030', domain: 'COMPANY SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.101.40'], issues: 3 },
  { hostname: 'WS-MOBILE01', domain: 'DOMAIN', osName: 'Windows 10 Pro', osVersion: '22H2', ipAddresses: ['192.168.40.5'], issues: 10 },
  { hostname: 'SRV-DC01', domain: 'DOMAIN', osName: 'Windows Server 2022', osVersion: '21H2', ipAddresses: ['10.0.0.1'], issues: 4 },
  { hostname: 'SRV-APP01', domain: 'DOMAIN', osName: 'Windows Server 2022', osVersion: '21H2', ipAddresses: ['10.0.0.10'], issues: 6 },
  { hostname: 'SRV-APP02', domain: 'DOMAIN', osName: 'Windows Server 2019', osVersion: '1809', ipAddresses: ['10.0.0.11'], issues: 8 },
  { hostname: 'SRV-APP03', domain: 'DOMAIN', osName: 'Windows Server 2022', osVersion: '21H2', ipAddresses: ['10.0.0.12'], issues: 2 },
  { hostname: 'SRV-BACKUP01', domain: 'DOMAIN', osName: 'Windows Server 2019', osVersion: '1809', ipAddresses: ['10.0.0.50'], issues: 5 },
];

export const usersADData = [
  { name: 'admin01', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '7 Groups', isAdmin: true },
  { name: 'Administrator', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '8 Groups', isAdmin: true },
  { name: 'user001', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '4 Groups', isAdmin: false },
  { name: 'user002', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '3 Groups', isAdmin: false },
  { name: 'user003', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '5 Groups', isAdmin: true },
  { name: 'user004', status: 'Disabled', domain: 'DOMAIN.local', memberOf: '2 Groups', isAdmin: false },
  { name: 'user005', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '4 Groups', isAdmin: false },
  { name: 'user006', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '3 Groups', isAdmin: false },
  { name: 'user007', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '3 Groups', isAdmin: false },
  { name: 'user009', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '6 Groups', isAdmin: true },
  { name: 'user010', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '3 Groups', isAdmin: false },
  { name: 'user013', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '4 Groups', isAdmin: false },
  { name: 'svc_backup', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '5 Groups', isAdmin: true },
  { name: 'tmp_admin', status: 'Enabled', domain: 'DOMAIN.local', memberOf: '2 Groups', isAdmin: true },
  { name: 'user017', status: 'Disabled', domain: 'DOMAIN.local', memberOf: '2 Groups', isAdmin: false },
];

export const usersLocalData = [
  { name: 'Administrator', status: 'Enabled', domain: 'WS-PC001', memberOf: 'Administrators', isAdmin: true },
  { name: 'user001', status: 'Enabled', domain: 'WS-PC001', memberOf: 'Users', isAdmin: false },
  { name: 'Administrator', status: 'Enabled', domain: 'SRV-DC01', memberOf: 'Administrators', isAdmin: true },
  { name: 'svc_sql', status: 'Enabled', domain: 'SRV-APP01', memberOf: 'Administrators, Users', isAdmin: true },
  { name: 'backup_agent', status: 'Enabled', domain: 'SRV-BACKUP01', memberOf: 'Backup Operators', isAdmin: false },
  { name: 'Administrator', status: 'Enabled', domain: 'WS-PC010', memberOf: 'Administrators', isAdmin: true },
  { name: 'user007', status: 'Enabled', domain: 'WS-PC010', memberOf: 'Users', isAdmin: false },
  { name: 'guest', status: 'Disabled', domain: 'SRV-APP02', memberOf: 'Guests', isAdmin: false },
  { name: 'svc_monitor', status: 'Enabled', domain: 'SRV-APP03', memberOf: 'Users', isAdmin: false },
  { name: 'Administrator', status: 'Enabled', domain: 'WS-PC025', memberOf: 'Administrators', isAdmin: true },
];

export const usersEntraData = [
  { name: 'user001@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Sales', isAdmin: false },
  { name: 'user002@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Marketing', isAdmin: false },
  { name: 'user003@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, IT Admins', isAdmin: true },
  { name: 'admin01@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Global Admins', isAdmin: true },
  { name: 'user005@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, IT', isAdmin: false },
  { name: 'user006@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, HR', isAdmin: false },
  { name: 'user009@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, IT', isAdmin: false },
  { name: 'service@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'Service Accounts', isAdmin: false },
  { name: 'svc_backup@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'Service Accounts, Backup Ops', isAdmin: false },
  { name: 'user011@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Finance', isAdmin: false },
  { name: 'user013@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Sales', isAdmin: false },
  { name: 'user015@company.local', status: 'Enabled', domain: 'company.onmicrosoft.com', memberOf: 'All Users, Remote Workers', isAdmin: false },
];

export const actionColors: Record<string, string> = {
  'User Logged In With Cached Credentials': 'bg-primary/20 text-primary',
  'User Login Failure': 'bg-red-500/20 text-red-500',
  'User Logged In': 'bg-green-500/20 text-green-500',
  'User Logged Off': 'bg-muted text-muted-foreground',
  'Success': 'bg-green-500/20 text-green-500',
  'Failure': 'bg-red-500/20 text-red-500',
  'Interrupted': 'bg-yellow-500/20 text-yellow-500',
  'Startup (Fast Startup)': 'bg-green-500/20 text-green-500',
  'Shutdown (Fast Startup)': 'bg-blue-500/20 text-blue-500',
  'Previous Shutdown Was Unexpected': 'bg-orange-500/20 text-orange-500',
  'Startup': 'bg-green-500/20 text-green-500',
};

export const severityColors: Record<string, string> = {
  'Low': 'bg-yellow-500/20 text-yellow-500',
  'Medium': 'bg-orange-500/20 text-orange-500',
  'High': 'bg-red-500/20 text-red-500',
  'Critical': 'bg-red-700/20 text-red-700',
  'Information': 'bg-blue-500/20 text-blue-500',
  'Notice': 'bg-purple-500/20 text-purple-500',
};
