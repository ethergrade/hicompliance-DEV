import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  onGenerateReport?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, onGenerateReport }) => {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-cyan-600/30 border border-cyan-500/40' : 'bg-slate-700/50 border border-slate-600/40'
      }`}>
        {isUser ? <User className="w-4 h-4 text-cyan-300" /> : <Bot className="w-4 h-4 text-slate-300" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser
          ? 'bg-cyan-900/40 border border-cyan-700/30 text-cyan-50'
          : 'bg-slate-800/60 border border-slate-700/30 text-slate-100'
      }`}>
        <div className="prose prose-sm prose-invert max-w-none
          prose-headings:text-cyan-300 prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-3
          prose-p:my-3
          prose-strong:text-cyan-200
          prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5
          prose-table:text-xs
          prose-th:text-cyan-300 prose-th:border-cyan-700/50
          prose-td:border-slate-700/50
          prose-code:text-cyan-300 prose-code:bg-slate-900/50 prose-code:px-1 prose-code:rounded
          prose-hr:my-5 prose-hr:border-slate-700/50
          prose-blockquote:border-l-2 prose-blockquote:border-cyan-500/40 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-300
        ">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {!isUser && onGenerateReport && (
          <div className="mt-3 pt-2 border-t border-slate-700/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={onGenerateReport}
              className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 text-xs"
            >
              <FileDown className="w-3 h-3 mr-1" />
              Genera Report PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
