import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlaybookInputField } from '@/types/playbook';
import { cn } from '@/lib/utils';

interface PlaybookInputSectionProps {
  inputs: PlaybookInputField[];
  onInputChange: (inputId: string, value: string) => void;
  columns?: 1 | 2;
}

export const PlaybookInputSection: React.FC<PlaybookInputSectionProps> = ({
  inputs,
  onInputChange,
  columns = 2,
}) => {
  const filledCount = inputs.filter(input => input.value.trim() !== '').length;

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {filledCount}/{inputs.length} compilati
      </div>
      <div className={cn(
        "grid gap-4",
        columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
      )}>
        {inputs.map((input) => (
          <div key={input.id} className="space-y-2">
            <Label 
              htmlFor={input.id}
              className="text-sm font-medium text-foreground"
            >
              {input.label}
              {input.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Input
              id={input.id}
              value={input.value}
              onChange={(e) => onInputChange(input.id, e.target.value)}
              placeholder={input.placeholder}
              className={cn(
                "transition-all",
                input.value.trim() !== '' 
                  ? "border-green-500/50 bg-green-500/5" 
                  : ""
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
