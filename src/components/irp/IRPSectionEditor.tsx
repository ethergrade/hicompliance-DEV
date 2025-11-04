import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IRPDocumentData } from '@/types/irp';

interface IRPSectionEditorProps {
  document: IRPDocumentData;
  onUpdate: (document: IRPDocumentData) => void;
}

export const IRPSectionEditor = ({ document, onUpdate }: IRPSectionEditorProps) => {
  const updateField = (field: keyof IRPDocumentData, value: string) => {
    onUpdate({ ...document, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* General Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Generali</CardTitle>
          <CardDescription>
            Informazioni di base sul documento IRP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome Azienda</Label>
            <Input
              id="companyName"
              value={document.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="Nome dell'azienda"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Indirizzo</Label>
            <Input
              id="companyAddress"
              value={document.companyAddress}
              onChange={(e) => updateField('companyAddress', e.target.value)}
              placeholder="Indirizzo completo"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={document.date}
                onChange={(e) => updateField('date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Versione</Label>
              <Input
                id="version"
                value={document.version}
                onChange={(e) => updateField('version', e.target.value)}
                placeholder="es. 1.0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Note */}
      <Card>
        <CardHeader>
          <CardTitle>Note</CardTitle>
          <CardDescription>
            Il documento originale verrà utilizzato come template. I contatti verranno popolati dalla sezione "Contatti di Emergenza".
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
};
