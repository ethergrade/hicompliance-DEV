import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlaybookInputField } from '@/types/playbook';
import { cn } from '@/lib/utils';
import { Users, CalendarIcon } from 'lucide-react';
import { ContactDirectoryDialog } from './ContactDirectoryDialog';
import { DirectoryContact } from '@/types/irp';
import { format, parse, isValid } from 'date-fns';
import { it } from 'date-fns/locale';

interface PlaybookInputSectionProps {
  inputs: PlaybookInputField[];
  onInputChange: (inputId: string, value: string, contactId?: string) => void;
  columns?: 1 | 2;
}

export const PlaybookInputSection: React.FC<PlaybookInputSectionProps> = ({
  inputs,
  onInputChange,
  columns = 2,
}) => {
  const filledCount = inputs.filter(input => input.value.trim() !== '').length;
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [activeInputId, setActiveInputId] = useState<string | null>(null);

  const handleOpenDirectory = (inputId: string) => {
    setActiveInputId(inputId);
    setDirectoryOpen(true);
  };

  const handleSelectContact = (contact: DirectoryContact) => {
    if (activeInputId) {
      const fullName = `${contact.first_name} ${contact.last_name}`;
      onInputChange(activeInputId, fullName, contact.id);
      setDirectoryOpen(false);
      setActiveInputId(null);
    }
  };

  const parseDate = (dateString: string): Date | undefined => {
    if (!dateString) return undefined;
    // Try to parse DD/MM/YYYY format
    const parsed = parse(dateString, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? parsed : undefined;
  };

  const handleDateSelect = (inputId: string, date: Date | undefined) => {
    if (date) {
      const formatted = format(date, 'dd/MM/yyyy');
      onInputChange(inputId, formatted);
    }
  };

  return (
    <>
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
              
              {input.fieldType === 'date' ? (
                // Date picker field
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !input.value && "text-muted-foreground",
                        input.value.trim() !== '' && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {input.value || input.placeholder || 'Seleziona data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDate(input.value)}
                      onSelect={(date) => handleDateSelect(input.id, date)}
                      initialFocus
                      locale={it}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                // Regular text field
                <div className="flex gap-2">
                  <Input
                    id={input.id}
                    value={input.value}
                    onChange={(e) => onInputChange(input.id, e.target.value)}
                    placeholder={input.placeholder}
                    className={cn(
                      "transition-all flex-1",
                      input.value.trim() !== '' 
                        ? "border-primary/50 bg-primary/5" 
                        : ""
                    )}
                  />
                  {input.allowDirectoryPicker !== false && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleOpenDirectory(input.id)}
                      title="Seleziona dalla rubrica"
                      className="shrink-0"
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ContactDirectoryDialog
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
        onSelectContact={handleSelectContact}
      />
    </>
  );
};
