import { useQuery } from '@tanstack/react-query';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  avatar: string;
  subscription: string;
  role: string;
  schoolId: number | null;
}

/**
 * Hook to fetch the authenticated school admin's profile and schoolId
 * 
 * Returns the user's profile data, including their schoolId for multi-tenant operations.
 * If the user doesn't have a schoolId, components should show an appropriate error.
 */
export function useSchoolAdmin() {
  const { data: userProfile, isLoading, error } = useQuery<UserProfile>({
    queryKey: ['/api/users/profile'],
    queryFn: () => fetch('/api/users/profile', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('supabase_token') || ''}`
      }
    }).then(res => {
      if (!res.ok) throw new Error('Failed to fetch profile')
      return res.json()
    }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1
  });

  return {
    userProfile,
    schoolId: userProfile?.schoolId || null,
    isLoading,
    error,
    hasSchool: !!userProfile?.schoolId
  };
}
