import React, { useState, useRef } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, MessageSquare, ExternalLink, Link as LinkIcon, ImagePlus, X, Image } from 'lucide-react';
import { PlaybookChecklistItem } from '@/types/playbook';
import { cn } from '@/lib/utils';

interface PlaybookRadioSectionProps {
  items: PlaybookChecklistItem[];
  onItemChange: (itemId: string, updates: Partial<PlaybookChecklistItem>) => void;
  showNotes?: boolean;
}

// Compress and resize image to reduce storage size
const compressImage = (file: File, maxWidth: number = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

export const PlaybookRadioSection: React.FC<PlaybookRadioSectionProps> = ({
  items,
  onItemChange,
  showNotes = true,
}) => {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [showLinkInput, setShowLinkInput] = useState<Record<string, boolean>>({});
  const [expandedScreenshot, setExpandedScreenshot] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedItemId = items.find(item => item.checked)?.id || '';

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

  const toggleScreenshot = (itemId: string) => {
    setExpandedScreenshot(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleRadioChange = (selectedId: string) => {
    // Uncheck all items, then check the selected one
    items.forEach(item => {
      if (item.id === selectedId) {
        onItemChange(item.id, { checked: true });
      } else if (item.checked) {
        onItemChange(item.id, { checked: false });
      }
    });
  };

  const handleScreenshotUpload = async (itemId: string, file: File) => {
    try {
      const compressedImage = await compressImage(file);
      onItemChange(itemId, { 
        screenshot: compressedImage, 
        screenshotName: file.name 
      });
    } catch (error) {
      console.error('Error compressing image:', error);
    }
  };

  const handleFileChange = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleScreenshotUpload(itemId, file);
    }
  };

  const removeScreenshot = (itemId: string) => {
    onItemChange(itemId, { screenshot: undefined, screenshotName: undefined });
  };

  const hasSelection = items.some(item => item.checked);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground mb-2">
        {hasSelection ? '1/1' : '0/1'} completato
      </div>
      <RadioGroup value={selectedItemId} onValueChange={handleRadioChange}>
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
              <RadioGroupItem
                value={item.id}
                id={item.id}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-2">
                <Label
                  htmlFor={item.id}
                  className={cn(
                    "text-sm cursor-pointer leading-relaxed font-normal",
                    item.checked ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {item.text}
                </Label>
                
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

                  {/* Screenshot button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleScreenshot(item.id)}
                    className={cn(
                      "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
                      item.screenshot && "text-primary"
                    )}
                  >
                    <Image className="w-3 h-3 mr-1" />
                    Screenshot
                    {expandedScreenshot[item.id] ? (
                      <ChevronUp className="w-3 h-3 ml-1" />
                    ) : (
                      <ChevronDown className="w-3 h-3 ml-1" />
                    )}
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

                {/* Screenshot section */}
                {expandedScreenshot[item.id] && (
                  <div className="mt-2 space-y-2">
                    {item.screenshot ? (
                      <div className="relative inline-block">
                        <img 
                          src={item.screenshot} 
                          alt={item.screenshotName || 'Screenshot'} 
                          className="max-w-full max-h-48 rounded-md border border-border"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={() => removeScreenshot(item.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        {item.screenshotName && (
                          <p className="text-xs text-muted-foreground mt-1">{item.screenshotName}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          ref={(el) => fileInputRefs.current[item.id] = el}
                          onChange={(e) => handleFileChange(item.id, e)}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          className="text-xs"
                        >
                          <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                          Carica Screenshot
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                
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
      </RadioGroup>
    </div>
  );
};
