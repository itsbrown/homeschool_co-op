import React from "react";
import ParentSidebar from "./ParentSidebar";

interface ParentAppShellProps {
  children: React.ReactNode;
}

export default function ParentAppShell({ children }: ParentAppShellProps) {
  return (
    <div className="flex min-h-screen">
      <ParentSidebar />
      <div className="flex-1 overflow-auto">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}