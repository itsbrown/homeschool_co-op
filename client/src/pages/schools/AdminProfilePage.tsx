import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  User, 
  Mail,
  Phone,
  Calendar,
  Shield,
  Users,
  Settings,
  Lock
} from 'lucide-react';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

export default function AdminProfilePage() {
  const [, params] = useRoute<{ adminId: string }>('/schools/admins/:adminId');
  const adminId = params?.adminId;

  const { data: admin, isLoading, error } = useQuery({
    queryKey: [`/api/school-admin/users/${adminId}`],
    enabled: !!adminId,
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Admin Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !admin) {
    return (
      <SchoolAdminLayout pageTitle="Admin Profile">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Failed to load admin profile. Please try again.
            </p>
            <div className="flex justify-center mt-4">
              <Link href="/schools/users">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Users
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={`${admin.firstName} ${admin.lastName}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/schools/users">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {admin.firstName} {admin.lastName}
              </h1>
              <p className="text-muted-foreground">School Administrator Profile</p>
            </div>
          </div>
          <Badge variant="default" className="text-sm">
            <Shield className="mr-2 h-4 w-4" />
            School Admin
          </Badge>
        </div>

        {/* Profile Information */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Contact Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{admin.email}</p>
                </div>
              </div>
              {admin.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{admin.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Joined</p>
                  <p className="text-sm text-muted-foreground">
                    {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge variant={admin.isActive ? 'default' : 'secondary'}>
                  {admin.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Role</span>
                <Badge variant="default">School Admin</Badge>
              </div>
              {admin.schoolId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">School ID</span>
                  <span className="text-sm text-muted-foreground">{admin.schoolId}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Additional Information */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Overview</CardTitle>
                <CardDescription>
                  Complete profile information for {admin.firstName} {admin.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">User ID:</span>
                      <span className="ml-2 text-muted-foreground">{admin.id}</span>
                    </div>
                    <div>
                      <span className="font-medium">Last Updated:</span>
                      <span className="ml-2 text-muted-foreground">
                        {admin.updatedAt ? new Date(admin.updatedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {admin.metadata && Object.keys(admin.metadata).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Additional Information:</p>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                        {JSON.stringify(admin.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Administrator Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">User Management</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Class Management</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Enrollment Management</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Payment Processing</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Reports & Analytics</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm">System Configuration</span>
                    <Badge variant="default">Full Access</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <Card>
          <CardContent className="py-6">
            <div className="flex gap-3">
              <Link href="/schools/users">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Users
                </Button>
              </Link>
              <Button variant="default">
                <Mail className="mr-2 h-4 w-4" />
                Send Message
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}
