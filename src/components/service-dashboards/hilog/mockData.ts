// All data is anonymized per privacy requirements

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

export const windowsLogsData = [
  { date: '26/07', login: 150, remoteLogin: 20, logout: 100, authFailure: 5 },
  { date: '07/08', login: 200, remoteLogin: 30, logout: 150, authFailure: 10 },
  { date: '19/08', login: 180, remoteLogin: 25, logout: 120, authFailure: 8 },
  { date: '31/08', login: 220, remoteLogin: 35, logout: 180, authFailure: 15 },
  { date: '12/09', login: 250, remoteLogin: 40, logout: 200, authFailure: 12 },
  { date: '23/11', login: 20000, remoteLogin: 500, logout: 18000, authFailure: 200 },
  { date: '05/12', login: 19000, remoteLogin: 450, logout: 17000, authFailure: 180 },
];

export const windowsLogsTableData = [
  { datetime: '28/01/2026 10:24:16', hostname: 'WS-PC001', domain: 'DOMAIN', username: 'user001@company.local', action: 'User Logged In With Cached Credentials', sourceIp: '192.168.100.10', type: 'Admin' },
  { datetime: '28/01/2026 10:23:36', hostname: 'SRV-BACKUP01', domain: '-', username: '(empty)', action: 'User Login Failure', sourceIp: '192.168.100.50', type: 'NA' },
  { datetime: '28/01/2026 10:21:44', hostname: 'WS-PC002', domain: 'DOMAIN', username: 'user002@company.local', action: 'User Logged In', sourceIp: '192.168.100.11', type: 'Standard User' },
  { datetime: '28/01/2026 10:20:24', hostname: 'WS-PC002', domain: 'DOMAIN', username: 'user002@company.local', action: 'User Logged Off', sourceIp: '-', type: 'NA' },
  { datetime: '28/01/2026 10:18:50', hostname: 'SRV-DC01', domain: 'DOMAIN', username: 'user003@company.local', action: 'User Logged In', sourceIp: '10.0.0.1', type: 'Admin' },
  { datetime: '28/01/2026 10:15:22', hostname: 'WS-PC005', domain: 'DOMAIN', username: 'user004@company.local', action: 'User Login Failure', sourceIp: '192.168.100.15', type: 'Standard User' },
  { datetime: '28/01/2026 10:12:01', hostname: 'WS-PC005', domain: 'DOMAIN', username: 'user004@company.local', action: 'User Login Failure', sourceIp: '192.168.100.15', type: 'Standard User' },
  { datetime: '28/01/2026 10:10:33', hostname: 'SRV-APP01', domain: 'DOMAIN', username: 'user005@company.local', action: 'User Logged In', sourceIp: '10.0.0.10', type: 'Admin' },
  { datetime: '28/01/2026 09:58:14', hostname: 'WS-PC008', domain: 'DOMAIN', username: 'user006@company.local', action: 'User Logged In With Cached Credentials', sourceIp: '192.168.101.20', type: 'Standard User' },
  { datetime: '28/01/2026 09:55:41', hostname: 'WS-PC010', domain: 'DOMAIN', username: 'user007@company.local', action: 'User Logged In', sourceIp: '192.168.101.22', type: 'Standard User' },
  { datetime: '28/01/2026 09:50:10', hostname: 'SRV-DC01', domain: 'DOMAIN', username: 'user008@company.local', action: 'User Login Failure', sourceIp: '10.0.0.1', type: 'NA' },
  { datetime: '28/01/2026 09:48:05', hostname: 'SRV-APP02', domain: 'DOMAIN', username: 'user009@company.local', action: 'User Logged In', sourceIp: '10.0.0.11', type: 'Admin' },
  { datetime: '28/01/2026 09:45:33', hostname: 'WS-PC012', domain: 'DOMAIN', username: 'user010@company.local', action: 'User Logged Off', sourceIp: '-', type: 'NA' },
  { datetime: '28/01/2026 09:42:18', hostname: 'WS-PC015', domain: 'DOMAIN', username: 'user011@company.local', action: 'User Logged In', sourceIp: '192.168.100.25', type: 'Standard User' },
  { datetime: '28/01/2026 09:39:55', hostname: 'WS-PC018', domain: 'DOMAIN', username: 'user012@company.local', action: 'User Logged In With Cached Credentials', sourceIp: '192.168.100.28', type: 'Standard User' },
  { datetime: '28/01/2026 09:35:44', hostname: 'SRV-APP03', domain: 'DOMAIN', username: 'svc_backup@company.local', action: 'User Logged In', sourceIp: '10.0.0.12', type: 'Service Account' },
  { datetime: '28/01/2026 09:30:12', hostname: 'WS-PC020', domain: 'DOMAIN', username: 'user013@company.local', action: 'User Login Failure', sourceIp: '192.168.101.30', type: 'Standard User' },
  { datetime: '28/01/2026 09:28:01', hostname: 'WS-PC020', domain: 'DOMAIN', username: 'user013@company.local', action: 'User Login Failure', sourceIp: '192.168.101.30', type: 'Standard User' },
  { datetime: '28/01/2026 09:25:48', hostname: 'WS-PC020', domain: 'DOMAIN', username: 'user013@company.local', action: 'User Login Failure', sourceIp: '192.168.101.30', type: 'Standard User' },
  { datetime: '28/01/2026 09:20:33', hostname: 'SRV-DC01', domain: 'DOMAIN', username: 'admin01@company.local', action: 'User Logged In', sourceIp: '10.0.0.1', type: 'Admin' },
  { datetime: '28/01/2026 09:15:11', hostname: 'WS-PC022', domain: 'DOMAIN', username: 'user014@company.local', action: 'User Logged In', sourceIp: '192.168.100.32', type: 'Standard User' },
  { datetime: '28/01/2026 09:10:45', hostname: 'WS-MOBILE01', domain: 'DOMAIN', username: 'user015@company.local', action: 'User Logged In With Cached Credentials', sourceIp: '192.168.40.5', type: 'Standard User' },
  { datetime: '28/01/2026 08:55:30', hostname: 'WS-PC025', domain: 'DOMAIN', username: 'user016@company.local', action: 'User Logged In', sourceIp: '192.168.100.35', type: 'Standard User' },
  { datetime: '28/01/2026 08:50:18', hostname: 'SRV-BACKUP01', domain: 'DOMAIN', username: 'svc_backup@company.local', action: 'User Logged In', sourceIp: '10.0.0.50', type: 'Service Account' },
  { datetime: '28/01/2026 08:45:02', hostname: 'WS-PC028', domain: 'DOMAIN', username: 'user017@company.local', action: 'User Login Failure', sourceIp: '192.168.101.38', type: 'Standard User' },
  { datetime: '28/01/2026 08:40:55', hostname: 'WS-PC030', domain: 'DOMAIN', username: 'user018@company.local', action: 'User Logged In', sourceIp: '192.168.101.40', type: 'Standard User' },
  { datetime: '28/01/2026 08:35:12', hostname: 'SRV-APP01', domain: 'DOMAIN', username: 'user019@company.local', action: 'User Logged Off', sourceIp: '-', type: 'NA' },
  { datetime: '28/01/2026 08:30:44', hostname: 'WS-PC003', domain: 'DOMAIN', username: 'user020@company.local', action: 'User Logged In', sourceIp: '192.168.100.13', type: 'Standard User' },
  { datetime: '28/01/2026 08:25:11', hostname: 'SRV-DC01', domain: 'DOMAIN', username: '(empty)', action: 'User Login Failure', sourceIp: '203.0.113.45', type: 'NA' },
  { datetime: '28/01/2026 08:20:05', hostname: 'SRV-DC01', domain: 'DOMAIN', username: '(empty)', action: 'User Login Failure', sourceIp: '203.0.113.45', type: 'NA' },
];

