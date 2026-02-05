import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Shield, Smartphone, ShieldBan, Download, FileText, Key, Mail, Plus, Settings, Trash2 } from "lucide-react";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { ClientSelectionGuard } from "@/components/guards/ClientSelectionGuard";
import { IntegrationAuditLog } from "@/components/integrations/IntegrationAuditLog";

interface HiSolutionService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface OrganizationIntegration {
  id: string;
  organization_id: string;
  service_id: string;
  api_url: string;
  api_key: string;
  api_methods: any;
  is_active: boolean;
  hisolution_services: HiSolutionService;
}

interface IntegrationFormData {
  service_id: string;
  api_url: string;
  api_key: string;
  api_methods: string;
  is_active: boolean;
}

const iconMap: { [key: string]: any } = {
  shield: Shield,
  smartphone: Smartphone,
  'shield-ban': ShieldBan,
  download: Download,
  'file-text': FileText,
  key: Key,
  mail: Mail,
};

const Integrations = () => {
  const [selectedIntegration, setSelectedIntegration] = useState<OrganizationIntegration | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, needsClientSelection, canManageMultipleClients, selectedOrganization } = useClientOrganization();

  const form = useForm<IntegrationFormData>({
    defaultValues: {
      service_id: "",
      api_url: "",
      api_key: "",
      api_methods: "{}",
      is_active: true,
    },
  });

  // Fetch HiSolution services
  const { data: services = [] } = useQuery({
    queryKey: ["hisolution-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hisolution_services")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data as HiSolutionService[];
    },
  });

  // Fetch organization integrations - filter by selected organization for sales/admin
  const { data: integrations = [] } = useQuery({
    queryKey: ["organization-integrations", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from("organization_integrations")
        .select(`
          *,
          hisolution_services(*)
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as OrganizationIntegration[];
    },
    enabled: !!organizationId,
  });


  // Create or update integration
  const createIntegrationMutation = useMutation({
    mutationFn: async (data: IntegrationFormData) => {
      if (!organizationId) {
        throw new Error("Nessuna organizzazione selezionata");
      }

      const integrationData = {
        organization_id: organizationId,
        service_id: data.service_id,
        api_url: data.api_url,
        api_key: data.api_key,
        api_methods: JSON.parse(data.api_methods || "{}"),
        is_active: data.is_active,
      };

      if (selectedIntegration) {
        const { error } = await supabase
          .from("organization_integrations")
          .update(integrationData)
          .eq("id", selectedIntegration.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("organization_integrations")
          .insert(integrationData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-integrations", organizationId] });
      setIsDialogOpen(false);
      setSelectedIntegration(null);
      form.reset();
      toast({
        title: "Successo",
        description: selectedIntegration ? "Integrazione aggiornata con successo" : "Integrazione creata con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete integration mutation
  const deleteIntegrationMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const { error } = await supabase
        .from("organization_integrations")
        .delete()
        .eq("id", integrationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-integrations", organizationId] });
      toast({
        title: "Successo",
        description: "Integrazione eliminata con successo",
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openDialog = (integration?: OrganizationIntegration) => {
    if (integration) {
      setSelectedIntegration(integration);
      form.reset({
        service_id: integration.service_id,
        api_url: integration.api_url,
        api_key: integration.api_key,
        api_methods: JSON.stringify(integration.api_methods, null, 2),
        is_active: integration.is_active,
      });
    } else {
      setSelectedIntegration(null);
      form.reset({
        service_id: "",
        api_url: "",
        api_key: "",
        api_methods: "{}",
        is_active: true,
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: IntegrationFormData) => {
    createIntegrationMutation.mutate(data);
  };

  // Get available services (not yet integrated)
  const availableServices = services.filter(
    service => !integrations.some(integration => integration.service_id === service.id)
  );

  // Sales/Admin need to select a client first
  if (needsClientSelection) {
    return (
      <DashboardLayout>
        <ClientSelectionGuard>
          <div />
        </ClientSelectionGuard>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Integrazioni HiSolution</h1>
            <p className="text-muted-foreground">
              Configura le integrazioni con i servizi HiSolution
              {canManageMultipleClients && selectedOrganization && (
                <span className="font-medium text-primary"> per {selectedOrganization.name}</span>
              )}
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Nuova Integrazione
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {selectedIntegration ? "Modifica Integrazione" : "Nuova Integrazione"}
                </DialogTitle>
                <DialogDescription>
                  Configura i dettagli per l'integrazione con il servizio HiSolution
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="service_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Servizio</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={!!selectedIntegration}
                          >
                            <option value="">Seleziona un servizio</option>
                            {(selectedIntegration ? services : availableServices).map((service) => (
                              <option key={service.id} value={service.id}>
                                {service.name} - {service.description}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="api_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL API</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://api.hisolution.com/v1"
                            type="url"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="api_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chiave API</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Inserisci la chiave API"
                            type="password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="api_methods"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Metodi API (JSON)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder='{"get_status": "/status", "get_alerts": "/alerts"}'
                            rows={4}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Attiva</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Abilita questa integrazione
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createIntegrationMutation.isPending}>
                      {createIntegrationMutation.isPending ? "Salvando..." : "Salva"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const IconComponent = iconMap[integration.hisolution_services.icon || ''] || Settings;
            return (
              <Card key={integration.id} className="relative">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IconComponent className="w-4 h-4" />
                    {integration.hisolution_services.name}
                  </CardTitle>
                  <Badge variant={integration.is_active ? "default" : "secondary"}>
                    {integration.is_active ? "Attiva" : "Inattiva"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-3">
                    {integration.hisolution_services.description}
                  </CardDescription>
                  <div className="space-y-2 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">URL API</Label>
                      <p className="font-mono text-xs bg-muted p-1 rounded truncate">
                        {integration.api_url}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Metodi configurati</Label>
                      <p className="text-xs">
                        {Object.keys(integration.api_methods || {}).length} metodi
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openDialog(integration)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configura
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina integrazione</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sei sicuro di voler eliminare l'integrazione con <strong>{integration.hisolution_services.name}</strong>?
                            <br />
                            Questa azione non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteIntegrationMutation.mutate(integration.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteIntegrationMutation.isPending ? "Eliminando..." : "Elimina"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {integrations.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Settings className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nessuna integrazione configurata</h3>
              <p className="text-muted-foreground text-center mb-4">
                Inizia configurando la tua prima integrazione con i servizi HiSolution
              </p>
              <Button onClick={() => openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Configura prima integrazione
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Audit Log */}
        <IntegrationAuditLog organizationId={organizationId} />
      </div>
    </DashboardLayout>
  );
};

export default Integrations;