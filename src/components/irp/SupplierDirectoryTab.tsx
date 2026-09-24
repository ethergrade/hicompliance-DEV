import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, Loader2, ArrowRight } from 'lucide-react';
import { CRITICALITY_LABEL, sb, type Supplier } from '@/features/supply-chain/api';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { isInnovatechDemo } from '@/data/innovatechSecurityDemo';

interface SupplierDirectoryTabProps {
  organizationId: string;
  groupId: string | null;
}

// Vista sintetica della rubrica fornitori condivisa con il modulo Supply Chain.
const SupplierDirectoryTab: React.FC<SupplierDirectoryTabProps> = ({ organizationId }) => {
  const { selectedOrganization } = useClientOrganization();
  const moduleOn = isInnovatechDemo(selectedOrganization?.name);
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['irp-suppliers', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await sb.from('supplier_directory').select('*')
        .eq('organization_id', organizationId).is('archived_at', null).order('supplier_name');
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" />Rubrica fornitori</CardTitle>
        {moduleOn && (
          <Button asChild size="sm" variant="outline"><Link to="/supply-chain">Gestisci in Supply Chain<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun fornitore registrato.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fornitore</TableHead><TableHead>Servizio</TableHead><TableHead>Criticità</TableHead>
                <TableHead>Referente</TableHead><TableHead>Email</TableHead><TableHead>Telefono</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.supplier_name}</TableCell>
                    <TableCell className="text-sm">{s.category ?? s.service_type ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{CRITICALITY_LABEL[s.criticality] ?? '—'}</Badge></TableCell>
                    <TableCell className="text-sm">{s.contact_name ?? '—'}</TableCell>
                    <TableCell className="text-sm">{s.email ?? '—'}</TableCell>
                    <TableCell className="text-sm">{s.phone ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierDirectoryTab;
