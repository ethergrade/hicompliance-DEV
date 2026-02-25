import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Server, Network, HardDrive, Users as UsersIcon, MapPin, Save, FileSpreadsheet, ScrollText } from 'lucide-react';
import { ClientSelector } from '@/components/asset-inventory/ClientSelector';
import * as XLSX from 'xlsx';

interface AssetInventoryData {
  id?: string;
  organization_id?: string;
  users_count: number;
  locations_count: number;
  endpoints_count: number;
  servers_count: number;
  hypervisors_count: number;
  virtual_machines_count: number;
  firewalls_count: number;
  core_switches_count: number;
  access_switches_count: number;
  access_points_count: number;
  miscellaneous_network_devices_count: number;
  total_network_devices_count: number;
  va_ip_punctual_count: number;
  va_subnet_25_count: number;
  va_subnet_24_count: number;
  va_subnet_23_count: number;
  va_subnet_22_count: number;
  va_subnet_21_count: number;
  va_total_ips_count: number;
  notes: string;
  hilog_syslog_count: number;
  hilog_iis_count: number;
  hilog_apache_count: number;
  hilog_sql_count: number;
  hilog_custom_path_count: number;
  hilog_endpoint_count: number;
  hilog_server_count: number;
  hilog_dlp_linux_count: number;
  hilog_dlp_windows_count: number;
  hilog_sharepoint_dlp_enabled: boolean;
  hilog_sharepoint_dlp_count: number;
  hilog_entra_id_enabled: boolean;
}

const INITIAL_DATA: AssetInventoryData = {
  users_count: 0, locations_count: 0, endpoints_count: 0, servers_count: 0,
  hypervisors_count: 0, virtual_machines_count: 0, firewalls_count: 0,
  core_switches_count: 0, access_switches_count: 0, access_points_count: 0,
  miscellaneous_network_devices_count: 0, total_network_devices_count: 0,
  va_ip_punctual_count: 0, va_subnet_25_count: 0, va_subnet_24_count: 0,
  va_subnet_23_count: 0, va_subnet_22_count: 0, va_subnet_21_count: 0,
  va_total_ips_count: 0, notes: '',
  hilog_syslog_count: 0, hilog_iis_count: 0, hilog_apache_count: 0,
  hilog_sql_count: 0, hilog_custom_path_count: 0, hilog_endpoint_count: 0,
  hilog_server_count: 0, hilog_dlp_linux_count: 0, hilog_dlp_windows_count: 0,
  hilog_sharepoint_dlp_enabled: false, hilog_sharepoint_dlp_count: 0,
  hilog_entra_id_enabled: false,
};

