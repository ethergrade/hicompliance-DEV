import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ClientAssetSheetProps {
  organizationId: string | null;
  organizationName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AssetData {
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
  va_ip_punctual_count: number;
  va_subnet_25_count: number;
  va_subnet_24_count: number;
  va_subnet_23_count: number;
  va_subnet_22_count: number;
  va_subnet_21_count: number;
  notes: string;
}

const INITIAL: AssetData = {
  users_count: 0, locations_count: 0,
  endpoints_count: 0, servers_count: 0, hypervisors_count: 0, virtual_machines_count: 0,
  firewalls_count: 0, core_switches_count: 0, access_switches_count: 0,
  access_points_count: 0, miscellaneous_network_devices_count: 0,
  va_ip_punctual_count: 0, va_subnet_25_count: 0, va_subnet_24_count: 0,
  va_subnet_23_count: 0, va_subnet_22_count: 0, va_subnet_21_count: 0,
  notes: '',
};

const ClientAssetSheet: React.FC<ClientAssetSheetProps> = ({
  organizationId, organizationName, open, onOpenChange,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState<AssetData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (open && organizationId) fetchData();
    if (!open) { setForm(INITIAL); setRecordId(null); }
  }, [open, organizationId]);

  const fetchData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('asset_inventory')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setRecordId(data.id);
        setForm({
          users_count: data.users_count ?? 0,
          locations_count: data.locations_count ?? 0,
          endpoints_count: data.endpoints_count ?? 0,
          servers_count: data.servers_count ?? 0,
          hypervisors_count: data.hypervisors_count ?? 0,
          virtual_machines_count: data.virtual_machines_count ?? 0,
          firewalls_count: data.firewalls_count ?? 0,
          core_switches_count: data.core_switches_count ?? 0,
          access_switches_count: data.access_switches_count ?? 0,
          access_points_count: data.access_points_count ?? 0,
          miscellaneous_network_devices_count: data.miscellaneous_network_devices_count ?? 0,
          va_ip_punctual_count: data.va_ip_punctual_count ?? 0,
          va_subnet_25_count: data.va_subnet_25_count ?? 0,
          va_subnet_24_count: data.va_subnet_24_count ?? 0,
          va_subnet_23_count: data.va_subnet_23_count ?? 0,
          va_subnet_22_count: data.va_subnet_22_count ?? 0,
          va_subnet_21_count: data.va_subnet_21_count ?? 0,
          notes: data.notes ?? '',
        });
      }
    } catch (err) {
      console.error('Error fetching asset inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalNetwork = useMemo(() =>
    form.firewalls_count + form.core_switches_count + form.access_switches_count +
    form.access_points_count + form.miscellaneous_network_devices_count,
    [form.firewalls_count, form.core_switches_count, form.access_switches_count, form.access_points_count, form.miscellaneous_network_devices_count]
  );

  const totalIPs = useMemo(() =>
    form.va_ip_punctual_count +
    form.va_subnet_25_count * 128 +
    form.va_subnet_24_count * 256 +
    form.va_subnet_23_count * 512 +
    form.va_subnet_22_count * 1024 +
    form.va_subnet_21_count * 2048,
    [form.va_ip_punctual_count, form.va_subnet_25_count, form.va_subnet_24_count, form.va_subnet_23_count, form.va_subnet_22_count, form.va_subnet_21_count]
  );

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        ...form,
        total_network_devices_count: totalNetwork,
        va_total_ips_count: totalIPs,
      };

      let error;
      if (recordId) {
        ({ error } = await supabase.from('asset_inventory').update(payload).eq('id', recordId));
      } else {
        ({ error } = await supabase.from('asset_inventory').insert(payload));
      }
      if (error) throw error;
      toast({ title: 'Consistenze salvate con successo' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Errore nel salvataggio', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const numField = (label: string, field: keyof AssetData) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        value={form[field] as number}
        onChange={e => setForm(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }))}
      />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Consistenze{organizationName ? ` — ${organizationName}` : ''}</SheetTitle>
          <SheetDescription>Modifica l'inventario asset dell'organizzazione</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-10rem)] pr-4 mt-4">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generale</p>
              <div className="grid grid-cols-2 gap-3">
                {numField('Utenti', 'users_count')}
                {numField('Sedi', 'locations_count')}
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint & Server</p>
              <div className="grid grid-cols-2 gap-3">
                {numField('Endpoint', 'endpoints_count')}
                {numField('Server', 'servers_count')}
                {numField('Hypervisor', 'hypervisors_count')}
                {numField('VM', 'virtual_machines_count')}
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rete <span className="text-foreground ml-1">({totalNetwork} totali)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {numField('Firewall', 'firewalls_count')}
                {numField('Core Switch', 'core_switches_count')}
                {numField('Access Switch', 'access_switches_count')}
                {numField('Access Point', 'access_points_count')}
                {numField('Altri dispositivi', 'miscellaneous_network_devices_count')}
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                IP/Subnet VA <span className="text-foreground ml-1">({totalIPs} IP totali)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {numField('IP puntuali', 'va_ip_punctual_count')}
                {numField('/25 (128 IP)', 'va_subnet_25_count')}
                {numField('/24 (256 IP)', 'va_subnet_24_count')}
                {numField('/23 (512 IP)', 'va_subnet_23_count')}
                {numField('/22 (1024 IP)', 'va_subnet_22_count')}
                {numField('/21 (2048 IP)', 'va_subnet_21_count')}
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salva Consistenze
              </Button>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ClientAssetSheet;
