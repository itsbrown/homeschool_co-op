import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, MapPin, Phone, Mail, Globe, Calendar, Users, TrendingUp, DollarSign, BookOpen, GraduationCap, AlertTriangle, CheckCircle, Clock, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import AppShell from '@/components/layout/AppShell';

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
  status?: string;
}

// Dashboard KPI interfaces
interface EnrollmentMetrics {
  totalStudents: number;
  activeStudents: number;
  newEnrollments: number;
  enrollmentGrowth: number;
  graduationRate: number;
  retentionRate: number;
}

interface FinancialMetrics {
  totalRevenue: number;
  outstandingBalance: number;
  collectionRate: number;
  avgTuitionPaid: number;
  monthlyRevenue: number;
  unpaidAccounts: number;
}

interface AcademicMetrics {
  averageProgress: number;
  completionRate: number;
  activeClasses: number;
  totalClasses: number;
  avgClassSize: number;
  studentTeacherRatio: number;
}

interface StaffMetrics {
  totalStaff: number;
  activeInstructors: number;
  pendingInvites: number;
  staffUtilization: number;
}

export default function MySchoolPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Fetch school data
  const { data: school, isLoading, error, refetch } = useQuery<SchoolData>({
    queryKey: ["/api/school-admin/my-school"],
    enabled: isAuthenticated,
  });

  // Fetch dashboard metrics from authentic data sources
  const { data: enrollmentMetrics } = useQuery<EnrollmentMetrics>({
    queryKey: ["/api/school-admin/metrics/enrollment"],
    enabled: isAuthenticated && !!school,
  });

  const { data: financialMetrics } = useQuery<FinancialMetrics>({
    queryKey: ["/api/school-admin/metrics/financial"],
    enabled: isAuthenticated && !!school,
  });

  const { data: academicMetrics } = useQuery<AcademicMetrics>({
    queryKey: ["/api/school-admin/metrics/academic"],
    enabled: isAuthenticated && !!school,
  });

  const { data: staffMetrics } = useQuery<StaffMetrics>({
    queryKey: ["/api/school-admin/metrics/staff"],
    enabled: isAuthenticated && !!school,
  });

  // Setup school mutation
  const setupSchoolMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/school-admin/setup-school"),
    onSuccess: () => {
      toast({
        title: "School created successfully",
        description: "Your school has been set up and registered.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to create school",
        description: error?.message || "An error occurred while setting up your school.",
      });
    },
  });

  // Check if user needs to set up a school
  const userEmail = user?.email;
  const needsSetup = !school && userEmail && !isLoading;

  const handleSetupSchool = async () => {
    try {
      await setupSchoolMutation.mutateAsync();
    } catch (err) {
      console.error('Setup failed:', err);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="container mx-auto p-4">
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading school information...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!school) {
    return (
      <AppShell>
        <div className="container mx-auto p-4">
          <div className="max-w-3xl mx-auto my-8">
            <Card>
              <CardHeader>
                <CardTitle>No School Found</CardTitle>
                <CardDescription>
                  You don't have any schools associated with your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Please register a school or contact an administrator for assistance.
                </p>
              </CardContent>
              <CardFooter className="flex gap-3">
                {needsSetup && (
                  <Button 
                    onClick={handleSetupSchool}
                    disabled={setupSchoolMutation.isPending}
                    className="mr-2"
                  >
                    {setupSchoolMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      'Create School'
                    )}
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link href="/schools/register">Register a School</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto p-4">
        <div className="max-w-6xl mx-auto my-8">
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  {school.logo ? (
                    <AvatarImage src={school.logo} alt={school.name} />
                  ) : (
                    <AvatarFallback className="text-lg">
                      {school.name.split(' ').map(word => word[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div>
                  <CardTitle className="text-2xl mb-1">{school.name}</CardTitle>
                  <CardDescription className="flex items-center space-x-2">
                    <Badge variant="secondary">{school.type}</Badge>
                    <Badge variant={school.status === 'active' ? 'default' : 'secondary'}>
                      {school.status}
                    </Badge>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="stats">Statistics</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-6">
                  {/* Key Performance Indicators */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Enrollment KPI */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {enrollmentMetrics?.totalStudents || 0}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {enrollmentMetrics?.enrollmentGrowth ? 
                            `+${enrollmentMetrics.enrollmentGrowth.toFixed(1)}% this month` : 
                            'No growth data'
                          }
                        </div>
                      </CardContent>
                    </Card>

                    {/* Financial KPI */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          ${financialMetrics?.monthlyRevenue?.toLocaleString() || '0'}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {financialMetrics?.collectionRate ? 
                            `${financialMetrics.collectionRate.toFixed(1)}% collection rate` : 
                            'No collection data'
                          }
                        </div>
                      </CardContent>
                    </Card>

                    {/* Academic Progress KPI */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Progress</CardTitle>
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {academicMetrics?.averageProgress ? 
                            `${academicMetrics.averageProgress.toFixed(1)}%` : 
                            '0%'
                          }
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Target className="h-3 w-3 mr-1" />
                          {academicMetrics?.completionRate ? 
                            `${academicMetrics.completionRate.toFixed(1)}% completion rate` : 
                            'No completion data'
                          }
                        </div>
                      </CardContent>
                    </Card>

                    {/* Staff KPI */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {staffMetrics?.activeInstructors || 0}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          {staffMetrics?.pendingInvites ? 
                            `${staffMetrics.pendingInvites} pending invites` : 
                            'No pending invites'
                          }
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Metrics Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Enrollment Metrics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Enrollment Overview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Active Students</span>
                          <span className="text-lg font-bold">
                            {enrollmentMetrics?.activeStudents || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">New Enrollments</span>
                          <span className="text-lg font-bold text-green-600">
                            +{enrollmentMetrics?.newEnrollments || 0}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Retention Rate</span>
                            <span>{enrollmentMetrics?.retentionRate?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={enrollmentMetrics?.retentionRate || 0} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Graduation Rate</span>
                            <span>{enrollmentMetrics?.graduationRate?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={enrollmentMetrics?.graduationRate || 0} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Financial Metrics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          Financial Overview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Total Revenue</span>
                          <span className="text-lg font-bold">
                            ${financialMetrics?.totalRevenue?.toLocaleString() || '0'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Outstanding Balance</span>
                          <span className="text-lg font-bold text-amber-600">
                            ${financialMetrics?.outstandingBalance?.toLocaleString() || '0'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Unpaid Accounts</span>
                          <span className="text-lg font-bold text-red-600">
                            {financialMetrics?.unpaidAccounts || 0}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Collection Rate</span>
                            <span>{financialMetrics?.collectionRate?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={financialMetrics?.collectionRate || 0} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Academic Metrics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BookOpen className="h-5 w-5" />
                          Academic Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Active Classes</span>
                          <span className="text-lg font-bold">
                            {academicMetrics?.activeClasses || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Average Class Size</span>
                          <span className="text-lg font-bold">
                            {academicMetrics?.avgClassSize?.toFixed(1) || 0}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Student Progress</span>
                            <span>{academicMetrics?.averageProgress?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={academicMetrics?.averageProgress || 0} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Course Completion</span>
                            <span>{academicMetrics?.completionRate?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={academicMetrics?.completionRate || 0} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Staff Metrics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <GraduationCap className="h-5 w-5" />
                          Staff Management
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Total Staff</span>
                          <span className="text-lg font-bold">
                            {staffMetrics?.totalStaff || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Active Instructors</span>
                          <span className="text-lg font-bold text-green-600">
                            {staffMetrics?.activeInstructors || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Pending Invites</span>
                          <span className="text-lg font-bold text-amber-600">
                            {staffMetrics?.pendingInvites || 0}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Staff Utilization</span>
                            <span>{staffMetrics?.staffUtilization?.toFixed(1) || 0}%</span>
                          </div>
                          <Progress value={staffMetrics?.staffUtilization || 0} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                      <CardDescription>
                        Common administrative tasks and shortcuts
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                          <Link href="/schools/students/register">
                            <Users className="h-6 w-6" />
                            <span className="text-sm">Register Student</span>
                          </Link>
                        </Button>
                        <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                          <Link href="/schools/staff/invite">
                            <GraduationCap className="h-6 w-6" />
                            <span className="text-sm">Invite Staff</span>
                          </Link>
                        </Button>
                        <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                          <Link href="/schools/classes/create">
                            <BookOpen className="h-6 w-6" />
                            <span className="text-sm">Create Class</span>
                          </Link>
                        </Button>
                        <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                          <Link href="/schools/knowledge-base">
                            <Globe className="h-6 w-6" />
                            <span className="text-sm">Knowledge Base</span>
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="details">
                  <div className="prose max-w-none">
                    <h3>About {school.name}</h3>
                    <p>{school.description || "No detailed description available."}</p>
                  </div>
                </TabsContent>
                
                <TabsContent value="stats">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Classes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">12</p>
                        <p className="text-sm text-muted-foreground">Active classes</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Staff</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">8</p>
                        <p className="text-sm text-muted-foreground">Teaching staff</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Students</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{school.enrollmentSize || "N/A"}</p>
                        <p className="text-sm text-muted-foreground">Total enrollment</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => {
                  refetch();
                  toast({
                    title: "Refreshing data",
                    description: "The school information is being refreshed.",
                  });
                }}
              >
                Refresh Data
              </Button>
              <Button asChild>
                <Link href="/schools/my-school/edit">Edit School Information</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}