import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Send } from 'lucide-react';

interface DemoFormData {
  nome: string;
  cognome: string;
  azienda: string;
  partita_iva: string;
  email: string;
  telefono: string;
}

const DemoRequestForm = () => {
  const [formData, setFormData] = useState<DemoFormData>({
    nome: '',
    cognome: '',
    azienda: '',
    partita_iva: '',
    email: '',
    telefono: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Personal email domains to reject
  const personalDomains = [
    'gmail.com', 'yahoo.com', 'yahoo.it', 'hotmail.com', 'hotmail.it',
    'outlook.com', 'outlook.it', 'libero.it', 'virgilio.it', 'tiscali.it',
    'alice.it', 'tin.it', 'msn.com', 'live.com', 'live.it', 'icloud.com',
    'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'tutanota.com'
  ];

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (personalDomains.includes(domain)) {
      return false;
    }

    return true;
  };

  const handleInputChange = (field: keyof DemoFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate all fields
      if (!formData.nome.trim() || !formData.cognome.trim() || !formData.azienda.trim() || 
          !formData.partita_iva.trim() || !formData.email.trim() || !formData.telefono.trim()) {
        throw new Error('Tutti i campi sono obbligatori');
      }

      // Validate email
      if (!validateEmail(formData.email)) {
        throw new Error('Utilizzare un indirizzo email aziendale. Email personali (Gmail, Yahoo, ecc.) non sono accettate.');
      }

      // Validate Partita IVA format (basic validation)
      const pivaRegex = /^[0-9]{11}$/;
      if (!pivaRegex.test(formData.partita_iva.replace(/\s/g, ''))) {
        throw new Error('Inserire una Partita IVA valida (11 cifre)');
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke('send-demo-request', {
        body: formData
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Errore durante l\'invio della richiesta');
      }

      toast({
        title: "Richiesta Inviata!",
        description: "La tua richiesta demo è stata inviata con successo. Ti contatteremo presto!",
      });

      // Reset form
      setFormData({
        nome: '',
        cognome: '',
        azienda: '',
        partita_iva: '',
        email: '',
        telefono: ''
      });

    } catch (error: any) {
      console.error('Demo request error:', error);
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'invio della richiesta. Riprova.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-primary/5">
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-6">
            Richiedi una Demo Personalizzata
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Scopri come HiCompliance può trasformare la gestione del cyber risk della tua organizzazione. 
            Richiedi una demo gratuita e personalizzata.
          </p>

          <Card className="text-left max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Compila il Form
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      type="text"
                      value={formData.nome}
                      onChange={(e) => handleInputChange('nome', e.target.value)}
                      placeholder="Il tuo nome"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cognome">Cognome *</Label>
                    <Input
                      id="cognome"
                      type="text"
                      value={formData.cognome}
                      onChange={(e) => handleInputChange('cognome', e.target.value)}
                      placeholder="Il tuo cognome"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="azienda">Azienda *</Label>
                  <Input
                    id="azienda"
                    type="text"
                    value={formData.azienda}
                    onChange={(e) => handleInputChange('azienda', e.target.value)}
                    placeholder="Nome della tua azienda"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="partita_iva">Partita IVA *</Label>
                  <Input
                    id="partita_iva"
                    type="text"
                    value={formData.partita_iva}
                    onChange={(e) => handleInputChange('partita_iva', e.target.value)}
                    placeholder="12345678901"
                    maxLength={11}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email Aziendale *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="nome@tuaazienda.it"
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Solo email aziendali. Email personali (Gmail, Yahoo, ecc.) non sono accettate.
                  </p>
                </div>

                <div>
                  <Label htmlFor="telefono">Telefono *</Label>
                  <Input
                    id="telefono"
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => handleInputChange('telefono', e.target.value)}
                    placeholder="+39 123 456 7890"
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-cyber hover:opacity-90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Invio in corso..."
                  ) : (
                    <>
                      Richiedi Demo Gratuita
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default DemoRequestForm;