 import React from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useClientContext } from '@/contexts/ClientContext';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Building2, ChevronDown, RefreshCw } from 'lucide-react';
 
 export const ClientIndicator: React.FC = () => {
   const navigate = useNavigate();
   const { selectedOrganization, canManageMultipleClients, clearSelection } = useClientContext();
 
   if (!canManageMultipleClients) return null;
 
   const handleChangeClient = () => {
     clearSelection();
     navigate('/clients');
   };
 
   return (
     <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-border">
       <div className="flex items-center gap-2 text-sm">
         <Building2 className="w-4 h-4 text-primary" />
         <span className="text-muted-foreground">Cliente:</span>
         {selectedOrganization ? (
           <Badge variant="secondary" className="font-medium">
             {selectedOrganization.name}
           </Badge>
         ) : (
           <span className="text-muted-foreground italic">Nessuno selezionato</span>
         )}
       </div>
       <Button
         variant="ghost"
         size="sm"
         onClick={handleChangeClient}
         className="ml-auto text-xs"
       >
         <RefreshCw className="w-3 h-3 mr-1" />
         Cambia cliente
       </Button>
     </div>
   );
 };