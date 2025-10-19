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
  GraduationCap,
  Users,
  BookOpen,
  Clock
} from 'lucide-react';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { formatDate } from 'date-fns';

export default function EducatorProfilePage() {
  const [, params] = useRoute<{ educatorId: string }>('/schools/educators/:educatorId');
  const educatorId = params?.educatorId;

  const { data: educator, isLoading, error } = useQuery({
    queryKey: [`/api/school-admin/users/${educatorId}`],
    enabled: !!educatorId,
    queryFn: async () => {
      const response = await fetch(`/api/school-admin/users/${educatorId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch educator details');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Educator Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !educator) {
    return (
      <SchoolAdminLayout pageTitle="Educator Profile">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Failed to load educator profile. Please try again.
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
    <SchoolAdminLayout pageTitle={`${educator.firstName} ${educator.lastName}`}>
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
                {educator.firstName} {educator.lastName}
              </h1>
              <p className="text-muted-foreground">Educator Profile</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm">
            <GraduationCap className="mr-2 h-4 w-4" />
            Educator
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
                  <p className="text-sm text-muted-foreground">{educator.email}</p>
                </div>
              </div>
              {educator.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{educator.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Joined</p>
                  <p className="text-sm text-muted-foreground">
                    {educator.createdAt ? new Date(educator.createdAt).toLocaleDateString() : 'N/A'}
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
                <Badge variant={educator.isActive ? 'default' : 'secondary'}>
                  {educator.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Role</span>
                <Badge variant="secondary">Educator</Badge>
              </div>
              {educator.schoolId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">School ID</span>
                  <span className="text-sm text-muted-foreground">{educator.schoolId}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Additional Information */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Overview</CardTitle>
                <CardDescription>
                  Complete profile information for {educator.firstName} {educator.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">User ID:</span>
                      <span className="ml-2 text-muted-foreground">{educator.id}</span>
                    </div>
                    <div>
                      <span className="font-medium">Last Updated:</span>
                      <span className="ml-2 text-muted-foreground">
                        {educator.updatedAt ? new Date(educator.updatedAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {educator.metadata && Object.keys(educator.metadata).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Additional Information:</p>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                        {JSON.stringify(educator.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Activity tracking coming soon</p>
                  <p className="text-sm mt-1">
                    View classes taught, student interactions, and more
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
