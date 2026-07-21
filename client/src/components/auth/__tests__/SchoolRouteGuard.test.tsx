/**
 * Component smoke: SchoolRouteGuard fail-closed behavior.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SchoolRouteGuard } from '../SchoolRouteGuard';

jest.mock('@/hooks/useEffectivePermissions', () => ({
  useEffectivePermissions: jest.fn(),
}));

jest.mock('@/contexts/RoleContext', () => ({
  useRole: () => ({ activeRole: 'educator' }),
}));

jest.mock('wouter', () => ({
  useLocation: () => ['/school-admin/financial-reports', jest.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';

const mocked = useEffectivePermissions as jest.MockedFunction<typeof useEffectivePermissions>;

describe('SchoolRouteGuard', () => {
  it('shows forbidden when path requires permission user lacks', () => {
    mocked.mockReturnValue({
      canAccessPath: () => false,
      isLoading: false,
      showAdminNavGroups: false,
      effective: {
        flags: {
          canViewReports: false,
          canManageStaff: false,
          canManageClasses: false,
          canManageStudents: false,
          canSendNotifications: false,
          canViewParentContacts: false,
        },
        accessibleLocationIds: [],
        canAccessEntireSchool: false,
        isSchoolAdminBypass: false,
        showAdminNavGroups: false,
      },
      can: () => false,
      canShowGroup: () => false,
      canShowItem: () => false,
      visibleNav: [],
      isError: false,
      error: null,
    } as any);

    render(
      <SchoolRouteGuard>
        <div>Secret finance</div>
      </SchoolRouteGuard>,
    );
    expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
    expect(screen.queryByText('Secret finance')).not.toBeInTheDocument();
  });

  it('renders children for schoolAdmin bypass', () => {
    mocked.mockReturnValue({
      canAccessPath: () => true,
      isLoading: false,
      showAdminNavGroups: true,
      effective: {
        flags: {
          canViewReports: true,
          canManageStaff: true,
          canManageClasses: true,
          canManageStudents: true,
          canSendNotifications: true,
          canViewParentContacts: true,
        },
        accessibleLocationIds: [],
        canAccessEntireSchool: true,
        isSchoolAdminBypass: true,
        showAdminNavGroups: true,
      },
      can: () => true,
      canShowGroup: () => true,
      canShowItem: () => true,
      visibleNav: [],
      isError: false,
      error: null,
    } as any);

    render(
      <SchoolRouteGuard>
        <div>Secret finance</div>
      </SchoolRouteGuard>,
    );
    expect(screen.getByText('Secret finance')).toBeInTheDocument();
  });

  it('shows loading for staff paths while permissions resolve', () => {
    mocked.mockReturnValue({
      canAccessPath: () => false,
      isLoading: true,
      showAdminNavGroups: false,
      effective: {
        flags: {
          canViewReports: false,
          canManageStaff: false,
          canManageClasses: false,
          canManageStudents: false,
          canSendNotifications: false,
          canViewParentContacts: false,
        },
        accessibleLocationIds: [],
        canAccessEntireSchool: false,
        isSchoolAdminBypass: false,
        showAdminNavGroups: false,
      },
      can: () => false,
      canShowGroup: () => false,
      canShowItem: () => false,
      visibleNav: [],
      isError: false,
      error: null,
    } as any);

    render(
      <SchoolRouteGuard>
        <div>Secret finance</div>
      </SchoolRouteGuard>,
    );
    expect(screen.getByTestId('permissions-loading')).toBeInTheDocument();
    expect(screen.queryByText('Secret finance')).not.toBeInTheDocument();
  });
});
