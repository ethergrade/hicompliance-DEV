import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { aiCisoApi } from '@/lib/api/ai-ciso';

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
    try {
      const conversations = await aiCisoApi.list();
      setConversations(
        conversations.map((c) => ({
          id: c.id,
          title: c.title || 'Conversazione',
          messages: c.messages || [],
          created_at: c.created_at,
        }))
      );
    } catch (error) {
      console.error('Failed to load conversations:', error);
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
    try {
      await aiCisoApi.delete(id);
      if (activeConversationId === id) {
        newConversation();
      }
      loadConversations();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  // Save conversation
  const saveConversation = async (msgs: Message[], title?: string) => {
    if (!user) return null;

    const convTitle = title || (msgs[0]?.content?.slice(0, 60) + '...' || 'Nuova conversazione');

    try {
      if (activeConversationId) {
        await aiCisoApi.update(activeConversationId, {
          messages: msgs,
          title: convTitle,
        });
        return activeConversationId;
      } else {
        const conversation = await aiCisoApi.create({
          messages: msgs,
          title: convTitle,
        });
        setActiveConversationId(conversation.id);
        return conversation.id;
      }
    } catch (error) {
      console.error('Failed to save conversation:', error);
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
      // Ensure we have a conversation id before calling chat endpoint
      let convId = activeConversationId;
      if (!convId) {
        const created = await aiCisoApi.create({
          messages: [userMsg],
          title: userPrompt.slice(0, 60),
        });
        convId = created.id;
        setActiveConversationId(convId);
      }
      const data = await aiCisoApi.chat(convId, {
        message: userPrompt,
        conversationHistory: messages,
      });
      const aiMsg: Message = { role: \'assistant\', content: data.response };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
      loadConversations();
    } catch (error: unknown) {
      console.error('AI CISO error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Errore nella comunicazione con l\'assistente AI';
      toast({
        title: 'Errore AI CISO',
        description: errorMessage,
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
