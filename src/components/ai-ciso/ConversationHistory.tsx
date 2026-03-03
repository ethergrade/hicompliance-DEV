import React from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface ConversationHistoryProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}) => {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-700/40">
        <Button
          onClick={onNew}
          size="sm"
          className="w-full bg-cyan-700/30 border border-cyan-600/40 text-cyan-300 hover:bg-cyan-600/40 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Nuova Conversazione
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                activeId === conv.id
                  ? 'bg-cyan-900/30 border border-cyan-700/30 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-slate-500 text-xs text-center py-4">Nessuna conversazione</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
