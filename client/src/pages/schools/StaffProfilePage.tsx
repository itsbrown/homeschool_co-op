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
  Briefcase,
  Users,
  Clock,
  CheckCircle
} from 'lucide-react';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

export default function StaffProfilePage() {
  const [, params] = useRoute<{ staffId: string }>('/schools/staff/:staffId');
  const staffId = params?.staffId;

  const { data: staffMember, isLoading, error } = useQuery({
    queryKey: [`/api/school-admin/users/${staffId}`],
    enabled: !!staffId,
    queryFn: async () => {
      const response = await fetch(`/api/school-admin/users/${staffId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch staff details');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Staff Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !staffMember) {
    return (
      <SchoolAdminLayout pageTitle="Staff Profile">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Failed to load staff profile. Please try again.
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
    <SchoolAdminLayout pageTitle={`${staffMember.firstName} ${staffMember.lastName}`}>
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
                {staffMember.firstName} {staffMember.lastName}
              </h1>
              <p className="text-muted-foreground">Staff Profile</p>
            </div>
          </div>
          <Badge variant="destructive" className="text-sm">
            <Briefcase className="mr-2 h-4 w-4" />
            Staff
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
                  <p className="text-sm text-muted-foreground">{staffMember.email}</p>
                </div>
              </div>
              {staffMember.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{staffMember.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Joined</p>
                  <p className="text-sm text-muted-foreground">
                    {staffMember.createdAt ? new Date(staffMember.createdAt).toLocaleDateString() : 'N/A'}
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
                <Badge variant={staffMember.isActive ? 'default' : 'secondary'}>
                  {staffMember.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Role</span>
                <Badge variant="destructive">Staff</Badge>
              </div>
              {staffMember.schoolId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">School ID</span>
                  <span className="text-sm text-muted-foreground">{staffMember.schoolId}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Additional Information */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Overview</CardTitle>
                <CardDescription>
                  Complete profile information for {staffMember.firstName} {staffMember.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">User ID:</span>
                      <span className="ml-2 text-muted-foreground">{staffMember.id}</span>
                    </div>
                    <div>
                      <span className="font-medium">Last Updated:</span>
                      <span className="ml-2 text-muted-foreground">
                        {staffMember.updatedAt ? new Date(staffMember.updatedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {staffMember.metadata && Object.keys(staffMember.metadata).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Additional Information:</p>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                        {JSON.stringify(staffMember.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Work Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Schedule management coming soon</p>
                  <p className="text-sm mt-1">
                    View work hours, assignments, and availability
                  </p>
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
