import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ShieldAlert, Globe, Search, Network, ChevronDown, ChevronRight } from 'lucide-react';
import type { EnricherData } from '@/types/enrichers';

interface EnricherBadgesProps {
  data: EnricherData | null;
  defaultOpen?: boolean;
  className?: string;
}

const reputationColors: Record<string, string> = {
  clean: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  suspicious: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
  malicious: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  unknown: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

export const EnricherBadges: React.FC<EnricherBadgesProps> = ({ data, defaultOpen = false, className = '' }) => {
  const [open, setOpen] = useState(defaultOpen);

  if (!data) {
    return <p className="text-xs text-muted-foreground italic">Dati enricher non disponibili</p>;
  }

  const hasWhois = data.whois && Object.values(data.whois).some(v => v !== undefined);
  const hasReverseDns = data.reverse_dns && (data.reverse_dns.ptr_records?.length || data.reverse_dns.hostname);
  const hasSubdomains = data.subdomains && data.subdomains.length > 0;
  const hasIpReputation = data.ip_reputation && data.ip_reputation.length > 0;

  const hasAny = hasWhois || hasReverseDns || hasSubdomains || hasIpReputation;
  if (!hasAny) {
    return <p className="text-xs text-muted-foreground italic">Dati enricher non disponibili</p>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>Dati Enricher ({[
          hasWhois && 'WHOIS',
          hasReverseDns && 'Reverse DNS',
          hasSubdomains && 'Subdomini',
          hasIpReputation && 'IP Reputation',
        ].filter(Boolean).join(', ')})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-4 pt-2">
        {/* IP Reputation */}
        {hasIpReputation && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <ShieldAlert className="w-3 h-3" />
              IP Reputation
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.ip_reputation!.map((ipRep, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-xs ${reputationColors[ipRep.reputation] || reputationColors.unknown}`}
                >
                  {ipRep.ip}
                  {ipRep.abuse_score !== undefined && (
                    <span className="ml-1 opacity-70">({ipRep.abuse_score})</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Subdomains */}
        {hasSubdomains && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Network className="w-3 h-3" />
              Subdomini ({data.subdomains!.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {data.subdomains!.slice(0, 20).map((sub, i) => (
                <Badge key={i} variant="secondary" className="text-xs font-mono">
                  {sub}
                </Badge>
              ))}
              {data.subdomains!.length > 20 && (
                <Badge variant="outline" className="text-xs">
                  +{data.subdomains!.length - 20} altri
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Reverse DNS */}
        {hasReverseDns && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Search className="w-3 h-3" />
              Reverse DNS
            </div>
            <div className="space-y-1 text-xs">
              {data.reverse_dns!.hostname && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Hostname:</span>
                  <span className="font-mono">{data.reverse_dns!.hostname}</span>
                </div>
              )}
              {data.reverse_dns!.root_domain && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Root Domain:</span>
                  <span className="font-mono">{data.reverse_dns!.root_domain}</span>
                </div>
              )}
              {data.reverse_dns!.ptr_records?.map((ptr, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground">PTR:</span>
                  <span className="font-mono">{ptr}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Whois */}
        {hasWhois && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Globe className="w-3 h-3" />
              WHOIS
            </div>
            <div className="space-y-1 text-xs">
              {data.whois!.registrant_org && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Organizzazione:</span>
                  <span>{data.whois!.registrant_org}</span>
                </div>
              )}
              {data.whois!.registrar && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Registrar:</span>
                  <span>{data.whois!.registrar}</span>
                </div>
              )}
              {data.whois!.creation_date && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Creato:</span>
                  <span>{data.whois!.creation_date}</span>
                </div>
              )}
              {data.whois!.expiry_date && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Scadenza:</span>
                  <span>{data.whois!.expiry_date}</span>
                </div>
              )}
              {data.whois!.registrant_country && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Paese:</span>
                  <span>{data.whois!.registrant_country}</span>
                </div>
              )}
              {data.whois!.name_servers && data.whois!.name_servers.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">NS:</span>
                  <span className="font-mono">{data.whois!.name_servers.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default EnricherBadges;
