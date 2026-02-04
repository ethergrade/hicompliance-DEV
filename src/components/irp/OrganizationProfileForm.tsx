import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { 
  NIS2Classification, 
  NIS2_LABELS, 
  NIS2_DESCRIPTIONS, 
  BUSINESS_SECTORS 
} from '@/types/organization';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

export const OrganizationProfileForm: React.FC = () => {
  const { formData, loading, saving, lastSaved, updateField } = useOrganizationProfile();

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const SaveStatusIndicator = () => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Salvando...</span>
        </>
      ) : lastSaved ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Salvato {formatDistanceToNow(lastSaved, { addSuffix: true, locale: it })}</span>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Anagrafica Azienda */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-foreground">Anagrafica Azienda</CardTitle>
                <CardDescription>Informazioni legali e di contatto dell'organizzazione</CardDescription>
              </div>
            </div>
            <SaveStatusIndicator />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="legal_name">Ragione Sociale</Label>
              <Input
                id="legal_name"
                placeholder="Es. Acme S.p.A."
                value={formData.legal_name}
                onChange={(e) => updateField('legal_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_number">Partita IVA</Label>
              <Input
                id="vat_number"
                placeholder="Es. 12345678901"
                maxLength={11}
                value={formData.vat_number}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                  updateField('vat_number', value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal_code">Codice Fiscale</Label>
              <Input
                id="fiscal_code"
                placeholder="Es. 12345678901 o RSSMRA80A01H501U"
                value={formData.fiscal_code}
                onChange={(e) => updateField('fiscal_code', e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_sector">Settore di Attività</Label>
              <Select
                value={formData.business_sector}
                onValueChange={(value) => updateField('business_sector', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona settore..." />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_SECTORS.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="legal_address">Sede Legale</Label>
              <Input
                id="legal_address"
                placeholder="Indirizzo completo"
                value={formData.legal_address}
                onChange={(e) => updateField('legal_address', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operational_address">Sede Operativa (opzionale)</Label>
              <Input
                id="operational_address"
                placeholder="Indirizzo completo"
                value={formData.operational_address}
                onChange={(e) => updateField('operational_address', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pec">PEC</Label>
              <Input
                id="pec"
                type="email"
                placeholder="azienda@pec.it"
                value={formData.pec}
                onChange={(e) => updateField('pec', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+39 02 1234567"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Aziendale</Label>
              <Input
                id="email"
                type="email"
                placeholder="info@azienda.it"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classificazione NIS2 */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-primary" />
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                Classificazione NIS2
                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                  Obbligatorio
                </Badge>
              </CardTitle>
              <CardDescription>
                Seleziona la classificazione della tua organizzazione secondo la Direttiva NIS2
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={formData.nis2_classification || ''}
            onValueChange={(value) => updateField('nis2_classification', value as NIS2Classification)}
            className="space-y-4"
          >
            {(['essential', 'important', 'none'] as NIS2Classification[]).map((classification) => (
              <div
                key={classification}
                className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                  formData.nis2_classification === classification
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => updateField('nis2_classification', classification)}
              >
                <RadioGroupItem value={classification} id={classification} className="mt-1" />
                <div className="space-y-1 flex-1">
                  <Label htmlFor={classification} className="font-medium cursor-pointer">
                    {NIS2_LABELS[classification]}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {NIS2_DESCRIPTIONS[classification]}
                  </p>
                </div>
                {formData.nis2_classification === classification && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
};
