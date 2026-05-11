import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface ParentCreditsData {
  user: { id: number; name: string; email: string };
  schoolId: number | null;
  credits: unknown[];
  availableCredits: unknown[];
  totalAvailableCents: number;
}

async function fetchParentCredits(): Promise<ParentCreditsData> {
  const res = await apiRequest('GET', '/api/credits/me');
  if (!res.ok) throw new Error('Failed to fetch credits');
  return res.json();
}

export function useParentCredits() {
  const { data, isLoading, error } = useQuery<ParentCreditsData>({
    queryKey: ['parent-credits'],
    queryFn: fetchParentCredits,
    staleTime: 30_000,
    retry: false,
  });

  return {
    totalAvailableCents: data?.totalAvailableCents ?? 0,
    creditsData: data,
    isLoading,
    error,
  };
}
