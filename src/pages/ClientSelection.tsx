 import React, { useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useClientContext } from '@/contexts/ClientContext';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Skeleton } from '@/components/ui/skeleton';
 import { Search, Building2, Calendar, ArrowRight, Users } from 'lucide-react';
 import { format } from 'date-fns';
 import { it } from 'date-fns/locale';
 
 const ClientSelection: React.FC = () => {
   const navigate = useNavigate();
   const { organizations, setSelectedOrganization, isLoadingClients, selectedOrganization } = useClientContext();
   const [searchQuery, setSearchQuery] = useState('');
 
   const filteredOrganizations = organizations.filter(org => {
     if (!searchQuery.trim()) return true;
     const query = searchQuery.toLowerCase();
     return (
       org.name.toLowerCase().includes(query) ||
       org.code.toLowerCase().includes(query)
     );
   });
 
   const handleSelectClient = (org: typeof organizations[0]) => {
     setSelectedOrganization(org);
     navigate('/dashboard');
   };
 
   if (isLoadingClients) {
     return (
       <div className="min-h-screen bg-background p-6">
         <div className="max-w-6xl mx-auto">
           <Skeleton className="h-10 w-64 mb-6" />
           <Skeleton className="h-12 w-full max-w-md mb-8" />
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {[1, 2, 3, 4, 5, 6].map(i => (
               <Skeleton key={i} className="h-48 rounded-xl" />
             ))}
           </div>
         </div>
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-background">
       {/* Header */}
       <div className="border-b border-border bg-card/50">
         <div className="max-w-6xl mx-auto px-6 py-8">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 rounded-lg bg-primary/10">
               <Users className="w-6 h-6 text-primary" />
             </div>
             <h1 className="text-3xl font-bold text-foreground">Gestione Clienti</h1>
           </div>
           <p className="text-muted-foreground ml-12">
             Seleziona un cliente per visualizzare e gestire i suoi dati
           </p>
         </div>
       </div>
 
       <div className="max-w-6xl mx-auto p-6">
         {/* Search */}
         <div className="relative max-w-md mb-8">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
           <Input
             placeholder="Cerca per nome o codice cliente..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-10"
           />
         </div>
 
         {/* Stats */}
         <div className="flex items-center gap-4 mb-6">
           <Badge variant="outline" className="text-sm">
             {filteredOrganizations.length} {filteredOrganizations.length === 1 ? 'cliente' : 'clienti'}
           </Badge>
           {selectedOrganization && (
             <Badge variant="secondary" className="text-sm">
               Attualmente: {selectedOrganization.name}
             </Badge>
           )}
         </div>
 
         {/* Client Grid */}
         {filteredOrganizations.length === 0 ? (
           <Card className="text-center py-12">
             <CardContent>
               <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
               <p className="text-muted-foreground">
                 {searchQuery ? 'Nessun cliente trovato con questi criteri' : 'Nessun cliente disponibile'}
               </p>
             </CardContent>
           </Card>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredOrganizations.map((org) => (
               <Card 
                 key={org.id}
                 className={`group cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                   selectedOrganization?.id === org.id ? 'ring-2 ring-primary border-primary' : ''
                 }`}
                 onClick={() => handleSelectClient(org)}
               >
                 <CardHeader className="pb-3">
                   <div className="flex items-start justify-between">
                     <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                       <Building2 className="w-5 h-5 text-primary" />
                     </div>
                     {selectedOrganization?.id === org.id && (
                       <Badge variant="default" className="text-xs">
                         Attivo
                       </Badge>
                     )}
                   </div>
                   <CardTitle className="text-lg mt-3 group-hover:text-primary transition-colors">
                     {org.name}
                   </CardTitle>
                   <CardDescription className="font-mono text-xs">
                     {org.code}
                   </CardDescription>
                 </CardHeader>
                 <CardContent className="pt-0">
                   <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                     <Calendar className="w-3 h-3" />
                     <span>
                       Creato il {format(new Date(org.created_at), 'd MMMM yyyy', { locale: it })}
                     </span>
                   </div>
                   <Button 
                     variant="ghost" 
                     className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                   >
                     <span>Gestisci</span>
                     <ArrowRight className="w-4 h-4 ml-2" />
                   </Button>
                 </CardContent>
               </Card>
             ))}
           </div>
         )}
       </div>
     </div>
   );
 };
 
 export default ClientSelection;