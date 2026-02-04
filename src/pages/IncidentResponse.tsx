import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IRPDocumentEditor } from '@/components/irp/IRPDocumentEditor';
import { GovernanceContactsTable } from '@/components/irp/GovernanceContactsTable';
import { ContactDirectoryManager } from '@/components/irp/ContactDirectoryManager';
import { OrganizationProfileForm } from '@/components/irp/OrganizationProfileForm';
import { PlaybookViewer } from '@/components/irp/PlaybookViewer';
import { CriticalInfrastructureManager } from '@/components/irp/CriticalInfrastructureManager';
import { RiskAnalysisManager } from '@/components/irp/RiskAnalysisManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Playbook } from '@/types/playbook';
import { playbooksMap } from '@/data/playbooks/phishing';
import { generatePlaybookDocx } from '@/components/irp/playbookDocxGenerator';
import {
  Download,
  Clock,
  Users,
  Phone,
  Mail,
  Shield,
  ShieldAlert,
  Eye,
  Database,
  Network,
  Lock,
  Package,
  Trash2,
  Server,
  ShieldCheck
} from 'lucide-react';

interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  category: string;
}

const IncidentResponse: React.FC = () => {
  const location = useLocation();
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [irpEditorOpen, setIrpEditorOpen] = useState(false);
  const [playbookViewerOpen, setPlaybookViewerOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const { toast } = useToast();

  // Handle navigation state to open a specific playbook
  useEffect(() => {
    const state = location.state as { openPlaybookId?: string } | null;
    if (state?.openPlaybookId) {
      const playbook = playbooksMap[state.openPlaybookId];
      if (playbook) {
        setSelectedPlaybook(playbook);
        setPlaybookViewerOpen(true);
      }
      // Clear the state to prevent re-opening on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Procedure operative per incident response
  const procedures = [
    {
      id: 'data-breach',
      title: 'Violazione dei Dati (Data Breach)',
      category: 'Dati',
      severity: 'Critica',
      icon: Database,
      duration: '2-4 ore',
      description: 'Procedura completa per gestire violazioni di dati personali e aziendali',
      steps: [
        'Identificazione immediata della violazione',
        'Isolamento dei sistemi compromessi',
        'Valutazione dell\'impatto sui dati',
        'Notifica alle autorità competenti',
        'Comunicazione ai soggetti interessati',
        'Documentazione dell\'incidente',
        'Implementazione misure correttive'
      ],
      contacts: ['CISO', 'DPO', 'Legal Team'],
      templates: ['Notifica GDPR', 'Report interno', 'Comunicazione clienti']
    },
    {
      id: 'phishing-attack',
      title: 'Attacco Phishing',
      category: 'Social Engineering',
      severity: 'Media',
      icon: Mail,
      duration: '30 min - 1 ora',
      description: 'Gestione di campagne phishing e compromissione credenziali',
      steps: [
        'Verifica della segnalazione phishing',
        'Blocco immediato delle email sospette',
        'Analisi dei link e allegati malevoli',
        'Reset credenziali compromesse',
        'Formazione utenti coinvolti',
        'Aggiornamento filtri email',
        'Monitoraggio continuo'
      ],
      contacts: ['Security Team', 'IT Helpdesk', 'HR'],
      templates: ['Alert phishing', 'Guida utenti', 'Report incidente']
    },
    {
      id: 'ddos-attack',
      title: 'Attacco DDoS',
      category: 'Rete',
      severity: 'Alta',
      icon: Network,
      duration: '1-2 ore',
      description: 'Mitigazione degli attacchi di negazione del servizio distribuito',
      steps: [
        'Identificazione del traffico anomalo',
        'Attivazione sistemi anti-DDoS',
        'Analisi pattern di attacco',
        'Implementazione rate limiting',
        'Contatto provider di rete',
        'Monitoraggio della mitigazione',
        'Ripristino servizi normali'
      ],
      contacts: ['Network Team', 'ISP Contact', 'Security Operations'],
      templates: ['Report DDoS', 'Comunicazione downtime', 'Piano mitigazione']
    },
    {
      id: 'physical-security',
      title: 'Physical Security Breach',
      category: 'Sicurezza Fisica',
      severity: 'Alta',
      icon: Shield,
      duration: '1-3 ore',
      description: 'Preservare scena ed evidenze, ridurre rischio su dati, ripristinare sicurezza fisica e logica',
      steps: [
        'Confermare evento e delimitare area',
        'Inventario asset coinvolti',
        'Valutare dati potenzialmente esposti',
        'Estrarre badge logs e CCTV',
        'Revocare badge/accessi fisici',
        'Remote wipe/lock endpoint',
        'Hardening fisico e recovery'
      ],
      contacts: ['Head IT', 'Facilities/Security', 'Legal'],
      templates: ['Report incidente', 'Chain of custody', 'Denuncia']
    },
    {
      id: 'unauthorized-access',
      title: 'Unauthorized Access / Intrusion',
      category: 'Sicurezza',
      severity: 'Critica',
      icon: ShieldAlert,
      duration: '2-4 ore',
      description: 'Interrompere l\'accesso e il movimento laterale, rimuovere persistenze, ripristinare sicurezza',
      steps: [
        'Confermare intrusion e identificare entry point',
        'Disabilitare account compromessi',
        'Segmentazione d\'emergenza',
        'Rimuovere backdoor e persistenze',
        'Ripristinare servizi con policy rafforzate',
        'Monitoraggio potenziato',
        'Valutare notifica CSIRT/DPO'
      ],
      contacts: ['SOC/Head IT', 'Forensics', 'IRM', 'CISO'],
      templates: ['Timeline incidente', 'Log autenticazioni', 'Report persistenze']
    },
    {
      id: 'ransomware',
      title: 'Ransomware / Malware',
      category: 'Sicurezza',
      severity: 'Critica',
      icon: Lock,
      duration: '1-4 ore',
      description: 'Risposta completa agli attacchi ransomware e malware',
      steps: [
        'Isolamento immediato sistemi infetti',
        'Identificazione variante ransomware/malware',
        'Valutazione dati crittografati',
        'Analisi disponibilità backup',
        'Decisione pagamento/ripristino',
        'Ripristino da backup verificati',
        'Hardening post-incidente'
      ],
      contacts: ['Crisis Team', 'Backup Admin', 'Legal Team'],
      templates: ['Piano crisis management', 'Valutazione impatto', 'Comunicazione stakeholder']
    },
    {
      id: 'supply-chain',
      title: 'Supply Chain Incident',
      category: 'Supply Chain',
      severity: 'Critica',
      icon: Package,
      duration: '2-6 ore',
      description: 'Bloccare distribuzione di componenti compromessi, verificare integrità software, isolare impatto',
      steps: [
        'Identificare componente/fornitore impattato',
        'Mappare sistemi dipendenti',
        'Stop deploy e freeze release',
        'Rollback a versione nota-buona',
        'Rebuild artefatti da pipeline trusted',
        'Aggiornare SBOM e policy',
        'Comunicazioni a clienti/partner'
      ],
      contacts: ['CISO', 'Head IT/DevOps', 'IRM', 'Legal/Vendor mgmt'],
      templates: ['Timeline vendor', 'SBOM aggiornato', 'Comunicazione clienti']
    }
  ];

  // Documenti scaricabili
  const documents = [
    {
      name: 'Piano di Incident Response Completo',
      type: 'PDF',
      size: '2.5 MB',
      updated: '2024-01-15',
      category: 'Piano Generale'
    },
    {
      name: 'Checklist Primo Intervento',
      type: 'PDF',
      size: '450 KB',
      updated: '2024-01-10',
      category: 'Checklist'
    },
    {
      name: 'Template Comunicazione Crisis',
      type: 'DOCX',
      size: '120 KB',
      updated: '2024-01-12',
      category: 'Template'
    },
    {
      name: 'Flowchart Decisionale',
      type: 'PDF',
      size: '890 KB',
      updated: '2024-01-08',
      category: 'Processo'
    },
    {
      name: 'Modulo Notifica GDPR',
      type: 'PDF',
      size: '320 KB',
      updated: '2024-01-05',
      category: 'Legal'
    },
    {
      name: 'Guida Forensics Digitale',
      type: 'PDF',
      size: '1.8 MB',
      updated: '2024-01-18',
      category: 'Tecnico'
    }
  ];

  // Fetch emergency contacts from database
  const fetchEmergencyContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setEmergencyContacts((data || []) as EmergencyContact[]);
    } catch (error) {
      console.error('Error fetching emergency contacts:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei contatti di emergenza",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmergencyContacts();
  }, []);

  const handleContactAdded = () => {
    fetchEmergencyContacts();
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Contatto eliminato con successo"
      });

      fetchEmergencyContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione del contatto",
        variant: "destructive"
      });
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'security': return 'Team di Sicurezza';
      case 'it': return 'Team IT';
      case 'authorities': return 'Autorità e Partner';
      default: return category;
    }
  };

  const getContactsByCategory = (category: string) => {
    return emergencyContacts.filter(contact => contact.category === category);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critica': return 'text-red-500';
      case 'Alta': return 'text-orange-500';
      case 'Media': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'Critica': return 'bg-red-100 dark:bg-red-900/20';
      case 'Alta': return 'bg-orange-100 dark:bg-orange-900/20';
      case 'Media': return 'bg-yellow-100 dark:bg-yellow-900/20';
      default: return 'bg-green-100 dark:bg-green-900/20';
    }
  };

  const downloadDocument = (docName: string) => {
    // Simulazione download
    console.log(`Downloading: ${docName}`);
  };

  const handleViewPlaybook = (procedureId: string) => {
    const playbook = playbooksMap[procedureId];
    if (playbook) {
      setSelectedPlaybook(playbook);
      setPlaybookViewerOpen(true);
    } else {
      toast({
        title: "Playbook non disponibile",
        description: "Il playbook interattivo per questa procedura sarà disponibile a breve.",
        variant: "default"
      });
    }
  };

  const handleDownloadPlaybook = async (procedureId: string) => {
    const playbook = playbooksMap[procedureId];
    if (playbook) {
      // Load saved progress if exists
      const storageKey = `playbook_progress_${playbook.id}`;
      const saved = localStorage.getItem(storageKey);
      const playbookToExport = saved ? JSON.parse(saved) : playbook;
      
      try {
        await generatePlaybookDocx(playbookToExport);
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
    } else {
      // Fallback to legacy behavior
      console.log(`Downloading procedure: ${procedureId}`);
    }
  };

  // Check if a playbook has saved progress
  const hasPlaybookProgress = (procedureId: string): boolean => {
    const storageKey = `playbook_progress_${procedureId}`;
    return localStorage.getItem(storageKey) !== null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Incident Response Plan</h1>
          <p className="text-gray-400">
            Procedure operative e documentazione per la gestione degli incidenti di sicurezza
          </p>
        </div>

        <Tabs defaultValue="procedures" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="procedures">Procedure Operative</TabsTrigger>
            <TabsTrigger value="contacts">Contatti e Informazioni</TabsTrigger>
            <TabsTrigger value="directory">Rubrica Contatti</TabsTrigger>
            <TabsTrigger value="infrastructure" className="flex items-center gap-1">
              <Server className="h-4 w-4" />
              Infrastruttura Critica
            </TabsTrigger>
            <TabsTrigger value="risk-analysis" className="flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" />
              Analisi Rischi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="procedures" className="space-y-6">
            <Button 
              className="w-full bg-primary text-primary-foreground"
              onClick={() => setIrpEditorOpen(true)}
            >
              <Download className="w-4 h-4 mr-2" />
              Scarica Incident Response Plan Completo
            </Button>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {procedures.map((procedure) => (
                <Card key={procedure.id} className="border-border bg-card hover:bg-card/80 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <procedure.icon className="w-8 h-8 text-primary" />
                      <div className="flex items-center gap-2">
                        {hasPlaybookProgress(procedure.id) && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                            In corso
                          </Badge>
                        )}
                        <Badge variant="secondary" className={getSeverityBg(procedure.severity)}>
                          <span className={getSeverityColor(procedure.severity)}>
                            {procedure.severity}
                          </span>
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-foreground text-lg">{procedure.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{procedure.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-muted-foreground">
                        <Clock className="w-4 h-4 mr-1" />
                        {procedure.duration}
                      </div>
                      <Badge variant="outline">{procedure.category}</Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Passaggi principali:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {procedure.steps.slice(0, 3).map((step, index) => (
                          <li key={index} className="flex items-start">
                            <span className="text-primary mr-2">•</span>
                            {step}
                          </li>
                        ))}
                        {procedure.steps.length > 3 && (
                          <li className="text-primary text-sm">
                            +{procedure.steps.length - 3} altri passaggi...
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleViewPlaybook(procedure.id)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Visualizza
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleDownloadPlaybook(procedure.id)}
                        className="bg-primary text-primary-foreground"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-6">
            <OrganizationProfileForm />
            <GovernanceContactsTable onDataChange={fetchEmergencyContacts} />
          </TabsContent>

          <TabsContent value="directory" className="space-y-6">
            <ContactDirectoryManager />
          </TabsContent>

          <TabsContent value="infrastructure" className="space-y-6">
            <CriticalInfrastructureManager />
          </TabsContent>

          <TabsContent value="risk-analysis" className="space-y-6">
            <RiskAnalysisManager />
          </TabsContent>
        </Tabs>
      </div>

      <IRPDocumentEditor open={irpEditorOpen} onOpenChange={setIrpEditorOpen} />
      <PlaybookViewer 
        playbook={selectedPlaybook} 
        open={playbookViewerOpen} 
        onOpenChange={setPlaybookViewerOpen} 
      />
    </DashboardLayout>
  );
};

export default IncidentResponse;