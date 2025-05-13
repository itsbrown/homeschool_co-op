import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, BookOpen, Users, Calendar, GraduationCap, FileText } from "lucide-react";
import AIGenerationCard from "@/components/dashboard/AIGenerationCard";
import { useAuth } from "@/hooks/useAuth";

export default function EducatorDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: curriculaData, isLoading: curriculaLoading } = useQuery({
    queryKey: ["/api/curricula/author", user?.id],
    queryFn: () => fetch(`/api/curricula/author/${user?.id}`).then(res => res.json()).catch(() => []),
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery({
    queryKey: ["/api/lessons/author", user?.id],
    queryFn: () => fetch(`/api/lessons/author/${user?.id}`).then(res => res.json()).catch(() => []),
  });

  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ["/api/classes/instructor", user?.id],
    queryFn: () => fetch(`/api/classes/instructor/${user?.id}`).then(res => res.json()).catch(() => []),
  });

  const { data: programsData, isLoading: programsLoading } = useQuery({
    queryKey: ["/api/programs/instructor", user?.id],
    queryFn: () => fetch(`/api/programs/instructor/${user?.id}`).then(res => res.json()).catch(() => []),
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Educator Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/lessons/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Lesson
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/programs/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Program
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">My Content</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">My Curricula</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{curriculaLoading ? "Loading..." : curriculaData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Created curricula
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">My Lessons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lessonsLoading ? "Loading..." : lessonsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Created lessons
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">My Classes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{classesLoading ? "Loading..." : classesData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active classes
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">My Programs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{programsLoading ? "Loading..." : programsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active programs
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AIGenerationCard />
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common educator tasks</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/lessons/ai-generator">
                    <BookOpen className="h-5 w-5 mb-1" />
                    <span>Generate Lesson</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/students">
                    <Users className="h-5 w-5 mb-1" />
                    <span>View Students</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/schedule">
                    <Calendar className="h-5 w-5 mb-1" />
                    <span>My Schedule</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/assessments">
                    <FileText className="h-5 w-5 mb-1" />
                    <span>Assessments</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Teaching Content</CardTitle>
              <CardDescription>Manage your educational content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/curriculum">
                    <BookOpen className="h-8 w-8 mb-2" />
                    <span>My Curricula</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/lessons">
                    <FileText className="h-8 w-8 mb-2" />
                    <span>My Lessons</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/knowledge-base">
                    <GraduationCap className="h-8 w-8 mb-2" />
                    <span>Knowledge Base</span>
                  </Link>
                </Button>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" asChild>
                  <Link href="/marketplace">Browse Marketplace</Link>
                </Button>
                <Button asChild>
                  <Link href="/lessons/ai-generator">Generate New Lesson</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Students</CardTitle>
              <CardDescription>View and manage your students</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Student Management</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    View student profiles, progress, and assessments
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/students">View All Students</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Schedule</CardTitle>
              <CardDescription>View and manage your teaching schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Calendar View</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Manage your classes, programs, and events
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/schedule">View Full Schedule</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}