export const entraIdLogsData = [
  { date: '07/08', success: 1200, interrupted: 100, failure: 50 },
  { date: '24/09', success: 1800, interrupted: 200, failure: 150 },
  { date: '06/10', success: 1500, interrupted: 150, failure: 100 },
  { date: '30/10', success: 300, interrupted: 50, failure: 20 },
  { date: '23/11', success: 800, interrupted: 80, failure: 40 },
  { date: '17/12', success: 1100, interrupted: 100, failure: 60 },
];

export const entraIdTableData = [
  { datetime: '28/01/2026 10:22:35', username: 'user001@company.local', application: 'Microsoft Account Controls V2', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.10' },
  { datetime: '28/01/2026 10:19:10', username: 'user002@company.local', application: 'One Outlook Web', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.11' },
  { datetime: '28/01/2026 10:13:09', username: 'service@company.local', application: 'Azure Active Directory PowerShell', status: 'Failure', location: 'Los Angeles, California, US', sourceIp: '216.24.50.10' },
  { datetime: '28/01/2026 10:08:45', username: 'user003@company.local', application: 'Microsoft Teams', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.12' },
  { datetime: '28/01/2026 10:05:22', username: 'user004@company.local', application: 'SharePoint Online', status: 'Success', location: 'Roma, IT', sourceIp: '151.38.20.5' },
  { datetime: '28/01/2026 09:58:11', username: 'user005@company.local', application: 'Microsoft Graph API', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.13' },
  { datetime: '28/01/2026 09:52:30', username: 'admin01@company.local', application: 'Azure Portal', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.14' },
  { datetime: '28/01/2026 09:45:18', username: 'user006@company.local', application: 'One Outlook Web', status: 'Interrupted', location: 'Londra, UK', sourceIp: '185.45.30.8' },
  { datetime: '28/01/2026 09:40:05', username: 'unknown@external.com', application: 'Azure Active Directory PowerShell', status: 'Failure', location: 'Mosca, RU', sourceIp: '95.173.200.55' },
  { datetime: '28/01/2026 09:35:44', username: 'user007@company.local', application: 'Microsoft Teams', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.15' },
  { datetime: '28/01/2026 09:30:12', username: 'user008@company.local', application: 'SharePoint Online', status: 'Failure', location: 'Milano, IT', sourceIp: '80.19.100.16' },
  { datetime: '28/01/2026 09:25:50', username: 'user009@company.local', application: 'One Outlook Web', status: 'Success', location: 'Roma, IT', sourceIp: '151.38.20.6' },
  { datetime: '28/01/2026 09:20:33', username: 'unknown2@external.com', application: 'Microsoft Graph API', status: 'Failure', location: 'Pechino, CN', sourceIp: '114.55.80.33' },
  { datetime: '28/01/2026 09:15:18', username: 'user010@company.local', application: 'Microsoft Teams', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.17' },
  { datetime: '28/01/2026 09:10:05', username: 'user011@company.local', application: 'Azure Portal', status: 'Interrupted', location: 'Milano, IT', sourceIp: '80.19.100.18' },
  { datetime: '28/01/2026 09:05:44', username: 'svc_backup@company.local', application: 'Azure Active Directory PowerShell', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.19' },
  { datetime: '28/01/2026 08:55:30', username: 'user012@company.local', application: 'One Outlook Web', status: 'Success', location: 'Napoli, IT', sourceIp: '2.36.80.5' },
  { datetime: '28/01/2026 08:50:22', username: 'user013@company.local', application: 'SharePoint Online', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.20' },
  { datetime: '28/01/2026 08:40:11', username: 'admin01@company.local', application: 'Azure Portal', status: 'Success', location: 'Milano, IT', sourceIp: '80.19.100.14' },
  { datetime: '28/01/2026 08:30:05', username: 'unknown3@external.com', application: 'Microsoft Graph API', status: 'Failure', location: 'San Pietroburgo, RU', sourceIp: '91.220.160.22' },
];

export const sharePointLogsData = [
  { date: '19/08', opening: 40000, adding: 20000, deleting: 2000 },
  { date: '18/10', opening: 150000, adding: 30000, deleting: 5000 },
  { date: '11/11', opening: 20000, adding: 40000, deleting: 8000 },
  { date: '22/01', opening: 35000, adding: 25000, deleting: 3000 },
];

export const securityEventsTableData = [
  { datetime: '28/01/2026 08:03:12', severity: 'Critical', event: 'Ransomware behavior detected', source: 'Windows', category: 'Malware', hostname: 'WS-PC025', message: 'Mass file encryption detected in C:\\Users\\user016\\Documents', username: 'user016@company.local', sourceIp: '192.168.100.35' },
  { datetime: '27/01/2026 15:41:50', severity: 'High', event: 'Spike of failed remote logons', source: 'Windows', category: 'Login', hostname: 'SRV-DC01', message: 'Failed logons count: 28 in 5 minutes from 203.0.113.45', username: '(multiple)', sourceIp: '203.0.113.45' },
  { datetime: '27/01/2026 14:41:50', severity: 'Low', event: 'Installation or use of Remote Desktop software', source: 'Windows', category: 'Processes', hostname: 'SRV-APP01', message: 'Process name: C:\\Users\\Administrator\\Downloads\\anydesk.exe', username: 'user005@company.local', sourceIp: '10.0.0.10' },
  { datetime: '27/01/2026 11:17:37', severity: 'Medium', event: 'Microsoft 365 sign-in from unusual location', source: 'Microsoft365', category: 'Login', hostname: '-', message: 'User admin01@company.local logged in from Mosca, RU', username: 'admin01@company.local', sourceIp: '95.173.200.55' },
  { datetime: '27/01/2026 10:30:22', severity: 'High', event: 'Privilege escalation attempt', source: 'Windows', category: 'Security', hostname: 'SRV-APP02', message: 'user009 attempted to add self to Domain Admins group', username: 'user009@company.local', sourceIp: '10.0.0.11' },
  { datetime: '27/01/2026 09:15:44', severity: 'Medium', event: 'USB policy violation - unauthorized device', source: 'Windows', category: 'DLP', hostname: 'WS-PC008', message: 'USB mass storage device SanDisk Ultra 128GB connected, not in whitelist', username: 'user006@company.local', sourceIp: '192.168.101.20' },
  { datetime: '27/01/2026 08:45:11', severity: 'Low', event: 'After-hours login detected', source: 'Windows', category: 'Login', hostname: 'WS-PC012', message: 'Login at 03:45 outside business hours (08:00-19:00)', username: 'user010@company.local', sourceIp: '192.168.100.25' },
  { datetime: '27/01/2026 08:20:05', severity: 'Medium', event: 'Lateral movement detected', source: 'Windows', category: 'Network', hostname: 'SRV-DC01', message: 'user003 accessed 12 different hosts via SMB in 10 minutes', username: 'user003@company.local', sourceIp: '10.0.0.1' },
  { datetime: '26/01/2026 22:10:33', severity: 'Low', event: 'Service account login from new IP', source: 'Windows', category: 'Login', hostname: 'SRV-APP03', message: 'svc_backup logged in from 192.168.101.99 (new IP)', username: 'svc_backup@company.local', sourceIp: '192.168.101.99' },
  { datetime: '26/01/2026 18:55:20', severity: 'Medium', event: 'Brute force attack on RDP', source: 'Windows', category: 'Login', hostname: 'SRV-DC01', message: '47 failed login attempts from external IP 203.0.113.45', username: '(multiple)', sourceIp: '203.0.113.45' },
  { datetime: '26/01/2026 16:30:15', severity: 'High', event: 'Data exfiltration attempt', source: 'Microsoft365', category: 'DLP', hostname: '-', message: 'user013 downloaded 2.3GB from SharePoint in 15 minutes', username: 'user013@company.local', sourceIp: '192.168.101.30' },
  { datetime: '26/01/2026 14:12:08', severity: 'Low', event: 'Password policy violation', source: 'Windows', category: 'Security', hostname: 'SRV-DC01', message: 'user017 password does not meet complexity requirements', username: 'user017@company.local', sourceIp: '192.168.101.38' },
  { datetime: '26/01/2026 11:45:30', severity: 'Medium', event: 'Suspicious PowerShell execution', source: 'Windows', category: 'Processes', hostname: 'WS-PC010', message: 'Encoded PowerShell command executed: -EncodedCommand JABX...', username: 'user007@company.local', sourceIp: '192.168.101.22' },
  { datetime: '26/01/2026 09:20:18', severity: 'Low', event: 'New admin account created', source: 'Windows', category: 'Security', hostname: 'SRV-DC01', message: 'New account tmp_admin added to Administrators group', username: 'admin01@company.local', sourceIp: '10.0.0.1' },
  { datetime: '25/01/2026 23:55:44', severity: 'Critical', event: 'Multiple failed logins followed by success', source: 'Windows', category: 'Login', hostname: 'SRV-DC01', message: '15 failures then successful login for admin01 from 203.0.113.45', username: 'admin01@company.local', sourceIp: '203.0.113.45' },
];

export const startupShutdownData = [
  { date: '30/10', startup: 200, unexpected: 50, shutdown: 300 },
  { date: '11/11', startup: 350, unexpected: 80, shutdown: 400 },
  { date: '23/11', startup: 400, unexpected: 100, shutdown: 500 },
  { date: '05/12', startup: 450, unexpected: 120, shutdown: 550 },
  { date: '17/12', startup: 300, unexpected: 60, shutdown: 350 },
  { date: '29/12', startup: 250, unexpected: 40, shutdown: 300 },
  { date: '10/01', startup: 350, unexpected: 70, shutdown: 400 },
  { date: '22/01', startup: 280, unexpected: 50, shutdown: 320 },
];

export const startupShutdownTableData = [
  { datetime: '28/01/2026 10:21:44', hostname: 'WS-PC002', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 10:20:26', hostname: 'WS-PC002', operation: 'Shutdown (Fast Startup)' },
  { datetime: '28/01/2026 09:43:20', hostname: 'WS-MOBILE01', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 09:29:41', hostname: 'WS-PC003', operation: 'Previous Shutdown Was Unexpected' },
  { datetime: '28/01/2026 09:15:10', hostname: 'WS-PC005', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 09:00:05', hostname: 'SRV-APP01', operation: 'Startup' },
  { datetime: '28/01/2026 08:55:33', hostname: 'WS-PC008', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 08:50:12', hostname: 'WS-PC010', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 08:45:44', hostname: 'WS-PC012', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 08:40:20', hostname: 'WS-PC015', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 08:35:55', hostname: 'SRV-DC01', operation: 'Startup' },
  { datetime: '28/01/2026 08:30:18', hostname: 'WS-PC018', operation: 'Startup (Fast Startup)' },
  { datetime: '27/01/2026 23:50:05', hostname: 'WS-PC025', operation: 'Previous Shutdown Was Unexpected' },
  { datetime: '27/01/2026 19:10:44', hostname: 'WS-PC022', operation: 'Shutdown (Fast Startup)' },
  { datetime: '27/01/2026 19:05:33', hostname: 'WS-PC028', operation: 'Shutdown (Fast Startup)' },
];

export const firewallLogsTableData = [
  { datetime: '28/01/2026 10:15:13', hostname: 'SFW-001', severity: 'Critical', username: 'system', actionType: 'Block', action: 'IPS Alert', message: "Intrusion attempt from 203.0.113.45 - signature: ET SCAN Nmap", sourceIp: '203.0.113.45' },
  { datetime: '28/01/2026 09:58:44', hostname: 'SFW-001', severity: 'High', username: 'system', actionType: 'Block', action: 'Firewall Rule', message: "Blocked outbound connection to known C2 server 198.51.100.22:4443", sourceIp: '192.168.100.35' },
  { datetime: '28/01/2026 09:45:22', hostname: 'SFW-001', severity: 'Medium', username: 'system', actionType: 'Block', action: 'Web Filter', message: "Blocked access to malicious URL category from 192.168.101.22", sourceIp: '192.168.101.22' },
  { datetime: '28/01/2026 09:30:11', hostname: 'SFW-001', severity: 'Information', username: 'system', actionType: 'Allow', action: 'VPN', message: "VPN tunnel established: user001@company.local from 80.19.100.10", sourceIp: '80.19.100.10' },
  { datetime: '28/01/2026 09:15:05', hostname: 'SFW-001', severity: 'Information', username: 'system', actionType: 'Allow', action: 'NAT', message: "SNAT applied: 192.168.100.25 -> 80.19.100.1:443 (HTTPS)", sourceIp: '192.168.100.25' },
  { datetime: '27/01/2026 18:30:44', hostname: 'SFW-001', severity: 'High', username: 'system', actionType: 'Drop', action: 'IPS Alert', message: "SQL injection attempt detected from 203.0.113.88 to 10.0.0.10:443", sourceIp: '203.0.113.88' },
  { datetime: '27/01/2026 16:45:33', hostname: 'SFW-001', severity: 'Medium', username: 'system', actionType: 'Block', action: 'Firewall Rule', message: "Blocked SSH brute force from 198.51.100.15 (50 attempts)", sourceIp: '198.51.100.15' },
  { datetime: '27/01/2026 14:53:13', hostname: 'SFW-001', severity: 'Information', username: 'admin01', actionType: 'Edit', action: 'Config Change', message: "Firewall Rule 'VPN Access' was updated by admin01", sourceIp: '10.0.0.1' },
  { datetime: '27/01/2026 14:49:15', hostname: 'SFW-001', severity: 'Notice', username: 'admin01', actionType: 'Info', action: 'User Management', message: "User 'svc_account' Status was changed to 'ACTIVE'", sourceIp: '10.0.0.1' },
  { datetime: '27/01/2026 12:20:08', hostname: 'SFW-001', severity: 'Medium', username: 'system', actionType: 'Block', action: 'GeoIP Block', message: "Blocked inbound from CN IP range 114.55.0.0/16 to SRV-DC01", sourceIp: '114.55.80.33' },
  { datetime: '27/01/2026 10:05:55', hostname: 'SFW-001', severity: 'Information', username: 'system', actionType: 'Allow', action: 'VPN', message: "VPN tunnel established: user015@company.local from 192.168.40.5", sourceIp: '192.168.40.5' },
  { datetime: '27/01/2026 08:30:22', hostname: 'SFW-001', severity: 'High', username: 'system', actionType: 'Drop', action: 'IPS Alert', message: "Port scan detected from 203.0.113.45 targeting 10.0.0.0/24", sourceIp: '203.0.113.45' },
  { datetime: '26/01/2026 22:15:11', hostname: 'SFW-001', severity: 'Notice', username: 'system', actionType: 'Allow', action: 'NAT', message: "DNAT: 80.19.100.1:8443 -> 10.0.0.10:443 (web app)", sourceIp: '185.45.30.8' },
  { datetime: '26/01/2026 20:45:33', hostname: 'SFW-001', severity: 'Medium', username: 'system', actionType: 'Block', action: 'Application Control', message: "Blocked BitTorrent traffic from 192.168.101.30", sourceIp: '192.168.101.30' },
  { datetime: '26/01/2026 15:10:05', hostname: 'SFW-001', severity: 'Information', username: 'admin01', actionType: 'Edit', action: 'Config Change', message: "New firewall rule 'Block_CN_RU' created", sourceIp: '10.0.0.1' },
];

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
