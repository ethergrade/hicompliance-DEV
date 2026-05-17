import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';

interface DemoDataBadgeProps {
  show: boolean;
  className?: string;
}

export function DemoDataBadge({ show, className }: DemoDataBadgeProps) {
  if (!show) return null;
  return (
    <Badge variant="outline" className={`bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs ${className ?? ''}`}>
      <Info className="w-3 h-3 mr-1" />
      Demo Data
    </Badge>
  );
}
