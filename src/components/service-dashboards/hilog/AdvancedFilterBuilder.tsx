import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, X, Braces, ToggleLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AdvancedFilter, FilterGroup, FilterCondition, LogicOperator,
  FILTER_FIELDS, FILTER_OPERATORS,
  createEmptyCondition, createEmptyGroup, createEmptyFilter, uid,
} from './filterEngine';

interface Props {
  filter: AdvancedFilter;
  onChange: (filter: AdvancedFilter) => void;
  onClose?: () => void;
}

const LogicToggle: React.FC<{ value: LogicOperator; onChange: (v: LogicOperator) => void; size?: 'sm' | 'lg' }> = ({ value, onChange, size = 'sm' }) => (
  <button
    type="button"
    onClick={() => onChange(value === 'AND' ? 'OR' : 'AND')}
    className={cn(
      'font-mono font-bold rounded-md border transition-colors select-none',
      size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs',
      value === 'AND'
        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/25'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
    )}
  >
    {value}
  </button>
);

const ConditionRow: React.FC<{
  condition: FilterCondition;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
  showLogic: boolean;
  groupLogic: LogicOperator;
}> = ({ condition, onChange, onRemove, canRemove, showLogic, groupLogic }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {showLogic && (
      <Badge variant="outline" className={cn(
        'font-mono text-[10px] w-9 justify-center shrink-0',
        groupLogic === 'AND' ? 'text-cyan-400 border-cyan-500/30' : 'text-amber-400 border-amber-500/30'
      )}>
        {groupLogic}
      </Badge>
    )}
    {!showLogic && <div className="w-9 shrink-0" />}

    <Select value={condition.field} onValueChange={v => onChange({ ...condition, field: v })}>
      <SelectTrigger className="w-[150px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FILTER_FIELDS.map(f => (
          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Select value={condition.operator} onValueChange={v => onChange({ ...condition, operator: v as any })}>
      <SelectTrigger className="w-[130px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FILTER_OPERATORS.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Input
      value={condition.value}
      onChange={e => onChange({ ...condition, value: e.target.value })}
      placeholder="Valore..."
      className="flex-1 min-w-[120px] h-8 text-xs"
    />

    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={onRemove}
      disabled={!canRemove}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  </div>
);

const GroupCard: React.FC<{
  group: FilterGroup;
  onChange: (g: FilterGroup) => void;
  onRemove: () => void;
  canRemove: boolean;
  showRootLogic: boolean;
  rootLogic: LogicOperator;
}> = ({ group, onChange, onRemove, canRemove, showRootLogic, rootLogic }) => {
  const updateCondition = (idx: number, c: FilterCondition) => {
    const next = [...group.conditions];
    next[idx] = c;
    onChange({ ...group, conditions: next });
  };

  const removeCondition = (idx: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  };

  const addCondition = () => {
    onChange({ ...group, conditions: [...group.conditions, createEmptyCondition()] });
  };

  return (
    <div className="space-y-1">
      {showRootLogic && (
        <div className="flex justify-center py-1">
          <Badge variant="outline" className={cn(
            'font-mono text-xs px-3',
            rootLogic === 'AND' ? 'text-cyan-400 border-cyan-500/30' : 'text-amber-400 border-amber-500/30'
          )}>
            {rootLogic}
          </Badge>
        </div>
      )}
      <div className="border border-border rounded-lg p-3 bg-muted/20 space-y-2 relative">
        {/* Group header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Gruppo</span>
            <LogicToggle
              value={group.logic}
              onChange={v => onChange({ ...group, logic: v })}
            />
            <span className="text-[10px] text-muted-foreground">tra le condizioni</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={addCondition}>
              <Plus className="w-3 h-3 mr-1" />Condizione
            </Button>
            {canRemove && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Conditions */}
        {group.conditions.map((cond, idx) => (
          <ConditionRow
            key={cond.id}
            condition={cond}
            onChange={c => updateCondition(idx, c)}
            onRemove={() => removeCondition(idx)}
            canRemove={group.conditions.length > 1}
            showLogic={idx > 0}
            groupLogic={group.logic}
          />
        ))}
      </div>
    </div>
  );
};

export const AdvancedFilterBuilder: React.FC<Props> = ({ filter, onChange, onClose }) => {
  const updateGroup = (idx: number, g: FilterGroup) => {
    const next = [...filter.groups];
    next[idx] = g;
    onChange({ ...filter, groups: next });
  };

  const removeGroup = (idx: number) => {
    onChange({ ...filter, groups: filter.groups.filter((_, i) => i !== idx) });
  };

  const addGroup = () => {
    onChange({ ...filter, groups: [...filter.groups, createEmptyGroup()] });
  };

  const clearAll = () => {
    onChange(createEmptyFilter());
  };

  const conditionCount = filter.groups.reduce((sum, g) => sum + g.conditions.filter(c => c.value.trim()).length, 0);

  return (
    <Card className="border-primary/30 bg-card/80 backdrop-blur">
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Braces className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Query Builder Avanzato</span>
            {conditionCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {conditionCount} condizion{conditionCount === 1 ? 'e' : 'i'} attiv{conditionCount === 1 ? 'a' : 'e'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {filter.groups.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Tra i gruppi:</span>
                <LogicToggle
                  value={filter.rootLogic}
                  onChange={v => onChange({ ...filter, rootLogic: v })}
                  size="lg"
                />
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addGroup}>
              <Plus className="w-3 h-3 mr-1" />Gruppo
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
              Reset
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Groups */}
        <div className="space-y-1">
          {filter.groups.map((group, idx) => (
            <GroupCard
              key={group.id}
              group={group}
              onChange={g => updateGroup(idx, g)}
              onRemove={() => removeGroup(idx)}
              canRemove={filter.groups.length > 1}
              showRootLogic={idx > 0}
              rootLogic={filter.rootLogic}
            />
          ))}
        </div>

        {/* Query preview */}
        {conditionCount > 0 && (
          <div className="bg-muted/40 rounded-md px-3 py-2 border border-border">
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">QUERY PREVIEW</p>
            <p className="text-xs font-mono text-foreground/80 break-all">
              {filter.groups.map((g, gi) => {
                const parts = g.conditions
                  .filter(c => c.value.trim())
                  .map(c => {
                    const fieldLabel = FILTER_FIELDS.find(f => f.value === c.field)?.label || c.field;
                    const opLabel = FILTER_OPERATORS.find(o => o.value === c.operator)?.label || c.operator;
                    return `${fieldLabel} ${opLabel} "${c.value}"`;
                  });
                if (parts.length === 0) return null;
                const groupStr = parts.length > 1
                  ? `(${parts.join(` ${g.logic} `)})`
                  : parts[0];
                return gi > 0 ? ` ${filter.rootLogic} ${groupStr}` : groupStr;
              }).filter(Boolean).join('')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
