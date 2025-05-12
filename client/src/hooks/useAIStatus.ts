import { useQuery } from "@tanstack/react-query";

interface AIStatusResponse {
  anthropic: {
    available: boolean;
    status: 'operational' | 'unavailable';
    message: string;
  };
  enhancedAI?: {
    available: boolean;
    status: 'operational' | 'unavailable';
    message: string;
  };
}

/**
 * A hook to check if AI services are available
 * Returns the current status of AI services and whether they're available
 */
export function useAIStatus() {
  const { data, error, isLoading, refetch } = useQuery<AIStatusResponse>({
    queryKey: ['/api/ai/status'],
    queryFn: () => fetch('/api/ai/status').then(res => res.json()),
    // Cache for 5 minutes, but refetch in the background after 1 minute
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isAIAvailable = data?.anthropic?.available ?? false;
  const aiStatus = data?.anthropic?.status ?? 'unavailable';
  const statusMessage = data?.anthropic?.message ?? 'AI service status unknown';
  
  // Enhanced AI status
  const isEnhancedAIAvailable = data?.enhancedAI?.available ?? false;
  const enhancedAIStatus = data?.enhancedAI?.status ?? 'unavailable';
  const enhancedAIMessage = data?.enhancedAI?.message ?? 'Enhanced AI status unknown';
  
  // User-friendly error message if there was an error checking status
  const errorMessage = error 
    ? 'There was an error checking AI service status'
    : undefined;

  return {
    isAIAvailable,
    aiStatus,
    statusMessage,
    isEnhancedAIAvailable,
    enhancedAIStatus,
    enhancedAIMessage,
    errorMessage,
    isLoading,
    refetch
  };
}

export default useAIStatus;