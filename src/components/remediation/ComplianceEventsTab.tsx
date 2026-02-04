import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  FileCheck, 
  Clock, 
  Search, 
  ExternalLink, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  CalendarCheck,
  ClipboardList,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { usePlaybookCompletions, PlaybookCompletion } from '@/hooks/usePlaybookCompletions';
import { generatePlaybookDocx } from '@/components/irp/playbookDocxGenerator';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type FilterStatus = 'all' | 'completed' | 'in_progress';

const getSeverityBadgeClass = (severity: string) => {
  switch (severity) {
    case 'Critica':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'Alta':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
    case 'Media':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
    default:
      return 'bg-primary/10 text-primary border-primary/20';
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: it });
  } catch {
    return '-';
  }
};

const ComplianceEventsTab: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { completions, isLoading, error, deleteCompletion } = usePlaybookCompletions();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredCompletions = completions.filter(c => {
    // Status filter
    if (filter === 'completed' && !c.completed_at) return false;
    if (filter === 'in_progress' && c.completed_at) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        c.playbook_title.toLowerCase().includes(query) ||
        c.playbook_category.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  const handleOpenPlaybook = useCallback((completion: PlaybookCompletion) => {
    // Navigate to incident response page - the playbook will be opened via localStorage
    navigate('/incident-response', { 
      state: { openPlaybookId: completion.playbook_id } 
    });
  }, [navigate]);

  const handleExportDocx = useCallback(async (completion: PlaybookCompletion) => {
    setExportingId(completion.id);
    try {
      await generatePlaybookDocx(completion.data);
      toast({
        title: "Export completato",
        description: `Playbook "${completion.playbook_title}" esportato con successo.`,
      });
    } catch (err) {
      console.error('Error exporting playbook:', err);
      toast({
        title: "Errore",
        description: "Impossibile esportare il playbook.",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  }, [toast]);

  const handleDelete = useCallback(async (completion: PlaybookCompletion) => {
    setDeletingId(completion.id);
    try {
      const success = await deleteCompletion(completion.playbook_id);
      if (success) {
        // Clear localStorage for this playbook
        localStorage.removeItem(`playbook_progress_${completion.playbook_id}`);
        toast({
          title: "Playbook eliminato",
          description: `"${completion.playbook_title}" è stato rimosso dallo storico.`,
        });
      } else {
        throw new Error('Delete failed');
      }
    } catch (err) {
      console.error('Error deleting playbook:', err);
      toast({
        title: "Errore",
        description: "Impossibile eliminare il playbook.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }, [deleteCompletion, toast]);

  // Stats
  const totalPlaybooks = completions.length;
  const completedPlaybooks = completions.filter(c => c.completed_at).length;
  const inProgressPlaybooks = totalPlaybooks - completedPlaybooks;

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Playbook Totali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPlaybooks}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Completati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{completedPlaybooks}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              In Corso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{inProgressPlaybooks}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCheck className="w-5 h-5 text-primary" />
            Storico Playbook Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca playbook..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtra per stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="completed">Completati</SelectItem>
                <SelectItem value="in_progress">In Corso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredCompletions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nessun playbook trovato</p>
              <p className="text-sm">
                {searchQuery 
                  ? "Prova a modificare i criteri di ricerca"
                  : "I playbook compilati appariranno qui automaticamente"
                }
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Playbook</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="text-center">Progresso</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompletions.map((completion) => (
                    <TableRow key={completion.id}>
                      <TableCell className="whitespace-nowrap">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 text-sm">
                                <CalendarCheck className="w-4 h-4 text-muted-foreground" />
                                {formatDate(completion.completed_at || completion.updated_at)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                <p>Inizio: {formatDate(completion.started_at)}</p>
                                {completion.completed_at && (
                                  <p>Completato: {formatDate(completion.completed_at)}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {completion.playbook_title}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {completion.playbook_category}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs", getSeverityBadgeClass(completion.playbook_severity))}
                        >
                          {completion.playbook_severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all",
                                completion.progress_percentage === 100 
                                  ? "bg-green-500" 
                                  : "bg-primary"
                              )}
                              style={{ width: `${completion.progress_percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground min-w-[36px]">
                            {completion.progress_percentage}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {completion.completed_at ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Completato
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            <Clock className="w-3 h-3 mr-1" />
                            In Corso
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenPlaybook(completion)}
                                  className="h-8 w-8"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Riapri playbook</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleExportDocx(completion)}
                                  disabled={exportingId === completion.id}
                                  className="h-8 w-8"
                                >
                                  {exportingId === completion.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Download className="w-4 h-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Esporta DOCX</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <AlertDialog>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      disabled={deletingId === completion.id}
                                    >
                                      {deletingId === completion.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Elimina</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare questo playbook?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Stai per eliminare "{completion.playbook_title}" dallo storico compliance. 
                                  Questa azione è irreversibile.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(completion)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Elimina
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          <span>Completato = Data certificata di completamento</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-yellow-500" />
          <span>In Corso = Compilazione parziale</span>
        </div>
        <div className="flex items-center gap-1">
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Riapri playbook per modificarlo</span>
        </div>
        <div className="flex items-center gap-1">
          <Download className="w-3.5 h-3.5" />
          <span>Esporta DOCX con datestamp</span>
        </div>
      </div>
    </div>
  );
};

export default ComplianceEventsTab;
