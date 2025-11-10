import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { Server, Network, HardDrive, Users as UsersIcon, MapPin, Save } from 'lucide-react';

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
  total_network_devices_count: number;
  notes: string;
}

const AssetInventory: React.FC = () => {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AssetInventoryData>({
    users_count: 0,
    locations_count: 0,
    endpoints_count: 0,
    servers_count: 0,
    hypervisors_count: 0,
    virtual_machines_count: 0,
    firewalls_count: 0,
    core_switches_count: 0,
    access_switches_count: 0,
    access_points_count: 0,
    total_network_devices_count: 0,
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [userProfile]);

  useEffect(() => {
    // Auto-calculate total network devices
    const total = 
      data.firewalls_count + 
      data.core_switches_count + 
      data.access_switches_count + 
      data.access_points_count;
    
    if (total !== data.total_network_devices_count) {
      setData(prev => ({ ...prev, total_network_devices_count: total }));
    }
  }, [
    data.firewalls_count,
    data.core_switches_count,
    data.access_switches_count,
    data.access_points_count,
  ]);

  const loadData = async () => {
    if (!userProfile?.organization_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: existingData, error } = await supabase
        .from('asset_inventory')
        .select('*')
        .eq('organization_id', userProfile.organization_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (existingData) {
        setData(existingData);
      }
    } catch (error) {
      console.error('Error loading asset inventory:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userProfile?.organization_id) {
      toast({
        title: "Errore",
        description: "Organizzazione non trovata",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...data,
        organization_id: userProfile.organization_id,
      };

      if (data.id) {
        // Update existing
        const { error } = await supabase
          .from('asset_inventory')
          .update(payload)
          .eq('id', data.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data: newData, error } = await supabase
          .from('asset_inventory')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        if (newData) {
          setData(newData);
        }
      }

      toast({
        title: "Successo",
        description: "Inventario salvato con successo"
      });
    } catch (error) {
      console.error('Error saving asset inventory:', error);
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNumberChange = (field: keyof AssetInventoryData, value: string) => {
    const numValue = parseInt(value) || 0;
    setData(prev => ({ ...prev, [field]: numValue }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventario Asset Tecnici</h1>
          <p className="text-muted-foreground">
            Gestisci le consistenze tecniche del cliente
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Info */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <UsersIcon className="w-5 h-5" />
                Informazioni Generali
              </CardTitle>
              <CardDescription>Utenti e sedi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="users_count">Utenti</Label>
                <Input
                  id="users_count"
                  type="number"
                  min="0"
                  value={data.users_count}
                  onChange={(e) => handleNumberChange('users_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locations_count">Sedi Cliente</Label>
                <Input
                  id="locations_count"
                  type="number"
                  min="0"
                  value={data.locations_count}
                  onChange={(e) => handleNumberChange('locations_count', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Endpoints & Servers */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Endpoint e Server
              </CardTitle>
              <CardDescription>Dispositivi fisici e virtuali</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="endpoints_count">Endpoint</Label>
                <Input
                  id="endpoints_count"
                  type="number"
                  min="0"
                  value={data.endpoints_count}
                  onChange={(e) => handleNumberChange('endpoints_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="servers_count">Server</Label>
                <Input
                  id="servers_count"
                  type="number"
                  min="0"
                  value={data.servers_count}
                  onChange={(e) => handleNumberChange('servers_count', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Virtualization */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Server className="w-5 h-5" />
                Virtualizzazione
              </CardTitle>
              <CardDescription>Hypervisor e macchine virtuali</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hypervisors_count">HyperVisor</Label>
                <Input
                  id="hypervisors_count"
                  type="number"
                  min="0"
                  value={data.hypervisors_count}
                  onChange={(e) => handleNumberChange('hypervisors_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="virtual_machines_count">Virtual Machine</Label>
                <Input
                  id="virtual_machines_count"
                  type="number"
                  min="0"
                  value={data.virtual_machines_count}
                  onChange={(e) => handleNumberChange('virtual_machines_count', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Network Devices */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Network className="w-5 h-5" />
                Dispositivi di Rete
              </CardTitle>
              <CardDescription>Firewall, switch e access point</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firewalls_count">Firewall</Label>
                <Input
                  id="firewalls_count"
                  type="number"
                  min="0"
                  value={data.firewalls_count}
                  onChange={(e) => handleNumberChange('firewalls_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="core_switches_count">Switch Core</Label>
                <Input
                  id="core_switches_count"
                  type="number"
                  min="0"
                  value={data.core_switches_count}
                  onChange={(e) => handleNumberChange('core_switches_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access_switches_count">Switch Access</Label>
                <Input
                  id="access_switches_count"
                  type="number"
                  min="0"
                  value={data.access_switches_count}
                  onChange={(e) => handleNumberChange('access_switches_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access_points_count">Access Point (Compresi Collector)</Label>
                <Input
                  id="access_points_count"
                  type="number"
                  min="0"
                  value={data.access_points_count}
                  onChange={(e) => handleNumberChange('access_points_count', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_network_devices_count">Dispositivi di rete totali</Label>
                <Input
                  id="total_network_devices_count"
                  type="number"
                  value={data.total_network_devices_count}
                  disabled
                  className="bg-muted"
                />
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
                <Textarea
                  id="notes"
                  rows={6}
                  value={data.notes}
                  onChange={(e) => setData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Inserisci eventuali note o dettagli aggiuntivi..."
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>Salvataggio in corso...</>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salva Inventario
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AssetInventory;