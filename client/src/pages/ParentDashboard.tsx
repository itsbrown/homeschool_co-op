import { useState } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BookOpen, Calendar, Bell, Plus, User, GraduationCap } from "lucide-react";
import Header from "@/components/layout/Header";
import ParentSidebar from "@/components/layout/ParentSidebar";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gradeLevel: string;
  parentId: string;
  birthdate?: string;
  age?: number;
  school?: string;
  interests?: string | string[];
  learningStyle?: string;
}

interface Program {
  id: number;
  name: string;
  description: string;
  ageRange: string;
  price: number;
  duration: string;
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Query for children data
  const { data: children = [], isLoading: childrenLoading, error: childrenError } = useQuery<Child[]>({
    queryKey: ["/api/parent/children"],
    enabled: !!user,
  });

  // Query for available programs
  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
    enabled: !!user,
  });

  // Query for enrollment data
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/program-enrollments"],
    enabled: !!user,
  });

  const isLoadingChildren = childrenLoading;

  return (
    <div className="flex h-screen bg-background">
      <ParentSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => {}} />
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 overflow-y-auto">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Parent Portal</h2>
            <div className="flex items-center space-x-2">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Enroll Child
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="children">My Children</TabsTrigger>
              <TabsTrigger value="programs">Available Programs</TabsTrigger>
              <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Children</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{children.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Registered in the system
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Enrollments</CardTitle>
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{enrollments.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Current program enrollments
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Available Programs</CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{programs.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Programs available for enrollment
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Notifications</CardTitle>
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                      Unread notifications
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="pl-2">
                    <div className="space-y-8">
                      <div className="flex items-center">
                        <div className="ml-4 space-y-1">
                          <p className="text-sm font-medium leading-none">
                            Welcome to the Parent Portal
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Use this dashboard to manage your children's enrollments and track their progress.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="col-span-3">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>
                      Common parent tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <Button variant="outline" className="justify-start">
                      <User className="mr-2 h-4 w-4" />
                      Add Child Profile
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Browse Programs
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Calendar className="mr-2 h-4 w-4" />
                      View Schedule
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="children" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold">My Children</h2>
                <p className="text-muted-foreground">Manage your children's profiles and information</p>
              </div>
              <Button asChild>
                <Link href="/children/register">
                  <Plus className="mr-2 h-4 w-4" />
                  Register New Child
                </Link>
              </Button>
            </div>

            {isLoadingChildren ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : childrenError ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-red-600">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                    <p>Error loading children data</p>
                    <p className="text-sm text-muted-foreground mt-2">{childrenError.message}</p>
                  </div>
                </CardContent>
              </Card>
            ) : children && children.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {children.map((child) => {
                  // Calculate age from birthdate if not provided
                  let age = child.age;
                  if (!age && child.birthdate) {
                    const birthDate = new Date(child.birthdate);
                    const today = new Date();
                    age = today.getFullYear() - birthDate.getFullYear();
                    const monthDiff = today.getMonth() - birthDate.getMonth();
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                      age--;
                    }
                  }

                  return (
                    <Card key={child.id}>
                      <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{child.firstName} {child.lastName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {age ? `Age: ${age}` : 'Age: Not specified'}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="ml-auto" asChild>
                          <Link href={`/children/${child.id}`}>
                            View Profile
                          </Link>
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Grade:</span>
                            <span>{child.gradeLevel || 'Not specified'}</span>
                          </div>
                          {child.school && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">School:</span>
                              <span>{child.school}</span>
                            </div>
                          )}
                          {child.interests && child.interests.length > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interests:</span>
                              <span>{Array.isArray(child.interests) ? child.interests.join(", ") : child.interests}</span>
                            </div>
                          )}
                          {child.learningStyle && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Learning Style:</span>
                              <span>{child.learningStyle}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No Children Registered</h3>
                    <p className="text-muted-foreground mb-4">
                      Register your first child to get started with managing their education journey.
                    </p>
                    <Button asChild>
                      <Link href="/children/register">
                        <Plus className="mr-2 h-4 w-4" />
                        Register New Child
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

            <TabsContent value="programs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Available Programs</CardTitle>
                  <CardDescription>
                    Browse and enroll in educational programs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {programsLoading ? (
                    <div>Loading programs...</div>
                  ) : programs.length === 0 ? (
                    <div className="text-center py-8">
                      <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-2 text-sm font-semibold text-gray-900">No programs available</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Check back later for new program offerings.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {programs.map((program: Program) => (
                        <Card key={program.id} className="border-2">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{program.name}</CardTitle>
                            <CardDescription>{program.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Badge variant="secondary">{program.ageRange}</Badge>
                                <span className="text-lg font-bold">${program.price}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Duration: {program.duration}
                              </div>
                              <Button className="w-full">
                                Enroll Now
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="enrollments" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Current Enrollments</CardTitle>
                  <CardDescription>
                    View and manage your children's program enrollments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {enrollmentsLoading ? (
                    <div>Loading enrollments...</div>
                  ) : enrollments.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-2 text-sm font-semibold text-gray-900">No active enrollments</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Enroll your children in programs to see them here.
                      </p>
                      <div className="mt-6">
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Browse Programs
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {enrollments.map((enrollment: any, index: number) => (
                        <Card key={index} className="border-l-4 border-l-blue-500">
                          <CardContent className="pt-6">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-semibold">Program Enrollment #{index + 1}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Active enrollment details
                                </p>
                              </div>
                              <Badge>Active</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}