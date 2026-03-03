import React from 'react';
import { Shield, ListChecks, TrendingUp, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const actions = [
  {
    icon: Shield,
    label: 'Executive Summary',
    prompt: 'Analizza i dati di sicurezza forniti e produci un Executive Summary di massimo 3 paragrafi: principali rischi, punti di debolezza rilevati e suggerimenti di remediation immediata. Mantieni output formale e professionale.',
  },
  {
    icon: ListChecks,
    label: 'Remediation Prioritizzata',
    prompt: 'Basandoti sui dati, genera una lista di remediation tecniche ordinate: 1. High Priority 2. Medium Priority 3. Low Priority. Includi steps eseguibili e l\'impatto stimato.',
  },
  {
    icon: TrendingUp,
    label: 'Trend Report',
    prompt: 'Elenca i trend recenti (ultimi 7/30 giorni) dei seguenti indicatori: criticità firewall, endpoint in stato attenzione, alert critici SOC, patch failed. Visualizza i trend in bullet summarizzati.',
  },
  {
    icon: Scale,
    label: 'Note Compliance NIS2/GDPR',
    prompt: 'Spiega, in termini generici, quali requisiti NIS2 o GDPR sono collegati alle criticità correnti, senza interpretazioni legali vincolanti (solo linee guida).',
  },
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelect, disabled }) => {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(action.prompt)}
          className="bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-cyan-900/30 hover:border-cyan-600/40 hover:text-cyan-300 text-xs transition-all"
        >
          <action.icon className="w-3.5 h-3.5 mr-1.5" />
          {action.label}
        </Button>
      ))}
    </div>
  );
};
