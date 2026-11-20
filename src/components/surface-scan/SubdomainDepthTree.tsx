import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Globe2, Loader2 } from 'lucide-react';
import { connectSecureApi } from '@/lib/api/connectsecure';
import { useClientOrganization } from '@/hooks/useClientOrganization';

interface SubdomainNode {
  domain: string;
  /** null se il connettore non la fornisce o non è un intero valido. */
  depth: number | null;
  parent_domain: string | null;
  cs_domain_id?: number;
  last_scanned_at?: string;
}

interface TreeNode {
  domain: string;
  depth: number | null;
  children: TreeNode[];
  last_scanned_at?: string;
}

interface SubdomainDepthTreeProps {
  organizationId: string;
}

const DEPTH_COLORS = [
  'text-blue-400',
  'text-emerald-400',
  'text-amber-400',
  'text-purple-400',
  'text-pink-400',
  'text-cyan-400',
  'text-orange-400',
  'text-rose-400',
  'text-lime-400',
  'text-indigo-400',
];

/** Profondità valida (intero ≥ 0) o null: prima un valore mancante dava NaN. */
const toDepth = (value: unknown): number | null => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isInteger(n) && n >= 0 ? n : null;
};

function buildTree(rows: SubdomainNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  rows.forEach(r => {
    map.set(r.domain, { domain: r.domain, depth: r.depth, children: [], last_scanned_at: r.last_scanned_at });
  });

  rows.forEach(r => {
    const node = map.get(r.domain)!;
    if (r.parent_domain && map.has(r.parent_domain)) {
      map.get(r.parent_domain)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

const TreeNodeRow: React.FC<{ node: TreeNode; indent: number }> = ({ node, indent }) => {
  const [open, setOpen] = useState(indent === 0);
  const hasChildren = node.children.length > 0;
  const colorClass = node.depth === null ? 'text-muted-foreground' : DEPTH_COLORS[Math.min(node.depth, DEPTH_COLORS.length - 1)];

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/40 cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        style={{ paddingLeft: `${indent * 16 + 4}px` }}
        onClick={() => hasChildren && setOpen(v => !v)}
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={hasChildren ? `${open ? 'Comprimi' : 'Espandi'} ${node.domain}` : undefined}
        onKeyDown={(e) => {
          if (hasChildren && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(v => !v);
          }
        }}
      >
        <span className="w-3.5 h-3.5 shrink-0 text-muted-foreground">
          {hasChildren
            ? (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
            : <span className="w-3.5 h-3.5 inline-block" />}
        </span>
        <Globe2 className={`w-3 h-3 shrink-0 ${colorClass}`} />
        <span className="text-xs font-mono truncate">{node.domain}</span>
        <Badge variant="outline" className={`text-[9px] ml-auto shrink-0 ${colorClass} border-current/30`}>
          {node.depth === null ? 'Livello n.d.' : `L${node.depth}`}
        </Badge>
        {hasChildren && (
          <Badge variant="outline" className="text-[9px] shrink-0">{node.children.length}</Badge>
        )}
      </div>
      {open && hasChildren && node.children.map(child => (
        <TreeNodeRow key={child.domain} node={child} indent={indent + 1} />
      ))}
    </div>
  );
};

export const SubdomainDepthTree: React.FC<SubdomainDepthTreeProps> = ({ organizationId }) => {
  const { groupId } = useClientOrganization();
  const [registryRows, setRegistryRows] = useState<SubdomainNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    setRegistryRows([]);
    connectSecureApi.getDomains(organizationId, groupId)
      .then((data) => {
        // Profondità normalizzate; quelle mancanti in fondo.
        const sorted = [...((data as SubdomainNode[]) || [])]
          .map((r) => ({ ...r, depth: toDepth(r.depth) }))
          .sort((a, b) => (a.depth ?? Number.MAX_SAFE_INTEGER) - (b.depth ?? Number.MAX_SAFE_INTEGER));
        setRegistryRows(sorted);
        setLoading(false);
      })
      .catch(() => {
        setRegistryRows([]);
        setLoading(false);
      });
  }, [organizationId, groupId]);

  const tree = useMemo(() => buildTree(registryRows), [registryRows]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />Caricamento albero sottodomini...
      </div>
    );
  }

  if (registryRows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Nessun sottodominio rilevato. Configura Attack Surface Mapper e avvia una scansione.
      </p>
    );
  }

  const depths = registryRows.map(r => r.depth).filter((d): d is number => d !== null);
  const maxDepth = depths.length > 0 ? Math.max(...depths) : null;
  const senzaProfondita = registryRows.length - depths.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span>{registryRows.length} domini totali</span>
        {maxDepth !== null && (<><span>·</span><span>profondità max {maxDepth}</span></>)}
        {senzaProfondita > 0 && (<><span>·</span><span>{senzaProfondita} senza profondità</span></>)}
        <div className="flex gap-1 ml-auto">
          {DEPTH_COLORS.slice(0, (maxDepth ?? -1) + 1).map((c, i) => (
            <span key={i} className={`${c} text-[10px]`}>L{i}</span>
          ))}
        </div>
      </div>
      <div className="border border-border rounded-md overflow-auto max-h-96 p-1">
        {tree.map(root => (
          <TreeNodeRow key={root.domain} node={root} indent={0} />
        ))}
      </div>
    </div>
  );
};
