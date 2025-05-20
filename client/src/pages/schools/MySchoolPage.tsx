import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, School, MapPin, Phone, Mail, Globe, Calendar, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Using relative path for dashboard layout
import DashboardLayout from '../../components/layout/DashboardLayout';

// School data interface
interface SchoolData {
  id: number;
  name: string;
  type: string;
  address?: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  logo?: string | null;
  description?: string;
  foundedYear?: number;
  accreditation?: string | null;
  enrollmentSize?: number;
  adminId: number;
  status: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string | Date;
}

export default function MySchoolPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  
  // Fetch the school information for the logged-in school admin
  const { data: school, isLoading, error, refetch } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user,
    staleTime: 60000, // 1 minute stale time
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Error loading school information",
        description: "There was a problem loading your school information. Please try again later.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  if (isLoading) {
    return (
      <DashboardLayout pageTitle="My School">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading school information...</span>
        </div>
      </DashboardLayout>
    );
  }

  // If no school is found, show registration prompt
  if (!school) {
    return (
      <DashboardLayout pageTitle="Register School">
        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome, School Administrator</CardTitle>
              <CardDescription>
                You haven't registered a school yet
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-6 py-8">
              <School className="w-24 h-24 text-muted-foreground" />
              <div className="text-center space-y-2">
                <h3 className="text-xl font-medium">Register Your School or Co-op</h3>
                <p className="text-muted-foreground">
                  To get started, you'll need to register your school or homeschool co-op in our system.
                  This will allow you to manage classes, staff, and students.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Link href="/schools/register">
                <Button size="lg">Register School/Co-op</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={`${school.name || 'My School'}`}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <div className="w-full md:w-1/3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center">
                  <Avatar className="w-24 h-24 mb-4">
                    <AvatarImage src={school.logo || ''} alt={school.name} />
                    <AvatarFallback className="text-xl">{school.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <h2 className="text-2xl font-bold text-center mb-2">{school.name}</h2>
                  <Badge variant="outline" className="mb-4">{school.type}</Badge>
                  <p className="text-muted-foreground text-center mb-6">{school.description}</p>
                  
                  <div className="w-full space-y-3">
                    {school.address && (
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">{school.address}, {school.city}, {school.state} {school.zipCode}</span>
                      </div>
                    )}
                    {school.phoneNumber && (
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">{school.phoneNumber}</span>
                      </div>
                    )}
                    {school.email && (
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">{school.email}</span>
                      </div>
                    )}
                    {school.website && (
                      <div className="flex items-center">
                        <Globe className="w-4 h-4 mr-2 text-muted-foreground" />
                        <a href={school.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {school.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {school.foundedYear && (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">Founded in {school.foundedYear}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/schools/edit">Edit School Information</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          <div className="w-full md:w-2/3">
            <Card className="h-full">
              <CardHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-3 mb-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="stats">Statistics</TabsTrigger>
                    <TabsTrigger value="activity">Recent Activity</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6 flex flex-col items-center">
                        <Users className="w-8 h-8 text-primary mb-2" />
                        <div className="text-2xl font-bold">24</div>
                        <div className="text-sm text-muted-foreground">Staff Members</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 flex flex-col items-center">
                        <School className="w-8 h-8 text-primary mb-2" />
                        <div className="text-2xl font-bold">12</div>
                        <div className="text-sm text-muted-foreground">Classes</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 flex flex-col items-center">
                        <Users className="w-8 h-8 text-primary mb-2" />
                        <div className="text-2xl font-bold">156</div>
                        <div className="text-sm text-muted-foreground">Students</div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button variant="outline" asChild>
                          <Link href="/schools/classes/new">Add New Class</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/schools/staff/invite">Invite Staff Member</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/schools/students/register">Register Student</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/calendar">View School Calendar</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="stats">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">School Statistics</h3>
                    <p className="text-muted-foreground">
                      Detailed statistics about enrollment, class attendance, and performance 
                      will be displayed here. This feature is coming soon.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="activity">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Recent Activity</h3>
                    <p className="text-muted-foreground">
                      A timeline of recent activities at your school will be displayed here.
                      This includes new enrollments, class schedules, and staff updates.
                      This feature is coming soon.
                    </p>
                  </div>
                </TabsContent>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}