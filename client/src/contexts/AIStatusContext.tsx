import React, { createContext, useContext, ReactNode } from 'react';
import { useAIStatus } from '@/hooks/useAIStatus';

interface AIStatusContextType {
  isAIAvailable: boolean;
  aiStatus: 'operational' | 'unavailable';
  statusMessage: string;
  errorMessage?: string;
  isLoading: boolean;
  refetch: () => void;
}

const AIStatusContext = createContext<AIStatusContextType>({
  isAIAvailable: false,
  aiStatus: 'unavailable',
  statusMessage: 'AI service status not initialized',
  isLoading: false,
  refetch: () => {}
});

/**
 * Provider component that makes AI status data available to any child component
 */
export const AIStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const aiStatus = useAIStatus();
  
  return (
    <AIStatusContext.Provider value={aiStatus}>
      {children}
    </AIStatusContext.Provider>
  );
};

/**
 * Hook to access the AI status information
 */
export function useAIStatusContext() {
  return useContext(AIStatusContext);
}

export default AIStatusProvider;