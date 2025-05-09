import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Link } from "wouter";
import Sidebar from "./Sidebar";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  backTo?: string;
  showSidebar?: boolean;
}

export default function PageLayout({ 
  children, 
  title, 
  backTo,
  showSidebar = true 
}: PageLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      {showSidebar && (
        <>
          {/* Mobile sidebar with backdrop */}
          <div
            className={`fixed inset-0 z-50 transition-transform transform ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } md:hidden`}
          >
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/50" 
              onClick={toggleSidebar}
            ></div>
            
            {/* Sidebar content */}
            <div className="relative h-full w-64 z-10">
              <Sidebar />
            </div>
          </div>

          {/* Desktop sidebar (always visible) */}
          <div className="hidden md:block w-64 flex-shrink-0">
            <Sidebar />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 w-full">
        {/* Header */}
        <header className="h-16 flex items-center px-4 border-b">
          {showSidebar && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden mr-4" 
              onClick={toggleSidebar}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation</span>
            </Button>
          )}
          
          {backTo && (
            <Link href={backTo}>
              <Button variant="ghost" size="sm" className="mr-4">
                ← Back
              </Button>
            </Link>
          )}
          
          {title && (
            <h1 className="text-xl font-semibold">{title}</h1>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}