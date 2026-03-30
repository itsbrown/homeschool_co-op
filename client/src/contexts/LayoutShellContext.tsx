import React, { createContext, useContext } from "react";

interface LayoutShellContextType {
  hasShell: boolean;
}

const LayoutShellContext = createContext<LayoutShellContextType>({ hasShell: false });

export const useLayoutShell = () => useContext(LayoutShellContext);

export const LayoutShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutShellContext.Provider value={{ hasShell: true }}>
    {children}
  </LayoutShellContext.Provider>
);
