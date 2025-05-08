import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

interface AIStatusResponse {
  anthropic: {
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
    queryFn: getQueryFn({ on401: 'returnNull' }),
    // Cache for 5 minutes, but refetch in the background after 1 minute
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isAIAvailable = data?.anthropic?.available ?? false;
  const aiStatus = data?.anthropic?.status ?? 'unavailable';
  const statusMessage = data?.anthropic?.message ?? 'AI service status unknown';
  
  // User-friendly error message if there was an error checking status
  const errorMessage = error 
    ? 'There was an error checking AI service status'
    : undefined;

  return {
    isAIAvailable,
    aiStatus,
    statusMessage,
    errorMessage,
    isLoading,
    refetch
  };
}

export default useAIStatus;