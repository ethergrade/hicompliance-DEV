import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Users,
  Phone,
  Mail,
  Shield,
  Eye,
  Database,
  Network,
  Lock
} from 'lucide-react';

const IncidentResponse: React.FC = () => {
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);

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
      id: 'malware-infection',
      title: 'Infezione Malware',
      category: 'Sicurezza',
      severity: 'Alta',
      icon: Shield,
      duration: '1-3 ore',
      description: 'Risposta rapida per contenere e rimuovere malware dai sistemi',
      steps: [
        'Disconnessione immediata dalla rete',
        'Identificazione del tipo di malware',
        'Scansione completa dei sistemi',
        'Isolamento dei file infetti',
        'Pulizia e bonifica',
        'Ripristino dei backup',
        'Rafforzamento delle difese'
      ],
      contacts: ['IT Security', 'System Admin', 'Network Team'],
      templates: ['Report analisi malware', 'Piano di bonifica', 'Checklist sicurezza']
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
      id: 'insider-threat',
      title: 'Minaccia Interna',
      category: 'Personale',
      severity: 'Critica',
      icon: Users,
      duration: '2-6 ore',
      description: 'Gestione di minacce provenienti da personale interno',
      steps: [
        'Raccolta evidenze iniziali',
        'Isolamento accessi dell\'utente',
        'Analisi dei log di attività',
        'Coordinamento con HR e Legal',
        'Preservazione delle prove',
        'Intervista del soggetto',
        'Azioni disciplinari/legali'
      ],
      contacts: ['CISO', 'HR Director', 'Legal Counsel'],
      templates: ['Report investigativo', 'Documentazione legale', 'Piano disciplinare']
    },
    {
      id: 'ransomware',
      title: 'Attacco Ransomware',
      category: 'Sicurezza',
      severity: 'Critica',
      icon: Lock,
      duration: '4-12 ore',
      description: 'Risposta completa agli attacchi ransomware',
      steps: [
        'Isolamento immediato sistemi infetti',
        'Identificazione variante ransomware',
        'Valutazione dati crittografati',
        'Analisi disponibilità backup',
        'Decisione pagamento/ripristino',
        'Ripristino da backup verificati',
        'Hardening post-incidente'
      ],
      contacts: ['Crisis Team', 'Backup Admin', 'Legal Team'],
      templates: ['Piano crisis management', 'Valutazione impatto', 'Comunicazione stakeholder']
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

  const downloadProcedure = (procedure: any) => {
    // Simulazione download procedura
    console.log(`Downloading procedure: ${procedure.title}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Incident Response Plan</h1>
            <p className="text-gray-400">
              Procedure operative e documentazione per la gestione degli incidenti di sicurezza
            </p>
          </div>
          <Button className="bg-primary text-primary-foreground">
            <Download className="w-4 h-4 mr-2" />
            Scarica Piano Completo
          </Button>
        </div>

        <Tabs defaultValue="procedures" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="procedures">Procedure Operative</TabsTrigger>
            <TabsTrigger value="documents">Gestione Documenti</TabsTrigger>
            <TabsTrigger value="contacts">Contatti di Emergenza</TabsTrigger>
          </TabsList>

          <TabsContent value="procedures" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {procedures.map((procedure) => (
                <Card key={procedure.id} className="border-border bg-card hover:bg-card/80 transition-colors cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <procedure.icon className="w-8 h-8 text-primary" />
                      <Badge variant="secondary" className={getSeverityBg(procedure.severity)}>
                        <span className={getSeverityColor(procedure.severity)}>
                          {procedure.severity}
                        </span>
                      </Badge>
                    </div>
                    <CardTitle className="text-white text-lg">{procedure.title}</CardTitle>
                    <p className="text-sm text-gray-400">{procedure.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-gray-400">
                        <Clock className="w-4 h-4 mr-1" />
                        {procedure.duration}
                      </div>
                      <Badge variant="outline">{procedure.category}</Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">Passaggi principali:</p>
                      <ul className="text-sm text-gray-400 space-y-1">
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
                      <Button size="sm" variant="outline" className="flex-1">
                        <Eye className="w-4 h-4 mr-1" />
                        Visualizza
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => downloadProcedure(procedure)}
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

          <TabsContent value="documents" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Documenti Disponibili</CardTitle>
                  <p className="text-gray-400">
                    Scarica i documenti di supporto per l'incident response
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium text-white">{doc.name}</p>
                            <p className="text-xs text-gray-400">
                              {doc.type} • {doc.size} • Aggiornato: {doc.updated}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="text-xs">
                            {doc.category}
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => downloadDocument(doc.name)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Caricamento Documenti</CardTitle>
                  <p className="text-gray-400">
                    Area per caricare documenti personalizzati della tua organizzazione
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-white mb-2">Trascina i file qui o clicca per selezionare</p>
                    <p className="text-sm text-gray-400">PDF, DOCX, TXT fino a 10MB</p>
                    <Button variant="outline" className="mt-4">
                      Seleziona File
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white">Documenti caricati:</p>
                    <div className="text-sm text-gray-400">
                      Nessun documento personalizzato caricato
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Team di Sicurezza</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="text-white">CISO: +39 02 1234 5678</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="text-white">security@company.com</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-white">Emergenze: +39 02 1234 9999</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Team IT</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="text-white">IT Manager: +39 02 1234 5679</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="text-white">it-support@company.com</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-white">Helpdesk: +39 02 1234 1000</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-white">Autorità e Partner</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="text-white">Polizia Postale: 113</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="text-white">CSIRT-IT: csirt@cert-it.gov</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-white">Partner SOC: +39 02 9876 5432</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default IncidentResponse;