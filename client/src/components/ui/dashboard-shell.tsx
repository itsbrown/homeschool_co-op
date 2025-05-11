import { ReactNode } from "react";
import { MainNav } from "@/components/MainNav";
import { DashboardNav } from "@/components/DashboardNav";
import { UserAccountNav } from "@/components/UserAccountNav";
import { ModeToggle } from "@/components/mode-toggle";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-16 items-center justify-between py-4">
          <MainNav />
          <div className="flex items-center gap-4">
            <ModeToggle />
            <UserAccountNav />
          </div>
        </div>
      </header>
      <div className="container grid flex-1 gap-12 md:grid-cols-[200px_1fr] pt-4">
        <aside className="hidden w-[200px] flex-col md:flex">
          <DashboardNav />
        </aside>
        <main className="flex w-full flex-1 flex-col overflow-hidden pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}