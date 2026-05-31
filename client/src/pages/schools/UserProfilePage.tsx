import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import ParentProfilePage from '@/pages/schools/ParentProfilePage';
import EducatorProfilePage from '@/pages/schools/EducatorProfilePage';

type ProfileMeta = {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  labels: Array<{ role: string; roleId: number; isPrimary: boolean }>;
  capabilities: {
    viewOverview: boolean;
    viewFamily: boolean;
    viewEnrollments: boolean;
    viewPayments: boolean;
    viewTeaching: boolean;
    viewStaff: boolean;
  };
};

function getRoleDisplayName(role: string) {
  switch ((role || '').toLowerCase()) {
    case 'schooladmin':
      return 'School Admin';
    case 'educator':
      return 'Educator';
    case 'parent':
      return 'Parent';
    default:
      return role;
  }
}

export default function UserProfilePage() {
  const [, params] = useRoute('/schools/users/:userId');
  const userId = params?.userId;
  const [location] = useLocation();

  const initialTab = useMemo(() => {
    const q = location.split('?')[1] || '';
    const tab = new URLSearchParams(q).get('tab');
    return tab || 'overview';
  }, [location]);

  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: meta, isLoading, error } = useQuery<ProfileMeta>({
    queryKey: [`/api/school-admin/users/${userId}/profile`],
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="User Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !meta) {
    const errorMessage = (error as Error)?.message || '';
    const lower = errorMessage.toLowerCase();
    let title = 'User Not Found';
    let description = 'The requested user profile could not be found.';
    if (lower.includes('permission') || lower.includes('associated with a school')) {
      title = 'Access Denied';
      description = 'You do not have permission to view this user profile.';
    } else if (/^5\d{2}:/.test(errorMessage)) {
      title = 'Could Not Load Profile';
      description = 'The server failed while loading this profile. Try again or check server logs.';
    }

    return (
      <SchoolAdminLayout pageTitle="User Profile">
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-muted-foreground text-center max-w-md">{description}</p>
          <Link href="/schools/users">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
      </SchoolAdminLayout>
    );
  }

  const { user, labels, capabilities } = meta;
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <SchoolAdminLayout pageTitle={displayName}>
      <div className="space-y-4 mb-4">
        <div className="flex items-center gap-4">
          <Link href="/schools/users">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {labels.map((l) => (
                <Badge key={l.roleId} variant="outline">
                  {getRoleDisplayName(l.role)}
                  {l.isPrimary ? ' (primary)' : ''}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {capabilities.viewFamily && (
            <TabsTrigger value="family">Family &amp; Billing</TabsTrigger>
          )}
          {capabilities.viewTeaching && (
            <TabsTrigger value="teaching">Teaching</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <p>
              <span className="font-medium">Phone:</span> {user.phone || '—'}
            </p>
            <p className="text-muted-foreground">
              Use the tabs above for role-specific details. Labels on this account determine which
              sections are available.
            </p>
          </div>
        </TabsContent>

        {capabilities.viewFamily && userId && (
          <TabsContent value="family" className="mt-4">
            <ParentProfilePage userIdOverride={userId} embedded />
          </TabsContent>
        )}

        {capabilities.viewTeaching && userId && (
          <TabsContent value="teaching" className="mt-4">
            <EducatorProfilePage userIdOverride={userId} embedded />
          </TabsContent>
        )}
      </Tabs>
    </SchoolAdminLayout>
  );
}
