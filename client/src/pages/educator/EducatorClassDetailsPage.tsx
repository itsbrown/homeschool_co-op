import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useAuth, supabase } from "@/components/SupabaseProvider";
import { Link } from "wouter";
import { 
  BookOpen, 
  Users, 
  Calendar, 
  MapPin, 
  Clock, 
  ArrowLeft,
  GraduationCap,
  DollarSign,
  User
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

export default function EducatorClassDetailsPage() {
  const { user } = useAuth();
  const [match, params] = useRoute("/educator/classes/:id");
  const classId = params?.id;

  // Helper to get the auth token
  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  // Get class details using authenticated educator endpoint
  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ["/api/educator/classes", classId],
    queryFn: async () => {
      const token = await getAuthToken();
      const response = await fetch(`/api/educator/classes/${classId}`, {
        credentials: "include",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        }
      });
      if (!response.ok) throw new Error("Failed to fetch class");
      return response.json();
    },
    enabled: !!classId,
  });

  // Get enrolled students for this class using authenticated endpoint
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["/api/educator/classes", classId, "students"],
    queryFn: async () => {
      const token = await getAuthToken();
      const response = await fetch(`/api/educator/classes/${classId}/students`, {
        credentials: "include",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        }
      });
      if (!response.ok) throw new Error("Failed to fetch students");
      return response.json();
    },
    enabled: !!classId,
  });

  if (classLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Class Not Found</h2>
          <p className="text-gray-600 mt-2">The class you're looking for doesn't exist or you don't have access to it.</p>
          <Link href="/educator/classes">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Classes
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/educator/classes">
          <Button variant="outline" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to My Classes
          </Button>
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{classData.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center">
                <GraduationCap className="h-4 w-4 mr-1" />
                {classData.gradeLevel}
              </div>
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                {classData.location}
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {classData.schedule}
              </div>
            </div>
          </div>
          <Badge className={getStatusColor(classData.status)}>
            {classData.status?.charAt(0).toUpperCase() + classData.status?.slice(1)}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students ({studentsData?.students?.length || 0})</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Class Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BookOpen className="h-5 w-5 mr-2" />
                  Class Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Description</p>
                  <p className="text-sm text-gray-900 mt-1">{classData.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Category</p>
                    <p className="text-sm text-gray-900">{classData.category}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Price</p>
                    <p className="text-sm text-gray-900">${(classData.price / 100).toFixed(2)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Start Date</p>
                    <p className="text-sm text-gray-900">{formatDate(classData.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">End Date</p>
                    <p className="text-sm text-gray-900">{formatDate(classData.endDate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enrollment Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Enrollment Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Enrolled Students</p>
                    <p className="text-2xl font-bold text-blue-600">{classData.enrollmentCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Max Capacity</p>
                    <p className="text-2xl font-bold text-gray-900">{classData.capacity || classData.maxStudents}</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full" 
                    style={{ 
                      width: `${((classData.enrollmentCount || 0) / (classData.capacity || classData.maxStudents || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500">
                  {classData.capacity - (classData.enrollmentCount || 0)} spots remaining
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Enrolled Students
              </CardTitle>
              <CardDescription>
                Students enrolled in this class
              </CardDescription>
            </CardHeader>
            <CardContent>
              {studentsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : studentsData?.students?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Grade Level</TableHead>
                      <TableHead>Parent Email</TableHead>
                      <TableHead>Enrollment Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentsData.students.map((student: any) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-2 text-gray-400" />
                            {student.firstName} {student.lastName}
                          </div>
                        </TableCell>
                        <TableCell>
                          {student.birthdate ? 
                            new Date().getFullYear() - new Date(student.birthdate).getFullYear() 
                            : 'N/A'
                          }
                        </TableCell>
                        <TableCell>{student.gradeLevel}</TableCell>
                        <TableCell>{student.parentEmail}</TableCell>
                        <TableCell>{formatDate(student.enrollmentDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Enrolled</h3>
                  <p className="text-gray-600">This class doesn't have any enrolled students yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Class Schedule
              </CardTitle>
              <CardDescription>
                Meeting times and schedule details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Schedule</p>
                <p className="text-lg text-gray-900">{classData.schedule}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Duration</p>
                  <p className="text-sm text-gray-900">
                    {formatDate(classData.startDate)} - {formatDate(classData.endDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Location</p>
                  <p className="text-sm text-gray-900">{classData.location}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}