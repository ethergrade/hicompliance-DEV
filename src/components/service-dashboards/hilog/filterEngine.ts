// Advanced boolean filter engine for HiLog

export type FilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'gt'
  | 'lt';

export type LogicOperator = 'AND' | 'OR';

export const FILTER_FIELDS = [
  { value: 'any', label: 'Qualsiasi campo' },
  { value: 'hostname', label: 'Hostname' },
  { value: 'username', label: 'Username' },
  { value: 'sourceIp', label: 'IP Sorgente' },
  { value: 'severity', label: 'Severity' },
  { value: 'source', label: 'Sorgente' },
  { value: 'event', label: 'Evento' },
  { value: 'action', label: 'Azione' },
  { value: 'datetime', label: 'Data/Ora' },
  { value: 'message', label: 'Messaggio' },
  { value: 'category', label: 'Categoria' },
  { value: 'domain', label: 'Dominio' },
  { value: 'type', label: 'Tipo utente' },
  { value: 'application', label: 'Applicazione' },
  { value: 'status', label: 'Stato' },
  { value: 'location', label: 'Località' },
  { value: 'actionType', label: 'Tipo azione FW' },
] as const;

export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'contiene' },
  { value: 'not_contains', label: 'non contiene' },
  { value: 'equals', label: 'uguale a' },
  { value: 'not_equals', label: 'diverso da' },
  { value: 'starts_with', label: 'inizia con' },
  { value: 'ends_with', label: 'finisce con' },
  { value: 'regex', label: 'regex' },
];

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  negated?: boolean;
}

export interface FilterGroup {
  id: string;
  logic: LogicOperator;
  conditions: FilterCondition[];
}

export interface AdvancedFilter {
  rootLogic: LogicOperator;
  groups: FilterGroup[];
}

let _idCounter = 0;
export const uid = () => `f_${++_idCounter}_${Date.now()}`;

export const createEmptyCondition = (): FilterCondition => ({
  id: uid(),
  field: 'any',
  operator: 'contains',
  value: '',
});

export const createEmptyGroup = (): FilterGroup => ({
  id: uid(),
  logic: 'AND',
  conditions: [createEmptyCondition()],
});

export const createEmptyFilter = (): AdvancedFilter => ({
  rootLogic: 'AND',
  groups: [createEmptyGroup()],
});

// ---- Evaluation ----

const evalCondition = (item: Record<string, any>, cond: FilterCondition): boolean => {
  if (!cond.value.trim()) return true; // empty value = pass

  const val = cond.value.toLowerCase();

  const getFieldValue = (field: string): string => {
    if (field === 'any') {
      return Object.values(item)
        .map(v => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
        .join(' ')
        .toLowerCase();
    }
    const raw = item[field];
    if (Array.isArray(raw)) return raw.join(' ').toLowerCase();
    return String(raw ?? '').toLowerCase();
  };

  const fieldVal = getFieldValue(cond.field);

  switch (cond.operator) {
    case 'contains':
      return fieldVal.includes(val);
    case 'not_contains':
      return !fieldVal.includes(val);
    case 'equals':
      return fieldVal === val;
    case 'not_equals':
      return fieldVal !== val;
    case 'starts_with':
      return fieldVal.startsWith(val);
    case 'ends_with':
      return fieldVal.endsWith(val);
    case 'regex':
      try {
        return new RegExp(cond.value, 'i').test(fieldVal);
      } catch {
        return false;
      }
    case 'gt':
      return fieldVal > val;
    case 'lt':
      return fieldVal < val;
    default:
      return true;
  }
};

const evalGroup = (item: Record<string, any>, group: FilterGroup): boolean => {
  if (group.conditions.length === 0) return true;
  if (group.logic === 'AND') {
    return group.conditions.every(c => evalCondition(item, c));
  }
  return group.conditions.some(c => evalCondition(item, c));
};

export const evalAdvancedFilter = <T extends Record<string, any>>(
  data: T[],
  filter: AdvancedFilter
): T[] => {
  // If no real conditions exist, return all
  const hasConditions = filter.groups.some(g =>
    g.conditions.some(c => c.value.trim() !== '')
  );
  if (!hasConditions) return data;

  return data.filter(item => {
    if (filter.rootLogic === 'AND') {
      return filter.groups.every(g => evalGroup(item, g));
    }
    return filter.groups.some(g => evalGroup(item, g));
  });
};
