
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Eye,
  Calendar
} from 'lucide-react';

interface SecurityFinding {
  id: string;
  ip: string;
  mac: string;
  hostname: string;
  assetType: string;
  operatingSystem: string;
  lastUpdated: string;
  highestSeverity: 'critical' | 'high' | 'medium' | 'low';
  totalCves: number;
  epssScore: number;
  vulnerabilities: Vulnerability[];
}

interface Vulnerability {
  cveId: string;
  cvssScore: number;
  cvssVector: string;
  epssScore: number;
  epssPercentile: number;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  discoveredDate: string;
  lastModified: string;
  remediationStatus: 'open' | 'in_progress' | 'resolved' | 'false_positive';
  patchAvailable: boolean;
  exploitAvailable: boolean;
  affectedService: string;
}

const SecurityFindings: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [epssRangeFilter, setEpssRangeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Mock data for security findings
  const mockFindings: SecurityFinding[] = [
    {
      id: '1',
      ip: '203.0.113.10',
      mac: '00:1B:44:11:3A:B7',
      hostname: 'cliente1.com',
      assetType: 'Web Server',
      operatingSystem: 'Ubuntu 20.04 LTS',
      lastUpdated: '2024-01-15T10:30:00Z',
      highestSeverity: 'critical',
      totalCves: 3,
      epssScore: 8.2,
      vulnerabilities: [
        {
          cveId: 'CVE-2024-0001',
          cvssScore: 9.8,
          cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          epssScore: 8.2,
          epssPercentile: 95.2,
          description: 'Remote code execution vulnerability in Apache HTTP Server',
          severity: 'critical',
          category: 'Remote Code Execution',
          discoveredDate: '2024-01-10T08:15:00Z',
          lastModified: '2024-01-15T10:30:00Z',
          remediationStatus: 'open',
          patchAvailable: true,
          exploitAvailable: true,
          affectedService: 'Apache HTTPD 2.4.41'
        },
        {
          cveId: 'CVE-2024-0002',
          cvssScore: 7.5,
          cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
          epssScore: 6.1,
          epssPercentile: 78.3,
          description: 'Information disclosure vulnerability',
          severity: 'high',
          category: 'Information Disclosure',
          discoveredDate: '2024-01-12T14:20:00Z',
          lastModified: '2024-01-15T10:30:00Z',
          remediationStatus: 'in_progress',
          patchAvailable: true,
          exploitAvailable: false,
          affectedService: 'OpenSSL 1.1.1'
        }
      ]
    },
    {
      id: '2',
      ip: '203.0.113.25',
      mac: '00:1B:44:11:3A:C8',
      hostname: 'mail.cliente1.com',
      assetType: 'Mail Server',
      operatingSystem: 'CentOS 8',
      lastUpdated: '2024-01-14T16:45:00Z',
      highestSeverity: 'high',
      totalCves: 2,
      epssScore: 5.7,
      vulnerabilities: [
        {
          cveId: 'CVE-2024-0003',
          cvssScore: 8.1,
          cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H',
          epssScore: 5.7,
          epssPercentile: 67.1,
          description: 'Authentication bypass in Postfix mail server',
          severity: 'high',
          category: 'Authentication Bypass',
          discoveredDate: '2024-01-08T11:30:00Z',
          lastModified: '2024-01-14T16:45:00Z',
          remediationStatus: 'resolved',
          patchAvailable: true,
          exploitAvailable: false,
          affectedService: 'Postfix 3.4.8'
        }
      ]
    },
    {
      id: '3',
      ip: '203.0.113.45',
      mac: '00:1B:44:11:3A:D9',
      hostname: 'vpn.cliente1.com',
      assetType: 'VPN Gateway',
      operatingSystem: 'pfSense 2.6.0',
      lastUpdated: '2024-01-16T09:15:00Z',
      highestSeverity: 'critical',
      totalCves: 5,
      epssScore: 9.1,
      vulnerabilities: [
        {
          cveId: 'CVE-2024-0004',
          cvssScore: 10.0,
          cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
          epssScore: 9.1,
          epssPercentile: 98.7,
          description: 'Critical buffer overflow in OpenVPN allowing remote code execution',
          severity: 'critical',
          category: 'Buffer Overflow',
          discoveredDate: '2024-01-05T13:22:00Z',
          lastModified: '2024-01-16T09:15:00Z',
          remediationStatus: 'open',
          patchAvailable: true,
          exploitAvailable: true,
          affectedService: 'OpenVPN 2.4.7'
        }
      ]
    }
  ];

  // Filter and search logic
  const filteredFindings = useMemo(() => {
    return mockFindings.filter(finding => {
      const matchesSearch = searchTerm === '' || 
        finding.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
        finding.mac.toLowerCase().includes(searchTerm.toLowerCase()) ||
        finding.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        finding.vulnerabilities.some(vuln => 
          vuln.cveId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vuln.description.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesSeverity = severityFilter === 'all' || finding.highestSeverity === severityFilter;
      
      const matchesEpss = epssRangeFilter === 'all' || 
        (epssRangeFilter === 'high' && finding.epssScore >= 7) ||
        (epssRangeFilter === 'medium' && finding.epssScore >= 4 && finding.epssScore < 7) ||
        (epssRangeFilter === 'low' && finding.epssScore < 4);

      const matchesStatus = statusFilter === 'all' || 
        finding.vulnerabilities.some(vuln => vuln.remediationStatus === statusFilter);

      return matchesSearch && matchesSeverity && matchesEpss && matchesStatus;
    });
  }, [searchTerm, severityFilter, epssRangeFilter, statusFilter]);

  const totalPages = Math.ceil(filteredFindings.length / itemsPerPage);
  const paginatedFindings = filteredFindings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'open': return 'bg-red-100 text-red-800 border-red-200';
      case 'false_positive': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle className="w-4 h-4" />;
      case 'in_progress': return <Clock className="w-4 h-4" />;
      case 'open': return <XCircle className="w-4 h-4" />;
      case 'false_positive': return <Eye className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const toggleRowExpansion = (findingId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId);
    } else {
      newExpanded.add(findingId);
    }
    setExpandedRows(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              Security Findings & Vulnerabilità
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Analisi completa delle vulnerabilità CVSS, CVE e EPSS per tutti gli asset monitorati
            </p>
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Esporta Report
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/20 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{mockFindings.filter(f => f.highestSeverity === 'critical').length}</div>
            <div className="text-sm text-muted-foreground">Critiche</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{mockFindings.filter(f => f.highestSeverity === 'high').length}</div>
            <div className="text-sm text-muted-foreground">Alta</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{mockFindings.filter(f => f.highestSeverity === 'medium').length}</div>
            <div className="text-sm text-muted-foreground">Media</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{mockFindings.filter(f => f.highestSeverity === 'low').length}</div>
            <div className="text-sm text-muted-foreground">Bassa</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-muted/10 rounded-lg">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Cerca per IP, MAC, CVE ID, hostname..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Severità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le severità</SelectItem>
              <SelectItem value="critical">Critica</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="low">Bassa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={epssRangeFilter} onValueChange={setEpssRangeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="EPSS Score" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli EPSS</SelectItem>
              <SelectItem value="high">Alto ≥ 7.0</SelectItem>
              <SelectItem value="medium">Medio 4.0-6.9</SelectItem>
              <SelectItem value="low">Basso &lt; 4.0</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="open">Aperte</SelectItem>
              <SelectItem value="in_progress">In Corso</SelectItem>
              <SelectItem value="resolved">Risolte</SelectItem>
              <SelectItem value="false_positive">Falsi Positivi</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>MAC Address</TableHead>
                <TableHead>Severità Max</TableHead>
                <TableHead className="text-center">CVE</TableHead>
                <TableHead className="text-center">EPSS Score</TableHead>
                <TableHead>Ultimo Aggiornamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedFindings.map((finding) => (
                <React.Fragment key={finding.id}>
                  <TableRow className="hover:bg-muted/20">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(finding.id)}
                        className="p-1"
                      >
                        {expandedRows.has(finding.id) ? 
                          <ChevronDown className="w-4 h-4" /> : 
                          <ChevronRight className="w-4 h-4" />
                        }
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{finding.hostname}</div>
                        <div className="text-sm text-muted-foreground">{finding.assetType}</div>
                        <div className="text-xs text-muted-foreground">{finding.operatingSystem}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-muted rounded text-sm">{finding.ip}</code>
                    </TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{finding.mac}</code>
                    </TableCell>
                    <TableCell>
                      <Badge className={getSeverityColor(finding.highestSeverity)}>
                        {finding.highestSeverity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {finding.totalCves}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`font-mono ${
                          finding.epssScore >= 7 ? 'border-red-300 text-red-700' :
                          finding.epssScore >= 4 ? 'border-orange-300 text-orange-700' :
                          'border-green-300 text-green-700'
                        }`}
                      >
                        {finding.epssScore.toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {formatDate(finding.lastUpdated)}
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {expandedRows.has(finding.id) && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="p-4 bg-muted/10 rounded-lg">
                          <h4 className="font-semibold mb-3">Dettagli Vulnerabilità</h4>
                          <div className="space-y-4">
                            {finding.vulnerabilities.map((vuln, index) => (
                              <div key={index} className="border border-border rounded-lg p-4 bg-background">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  <div>
                                    <div className="flex items-center gap-3 mb-2">
                                      <Badge className={getSeverityColor(vuln.severity)}>
                                        {vuln.cveId}
                                      </Badge>
                                      <Badge className={getStatusColor(vuln.remediationStatus)} variant="outline">
                                        <div className="flex items-center gap-1">
                                          {getStatusIcon(vuln.remediationStatus)}
                                          {vuln.remediationStatus.replace('_', ' ').toUpperCase()}
                                        </div>
                                      </Badge>
                                    </div>
                                    <p className="text-sm mb-3">{vuln.description}</p>
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                      <div><strong>Servizio:</strong> {vuln.affectedService}</div>
                                      <div><strong>Categoria:</strong> {vuln.category}</div>
                                      <div><strong>Scoperta:</strong> {formatDate(vuln.discoveredDate)}</div>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                                      <div>
                                        <div className="text-sm font-medium">CVSS Score</div>
                                        <div className="text-2xl font-bold text-red-600">{vuln.cvssScore}</div>
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium">EPSS Score</div>
                                        <div className="text-2xl font-bold text-orange-600">{vuln.epssScore}</div>
                                        <div className="text-xs text-muted-foreground">{vuln.epssPercentile}° percentile</div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                      {vuln.patchAvailable && (
                                        <Badge variant="outline" className="text-green-700 border-green-300">
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Patch Disponibile
                                        </Badge>
                                      )}
                                      {vuln.exploitAvailable && (
                                        <Badge variant="outline" className="text-red-700 border-red-300">
                                          <AlertTriangle className="w-3 h-3 mr-1" />
                                          Exploit Disponibile
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    <div className="text-xs text-muted-foreground">
                                      <strong>CVSS Vector:</strong>
                                      <code className="block mt-1 p-1 bg-muted rounded text-xs">{vuln.cvssVector}</code>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* Results Summary */}
        <div className="mt-4 text-sm text-muted-foreground text-center">
          Visualizzati {paginatedFindings.length} di {filteredFindings.length} risultati
          {filteredFindings.length !== mockFindings.length && ` (${mockFindings.length} totali)`}
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityFindings;
