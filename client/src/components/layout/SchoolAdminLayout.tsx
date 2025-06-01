import React from "react";
import UnifiedSchoolAdminSidebar from "./UnifiedSchoolAdminSidebar";

interface SchoolAdminLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
}

export default function SchoolAdminLayout({ children, pageTitle }: SchoolAdminLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-100">
      <UnifiedSchoolAdminSidebar />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 py-3 flex items-center">
            <h1 className="text-2xl font-semibold text-gray-800">{pageTitle}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}