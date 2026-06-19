import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api-client';

export default function EntraRedirect() {
  useEffect(() => {
    window.location.href = `${API_BASE_URL}/auth/saml/redirect`;
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Reindirizzamento a Microsoft...</p>
    </div>
  );
}
