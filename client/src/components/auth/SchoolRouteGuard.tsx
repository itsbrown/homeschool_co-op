import { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useRole } from '@/contexts/RoleContext';
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';
import ForbiddenPage from '@/pages/ForbiddenPage';

/**
 * Blocks deep links to school-admin / schools paths when the user lacks the
 * required permission. Fail closed while permissions load for staff paths.
 */
export function SchoolRouteGuard({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { activeRole } = useRole();
  const { canAccessPath, isLoading, showAdminNavGroups } =
    useEffectivePermissions();

  const path = location.split('?')[0];
  const isSchoolPath =
    path.startsWith('/schools/') ||
    path.startsWith('/school-admin/') ||
    path === '/schools' ||
    path === '/school-admin';

  // Public / registration school paths that should not use staff gates
  const isPublicSchoolPath =
    path.startsWith('/schools/register') ||
    path === '/schools/apply' ||
    path.startsWith('/schools/application');

  if (!isSchoolPath || isPublicSchoolPath) {
    return <>{children}</>;
  }

  // ParentAppShell silently switches role for /school-admin/* only. Keep that path
  // unblocked so the shell can mount; still gate /schools/* staff deep links.
  if (
    activeRole === 'parent' &&
    (path === '/school-admin' || path.startsWith('/school-admin/'))
  ) {
    return <>{children}</>;
  }

  // Settings + dashboard always allowed for authenticated school users
  if (path === '/schools/settings' || path === '/dashboard') {
    return <>{children}</>;
  }

  if (showAdminNavGroups) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" data-testid="permissions-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Registry + unlisted staff paths: canAccessPath fail-closes unlisted deep links
  // unless the user has school-wide / bypass access.
  if (!canAccessPath(path)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}
