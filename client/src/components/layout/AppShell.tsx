import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (hidden on mobile, toggleable) */}
      <div
        className={`fixed inset-0 z-40 md:relative md:z-0 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 transition-transform duration-300 ease-in-out`}
      >
        <Sidebar />
        {/* Backdrop for mobile */}
        <div
          className={`absolute inset-0 bg-black bg-opacity-50 md:hidden ${
            sidebarOpen ? "block" : "hidden"
          }`}
          onClick={toggleSidebar}
        ></div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-auto bg-secondary p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
