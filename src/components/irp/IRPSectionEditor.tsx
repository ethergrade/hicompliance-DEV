import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { IRPDocumentData, SeverityLevel, RoleItem, Procedure } from '@/types/irp';

interface IRPSectionEditorProps {
  document: IRPDocumentData;
  onUpdate: (document: IRPDocumentData) => void;
}

export const IRPSectionEditor = ({ document, onUpdate }: IRPSectionEditorProps) => {
  const updateField = (field: keyof IRPDocumentData, value: any) => {
    onUpdate({ ...document, [field]: value });
  };

  const updateSection = (field: keyof IRPDocumentData['sections'], value: any) => {
    onUpdate({
      ...document,
      sections: { ...document.sections, [field]: value },
    });
  };

  const addSeverityLevel = () => {
    const newLevel: SeverityLevel = {
      level: 'Nuovo Livello',
      description: '',
      responseTime: '',
    };
    updateSection('severity', [...document.sections.severity, newLevel]);
  };

  const updateSeverityLevel = (index: number, field: keyof SeverityLevel, value: string) => {
    const updated = [...document.sections.severity];
    updated[index] = { ...updated[index], [field]: value };
    updateSection('severity', updated);
  };

  const removeSeverityLevel = (index: number) => {
    updateSection('severity', document.sections.severity.filter((_, i) => i !== index));
  };

  const addRole = () => {
    const newRole: RoleItem = { role: '', responsibilities: '', contact: '' };
    updateSection('roles', [...document.sections.roles, newRole]);
  };

  const updateRole = (index: number, field: keyof RoleItem, value: string) => {
    const updated = [...document.sections.roles];
    updated[index] = { ...updated[index], [field]: value };
    updateSection('roles', updated);
  };

  const removeRole = (index: number) => {
    updateSection('roles', document.sections.roles.filter((_, i) => i !== index));
  };

  const addProcedure = () => {
    const newProc: Procedure = { title: '', steps: [''], assignedTo: '' };
    updateSection('procedures', [...document.sections.procedures, newProc]);
  };

  const updateProcedure = (index: number, field: keyof Procedure, value: any) => {
    const updated = [...document.sections.procedures];
    updated[index] = { ...updated[index], [field]: value };
    updateSection('procedures', updated);
  };

  const removeProcedure = (index: number) => {
    updateSection('procedures', document.sections.procedures.filter((_, i) => i !== index));
  };

  const addStep = (procIndex: number) => {
    const updated = [...document.sections.procedures];
    updated[procIndex].steps.push('');
    updateSection('procedures', updated);
  };

  const updateStep = (procIndex: number, stepIndex: number, value: string) => {
    const updated = [...document.sections.procedures];
    updated[procIndex].steps[stepIndex] = value;
    updateSection('procedures', updated);
  };

  const removeStep = (procIndex: number, stepIndex: number) => {
    const updated = [...document.sections.procedures];
    updated[procIndex].steps = updated[procIndex].steps.filter((_, i) => i !== stepIndex);
    updateSection('procedures', updated);
  };

  return (
    <div className="space-y-6">
      {/* General Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Generali</CardTitle>
          <CardDescription>Dati dell'azienda e del documento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Azienda</Label>
              <Input
                value={document.companyName}
                onChange={e => updateField('companyName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Versione</Label>
              <Input
                value={document.version}
                onChange={e => updateField('version', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Indirizzo</Label>
            <Input
              value={document.companyAddress}
              onChange={e => updateField('companyAddress', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle>Introduzione</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={document.sections.introduction}
            onChange={e => updateSection('introduction', e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Severity Levels */}
      <Card>
        <CardHeader>
          <CardTitle>Classificazione della Gravità</CardTitle>
          <CardDescription>Definisci i livelli di gravità degli incidenti</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {document.sections.severity.map((level, index) => (
            <div key={index} className="flex gap-2 items-start p-4 border rounded-lg">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Livello"
                  value={level.level}
                  onChange={e => updateSeverityLevel(index, 'level', e.target.value)}
                />
                <Input
                  placeholder="Descrizione"
                  value={level.description}
                  onChange={e => updateSeverityLevel(index, 'description', e.target.value)}
                />
                <Input
                  placeholder="Tempo di Risposta"
                  value={level.responseTime}
                  onChange={e => updateSeverityLevel(index, 'responseTime', e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSeverityLevel(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={addSeverityLevel} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Livello
          </Button>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Ruoli e Responsabilità</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {document.sections.roles.map((role, index) => (
            <div key={index} className="flex gap-2 items-start p-4 border rounded-lg">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Ruolo"
                  value={role.role}
                  onChange={e => updateRole(index, 'role', e.target.value)}
                />
                <Textarea
                  placeholder="Responsabilità"
                  value={role.responsibilities}
                  onChange={e => updateRole(index, 'responsibilities', e.target.value)}
                  rows={2}
                />
                <Input
                  placeholder="Contatto"
                  value={role.contact}
                  onChange={e => updateRole(index, 'contact', e.target.value)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeRole(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={addRole} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Ruolo
          </Button>
        </CardContent>
      </Card>

      {/* Communications */}
      <Card>
        <CardHeader>
          <CardTitle>Piano di Comunicazione</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={document.sections.communications}
            onChange={e => updateSection('communications', e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Procedures */}
      <Card>
        <CardHeader>
          <CardTitle>Procedure Operative</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {document.sections.procedures.map((proc, procIndex) => (
            <div key={procIndex} className="p-4 border rounded-lg space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Titolo Procedura"
                  value={proc.title}
                  onChange={e => updateProcedure(procIndex, 'title', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Assegnato a"
                  value={proc.assignedTo}
                  onChange={e => updateProcedure(procIndex, 'assignedTo', e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeProcedure(procIndex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2 pl-4">
                <Label className="text-sm">Passi:</Label>
                {proc.steps.map((step, stepIndex) => (
                  <div key={stepIndex} className="flex gap-2">
                    <Input
                      placeholder={`Passo ${stepIndex + 1}`}
                      value={step}
                      onChange={e => updateStep(procIndex, stepIndex, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStep(procIndex, stepIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => addStep(procIndex)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Aggiungi Passo
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={addProcedure} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Procedura
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
