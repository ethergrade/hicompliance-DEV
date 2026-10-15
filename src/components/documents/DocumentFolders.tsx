import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Folder, FolderOpen, FolderPlus, Pencil, Trash2, ChevronRight, ChevronDown, Home } from 'lucide-react';
import type { DocumentFolder } from '@/lib/api/documents';

export const ROOT = '__root__';
export type FolderSelection = 'all' | typeof ROOT | string;

const childrenOf = (folders: DocumentFolder[], parent: string | null) =>
  folders.filter(f => (f.parent_id ?? null) === parent);

export const folderPath = (folders: DocumentFolder[], id: string | null): string => {
  const parts: string[] = [];
  let cur = folders.find(f => f.id === id);
  while (cur) { parts.unshift(cur.name); cur = folders.find(f => f.id === cur!.parent_id); }
  return parts.length ? parts.join(' / ') : 'Radice';
};

interface PanelProps {
  folders: DocumentFolder[];
  selected: FolderSelection;
  onSelect: (s: FolderSelection) => void;
  counts: (s: FolderSelection) => number;
  onCreate: (name: string, parent: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const DocumentFolderPanel: React.FC<PanelProps> = ({ folders, selected, onSelect, counts, onCreate, onRename, onDelete }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ mode: 'create' | 'rename'; id?: string; parent: string | null; name: string } | null>(null);

  const node = (f: DocumentFolder, depth: number): React.ReactNode => {
    const kids = childrenOf(folders, f.id);
    const isOpen = open[f.id] ?? true;
    return (
      <div key={f.id}>
        <div className={`group flex items-center gap-1 rounded-md pr-1 ${selected === f.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} style={{ paddingLeft: depth * 12 }}>
          <button className="p-1" onClick={() => setOpen(o => ({ ...o, [f.id]: !isOpen }))} aria-label="Espandi">
            {kids.length ? (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-3 inline-block" />}
          </button>
          <button className="flex flex-1 min-w-0 items-center gap-2 py-1.5 text-sm text-left" onClick={() => onSelect(f.id)}>
            {selected === f.id ? <FolderOpen className="w-4 h-4 shrink-0" /> : <Folder className="w-4 h-4 shrink-0" />}
            <span className="truncate">{f.name}</span>
          </button>
          <div className="hidden group-hover:flex items-center">
            <button className="p-1" title="Nuova sottocartella" onClick={() => setDialog({ mode: 'create', parent: f.id, name: '' })}><FolderPlus className="w-3.5 h-3.5" /></button>
            <button className="p-1" title="Rinomina" onClick={() => setDialog({ mode: 'rename', id: f.id, parent: f.parent_id, name: f.name })}><Pencil className="w-3.5 h-3.5" /></button>
            <button className="p-1" title="Elimina" onClick={() => { if (confirm(`Eliminare "${f.name}" e le sottocartelle? I documenti tornano nella radice.`)) onDelete(f.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <Badge variant="secondary" className="text-[10px] group-hover:hidden">{counts(f.id)}</Badge>
        </div>
        {isOpen && kids.map(k => node(k, depth + 1))}
      </div>
    );
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-foreground flex items-center gap-2"><Folder className="w-5 h-5" />Cartelle</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'create', parent: null, name: '' })}><FolderPlus className="w-4 h-4 mr-1" />Nuova</Button>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <Button variant={selected === 'all' ? 'default' : 'ghost'} className="w-full justify-between" onClick={() => onSelect('all')}>
          <span>Tutte le cartelle</span><Badge variant="secondary">{counts('all')}</Badge>
        </Button>
        <Button variant={selected === ROOT ? 'default' : 'ghost'} className="w-full justify-between" onClick={() => onSelect(ROOT)}>
          <span className="flex items-center gap-2"><Home className="w-4 h-4" />Radice (senza cartella)</span><Badge variant="secondary">{counts(ROOT)}</Badge>
        </Button>
        {childrenOf(folders, null).map(f => node(f, 0))}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === 'rename' ? 'Rinomina cartella' : `Nuova cartella in ${folderPath(folders, dialog?.parent ?? null)}`}</DialogTitle></DialogHeader>
          <Input autoFocus value={dialog?.name ?? ''} placeholder="Nome cartella" onChange={e => setDialog(d => d && { ...d, name: e.target.value })} />
          <DialogFooter>
            <Button disabled={!dialog?.name.trim()} onClick={async () => {
              if (!dialog) return;
              if (dialog.mode === 'rename' && dialog.id) await onRename(dialog.id, dialog.name.trim());
              else await onCreate(dialog.name.trim(), dialog.parent);
              setDialog(null);
            }}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

interface MoveProps {
  open: boolean;
  mode: 'move' | 'copy';
  count: number;
  folders: DocumentFolder[];
  onOpenChange: (o: boolean) => void;
  onConfirm: (folderId: string | null) => Promise<void>;
}

export const MoveCopyDialog: React.FC<MoveProps> = ({ open, mode, count, folders, onOpenChange, onConfirm }) => {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const row = (f: DocumentFolder, depth: number): React.ReactNode => (
    <div key={f.id}>
      <button className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left ${target === f.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setTarget(f.id)}>
        <Folder className="w-4 h-4" />{f.name}
      </button>
      {childrenOf(folders, f.id).map(k => row(k, depth + 1))}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === 'move' ? 'Sposta' : 'Copia'} {count} document{count === 1 ? 'o' : 'i'} in…</DialogTitle></DialogHeader>
        <div className="max-h-80 overflow-auto border border-border rounded-md p-1">
          <button className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left ${target === null ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} onClick={() => setTarget(null)}>
            <Home className="w-4 h-4" />Radice
          </button>
          {childrenOf(folders, null).map(f => row(f, 0))}
        </div>
        {mode === 'copy' && <p className="text-xs text-muted-foreground">La copia riceve un nuovo codice, Rev01 e stato Bozza; il file viene duplicato.</p>}
        <DialogFooter>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(target); } finally { setBusy(false); } }}>
            {busy ? 'In corso…' : mode === 'move' ? 'Sposta qui' : 'Copia qui'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface TagProps { open: boolean; count: number; suggestions: string[]; onOpenChange: (o: boolean) => void; onConfirm: (add: string[], remove: string[]) => Promise<void>; }

export const BulkTagDialog: React.FC<TagProps> = ({ open, count, suggestions, onOpenChange, onConfirm }) => {
  const [input, setInput] = useState('');
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const push = (t: string) => { t = t.trim(); if (t && !add.includes(t)) setAdd(a => [...a, t]); setInput(''); };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setAdd([]); setRemove([]); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tag su {count} document{count === 1 ? 'o' : 'i'}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input value={input} placeholder="Nuovo tag e Invio" onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); push(input); } }} />
          <Button variant="outline" onClick={() => push(input)}>Aggiungi</Button>
        </div>
        {add.length > 0 && <div className="flex flex-wrap gap-1">{add.map(t => <Badge key={t} className="cursor-pointer" onClick={() => setAdd(a => a.filter(x => x !== t))}>+ {t} ×</Badge>)}</div>}
        {suggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tag esistenti: clic per aggiungere, doppio clic per rimuovere dai selezionati</p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map(t => (
                <Badge key={t} variant={remove.includes(t) ? 'destructive' : 'outline'} className="cursor-pointer select-none"
                  onClick={() => push(t)} onDoubleClick={() => { setAdd(a => a.filter(x => x !== t)); setRemove(r => r.includes(t) ? r.filter(x => x !== t) : [...r, t]); }}>
                  {remove.includes(t) ? `− ${t}` : t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button disabled={!add.length && !remove.length} onClick={async () => { await onConfirm(add, remove); setAdd([]); setRemove([]); }}>Applica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
