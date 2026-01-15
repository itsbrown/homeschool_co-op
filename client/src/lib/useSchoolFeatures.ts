import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/components/SupabaseProvider';

interface SchoolFeaturesResponse {
  features: Record<string, boolean>;
  schoolId: number;
}

export function useSchoolFeatures() {
  const { user } = useSupabase();
  
  const { data, isLoading, error } = useQuery<SchoolFeaturesResponse>({
    queryKey: ['/api/school-admin/features'],
    enabled: !!user,
  });

  const features = data?.features || {};

  return {
    features,
    isLoading,
    error,
    hasFeature: (featureName: string) => features[featureName] === true,
    isFinancialReportsEnabled: features['financialReports'] === true,
    isAiInsightsEnabled: features['aiInsights'] === true,
  };
}
