import React from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { 
  BookOpen, 
  Users, 
  Calendar, 
  MapPin, 
  Clock, 
  ArrowLeft,
  GraduationCap,
  DollarSign,
  User,
  Edit,
  UserCheck
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatClassSchedule } from "@/lib/utils";

export default function SchoolClassDetailsPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/schools/classes/:id");
  const classId = params?.id;

  // Get class details
  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ["/api/class-details", classId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/class-details/${classId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch class");
      return response.json();
    },
    enabled: !!classId,
  });

  // Get enrolled students for this class
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["/api/school-admin/class-students", classId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/school-admin/class-students/${classId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch students");
      return response.json();
    },
    enabled: !!classId,
  });

  if (classLoading) {
    return (
      <SchoolAdminLayout pageTitle="Class Details">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (!classData) {
    return (
      <SchoolAdminLayout pageTitle="Class Details">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold text-gray-900">Class Not Found</h2>
          <p className="text-gray-600 mt-2">The class you're looking for doesn't exist.</p>
          <Button 
            className="mt-4"
            onClick={() => navigate("/schools/classes")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Button>
        </div>
      </SchoolAdminLayout>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price / 100);
  };

  const formatGradeLevels = (gradeLevels: string[] | string | null) => {
    if (!gradeLevels) return 'Not specified';
    
    if (Array.isArray(gradeLevels)) {
      return gradeLevels.map(level => {
        // Convert from value to display format
        const displayMap: Record<string, string> = {
          'littles': 'Littles',
          'pre-k': 'Pre K',
          'kindergarten': 'Kindergarten',
          '1st-grade': '1st Grade',
          '2nd-grade': '2nd Grade',
          '3rd-grade': '3rd Grade',
          '4th-grade': '4th Grade',
          '5th-grade': '5th Grade',
          '6th-grade': '6th Grade',
          '7th-grade': '7th Grade',
          '8th-grade': '8th Grade',
          '9th-grade': '9th Grade',
          '10th-grade': '10th Grade',
        };
        return displayMap[level] || level;
      }).join(', ');
    }
    
    // Handle legacy single gradeLevel string
    return gradeLevels;
  };

  const students = studentsData?.students || [];

  return (
    <SchoolAdminLayout pageTitle={classData.title}>
      <div className="space-y-6">
        {/* Header with Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => navigate("/schools/classes")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Classes
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{classData.title}</h1>
              <p className="text-gray-500">
                Class ID: {classData.id} • {classData.category}
              </p>
            </div>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={() => navigate(`/schools/classes/${classId}/edit`)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Class
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate(`/schools/classes/${classId}/roster`)}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              View Roster
            </Button>
          </div>
        </div>

        {/* Class Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrollment</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {classData.enrollmentCount || 0}/{classData.capacity || 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                {classData.capacity ? `${Math.round(((classData.enrollmentCount || 0) / classData.capacity) * 100)}% filled` : 'No capacity set'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Price</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(() => {
                  // Check if class has variants with different prices
                  if (classData.variants && Array.isArray(classData.variants) && classData.variants.length > 0) {
                    const prices = classData.variants.map((v: any) => v.price).filter((p: number) => p > 0);
                    if (prices.length > 0) {
                      const minPrice = Math.min(...prices);
                      const maxPrice = Math.max(...prices);
                      if (minPrice === maxPrice) {
                        return formatPrice(minPrice);
                      } else {
                        return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
                      }
                    }
                  }
                  return formatPrice(classData.price || 0);
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                {classData.variants && classData.variants.length > 1 ? 'Price range' : 'Per student'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <Badge variant={classData.status === 'active' ? 'default' : 'secondary'}>
                  {classData.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Current status
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Location</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-sm">
                {classData.location || 'Not set'}
              </div>
              <p className="text-xs text-muted-foreground">
                Class location
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Class Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Description</label>
                    <p className="mt-1 text-sm text-gray-900">{classData.description}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Grade Levels</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {formatGradeLevels(classData.gradeLevels || classData.gradeLevel)}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Category</label>
                    <p className="mt-1 text-sm text-gray-900">{classData.category}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Instructor</label>
                    <p className="mt-1 text-sm text-gray-900">{classData.instructorName || 'Not assigned'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Schedule & Dates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Start Date</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {classData.startDate ? formatDate(classData.startDate) : 'Not set'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">End Date</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {classData.endDate ? formatDate(classData.endDate) : 'Not set'}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Schedule</label>
                    <p className="mt-1 text-sm text-gray-900">{formatClassSchedule(classData.schedule, true) || 'Not specified'}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Capacity</label>
                    <p className="mt-1 text-sm text-gray-900">{classData.capacity || 'Unlimited'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="students" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Enrolled Students</CardTitle>
                <CardDescription>
                  Students currently enrolled in this class
                </CardDescription>
              </CardHeader>
              <CardContent>
                {studentsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : students.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Parent Email</TableHead>
                        <TableHead>Enrollment Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((student: any) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">
                            {student.childName}
                          </TableCell>
                          <TableCell>{student.parentEmail}</TableCell>
                          <TableCell>
                            {formatDate(student.enrollmentDate)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">{student.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Users className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No students enrolled</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      This class doesn't have any students enrolled yet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Class Schedule</CardTitle>
                <CardDescription>
                  Detailed schedule information for this class
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Check if schedule has variants */}
                {(() => {
                  let scheduleData = classData.schedule;
                  
                  // Parse JSON string if needed
                  if (typeof scheduleData === 'string') {
                    try {
                      scheduleData = JSON.parse(scheduleData);
                    } catch (e) {
                      // Not JSON, keep as string
                    }
                  }
                  
                  // If has variants, show them in a list
                  if (scheduleData && scheduleData.variants && Array.isArray(scheduleData.variants) && scheduleData.variants.length > 0) {
                    return (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-500">
                            <Calendar className="inline mr-1 h-4 w-4" />
                            Time Options ({scheduleData.variants.length} {scheduleData.variants.length === 1 ? 'option' : 'options'})
                          </label>
                          <div className="mt-2 space-y-2">
                            {scheduleData.variants.map((variant: any, index: number) => (
                              <div key={index} className="p-3 border rounded-lg bg-gray-50">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium text-sm">{variant.name}</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {variant.days?.join(', ')} • {variant.startTime} - {variant.endTime}
                                    </p>
                                  </div>
                                  <p className="text-sm font-semibold text-green-600">
                                    ${(variant.price / 100).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">
                            <Clock className="inline mr-1 h-4 w-4" />
                            Duration
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {classData.startDate && classData.endDate
                              ? `${formatDate(classData.startDate)} - ${formatDate(classData.endDate)}`
                              : 'Duration not specified'
                            }
                          </p>
                        </div>
                      </>
                    );
                  }
                  
                  // Otherwise show standard schedule format
                  return (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-gray-500">
                          <Calendar className="inline mr-1 h-4 w-4" />
                          Schedule Details
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {formatClassSchedule(classData.schedule) || 'Schedule not specified'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">
                          <Clock className="inline mr-1 h-4 w-4" />
                          Duration
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {classData.startDate && classData.endDate
                            ? `${formatDate(classData.startDate)} - ${formatDate(classData.endDate)}`
                            : 'Duration not specified'
                          }
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {classData.startTime && classData.endTime && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      <Clock className="inline mr-1 h-4 w-4" />
                      Time
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {classData.startTime} - {classData.endTime}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}