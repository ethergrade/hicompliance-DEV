
## Correzione: Menu Duplicato "Reportistica Aggregata"

### Problema
Nel file `src/components/layout/AppSidebar.tsx`, l'array `adminNavigation` contiene erroneamente due voci identiche per "Reportistica Aggregata" (righe 115-119 e 120-124).

### Soluzione
Rimuovere la voce duplicata mantenendo solo una istanza.

### Modifica

**File**: `src/components/layout/AppSidebar.tsx`

**Prima** (righe 109-135):
```typescript
const adminNavigation = [
  {
    title: 'Selezione Clienti',
    href: '/clients',
    icon: Building2,
  },
  {
    title: 'Reportistica Aggregata',
    href: '/admin/reporting',
    icon: PieChart,
  },
  {
    title: 'Reportistica Aggregata',  // DUPLICATO DA RIMUOVERE
    href: '/admin/reporting',
    icon: PieChart,
  },
  {
    title: 'Gestione Clienti',
    href: '/admin/clients',
    icon: Users,
  },
  {
    title: 'Gestione Ruoli',
    href: '/admin/role-settings',
    icon: Settings,
  },
];
```

**Dopo**:
```typescript
const adminNavigation = [
  {
    title: 'Selezione Clienti',
    href: '/clients',
    icon: Building2,
  },
  {
    title: 'Reportistica Aggregata',
    href: '/admin/reporting',
    icon: PieChart,
  },
  {
    title: 'Gestione Clienti',
    href: '/admin/clients',
    icon: Users,
  },
  {
    title: 'Gestione Ruoli',
    href: '/admin/role-settings',
    icon: Settings,
  },
];
```

Questa correzione elimina la voce duplicata dal menu della sidebar.
