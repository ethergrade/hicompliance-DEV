import React, { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Download, 
  Clock, 
  Target,
  Users,
  AlertTriangle,
  CheckCircle2,
  Shield,
  FileText,
  Zap,
  RotateCcw,
  Trash2,
  Eye,
  CloudUpload,
  Cloud,
  Calendar,
} from 'lucide-react';
import { Playbook, PlaybookChecklistItem, calculatePlaybookProgress } from '@/types/playbook';
import { PlaybookProgressBar } from './PlaybookProgressBar';
import { PlaybookChecklistSection } from './PlaybookChecklistSection';
import { PlaybookRadioSection } from './PlaybookRadioSection';
import { PlaybookInputSection } from './PlaybookInputSection';
import { generatePlaybookDocx } from './playbookDocxGenerator';
import { useToast } from '@/hooks/use-toast';
import { usePlaybookAutoSave, formatRelativeTime } from '@/hooks/usePlaybookAutoSave';
import { usePlaybookCompletions } from '@/hooks/usePlaybookCompletions';
import { loadPlaybookWithMigration } from '@/lib/playbookMigration';
import { cn } from '@/lib/utils';

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface PlaybookViewerProps {
  playbook: Playbook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getSectionIcon = (sectionId: string) => {
  const icons: Record<string, React.ReactNode> = {
    triggers: <Zap className="w-4 h-4" />,
    triage: <Target className="w-4 h-4" />,
    containment: <Shield className="w-4 h-4" />,
    eradication: <Trash2 className="w-4 h-4" />,
    recovery: <RotateCcw className="w-4 h-4" />,
    communications: <Users className="w-4 h-4" />,
    evidence: <FileText className="w-4 h-4" />,
    gonogo: <CheckCircle2 className="w-4 h-4" />,
  };
  return icons[sectionId] || <Eye className="w-4 h-4" />;
};

const getSeverityStyles = (severity: string) => {
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

export const PlaybookViewer: React.FC<PlaybookViewerProps> = ({
  playbook: initialPlaybook,
  open,
  onOpenChange,
}) => {
  const [playbookState, setPlaybookState] = useState<Playbook | null>(null);
  const [, forceUpdate] = useState(0); // For relative time updates
  const { toast } = useToast();
  const { saveStatus, lastSaved, triggerSave, resetSaveState } = usePlaybookAutoSave();
  const { getCompletion } = usePlaybookCompletions();

  const completion = playbookState ? getCompletion(playbookState.id) : undefined;

  useEffect(() => {
    if (initialPlaybook) {
      // Deep clone to avoid mutating the original
      setPlaybookState(JSON.parse(JSON.stringify(initialPlaybook)));
    }
  }, [initialPlaybook]);

  // Auto-save when playbookState changes
  useEffect(() => {
    if (playbookState && open) {
      triggerSave(playbookState);
    }
  }, [playbookState, open, triggerSave]);

  // Update relative time display every minute
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  const handleOwnerChange = useCallback((inputId: string, value: string, contactId?: string) => {
    setPlaybookState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        owner: prev.owner.map(field =>
          field.id === inputId ? { ...field, value, contactId } : field
        ),
      };
    });
  }, []);

  const handleItemChange = useCallback((sectionId: string, itemId: string, updates: Partial<PlaybookChecklistItem>) => {
    setPlaybookState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map(section =>
          section.id === sectionId
            ? {
                ...section,
                items: section.items?.map(item =>
                  item.id === itemId ? { ...item, ...updates } : item
                ),
              }
            : section
        ),
      };
    });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!playbookState) return;
    try {
      await generatePlaybookDocx(playbookState);
      toast({
        title: "Download completato",
        description: "La checklist è stata scaricata in formato Word.",
      });
    } catch (error) {
      console.error('Error generating DOCX:', error);
      toast({
        title: "Errore",
        description: "Errore durante la generazione del documento.",
        variant: "destructive",
      });
    }
  }, [playbookState, toast]);

  const handleReset = useCallback(() => {
    if (initialPlaybook) {
      setPlaybookState(JSON.parse(JSON.stringify(initialPlaybook)));
      const storageKey = `playbook_progress_${initialPlaybook.id}`;
      localStorage.removeItem(storageKey);
      resetSaveState();
      toast({
        title: "Reset completato",
        description: "Il playbook è stato riportato allo stato iniziale.",
      });
    }
  }, [initialPlaybook, toast, resetSaveState]);

  // Load saved progress on mount with automatic migration
  useEffect(() => {
    if (initialPlaybook && open) {
      const loadedPlaybook = loadPlaybookWithMigration(
        initialPlaybook.id,
        initialPlaybook
      );
      setPlaybookState(loadedPlaybook);
    }
  }, [initialPlaybook, open]);

  if (!playbookState) return null;

  const progress = calculatePlaybookProgress(playbookState);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b bg-card/50">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <SheetTitle className="text-xl font-bold text-foreground">
                {playbookState.title}
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {playbookState.description}
              </SheetDescription>
            </div>
            <Badge 
              variant="outline" 
              className={cn("shrink-0", getSeverityStyles(playbookState.severity))}
            >
              {playbookState.severity}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {playbookState.duration}
            </div>
            <div className="flex items-center gap-1">
              <Target className="w-4 h-4" />
              {playbookState.category}
            </div>
          </div>

          {/* Date Section */}
          {completion && (
            <div className="flex flex-wrap items-center gap-4 text-sm mt-2">
              {completion.started_at && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Iniziato: {formatDateTime(completion.started_at)}</span>
                </div>
              )}
              {completion.completed_at && (
                <div className="flex items-center gap-1.5 text-primary">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Completato: {formatDateTime(completion.completed_at)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <PlaybookProgressBar
              completed={progress.completed}
              total={progress.total}
              percentage={progress.percentage}
            />
            
            {/* Auto-save status indicator */}
            <div className="flex items-center gap-2 text-xs">
              {saveStatus === 'saving' && (
                <>
                  <CloudUpload className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
                  <span className="text-muted-foreground">Salvando...</span>
                </>
              )}
              {saveStatus === 'saved' && lastSaved && (
                <>
                  <Cloud className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">
                    Salvato automaticamente - {formatRelativeTime(lastSaved)}
                  </span>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {/* Purpose Section */}
            <div className="rounded-lg border bg-primary/5 border-primary/20 p-4">
              <div className="flex items-center gap-2 text-primary font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Scopo
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {playbookState.purpose}
              </p>
            </div>

            {/* Owner Section */}
            <div className="space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Owner e Squad
              </h3>
              <PlaybookInputSection
                inputs={playbookState.owner}
                onInputChange={handleOwnerChange}
                columns={2}
              />
            </div>

            {/* Accordion Sections */}
            <Accordion 
              type="multiple" 
              defaultValue={['triggers', 'triage']}
              className="space-y-2"
            >
              {playbookState.sections.map((section) => {
                // For singleChoice sections, count as 0/1 or 1/1
                const sectionCompleted = section.singleChoice 
                  ? (section.items?.some(i => i.checked) ? 1 : 0)
                  : (section.items?.filter(i => i.checked).length || 0);
                const sectionTotal = section.singleChoice ? 1 : (section.items?.length || 0);
                
                return (
                  <AccordionItem 
                    key={section.id} 
                    value={section.id}
                    className="border rounded-lg px-4 bg-card"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="text-primary">
                          {getSectionIcon(section.id)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">
                            {section.title}
                            {section.subtitle && (
                              <span className="font-normal text-muted-foreground ml-2">
                                ({section.subtitle})
                              </span>
                            )}
                          </div>
                        </div>
                        {sectionTotal > 0 && (
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "ml-2",
                              sectionCompleted === sectionTotal 
                                ? "bg-primary/20 text-primary" 
                                : ""
                            )}
                          >
                            {sectionCompleted}/{sectionTotal}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      {section.type === 'text' && section.content && (
                        <p className="text-sm text-muted-foreground">
                          {section.content}
                        </p>
                      )}
                      {section.type === 'checklist' && section.items && (
                        section.singleChoice ? (
                          <PlaybookRadioSection
                            items={section.items}
                            onItemChange={(itemId, updates) => 
                              handleItemChange(section.id, itemId, updates)
                            }
                          />
                        ) : (
                          <PlaybookChecklistSection
                            items={section.items}
                            onItemChange={(itemId, updates) => 
                              handleItemChange(section.id, itemId, updates)
                            }
                          />
                        )
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>

        {/* Footer */}
        <SheetFooter className="p-4 border-t bg-card/50">
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownload}
                className="bg-primary text-primary-foreground"
              >
                <Download className="w-4 h-4 mr-2" />
                Scarica Checklist
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
