import { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';
import ForbiddenPage from '@/pages/ForbiddenPage';
import { NAV_REGISTRY } from '@shared/permissions';

/**
 * Blocks deep links to school-admin / schools paths when the user lacks the
 * required permission. Fail closed while permissions load for staff paths.
 */
export function SchoolRouteGuard({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { canAccessPath, isLoading, showAdminNavGroups, effective } =
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

  // Settings + dashboard always allowed for authenticated school users
  if (path === '/schools/settings' || path === '/dashboard') {
    return <>{children}</>;
  }

  if (showAdminNavGroups) {
    return <>{children}</>;
  }

  const inRegistry = NAV_REGISTRY.some(
    (item) => path === item.href || path.startsWith(`${item.href}/`),
  );

  if (isLoading && inRegistry) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" data-testid="permissions-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (inRegistry && !canAccessPath(path)) {
    return <ForbiddenPage />;
  }

  // Paths not in registry: allow if any staff grant or school-wide, else forbid if clearly admin-only
  if (
    !inRegistry &&
    path.startsWith('/school-admin/') &&
    !effective.isSchoolAdminBypass &&
    !effective.canAccessEntireSchool &&
    !Object.values(effective.flags).some(Boolean)
  ) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}
