import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, organizationName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userProfile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch user profile
          setTimeout(async () => {
            try {
              const { data: profile } = await supabase
                .from('users')
                .select('*, organizations(*)')
                .eq('auth_user_id', session.user.id)
                .single();
              
              setUserProfile(profile);
            } catch (error) {
              console.error('Error fetching user profile:', error);
            }
          }, 0);
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Handle special cases for admin and sales
      let loginEmail = email;
      let loginPassword = password;
      
      if (email === 'admin') {
        loginEmail = 'admin@admin.com';
        loginPassword = 'adminadmin';
      } else if (email === 'sales') {
        loginEmail = 'sales@sales.com';
        loginPassword = 'salessales';
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        // If admin login fails, try to sign up the admin user first
        if ((email === 'admin' || email === 'admin@admin.com') && error.message.includes('Invalid login credentials')) {
          console.log('Tentativo di registrazione admin...');
          
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: 'admin@admin.com',
            password: 'adminadmin',
            options: {
              emailRedirectTo: `${window.location.origin}/dashboard`,
              data: {
                full_name: 'Administrator',
                user_type: 'admin'
              }
            }
          });

          if (signUpError) {
            console.error('Errore registrazione admin:', signUpError);
            toast({
              title: "Errore di registrazione admin",
              description: signUpError.message,
              variant: "destructive",
            });
            return { error: signUpError };
          }

          console.log('Admin registrato, tentativo di login...');

          // Wait a moment for the signup to complete
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Try to login again after signup
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: 'admin@admin.com',
            password: 'adminadmin',
          });

          if (loginError) {
            console.error('Errore login dopo registrazione:', loginError);
            toast({
              title: "Admin registrato",
              description: "Account admin creato. Riprova il login tra qualche secondo.",
              variant: "default",
            });
            return { error: loginError };
          }

          // Update the user profile with admin details and sync auth_user_id
          if (loginData.user) {
            console.log('Aggiornamento profilo admin...');
            
            // Get admin organization
            const { data: adminOrg } = await supabase
              .from('organizations')
              .select('id')
              .eq('code', 'admin')
              .single();

            // Update the existing admin user record with auth_user_id
            await supabase
              .from('users')
              .update({
                auth_user_id: loginData.user.id,
              })
              .eq('email', 'admin@admin.com');

            console.log('Profilo admin aggiornato');
          }

          toast({
            title: "Accesso admin effettuato",
            description: "Account admin creato e login completato",
          });

          return { error: null };
        } else if ((email === 'sales' || email === 'sales@sales.com') && error.message.includes('Invalid login credentials')) {
          // If sales login fails, try to sign up the sales user first
          console.log('Tentativo di registrazione sales...');
          
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: 'sales@sales.com',
            password: 'salessales',
            options: {
              emailRedirectTo: `${window.location.origin}/dashboard`,
              data: {
                full_name: 'Sales User',
                user_type: 'client'
              }
            }
          });

          if (signUpError) {
            console.error('Errore registrazione sales:', signUpError);
            toast({
              title: "Errore di registrazione sales",
              description: signUpError.message,
              variant: "destructive",
            });
            return { error: signUpError };
          }

          console.log('Sales registrato, tentativo di login...');

          // Wait a moment for the signup to complete
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Try to login again after signup
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: 'sales@sales.com',
            password: 'salessales',
          });

          if (loginError) {
            console.error('Errore login dopo registrazione:', loginError);
            toast({
              title: "Sales registrato",
              description: "Account sales creato. Riprova il login tra qualche secondo.",
              variant: "default",
            });
            return { error: loginError };
          }

          // Update the user profile with sales details and sync auth_user_id
          if (loginData.user) {
            console.log('Aggiornamento profilo sales...');
            
            // Update the existing sales user record with auth_user_id
            await supabase
              .from('users')
              .update({
                auth_user_id: loginData.user.id,
              })
              .eq('email', 'sales@sales.com');

            // Assign sales role
            await supabase
              .from('user_roles')
              .insert({
                user_id: loginData.user.id,
                role: 'sales'
              })
              .select()
              .single();

            console.log('Profilo sales aggiornato');
          }

          toast({
            title: "Accesso sales effettuato",
            description: "Account sales creato e login completato",
          });

          return { error: null };
        } else {
          toast({
            title: "Errore di accesso",
            description: error.message,
            variant: "destructive",
          });
          return { error };
        }
      }

      toast({
        title: "Accesso effettuato",
        description: "Benvenuto in HiCompliance",
      });

      return { error: null };
    } catch (error: any) {
      console.error('Errore generale di accesso:', error);
      toast({
        title: "Errore di accesso",
        description: "Si è verificato un errore durante l'accesso",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, organizationName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        toast({
          title: "Errore di registrazione",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      if (data.user) {
        // Create organization
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: organizationName,
            code: organizationName.toLowerCase().replace(/\s+/g, '_'),
          })
          .select()
          .single();

        if (orgError) {
          console.error('Error creating organization:', orgError);
          return { error: orgError };
        }

        // Create user profile
        const { error: userError } = await supabase
          .from('users')
          .insert({
            auth_user_id: data.user.id,
            email,
            full_name: fullName,
            user_type: 'client',
            organization_id: org.id,
          });

        if (userError) {
          console.error('Error creating user profile:', userError);
          return { error: userError };
        }
      }

      toast({
        title: "Registrazione completata",
        description: "Controlla la tua email per confermare l'account",
      });

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserProfile(null);
    toast({
      title: "Disconnesso",
      description: "Sei stato disconnesso con successo",
    });
  };

  const value = {
    user,
    session,
    userProfile,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};