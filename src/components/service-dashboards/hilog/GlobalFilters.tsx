import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, X } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface HiLogFilters {
  globalSearch: string;
  severity: string;
  hostname: string;
  username: string;
  ip: string;
}

interface Props {
  filters: HiLogFilters;
  onChange: (filters: HiLogFilters) => void;
}

export const GlobalFilters: React.FC<Props> = ({ filters, onChange }) => {
  const update = (key: keyof HiLogFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onChange({ globalSearch: '', severity: 'all', hostname: '', username: '', ip: '' });
  };

  const hasFilters = filters.globalSearch || filters.severity !== 'all' || filters.hostname || filters.username || filters.ip;

  return (
    <Card className="border-border">
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Ricerca globale</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca in tutti i campi..."
                value={filters.globalSearch}
                onChange={(e) => update('globalSearch', e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Severity</Label>
            <Select value={filters.severity} onValueChange={(v) => update('severity', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Hostname</Label>
            <Input placeholder="es. SRV-DC01" value={filters.hostname} onChange={(e) => update('hostname', e.target.value)} />
          </div>
          <div className="w-[180px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Username</Label>
            <Input placeholder="es. user003" value={filters.username} onChange={(e) => update('username', e.target.value)} />
          </div>
          <div className="w-[160px]">
            <Label className="text-xs text-muted-foreground mb-1 block">IP</Label>
            <Input placeholder="es. 203.0.113" value={filters.ip} onChange={(e) => update('ip', e.target.value)} />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="mb-0.5">
              <X className="w-4 h-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
