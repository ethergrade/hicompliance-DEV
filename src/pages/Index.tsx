import { useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Monitor, Globe, Eye, ClipboardCheck, BarChart3, AlertTriangle, FileText, Users, CheckCircle, ArrowRight, Lock, Cloud, Network, Mail, Download, Activity } from 'lucide-react';
const Index = () => {
  const {
    user,
    loading
  } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-4xl font-bold bg-gradient-cyber bg-clip-text text-transparent mb-4">
            HiCompliance
          </h1>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>;
  }

  // Show different header for authenticated users
  const showAuthenticatedHeader = user;
  const features = [{
    icon: Shield,
    title: "Dashboard Centralizzata",
    description: "Monitoraggio in tempo reale dei servizi HiSolution con metriche di sicurezza e health score",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10"
  }, {
    icon: Globe,
    title: "SurfaceScan360",
    description: "Scansione completa della superficie di attacco dell'organizzazione",
    color: "text-green-500",
    bgColor: "bg-green-500/10"
  }, {
    icon: Eye,
    title: "DarkRisk360",
    description: "Monitoraggio delle minacce nel dark web e intelligence sulle vulnerabilità",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10"
  }, {
    icon: ClipboardCheck,
    title: "Assessment NIS2",
    description: "Valutazione completa della conformità alla direttiva NIS2 con report dettagliati",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10"
  }, {
    icon: BarChart3,
    title: "Analytics Avanzate",
    description: "Dashboard analitiche per trend di sicurezza e KPI di conformità",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10"
  }, {
    icon: AlertTriangle,
    title: "Threat Management",
    description: "Gestione centralizzata delle minacce e incident response automatizzato",
    color: "text-red-500",
    bgColor: "bg-red-500/10"
  }];
  const hiSolutionServices = [{
    icon: Shield,
    name: "HiFirewall",
    description: "Sicurezza Perimetrale"
  }, {
    icon: Monitor,
    name: "HiEndpoint",
    description: "Sicurezza Endpoint e Server"
  }, {
    icon: Mail,
    name: "HiMail",
    description: "Protezione caselle E-Mail"
  }, {
    icon: FileText,
    name: "HiLog",
    description: "Monitoraggio accessi Admin"
  }, {
    icon: Download,
    name: "HiPatch",
    description: "Vulnerability Assessment continuativo e Patch Management"
  }, {
    icon: Lock,
    name: "HiMfa",
    description: "Protezione accessi"
  }, {
    icon: Activity,
    name: "HiTrack",
    description: "Monitoraggio Dispositivi"
  }];
  const stats = [{
    label: "Organizzazioni Protette",
    value: "500+",
    icon: Users
  }, {
    label: "Conformità NIS2",
    value: "100%",
    icon: CheckCircle
  }, {
    label: "Uptime Garantito",
    value: "99.9%",
    icon: Network
  }, {
    label: "delle aziende hanno ridotto il rischio nei primi 3 mesi",
    value: "63%",
    icon: Shield
  }];
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden">
              <img src="/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png" alt="HiCompliance Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-cyber bg-clip-text text-transparent">
                HiCompliance
              </h1>
              <p className="text-xs text-muted-foreground">Cyber Risk Platform</p>
            </div>
          </div>
          {showAuthenticatedHeader ? <Link to="/dashboard">
              <Button className="bg-gradient-cyber hover:opacity-90">
                Vai alla Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link> : <Link to="/auth">
              <Button className="bg-gradient-cyber hover:opacity-90">
                Accedi alla Piattaforma
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-background via-background to-muted/30">
        <div className="container mx-auto px-4 text-center py-[15px]">
          <Badge variant="secondary" className="mb-6">
            Conformità NIS2 • Gestione Cyber Risk • Monitoraggio 24/7
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="text-white">HiCompliance:</span>
            <span className="block bg-gradient-cyber bg-clip-text text-transparent py-[10px]">
              Piattaforma integrata di Cyber Risk Management
            </span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            HiCompliance offre una soluzione completa per la gestione del rischio cyber, 
            la conformità NIS2 e il monitoraggio continuo della sicurezza aziendale.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {showAuthenticatedHeader ? <Link to="/dashboard">
                <Button size="lg" className="bg-gradient-cyber hover:opacity-90 text-lg px-8">
                  Vai alla Dashboard
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link> : <Link to="/auth">
                <Button size="lg" className="bg-gradient-cyber hover:opacity-90 text-lg px-8">
                  Inizia Ora
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>}
            <Button size="lg" variant="outline" className="text-lg px-8">
              Scopri di Più
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-card text-center">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 justify-items-center">
            {stats.map((stat, index) => <div key={index} className="text-center">
                <div className="w-12 h-12 bg-gradient-cyber rounded-lg flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-bold text-foreground mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>)}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Funzionalità Avanzate</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Una suite completa di strumenti per proteggere, monitorare e gestire 
              la sicurezza della tua organizzazione
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => <Card key={index} className="border-border hover:shadow-cyber transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className={`w-12 h-12 ${feature.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>)}
          </div>
        </div>
      </section>

      {/* HiSolution Services */}
      <section className="py-20 bg-muted/30 text-center">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Servizi HiSolution Integrati</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Monitoraggio centralizzato di tutti i servizi di sicurezza HiSolution 
              con dashboard real-time e alerting automatico
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {hiSolutionServices.map((service, index) => <div key={index} className="bg-card rounded-xl border border-border p-6 hover:bg-muted/50 transition-colors">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <service.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{service.name}</h3>
                </div>
                <p className="text-muted-foreground text-sm text-left">{service.description}</p>
              </div>)}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-cyber">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Inizia la Tua Valutazione NIS2 Oggi
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Scopri HiCompliance per iniziare la valutazione della conformità e proteggere la tua organizzazione dalle minacce cyber.</p>
          {showAuthenticatedHeader ? <Link to="/dashboard">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Vai alla Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link> : <Link to="/auth">
              <Button size="lg" variant="secondary" className="text-lg px-8">
                Accedi alla Piattaforma
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-8 h-8 rounded-lg overflow-hidden">
                <img src="/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png" alt="HiCompliance Logo" className="w-full h-full object-cover" />
              </div>
              <span className="text-lg font-semibold">HiCompliance</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © 2024 HiCompliance. Piattaforma di gestione cyber risk e conformità NIS2.
            </p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Index;