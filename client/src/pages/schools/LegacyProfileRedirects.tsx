import { Redirect, useRoute } from 'wouter';

export function LegacyParentProfileRedirect() {
  const [, params] = useRoute<{ parentId: string }>('/schools/parents/:parentId');
  if (!params?.parentId) return null;
  return <Redirect to={`/schools/users/${params.parentId}?tab=family`} />;
}

export function LegacyEducatorProfileRedirect() {
  const [, params] = useRoute<{ educatorId: string }>('/schools/educators/:educatorId');
  if (!params?.educatorId) return null;
  return <Redirect to={`/schools/users/${params.educatorId}?tab=teaching`} />;
}

export function LegacyStaffProfileRedirect() {
  const [, params] = useRoute<{ staffId: string }>('/schools/staff/:staffId');
  if (!params?.staffId) return null;
  return <Redirect to={`/schools/users/${params.staffId}`} />;
}
