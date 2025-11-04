import { EmergencyContact } from '@/types/irp';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface IRPContactsTableProps {
  contacts: EmergencyContact[];
  onUpdateContact: (id: string, escalationLevel: number) => void;
  onReload?: () => void;
}

const getCategoryColor = (category: string) => {
  switch (category.toLowerCase()) {
    case 'security':
      return 'destructive';
    case 'it':
      return 'default';
    case 'authorities':
      return 'secondary';
    default:
      return 'outline';
  }
};

export const IRPContactsTable = ({ contacts, onUpdateContact, onReload }: IRPContactsTableProps) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Questi contatti verranno inclusi automaticamente nel documento IRP
        </p>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Ricarica Contatti
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-32">Livello Escalation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nessun contatto di emergenza configurato. Vai alla tab "Contatti di Emergenza" per aggiungerne.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map(contact => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>{contact.role}</TableCell>
                  <TableCell>
                    <Badge variant={getCategoryColor(contact.category)}>
                      {contact.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{contact.phone}</TableCell>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      max={3}
                      value={contact.escalationLevel || 3}
                      onChange={e =>
                        onUpdateContact(contact.id, parseInt(e.target.value) || 3)
                      }
                      className="w-20"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
