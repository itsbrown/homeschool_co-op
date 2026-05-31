/** Shared React Query key for `GET /api/parent/member-id`. */
export const PARENT_MEMBER_ID_QUERY_KEY = ['/api/parent/member-id'] as const;

export interface ParentMemberIdResponse {
  memberId: string | null;
  hasMemberId: boolean;
  hasMembership: boolean;
  membershipStatus: string | null;
  schoolId: number | null;
  schoolName: string | null;
  membershipFeeAmount: number;
  membershipRequired: boolean;
  membershipOwedCents: number;
}

export async function fetchParentMemberId(): Promise<ParentMemberIdResponse> {
  const token = localStorage.getItem('supabase_token');
  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch('/api/parent/member-id', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch member ID: ${response.status}`);
  }

  return response.json();
}
