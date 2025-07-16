import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { LocationManager } from "./LocationManager";
import { Building2, Save } from "lucide-react";

export function GeneralSettings() {
  const { toast } = useToast();
  const { organization, loading, updateOrganization } = useOrganizationSettings();
  const [organizationName, setOrganizationName] = useState("");

  useEffect(() => {
    if (organization) {
      setOrganizationName(organization.name);
    }
  }, [organization]);

  const handleSaveOrganization = async () => {
    if (!organizationName.trim()) {
      toast({
        title: "Errore",
        description: "Il nome dell'organizzazione è obbligatorio",
        variant: "destructive",
      });
      return;
    }

    const success = await updateOrganization({ name: organizationName });
    if (success) {
      toast({
        title: "Successo",
        description: "Dati dell'organizzazione aggiornati con successo",
      });
    }
  };

  if (loading) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Dati Organizzazione */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dati Organizzazione
          </CardTitle>
          <CardDescription>
            Modifica le informazioni principali della tua organizzazione
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="organizationName">Nome Organizzazione</Label>
              <Input
                id="organizationName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Inserisci il nome dell'organizzazione"
              />
            </div>
          </div>
          
          <Button onClick={handleSaveOrganization} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Salva Modifiche
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Gestione Sedi */}
      <LocationManager />
    </div>
  );
}