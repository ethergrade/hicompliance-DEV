import React, { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Send, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StarfieldBackground } from '@/components/ai-ciso/StarfieldBackground';
import { ChatMessage } from '@/components/ai-ciso/ChatMessage';
import { QuickActions } from '@/components/ai-ciso/QuickActions';
import { ConversationHistory } from '@/components/ai-ciso/ConversationHistory';
import { generateCISOReport } from '@/components/ai-ciso/ReportGenerator';
import { useAICiso } from '@/hooks/useAICiso';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuth } from '@/components/auth/AuthProvider';

const AICiso: React.FC = () => {
  const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const { user, loading: authLoading } = useAuth();
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    sendMessage,
    selectConversation,
    newConversation,
    deleteConversation,
  } = useAICiso();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (authLoading || rolesLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
    inputRef.current?.focus();
  };

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleGenerateReport = (content: string) => {
    generateCISOReport(content);
  };

  return (
    <div className="h-screen flex bg-slate-950 overflow-hidden relative">
      <StarfieldBackground />

      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800/60 bg-slate-950/80 backdrop-blur-sm z-10 flex-shrink-0">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-cyan-300">AI CISO</h1>
                <p className="text-[10px] text-slate-500">Assistant</p>
              </div>
            </div>
          </div>
          <ConversationHistory
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={selectConversation}
            onNew={newConversation}
            onDelete={deleteConversation}
          />
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col z-10 relative">
        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center space-y-8">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                    <Bot className="w-9 h-9 text-cyan-400/80" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-200">AI CISO Assistant</h2>
                  <p className="text-sm text-slate-500 max-w-md">
                    Analizza la postura di sicurezza, identifica rischi e genera remediation prioritizzate per l'infrastruttura monitorata.
                  </p>
                </div>
                <QuickActions onSelect={handleQuickAction} disabled={isLoading} />
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-2">
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={idx}
                    role={msg.role}
                    content={msg.content}
                    onGenerateReport={msg.role === 'assistant' ? () => handleGenerateReport(msg.content) : undefined}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-slate-700/50 border border-slate-600/40 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-slate-300" />
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/30 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analisi in corso...
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions (shown when there are messages) */}
        {messages.length > 0 && (
          <div className="px-6 py-2">
            <QuickActions onSelect={handleQuickAction} disabled={isLoading} />
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t border-slate-800/40 bg-slate-950/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Analizza la postura di sicurezza..."
              disabled={isLoading}
              className="bg-slate-900/60 border-slate-700/50 text-slate-100 placeholder:text-slate-500 focus:border-cyan-600/50 focus:ring-cyan-600/20"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="bg-cyan-700/40 border border-cyan-600/40 text-cyan-300 hover:bg-cyan-600/50 disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AICiso;
