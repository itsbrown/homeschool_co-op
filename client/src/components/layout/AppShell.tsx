import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (always visible on desktop, toggleable on mobile) */}
      <div
        className={`fixed inset-0 z-40 lg:relative lg:z-0 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 transition-transform duration-300 ease-in-out lg:w-64 shrink-0`}
      >
        <Sidebar />
        
        {/* Backdrop for mobile */}
        <div
          className={`absolute inset-0 bg-black bg-opacity-50 lg:hidden ${
            sidebarOpen ? "block" : "hidden"
          }`}
          onClick={toggleSidebar}
        ></div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden w-full">
        <Header onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
