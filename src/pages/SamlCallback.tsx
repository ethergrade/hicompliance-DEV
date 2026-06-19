import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '@/lib/api-client';

export default function SamlCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');
    if (token) {
      setToken(token);
      navigate('/dashboard', { replace: true });
    } else {
      navigate(`/auth?error=${error ?? 'saml_failed'}`, { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Accesso in corso...</p>
    </div>
  );
}
