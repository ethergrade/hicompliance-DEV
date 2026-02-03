import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, MessageSquare, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { PlaybookChecklistItem } from '@/types/playbook';
import { cn } from '@/lib/utils';

interface PlaybookChecklistSectionProps {
  items: PlaybookChecklistItem[];
  onItemChange: (itemId: string, updates: Partial<PlaybookChecklistItem>) => void;
  showNotes?: boolean;
}

export const PlaybookChecklistSection: React.FC<PlaybookChecklistSectionProps> = ({
  items,
  onItemChange,
  showNotes = true,
}) => {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [showLinkInput, setShowLinkInput] = useState<Record<string, boolean>>({});

  const toggleNotes = (itemId: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const toggleLinkInput = (itemId: string) => {
    setShowLinkInput(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const completedCount = items.filter(item => item.checked).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground mb-2">
        {completedCount}/{items.length} completati
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "rounded-lg border p-3 transition-all",
            item.checked 
              ? "bg-primary/5 border-primary/20" 
              : "bg-card border-border hover:border-primary/30"
          )}
        >
          <div className="flex items-start gap-3">
            <Checkbox
              id={item.id}
              checked={item.checked}
              onCheckedChange={(checked) => 
                onItemChange(item.id, { checked: checked === true })
              }
              className="mt-0.5"
            />
            <div className="flex-1 space-y-2">
              <label
                htmlFor={item.id}
                className={cn(
                  "text-sm cursor-pointer leading-relaxed",
                  item.checked ? "text-muted-foreground line-through" : "text-foreground"
                )}
              >
                {item.text}
                {item.hasInlineInput && (
                  <span className="inline-flex items-center gap-1 ml-1">
                    <Input
                      type="text"
                      value={item.inlineInputValue || ''}
                      onChange={(e) => 
                        onItemChange(item.id, { inlineInputValue: e.target.value })
                      }
                      placeholder={item.inlineInputPlaceholder}
                      className="inline-block w-16 h-6 px-2 text-sm mx-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {item.inlineInputLabel && (
                      <span className="text-muted-foreground">{item.inlineInputLabel}</span>
                    )}
                  </span>
                )}
              </label>
              
              {/* Link display when set */}
              {item.link && item.link.trim() !== '' && (
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  {item.linkLabel || 'Apri link'}
                </a>
              )}

              {/* Link input field when expanded */}
              {showLinkInput[item.id] && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="url"
                    value={item.link || ''}
                    onChange={(e) => onItemChange(item.id, { link: e.target.value })}
                    placeholder="https://..."
                    className="text-sm h-8 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              
              <div className="flex items-center gap-2">
                {/* Link button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleLinkInput(item.id)}
                  className={cn(
                    "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
                    (item.link && item.link.trim() !== '') && "text-primary"
                  )}
                >
                  <LinkIcon className="w-3 h-3 mr-1" />
                  Link
                </Button>

                {showNotes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleNotes(item.id)}
                    className={cn(
                      "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
                      item.notes && "text-primary"
                    )}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Note
                    {expandedNotes[item.id] ? (
                      <ChevronUp className="w-3 h-3 ml-1" />
                    ) : (
                      <ChevronDown className="w-3 h-3 ml-1" />
                    )}
                  </Button>
                )}
                {item.notes && !expandedNotes[item.id] && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {item.notes}
                  </span>
                )}
              </div>
              
              {showNotes && expandedNotes[item.id] && (
                <Textarea
                  value={item.notes || ''}
                  onChange={(e) => 
                    onItemChange(item.id, { notes: e.target.value })
                  }
                  placeholder="Aggiungi note per questo passaggio..."
                  className="text-sm min-h-[60px] mt-2"
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};