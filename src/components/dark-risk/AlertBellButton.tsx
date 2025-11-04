import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AlertBellButtonProps {
  alertCount: number;
  onClick: () => void;
}

export const AlertBellButton: React.FC<AlertBellButtonProps> = ({
  alertCount,
  onClick,
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="relative"
    >
      <Bell className="w-4 h-4" />
      {alertCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
        >
          {alertCount}
        </Badge>
      )}
    </Button>
  );
};
