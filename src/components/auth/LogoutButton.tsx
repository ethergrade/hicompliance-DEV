import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  showText?: boolean;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  variant = 'outline', 
  size = 'sm', 
  className = '',
  showText = true 
}) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Button 
      onClick={handleLogout}
      variant={variant} 
      size={size} 
      className={className}
    >
      <LogOut className="w-4 h-4 mr-2" />
      {showText && 'Disconnetti'}
    </Button>
  );
};