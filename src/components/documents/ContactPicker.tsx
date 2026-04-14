import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { X, UserPlus, Search } from 'lucide-react';
import { DirectoryContact } from '@/types/irp';

interface ContactPickerProps {
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  contacts: DirectoryContact[];
}

const ContactPicker: React.FC<ContactPickerProps> = ({ label, selectedIds, onChange, contacts }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      c.job_title?.toLowerCase().includes(q);
  });

  const selectedContacts = contacts.filter(c => selectedIds.includes(c.id));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex flex-wrap gap-1 min-h-[32px]">
        {selectedContacts.map(c => (
          <Badge key={c.id} variant="secondary" className="flex items-center gap-1 text-xs">
            {c.first_name} {c.last_name}
            <X className="w-3 h-3 cursor-pointer" onClick={() => toggle(c.id)} />
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
              <UserPlus className="w-3 h-3 mr-1" />
              Aggiungi
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca contatto..."
                className="h-7 text-xs pl-7"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Nessun contatto</p>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-accent transition-colors ${
                      selectedIds.includes(c.id) ? 'bg-accent' : ''
                    }`}
                  >
                    <span className="font-medium">{c.first_name} {c.last_name}</span>
                    {c.job_title && <span className="text-muted-foreground ml-1">— {c.job_title}</span>}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default ContactPicker;
