import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Shield,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Target,
  Users,
  Calendar,
  BarChart3,
  Plus,
  Edit,
  Trash2,
  Activity,
} from "lucide-react";

const ThreatManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");

  const threats: any[] = [];

  // Statistiche delle minacce
  const threatStats = {
    total: threats.length,
    critical: threats.filter((t) => t.severity === "Critica").length,
    high: threats.filter((t) => t.severity === "Alta").length,
    medium: threats.filter((t) => t.severity === "Media").length,
    resolved: threats.filter((t) => t.status === "Risolto").length,
    inProgress: threats.filter((t) => t.status === "In corso").length,
    open: threats.filter((t) => t.status === "Aperto").length,
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Critica":
        return "text-red-500";
      case "Alta":
        return "text-orange-500";
      case "Media":
        return "text-yellow-500";
      default:
        return "text-green-500";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critica":
        return "bg-red-600";
      case "Alta":
        return "bg-orange-600";
      case "Media":
        return "bg-yellow-600";
      default:
        return "bg-green-600";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Risolto":
        return "text-green-500";
      case "In corso":
        return "text-blue-500";
      case "In analisi":
        return "text-purple-500";
      case "Aperto":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Risolto":
        return CheckCircle2;
      case "In corso":
        return Clock;
      case "In analisi":
        return Eye;
      case "Aperto":
        return XCircle;
      default:
        return AlertTriangle;
    }
  };

  const filteredThreats = threats.filter((threat) => {
    const matchesSearch =
      threat.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || threat.status === filterStatus;
    const matchesSeverity =
      filterSeverity === "all" || threat.severity === filterSeverity;

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Threat Management
            </h1>
            <p className="text-muted-foreground">
              Vista centralizzata delle minacce alimentata dai dati HiCompliance
              del cliente selezionato
            </p>
          </div>
          <Badge variant="outline">In attesa di dati</Badge>
        </div>

        <Card className="border-dashed border-border">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-foreground">
                Nessun feed operativo disponibile
              </p>
              <p className="text-sm text-muted-foreground">
                Il modulo resterà visibile ma senza contenuti finché non saranno
                disponibili dati reali provenienti da HiCompliance.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Statistiche */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Minacce Totali
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {threatStats.total}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critiche/Alte</p>
                  <p className="text-2xl font-bold text-foreground">
                    {threatStats.critical + threatStats.high}
                  </p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-500">Priorità alta</span>
                  </div>
                </div>
                <Shield className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Gestione</p>
                  <p className="text-2xl font-bold text-foreground">
                    {threatStats.inProgress}
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    Attive
                  </Badge>
                </div>
                <Activity className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Risolte</p>
                  <p className="text-2xl font-bold text-foreground">
                    {threatStats.resolved}
                  </p>
                  <div className="flex items-center mt-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-500">
                      {threatStats.total > 0
                        ? Math.round(
                            (threatStats.resolved / threatStats.total) * 100,
                          )
                        : 0}
                      %
                    </span>
                  </div>
                </div>
                <Target className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="threats" className="space-y-6">
          <TabsList className="grid w-full">
            <TabsTrigger value="intelligence">Threat Intelligence</TabsTrigger>
          </TabsList>

          <TabsContent value="threats" className="space-y-6">
            {/* Filtri e Ricerca */}
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Cerca minacce per ID, titolo o descrizione..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli stati</SelectItem>
                      <SelectItem value="Aperto">Aperto</SelectItem>
                      <SelectItem value="In analisi">In analisi</SelectItem>
                      <SelectItem value="In corso">In corso</SelectItem>
                      <SelectItem value="Risolto">Risolto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterSeverity}
                    onValueChange={setFilterSeverity}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Severità" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le severità</SelectItem>
                      <SelectItem value="Critica">Critica</SelectItem>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Bassa">Bassa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Lista Minacce */}
            <div className="space-y-4">
              {filteredThreats.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nessun dato disponibile
                </div>
              ) : (
                filteredThreats.map((threat) => {
                  const StatusIcon = getStatusIcon(threat.status);
                  return (
                    <Card
                      key={threat.id}
                      className="border-border bg-card hover:bg-card/80 transition-colors"
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center space-x-3">
                              <Badge
                                variant="outline"
                                className="font-mono text-xs"
                              >
                                {threat.id}
                              </Badge>
                              <div
                                className={`w-2 h-2 rounded-full ${getSeverityBadge(threat.severity)}`}
                              />
                              <span
                                className={`text-sm font-medium ${getSeverityColor(threat.severity)}`}
                              >
                                {threat.severity.toUpperCase()}
                              </span>
                              <Badge variant="secondary">{threat.source}</Badge>
                              <Badge variant="outline">{threat.priority}</Badge>
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold text-white mb-1">
                                {threat.title}
                              </h3>
                              <p className="text-gray-400 text-sm">
                                {threat.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-400">
                                  Categoria:{" "}
                                </span>
                                <span className="text-white">
                                  {threat.category}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">
                                  Assegnato a:{" "}
                                </span>
                                <span className="text-white">
                                  {threat.assignedTo}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">
                                  Ultimo aggiornamento:{" "}
                                </span>
                                <span className="text-white">
                                  {threat.lastUpdate}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span className="text-sm text-gray-400">
                                Asset coinvolti:
                              </span>
                              {threat.affectedAssets.map((asset, index) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {asset}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col items-end space-y-3">
                            <div className="flex items-center space-x-2">
                              <StatusIcon
                                className={`w-4 h-4 ${getStatusColor(threat.status)}`}
                              />
                              <span
                                className={`text-sm font-medium ${getStatusColor(threat.status)}`}
                              >
                                {threat.status}
                              </span>
                            </div>

                            <div className="flex space-x-2">
                              <Button size="sm" variant="outline">
                                <Eye className="w-4 h-4 mr-1" />
                                Dettagli
                              </Button>
                              <Button size="sm" variant="outline">
                                <Edit className="w-4 h-4 mr-1" />
                                Modifica
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="intelligence" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Feed Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-12 text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Indicatori di Compromissione
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-12 text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Trend Minacce per Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Tempo di Risoluzione
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ThreatManagement;
