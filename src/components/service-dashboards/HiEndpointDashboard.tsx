import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Info, 
  Laptop, 
  Monitor, 
  Server, 
  Smartphone, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Cpu
} from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import { DemoDataBadge } from './DemoDataBadge';
import { useEndpointDashboard } from '@/hooks/useEndpoints';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Data provided by useEndpointDashboard hook with mock fallback
// When the endpoint protection API becomes available, it will be used automatically.

const typeIcons = {
  Workstation: Monitor,
  Laptop: Laptop,
  Server: Server,
  Mobile: Smartphone,
};

const statusColors = {
  Online: 'bg-green-500/20 text-green-500',
  Offline: 'bg-muted text-muted-foreground',
  Protected: 'bg-green-500/20 text-green-500',
  'At Risk': 'bg-red-500/20 text-red-500',
  Unknown: 'bg-muted text-muted-foreground',
  Outdated: 'bg-yellow-500/20 text-yellow-500',
  Quarantined: 'bg-yellow-500/20 text-yellow-500',
  Removed: 'bg-green-500/20 text-green-500',
  Blocked: 'bg-green-500/20 text-green-500',
  Patched: 'bg-green-500/20 text-green-500',
  Pending: 'bg-orange-500/20 text-orange-500',
};

const severityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

const priorityColors = {
  Low: 'bg-green-500/20 text-green-500',
  Medium: 'bg-yellow-500/20 text-yellow-500',
  High: 'bg-orange-500/20 text-orange-500',
  Critical: 'bg-red-500/20 text-red-500',
};

export const HiEndpointDashboard: React.FC = () => {
  const { data, loading, isMock } = useEndpointDashboard();
  const { stats: endpointStats, endpoints, detectedThreats, pendingUpdates } = data;

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Endpoint Overview</h2>
          <DemoDataBadge show={isMock} />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <Cpu className="w-6 h-6 text-primary mb-2" />
                <p className="text-2xl font-bold">{endpointStats.totalEndpoints}</p>
                <p className="text-xs text-muted-foreground">Totale Endpoint</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <ShieldCheck className="w-6 h-6 text-green-500 mb-2" />
                <p className="text-2xl font-bold text-green-500">{endpointStats.protectedEndpoints}</p>
                <p className="text-xs text-muted-foreground">Protetti</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <ShieldAlert className="w-6 h-6 text-red-500 mb-2" />
                <p className="text-2xl font-bold text-red-500">{endpointStats.atRiskEndpoints}</p>
                <p className="text-xs text-muted-foreground">A Rischio</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
                <p className="text-2xl font-bold text-green-500">{endpointStats.onlineEndpoints}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <XCircle className="w-6 h-6 text-muted-foreground mb-2" />
                <p className="text-2xl font-bold text-muted-foreground">{endpointStats.offlineEndpoints}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col items-center text-center">
                <Clock className="w-6 h-6 text-yellow-500 mb-2" />
                <p className="text-2xl font-bold text-yellow-500">{endpointStats.pendingUpdates}</p>
                <p className="text-xs text-muted-foreground">Aggiornamenti</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Endpoint Protection Score"
            level="Buono"
            levelColor="green"
            score={91}
            ringColor="#10b981"
          />
          <RiskScoreCard 
            title="Compliance Score"
            level="Moderato"
            levelColor="yellow"
            score={78}
            ringColor="#eab308"
          />
        </div>
      </section>

      {/* Endpoints List Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Elenco Endpoint</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Laptop className="w-5 h-5 text-primary" />
              Endpoint monitorati
            </CardTitle>
            <p className="text-sm text-muted-foreground">Stato e protezione di tutti gli endpoint</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Sistema Operativo</TableHead>
                  <TableHead>Ultimo Contatto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Protezione</TableHead>
                  <TableHead>Minacce</TableHead>
                  <TableHead>Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint, index) => {
                  const TypeIcon = typeIcons[endpoint.type];
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4 text-muted-foreground" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{endpoint.type}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{endpoint.name}</TableCell>
                      <TableCell className="text-sm">{endpoint.os}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{endpoint.lastSeen}</TableCell>
                      <TableCell>
                        <Badge className={cn("font-medium", statusColors[endpoint.status])}>
                          {endpoint.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("font-medium", statusColors[endpoint.protection])}>
                          {endpoint.protection}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {endpoint.threats > 0 ? (
                          <span className="text-red-500 font-semibold">{endpoint.threats}</span>
                        ) : (
                          <span className="text-green-500">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                endpoint.compliance >= 90 ? 'bg-green-500' :
                                endpoint.compliance >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                              )}
                              style={{ width: `${endpoint.compliance}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{endpoint.compliance}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Detected Threats Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Minacce Rilevate</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Ultime minacce rilevate
            </CardTitle>
            <p className="text-sm text-muted-foreground">Minacce identificate sugli endpoint</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Nome Minaccia</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Rilevata</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detectedThreats.map((threat, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{threat.id}</TableCell>
                    <TableCell className="font-medium">{threat.endpoint}</TableCell>
                    <TableCell className="font-mono text-sm">{threat.threatName}</TableCell>
                    <TableCell>{threat.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{threat.detectedAt}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", severityColors[threat.severity])}>
                        {threat.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", statusColors[threat.status])}>
                        {threat.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Pending Updates Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Aggiornamenti Pendenti</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              Aggiornamenti da installare
            </CardTitle>
            <p className="text-sm text-muted-foreground">Endpoint con definizioni o software obsoleti</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Componente</TableHead>
                  <TableHead>Versione Attuale</TableHead>
                  <TableHead>Ultima Versione</TableHead>
                  <TableHead>Giorni Obsoleto</TableHead>
                  <TableHead>Priorità</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUpdates.map((update, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{update.endpoint}</TableCell>
                    <TableCell>{update.component}</TableCell>
                    <TableCell className="font-mono text-sm">{update.currentVersion}</TableCell>
                    <TableCell className="font-mono text-sm text-green-500">{update.latestVersion}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "font-semibold",
                        update.daysOutdated > 30 ? 'text-red-500' :
                        update.daysOutdated > 7 ? 'text-yellow-500' : 'text-muted-foreground'
                      )}>
                        {update.daysOutdated} giorni
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", priorityColors[update.priority])}>
                        {update.priority}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
