import React from 'react';
import { useAuth } from "@/hooks/useAuth0";
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';

interface BaseLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export default function BaseLayout({ children, pageTitle }: BaseLayoutProps) {
  const { user, logout, isAuthenticated } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header without navigation */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">American Seekers Academy</h1>
            {pageTitle && (
              <p className="text-sm text-muted-foreground mt-1">{pageTitle}</p>
            )}
          </div>
          
          {isAuthenticated && user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-muted-foreground">{user.email}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}