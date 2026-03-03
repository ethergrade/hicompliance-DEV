import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
}

export const useAICiso = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('ai_ciso_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setConversations(data.map((c: any) => ({
        id: c.id,
        title: c.title || 'Conversazione',
        messages: (c.messages as any[]) || [],
        created_at: c.created_at,
      })));
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Select conversation
  const selectConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setActiveConversationId(id);
      setMessages(conv.messages);
    }
  };

  // New conversation
  const newConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  // Delete conversation
  const deleteConversation = async (id: string) => {
    await supabase.from('ai_ciso_conversations').delete().eq('id', id);
    if (activeConversationId === id) {
      newConversation();
    }
    loadConversations();
  };

  // Save conversation
  const saveConversation = async (msgs: Message[], title?: string) => {
    if (!user) return null;

    const convTitle = title || (msgs[0]?.content?.slice(0, 60) + '...' || 'Nuova conversazione');

    if (activeConversationId) {
      await supabase
        .from('ai_ciso_conversations')
        .update({ messages: msgs as any, title: convTitle, updated_at: new Date().toISOString() })
        .eq('id', activeConversationId);
      return activeConversationId;
    } else {
      const { data, error } = await supabase
        .from('ai_ciso_conversations')
        .insert({ user_id: user.id, messages: msgs as any, title: convTitle })
        .select('id')
        .single();

      if (data) {
        setActiveConversationId(data.id);
        return data.id;
      }
      return null;
    }
  };

  // Send message
  const sendMessage = async (userPrompt: string) => {
    if (!userPrompt.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: userPrompt };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-ciso-chat', {
        body: {
          userPrompt,
          conversationHistory: messages,
        },
      });

      if (error) throw error;

      const aiMsg: Message = { role: 'assistant', content: data.response };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
      loadConversations();
    } catch (error: any) {
      console.error('AI CISO error:', error);
      toast({
        title: 'Errore AI CISO',
        description: error.message || 'Errore nella comunicazione con l\'assistente AI',
        variant: 'destructive',
      });
      // Remove the user message on error
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    sendMessage,
    selectConversation,
    newConversation,
    deleteConversation,
  };
};
