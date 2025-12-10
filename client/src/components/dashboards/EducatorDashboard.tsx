import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, BookOpen, Users, Calendar, GraduationCap, FileText, Eye, Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth0";
import { useSupabaseAuth } from "@/components/SupabaseProvider";
import { formatDate, formatClassSchedule } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import { WeeklyCalendarContent } from "@/pages/educator/WeeklyCalendar";

export default function EducatorDashboard() {
  const { user: auth0User } = useAuth();
  const { user: supabaseUser } = useSupabaseAuth();
  const user = auth0User || supabaseUser;
  const { activeRole } = useRole(); // Assuming this hook provides the active role
  const [activeTab, setActiveTab] = useState("classes");

  console.log('🎓 EducatorDashboard rendering for role:', activeRole, 'user:', user?.email);

  // Determine the dashboard title and greeting based on role
  const getDashboardTitle = () => {
    switch (activeRole) {
      case 'superAdmin':
        return 'Super Admin Dashboard';
      case 'admin':
        return 'Admin Dashboard';
      case 'educator':
        return 'Educator Dashboard';
      default:
        return 'Dashboard';
    }
  };

  const getWelcomeMessage = () => {
    switch (activeRole) {
      case 'superAdmin':
        return 'Welcome back, Super Admin';
      case 'admin':
        return 'Welcome back, Admin';
      case 'educator':
        return 'Welcome back, Educator';
      default:
        return 'Welcome back';
    }
  };

  // Get educator's assigned classes
  const { data: assignedClasses, isLoading: classesLoading } = useQuery({
    queryKey: ["/api/educator/classes", user?.email],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/educator/classes?email=${user?.email}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch classes");
      return response.json();
    },
    enabled: !!user?.email,
  });

  // Get students for educator's classes
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["/api/educator/students", user?.email],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/educator/students?email=${user?.email}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch students");
      return response.json();
    },
    enabled: !!user?.email,
  });

  return (
    <div className="flex flex-col space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">{getDashboardTitle()}</h1>
          <p className="text-lg text-gray-600 mt-2">{getWelcomeMessage()}</p>
          <p className="text-sm text-gray-500">Role: {activeRole} | {(user as any)?.user_metadata?.name || user?.email}</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classesLoading ? "..." : assignedClasses?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Active classes assigned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {studentsLoading ? "..." : studentsData?.totalStudents || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all classes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classesLoading ? "..." : assignedClasses?.filter((c: any) => c.status === 'active')?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Classes this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {classesLoading ? "..." : assignedClasses?.filter((c: any) => c.status === 'upcoming')?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Starting soon
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="classes">My Classes</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Assigned Classes</CardTitle>
              <CardDescription>
                Classes you are currently teaching or scheduled to teach
              </CardDescription>
            </CardHeader>
            <CardContent>
              {classesLoading ? (
                <div className="space-y-2">
                  {Array(3).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : assignedClasses && assignedClasses.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class Name</TableHead>
                        <TableHead>Schedule</TableHead>
                        <TableHead>Students</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignedClasses.map((classItem: any) => (
                        <TableRow key={classItem.id}>
                          <TableCell className="font-medium">
                            <div>
                              <div className="font-semibold">{classItem.title}</div>
                              <div className="text-sm text-muted-foreground">
                                {classItem.category}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              <div>
                                {classItem.startDate ? formatDate(classItem.startDate) : 'TBD'} - {classItem.endDate ? formatDate(classItem.endDate) : 'TBD'}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatClassSchedule(classItem.schedule) || 'Schedule TBD'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {classItem.enrollmentCount || 0}/{classItem.maxStudents || classItem.capacity || 20}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3" />
                              {classItem.location || 'TBD'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              classItem.status === 'active' ? 'default' :
                              classItem.status === 'upcoming' ? 'secondary' : 'outline'
                            }>
                              {classItem.status || 'draft'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">
                              <Eye className="h-3 w-3 mr-1" />
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No Classes Assigned</h3>
                  <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
                    You haven't been assigned to any classes yet. Contact your school administrator.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Students</CardTitle>
              <CardDescription>
                Students enrolled in your classes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {studentsLoading ? (
                <div className="space-y-2">
                  {Array(5).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : studentsData && studentsData.students && studentsData.students.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Grade Level</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Parent Contact</TableHead>
                        <TableHead>Enrollment Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsData.students.map((student: any) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">
                            {student.firstName} {student.lastName}
                          </TableCell>
                          <TableCell>{student.gradeLevel}</TableCell>
                          <TableCell>{student.className}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {student.parentEmail}
                            </div>
                          </TableCell>
                          <TableCell>
                            {student.enrollmentDate ? formatDate(student.enrollmentDate) : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8">
                  <Users className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No Students Yet</h3>
                  <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
                    No students are enrolled in your classes yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <WeeklyCalendarContent showBirthdays={false} showQuickActions={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}