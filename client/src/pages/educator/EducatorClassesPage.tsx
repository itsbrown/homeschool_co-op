import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { Link } from "wouter";
import { 
  BookOpen, 
  Users, 
  Calendar, 
  MapPin, 
  Clock, 
  Eye, 
  Search,
  GraduationCap
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

export default function EducatorClassesPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // Get educator's assigned classes using authenticated endpoint
  const { data: classesData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/educator/my-classes"],
  });

  // Transform data to match the expected format
  const transformedClasses = (classesData ?? []).map((classItem: any) => {
    // Parse schedule from the legacy format
    let scheduleStr = 'Schedule TBD';
    if (classItem.schedule?.variants?.[0]) {
      const variant = classItem.schedule.variants[0];
      const days = variant.days?.join(', ') || '';
      if (days && variant.startTime && variant.endTime) {
        scheduleStr = `${days} ${variant.startTime}-${variant.endTime}`;
      }
    }
    
    // Determine status based on dates
    const now = new Date();
    const validFrom = classItem.validFrom ? new Date(classItem.validFrom) : null;
    const validTo = classItem.validTo ? new Date(classItem.validTo) : null;
    
    let status = 'active';
    if (validTo && now > validTo) {
      status = 'completed';
    } else if (validFrom && now < validFrom) {
      status = 'upcoming';
    }
    
    return {
      id: classItem.id,
      title: classItem.title,
      description: classItem.description,
      schedule: scheduleStr,
      location: classItem.location,
      capacity: classItem.capacity,
      enrollmentCount: classItem.enrollmentCount || 0,
      status,
      startDate: classItem.validFrom,
      endDate: classItem.validTo,
      category: classItem.category,
      isPrimary: true,
      canStartSession: true
    };
  });

  const filteredClasses = transformedClasses.filter((classItem: any) =>
    classItem.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    classItem.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeClasses = filteredClasses.filter((cls: any) => cls.status === 'active');
  const upcomingClasses = filteredClasses.filter((cls: any) => cls.status === 'upcoming');
  const completedClasses = filteredClasses.filter((cls: any) => cls.status === 'completed');

  const ClassTable = ({ classes, title }: { classes: any[], title: string }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>
          {classes.length} class{classes.length !== 1 ? 'es' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {classes.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Details</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classItem) => (
                  <TableRow key={classItem.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{classItem.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {classItem.category}
                        </div>
                        {classItem.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {classItem.description.substring(0, 100)}
                            {classItem.description.length > 100 && '...'}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {classItem.startDate ? formatDate(classItem.startDate) : 'TBD'}
                            {classItem.endDate && ` - ${formatDate(classItem.endDate)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {classItem.schedule || 'Schedule TBD'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span className="text-sm">
                          {classItem.enrollmentCount || 0}/{classItem.maxStudents || classItem.capacity || 20}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        enrolled
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
                        classItem.status === 'upcoming' ? 'secondary' : 
                        classItem.status === 'completed' ? 'outline' : 'outline'
                      }>
                        {classItem.status || 'draft'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/educator/classes/${classItem.id}`}>
                          <Button size="sm" variant="outline">
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Classes</h3>
            <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
              No {title.toLowerCase()} found.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
          <p className="text-gray-600 mt-1">Classes you are teaching or scheduled to teach</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeClasses.length}</div>
            <p className="text-xs text-muted-foreground">Currently teaching</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredClasses.reduce((total: number, cls: any) => total + (cls.enrollmentCount || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Across all classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Classes</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingClasses.length}</div>
            <p className="text-xs text-muted-foreground">Starting soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search classes by name or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Classes Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Active ({activeClasses.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingClasses.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedClasses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <ClassTable classes={activeClasses} title="Active Classes" />
        </TabsContent>

        <TabsContent value="upcoming">
          <ClassTable classes={upcomingClasses} title="Upcoming Classes" />
        </TabsContent>

        <TabsContent value="completed">
          <ClassTable classes={completedClasses} title="Completed Classes" />
        </TabsContent>
      </Tabs>
    </div>
  );
}