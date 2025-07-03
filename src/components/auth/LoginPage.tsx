import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { signIn, signUp, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    await signIn(email, password);
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;
    const organizationName = formData.get('organizationName') as string;
    
    await signUp(email, password, fullName, organizationName);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-cyber bg-clip-text text-transparent">
            HiCompliance
          </h1>
          <p className="text-muted-foreground mt-2">
            Piattaforma di gestione cyber risk
          </p>
        </div>

        <Card className="border-border shadow-cyber">
          <CardHeader>
            <CardTitle>Accesso alla piattaforma</CardTitle>
            <CardDescription>
              Accedi o registra la tua organizzazione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Accedi</TabsTrigger>
                <TabsTrigger value="signup">Registrati</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-4">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email" 
                      name="email" 
                      type="email" 
                      placeholder="admin o tua email"
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input 
                      id="password" 
                      name="password" 
                      type="password" 
                      placeholder="adminadmin o tua password"
                      required 
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-cyber hover:opacity-90" 
                    disabled={isLoading}
                  >
                    {isLoading ? 'Accesso in corso...' : 'Accedi'}
                  </Button>
                </form>
                
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                  <strong>Accesso Admin:</strong><br />
                  Email: <code>admin</code><br />
                  Password: <code>adminadmin</code><br />
                  <em className="text-xs">Puoi usare "admin" come email</em>
                </div>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome completo</Label>
                    <Input 
                      id="fullName" 
                      name="fullName" 
                      type="text" 
                      placeholder="Il tuo nome"
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizationName">Nome organizzazione</Label>
                    <Input 
                      id="organizationName" 
                      name="organizationName" 
                      type="text" 
                      placeholder="Nome della tua azienda"
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input 
                      id="signup-email" 
                      name="email" 
                      type="email" 
                      placeholder="tua@email.com"
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input 
                      id="signup-password" 
                      name="password" 
                      type="password" 
                      placeholder="Password sicura"
                      required 
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-cyber hover:opacity-90" 
                    disabled={isLoading}
                  >
                    {isLoading ? 'Registrazione in corso...' : 'Registrati'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};