const AssetInventory: React.FC = () => {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { isSuperAdmin, isSales } = useUserRoles();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [data, setData] = useState<AssetInventoryData>({ ...INITIAL_DATA });

  useEffect(() => {
    if (isSuperAdmin || isSales) {
      setLoading(false);
    } else if (userProfile?.organization_id) {
      setSelectedOrgId(userProfile.organization_id);
    }
  }, [userProfile, isSuperAdmin, isSales]);

  useEffect(() => {
    if (selectedOrgId) {
      loadData();
    }
  }, [selectedOrgId]);

  useEffect(() => {
    const total = 
      data.firewalls_count + data.core_switches_count + data.access_switches_count + 
      data.access_points_count + data.miscellaneous_network_devices_count;
    if (total !== data.total_network_devices_count) {
      setData(prev => ({ ...prev, total_network_devices_count: total }));
    }
  }, [data.firewalls_count, data.core_switches_count, data.access_switches_count, data.access_points_count, data.miscellaneous_network_devices_count]);

  useEffect(() => {
    const totalIps = 
      data.va_ip_punctual_count + (data.va_subnet_25_count * 126) + (data.va_subnet_24_count * 254) + 
      (data.va_subnet_23_count * 510) + (data.va_subnet_22_count * 1022) + (data.va_subnet_21_count * 2046);
    if (totalIps !== data.va_total_ips_count) {
      setData(prev => ({ ...prev, va_total_ips_count: totalIps }));
    }
  }, [data.va_ip_punctual_count, data.va_subnet_25_count, data.va_subnet_24_count, data.va_subnet_23_count, data.va_subnet_22_count, data.va_subnet_21_count]);

  const loadData = async () => {
    if (!selectedOrgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: existingData, error } = await supabase
        .from('asset_inventory').select('*').eq('organization_id', selectedOrgId).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (existingData) {
        setData({
          ...INITIAL_DATA,
          ...existingData,
          notes: existingData.notes ?? '',
          hilog_sharepoint_dlp_enabled: existingData.hilog_sharepoint_dlp_enabled ?? false,
          hilog_entra_id_enabled: existingData.hilog_entra_id_enabled ?? false,
        });
      } else {
        setData({ ...INITIAL_DATA });
      }
    } catch (error) {
      console.error('Error loading asset inventory:', error);
      toast({ title: "Errore", description: "Errore nel caricamento dei dati", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selectedOrgId) {
      toast({ title: "Errore", description: "Seleziona un cliente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...data, organization_id: selectedOrgId };
      if (data.id) {
        const { error } = await supabase.from('asset_inventory').update(payload).eq('id', data.id);
        if (error) throw error;
      } else {
        const { data: newData, error } = await supabase.from('asset_inventory').insert(payload).select().single();
        if (error) throw error;
        if (newData) setData({ ...INITIAL_DATA, ...newData, notes: newData.notes ?? '', hilog_sharepoint_dlp_enabled: newData.hilog_sharepoint_dlp_enabled ?? false, hilog_entra_id_enabled: newData.hilog_entra_id_enabled ?? false });
      }
      toast({ title: "Successo", description: "Inventario salvato con successo" });
    } catch (error) {
      console.error('Error saving asset inventory:', error);
      toast({ title: "Errore", description: "Errore durante il salvataggio", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleNumberChange = (field: keyof AssetInventoryData, value: string) => {
    const numValue = parseInt(value) || 0;
    setData(prev => ({ ...prev, [field]: numValue }));
  };

  const handleExportExcel = () => {
    const exportData = {
      'Utenti': data.users_count,
      'Sedi': data.locations_count,
      'Endpoint': data.endpoints_count,
      'Server': data.servers_count,
      'Hypervisor': data.hypervisors_count,
      'Virtual Machine': data.virtual_machines_count,
      'Firewall': data.firewalls_count,
      'Switch Core': data.core_switches_count,
      'Switch Access': data.access_switches_count,
      'Access Point': data.access_points_count,
      'Dispositivi rete vari': data.miscellaneous_network_devices_count,
      'Totale dispositivi rete': data.total_network_devices_count,
      'IP Puntuali': data.va_ip_punctual_count,
      'Subnet /25': data.va_subnet_25_count,
      'Subnet /24': data.va_subnet_24_count,
      'Subnet /23': data.va_subnet_23_count,
      'Subnet /22': data.va_subnet_22_count,
      'Subnet /21': data.va_subnet_21_count,
      'IP Totali VA': data.va_total_ips_count,
      'HiLog Syslog': data.hilog_syslog_count,
      'HiLog IIS': data.hilog_iis_count,
      'HiLog Apache': data.hilog_apache_count,
      'HiLog SQL': data.hilog_sql_count,
      'HiLog Custom PATH': data.hilog_custom_path_count,
      'HiLog Endpoint sotto Log': data.hilog_endpoint_count,
      'HiLog Server sotto Log': data.hilog_server_count,
      'HiLog DLP Linux': data.hilog_dlp_linux_count,
      'HiLog DLP Windows': data.hilog_dlp_windows_count,
      'SharePoint DLP': data.hilog_sharepoint_dlp_enabled ? 'Sì' : 'No',
      'SharePoint DLP Quantità': data.hilog_sharepoint_dlp_count,
      'Entra ID Microsoft': data.hilog_entra_id_enabled ? 'Sì' : 'No',
      'Note': data.notes,
    };
    const ws = XLSX.utils.json_to_sheet([exportData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario Asset');
    XLSX.writeFile(wb, `inventario_asset.xlsx`);
  };

  const canManageClients = isSuperAdmin || isSales;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Inventario Asset Tecnici</h1>
            <p className="text-muted-foreground">Gestisci le consistenze tecniche del cliente</p>
          </div>
          {selectedOrgId && !loading && (
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Esporta Excel
            </Button>
          )}
        </div>

        {canManageClients && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Cliente</CardTitle>
              <CardDescription>Seleziona o crea un nuovo cliente</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientSelector selectedOrgId={selectedOrgId} onOrgChange={setSelectedOrgId} disabled={saving} />
            </CardContent>
          </Card>
        )}

        {!selectedOrgId && canManageClients && (
          <Card className="border-border bg-card">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Seleziona un cliente per visualizzare e modificare l'inventario</p>
            </CardContent>
          </Card>
        )}

        {selectedOrgId && (
          <>
            {loading ? (
              <Card className="border-border bg-card">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Caricamento...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* General Info */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <UsersIcon className="w-5 h-5" />Informazioni Generali
                    </CardTitle>
                    <CardDescription>Utenti e sedi</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="users_count">Utenti</Label>
                      <Input id="users_count" type="number" min="0" value={data.users_count} onChange={(e) => handleNumberChange('users_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="locations_count">Sedi Cliente</Label>
                      <Input id="locations_count" type="number" min="0" value={data.locations_count} onChange={(e) => handleNumberChange('locations_count', e.target.value)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Endpoints & Servers */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <HardDrive className="w-5 h-5" />Endpoint e Server
                    </CardTitle>
                    <CardDescription>Dispositivi fisici e virtuali</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="endpoints_count">Endpoint</Label>
                      <Input id="endpoints_count" type="number" min="0" value={data.endpoints_count} onChange={(e) => handleNumberChange('endpoints_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="servers_count">Server</Label>
                      <Input id="servers_count" type="number" min="0" value={data.servers_count} onChange={(e) => handleNumberChange('servers_count', e.target.value)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Virtualization */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Server className="w-5 h-5" />Virtualizzazione
                    </CardTitle>
                    <CardDescription>Hypervisor e macchine virtuali</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hypervisors_count">HyperVisor</Label>
                      <Input id="hypervisors_count" type="number" min="0" value={data.hypervisors_count} onChange={(e) => handleNumberChange('hypervisors_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="virtual_machines_count">Virtual Machine</Label>
                      <Input id="virtual_machines_count" type="number" min="0" value={data.virtual_machines_count} onChange={(e) => handleNumberChange('virtual_machines_count', e.target.value)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Network Devices */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Network className="w-5 h-5" />Dispositivi di Rete
                    </CardTitle>
                    <CardDescription>Firewall, switch e access point</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="firewalls_count">Firewall</Label>
                      <Input id="firewalls_count" type="number" min="0" value={data.firewalls_count} onChange={(e) => handleNumberChange('firewalls_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="core_switches_count">Switch Core</Label>
                      <Input id="core_switches_count" type="number" min="0" value={data.core_switches_count} onChange={(e) => handleNumberChange('core_switches_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access_switches_count">Switch Access</Label>
                      <Input id="access_switches_count" type="number" min="0" value={data.access_switches_count} onChange={(e) => handleNumberChange('access_switches_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access_points_count">Access Point (Compresi Collector)</Label>
                      <Input id="access_points_count" type="number" min="0" value={data.access_points_count} onChange={(e) => handleNumberChange('access_points_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="miscellaneous_network_devices_count">Dispositivi di rete varie</Label>
                      <Input id="miscellaneous_network_devices_count" type="number" min="0" value={data.miscellaneous_network_devices_count} onChange={(e) => handleNumberChange('miscellaneous_network_devices_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="total_network_devices_count">Dispositivi di rete totali</Label>
                      <Input id="total_network_devices_count" type="number" value={data.total_network_devices_count} disabled className="bg-muted" />
                    </div>
                  </CardContent>
                </Card>

                {/* IP and Subnets for VA */}
                <Card className="border-border bg-card lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Network className="w-5 h-5" />IP puntuali o Subnet da scansionare per VA
                    </CardTitle>
                    <CardDescription>Configurazione degli indirizzi IP da scansionare</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="va_ip_punctual_count">IP Puntuali</Label>
                      <Input id="va_ip_punctual_count" type="number" min="0" value={data.va_ip_punctual_count} onChange={(e) => handleNumberChange('va_ip_punctual_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="va_subnet_25_count">Quantità di subnet /25 (126 IP) da scansionare</Label>
                      <Input id="va_subnet_25_count" type="number" min="0" value={data.va_subnet_25_count} onChange={(e) => handleNumberChange('va_subnet_25_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="va_subnet_24_count">Quantità di subnet /24 (254 IP) da scansionare</Label>
                      <Input id="va_subnet_24_count" type="number" min="0" value={data.va_subnet_24_count} onChange={(e) => handleNumberChange('va_subnet_24_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="va_subnet_23_count">Quantità di subnet /23 (510 IP) da scansionare</Label>
                      <Input id="va_subnet_23_count" type="number" min="0" value={data.va_subnet_23_count} onChange={(e) => handleNumberChange('va_subnet_23_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="va_subnet_22_count">Quantità di subnet /22 (1022 IP) da scansionare</Label>
                      <Input id="va_subnet_22_count" type="number" min="0" value={data.va_subnet_22_count} onChange={(e) => handleNumberChange('va_subnet_22_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="va_subnet_21_count">Quantità di subnet /21 (2046 IP) da scansionare</Label>
                      <Input id="va_subnet_21_count" type="number" min="0" value={data.va_subnet_21_count} onChange={(e) => handleNumberChange('va_subnet_21_count', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="va_total_ips_count">IP Totali (1000IP = 1 Collector VA)</Label>
                      <Input id="va_total_ips_count" type="number" value={data.va_total_ips_count} disabled className="bg-muted" />
                    </div>
                  </CardContent>
                </Card>

                {/* HiLog Section */}
                <Card className="border-border bg-card lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <ScrollText className="w-5 h-5" />Consistenze HiLog
                    </CardTitle>
                    <CardDescription>Sorgenti log e integrazioni sotto gestione HiLog</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hilog_syslog_count">Syslog</Label>
                        <Input id="hilog_syslog_count" type="number" min="0" value={data.hilog_syslog_count} onChange={(e) => handleNumberChange('hilog_syslog_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_iis_count">IIS</Label>
                        <Input id="hilog_iis_count" type="number" min="0" value={data.hilog_iis_count} onChange={(e) => handleNumberChange('hilog_iis_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_apache_count">Apache</Label>
                        <Input id="hilog_apache_count" type="number" min="0" value={data.hilog_apache_count} onChange={(e) => handleNumberChange('hilog_apache_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_sql_count">SQL</Label>
                        <Input id="hilog_sql_count" type="number" min="0" value={data.hilog_sql_count} onChange={(e) => handleNumberChange('hilog_sql_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_custom_path_count">Custom PATH</Label>
                        <Input id="hilog_custom_path_count" type="number" min="0" value={data.hilog_custom_path_count} onChange={(e) => handleNumberChange('hilog_custom_path_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_endpoint_count">Endpoint sotto Log</Label>
                        <Input id="hilog_endpoint_count" type="number" min="0" value={data.hilog_endpoint_count} onChange={(e) => handleNumberChange('hilog_endpoint_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_server_count">Server sotto Log</Label>
                        <Input id="hilog_server_count" type="number" min="0" value={data.hilog_server_count} onChange={(e) => handleNumberChange('hilog_server_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_dlp_linux_count">DLP File Server Linux</Label>
                        <Input id="hilog_dlp_linux_count" type="number" min="0" value={data.hilog_dlp_linux_count} onChange={(e) => handleNumberChange('hilog_dlp_linux_count', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hilog_dlp_windows_count">DLP File Server Windows</Label>
                        <Input id="hilog_dlp_windows_count" type="number" min="0" value={data.hilog_dlp_windows_count} onChange={(e) => handleNumberChange('hilog_dlp_windows_count', e.target.value)} />
                      </div>
                    </div>

                    <div className="border-t border-border pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="hilog_sharepoint_dlp">SharePoint DLP</Label>
                        <Switch
                          id="hilog_sharepoint_dlp"
                          checked={data.hilog_sharepoint_dlp_enabled}
                          onCheckedChange={(checked) => setData(prev => ({ ...prev, hilog_sharepoint_dlp_enabled: checked }))}
                        />
                      </div>
                      {data.hilog_sharepoint_dlp_enabled && (
                        <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                          <Label htmlFor="hilog_sharepoint_dlp_count">Quantità SharePoint DLP</Label>
                          <Input id="hilog_sharepoint_dlp_count" type="number" min="0" value={data.hilog_sharepoint_dlp_count} onChange={(e) => handleNumberChange('hilog_sharepoint_dlp_count', e.target.value)} />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <Label htmlFor="hilog_entra_id">Integrazione Entra ID Microsoft</Label>
                        <Switch
                          id="hilog_entra_id"
                          checked={data.hilog_entra_id_enabled}
                          onCheckedChange={(checked) => setData(prev => ({ ...prev, hilog_entra_id_enabled: checked }))}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card className="border-border bg-card lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-foreground">Note</CardTitle>
                    <CardDescription>Informazioni aggiuntive sull'inventario</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="notes">Note libere</Label>
                      <Textarea id="notes" rows={6} value={data.notes} onChange={(e) => setData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Inserisci eventuali note o dettagli aggiuntivi..." />
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="w-full">
                      {saving ? <>Salvataggio in corso...</> : <><Save className="w-4 h-4 mr-2" />Salva Inventario</>}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AssetInventory;
