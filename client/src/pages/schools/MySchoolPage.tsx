import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, MapPin, Phone, Mail, Globe, Calendar, Users, TrendingUp, DollarSign, BookOpen, GraduationCap, AlertTriangle, CheckCircle, Clock, Target, Link as LucideLink, Copy, ExternalLink, Plus, QrCode, BarChart3, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import AppShell from '@/components/layout/AppShell';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  registrationCode?: string;
  locations?: LocationData[]; // Added locations array
}

// Location data interface
interface LocationData {
  id: number;
  schoolId: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  managerName?: string;
  capacity?: number;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
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

// Marketing Links interfaces - matches shared/schema.ts
interface MarketingLink {
  id: number;
  schoolId: number;
  campaignId: string;
  campaignName: string;
  linkUrl: string;
  isActive: boolean;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
  trackingUrl?: string;
  shortUrl?: string;
}

interface CreateMarketingLinkData {
  campaignName: string;
  linkUrl: string;
}

export default function MySchoolPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Marketing Links state
  const [showCreateLinkDialog, setShowCreateLinkDialog] = useState(false);
  const [newLinkData, setNewLinkData] = useState<CreateMarketingLinkData>({
    campaignName: '',
    linkUrl: '',
  });

  // Fetch school data
  const { data: school, isLoading, error, refetch } = useQuery<SchoolData>({
    queryKey: ["/api/school-admin/my-school"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/school-admin/my-school");
      if (!response.ok) {
        throw new Error("Failed to fetch school");
      }
      const schoolData = await response.json();
      console.log("🏫 Received school data:", schoolData);
      console.log("🔑 Registration code in data:", schoolData.registrationCode);
      return schoolData;
    },
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

  // Fetch marketing links
  const { data: marketingLinks = [], isLoading: isLoadingLinks } = useQuery<MarketingLink[]>({
    queryKey: ["/api/school-admin/marketing-links"],
    enabled: isAuthenticated && !!school,
  });

  // Create marketing link mutation
  const createLinkMutation = useMutation({
    mutationFn: async (data: CreateMarketingLinkData) => {
      const response = await apiRequest("POST", "/api/school-admin/marketing-links", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/marketing-links"] });
      setShowCreateLinkDialog(false);
      setNewLinkData({ campaignName: '', linkUrl: '' });
      toast({
        title: "Marketing link created",
        description: "Your new marketing link has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating link",
        description: "Failed to create marketing link. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete marketing link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: number) => {
      await apiRequest("DELETE", `/api/school-admin/marketing-links/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/marketing-links"] });
      toast({
        title: "Marketing link deleted",
        description: "The marketing link has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error deleting link",
        description: "Failed to delete marketing link. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: successMessage,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

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

                <TabsContent value="details" className="space-y-6">
                  {/* School Description */}

<div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">About {school.name}</h3>
                <p className="text-muted-foreground">
                  {school.description || "No detailed description available."}
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-primary/5">
                <h4 className="font-medium mb-2 text-primary">Registration Code</h4>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-lg font-bold bg-background px-2 py-1 rounded">
                    {school.registrationCode || 'No code available'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!school.registrationCode}
                    onClick={() => {
                      const codeToClipboard = school.registrationCode;
                      if (codeToClipboard) {
                        navigator.clipboard.writeText(codeToClipboard).then(() => {
                          toast({
                            title: "Copied!",
                            description: "Registration code copied to clipboard",
                          });
                        }).catch((err) => {
                          console.error('Failed to copy:', err);
                          toast({
                            title: "Copy failed",
                            description: "Unable to copy to clipboard",
                            variant: "destructive"
                          });
                        });
                      } else {
                        toast({
                          title: "No code available",
                          description: "Registration code is not yet generated",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Share this code with families to allow them to register for your school.
                </p>
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium">Registration Links:</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-background p-2 rounded">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground">Landing Page:</p>
                        <code className="text-xs">
                          {school.registrationCode 
                            ? `${window.location.origin}/school/${school.registrationCode}`
                            : 'Registration code not available'
                          }
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!school.registrationCode}
                        onClick={() => {
                          if (school.registrationCode) {
                            const landingUrl = `${window.location.origin}/school/${school.registrationCode}`;
                            navigator.clipboard.writeText(landingUrl).then(() => {
                              toast({
                                title: "Copied!",
                                description: "Landing page link copied to clipboard",
                              });
                            }).catch((err) => {
                              console.error('Failed to copy:', err);
                              toast({
                                title: "Copy failed",
                                description: "Unable to copy to clipboard",
                                variant: "destructive"
                              });
                            });
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between bg-background p-2 rounded">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground">Direct Registration:</p>
                        <code className="text-xs">
                          {school.registrationCode 
                            ? `${window.location.origin}/register/${school.registrationCode}`
                            : 'Registration code not available'
                          }
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!school.registrationCode}
                        onClick={() => {
                          if (school.registrationCode) {
                            const registerUrl = `${window.location.origin}/register/${school.registrationCode}`;
                            navigator.clipboard.writeText(registerUrl).then(() => {
                              toast({
                                title: "Copied!",
                                description: "Registration link copied to clipboard",
                              });
                            }).catch((err) => {
                              console.error('Failed to copy:', err);
                              toast({
                                title: "Copy failed",
                                description: "Unable to copy to clipboard",
                                variant: "destructive"
                              });
                            });
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div></div>


                  {/* Marketing Links Section */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <LucideLink className="h-5 w-5" />
                            Marketing Links
                          </CardTitle>
                          <CardDescription>
                            Create and manage marketing links to track enrollment campaigns
                          </CardDescription>
                        </div>
                        <Dialog open={showCreateLinkDialog} onOpenChange={setShowCreateLinkDialog}>
                          <DialogTrigger asChild>
                            <Button className="flex items-center gap-2">
                              <Plus className="h-4 w-4" />
                              Create Link
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create Marketing Link</DialogTitle>
                              <DialogDescription>
                                Create a trackable marketing link for your enrollment campaigns
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <Label htmlFor="campaignName">Campaign Name</Label>
                                <Input
                                  id="campaignName"
                                  placeholder="e.g., Spring 2025 Open House"
                                  value={newLinkData.campaignName}
                                  onChange={(e) => setNewLinkData(prev => ({ ...prev, campaignName: e.target.value }))}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="linkUrl">Destination URL</Label>
                                <Input
                                  id="linkUrl"
                                  placeholder="e.g., https://your-website.com/enroll"
                                  value={newLinkData.linkUrl}
                                  onChange={(e) => setNewLinkData(prev => ({ ...prev, linkUrl: e.target.value }))}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setShowCreateLinkDialog(false)}>
                                Cancel
                              </Button>
                              <Button 
                                onClick={() => createLinkMutation.mutate(newLinkData)}
                                disabled={!newLinkData.campaignName || !newLinkData.linkUrl || createLinkMutation.isPending}
                              >
                                {createLinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Link
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isLoadingLinks ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="ml-2">Loading marketing links...</span>
                        </div>
                      ) : marketingLinks.length === 0 ? (
                        <div className="text-center py-8">
                          <LucideLink className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-lg font-medium mb-2">No marketing links yet</h3>
                          <p className="text-muted-foreground mb-4">
                            Create your first marketing link to start tracking enrollment campaigns
                          </p>
                          <Button onClick={() => setShowCreateLinkDialog(true)} className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Create Your First Link
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {marketingLinks.map((link) => (
                            <Card key={link.id} className="border-l-4 border-l-primary/20">
                              <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                  <div className="space-y-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      {link.campaignName}
                                      <Badge variant={link.isActive ? "default" : "secondary"}>
                                        {link.isActive ? "Active" : "Inactive"}
                                      </Badge>
                                    </CardTitle>
                                    <CardDescription>
                                      Campaign ID: {link.campaignId}
                                    </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="flex items-center gap-1">
                                      <BarChart3 className="h-3 w-3" />
                                      {link.clickCount} clicks
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteLinkMutation.mutate(link.id)}
                                      disabled={deleteLinkMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">Tracking URL:</Label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyToClipboard(link.trackingUrl || link.linkUrl, "Tracking URL copied to clipboard")}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(link.trackingUrl || link.linkUrl, '_blank')}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="p-2 bg-muted rounded text-sm font-mono break-all">
                                    {link.trackingUrl || link.linkUrl}
                                  </div>
                                </div>

                                {link.shortUrl && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-sm font-medium">Short URL:</Label>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyToClipboard(link.shortUrl!, "Short URL copied to clipboard")}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="p-2 bg-muted rounded text-sm font-mono break-all">
                                      {link.shortUrl}
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t">
                                  <div className="text-sm text-muted-foreground">
                                    Created: {new Date(link.createdAt).toLocaleDateString()}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link.trackingUrl || link.linkUrl)}`, '_blank')}
                                  >
                                    <QrCode className="h-4 w-4 mr-2" />
                                    Generate QR Code
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