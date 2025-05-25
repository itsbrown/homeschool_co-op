import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, Users, BookOpen, Calendar, DollarSign, BarChart2 } from "lucide-react";
import AIGenerationCard from "@/components/dashboard/AIGenerationCard";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: curriculaData, isLoading: curriculaLoading } = useQuery({
    queryKey: ["/api/curricula"],
    queryFn: () => fetch("/api/curricula").then(res => res.json()),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users/stats"],
    queryFn: () => fetch("/api/users/stats").then(res => res.json()).catch(() => ({ total: 0, byRole: {} })),
  });

  const { data: programStats, isLoading: programsLoading } = useQuery({
    queryKey: ["/api/programs/stats"],
    queryFn: () => fetch("/api/programs/stats").then(res => res.json()).catch(() => ({ total: 0, enrollments: 0 })),
  });

  const { data: classStats, isLoading: classesLoading } = useQuery({
    queryKey: ["/api/admin-classes/stats"],
    queryFn: () => fetch("/api/admin-classes/stats").then(res => res.json()).catch(() => ({ total: 0, published: 0 })),
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/classes/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add New Class
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/users">
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usersLoading ? "Loading..." : usersData?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across all roles
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Programs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{programsLoading ? "Loading..." : programStats?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {programsLoading ? "" : `${programStats?.enrollments || 0} total enrollments`}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Classes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{classesLoading ? "Loading..." : classStats?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {classesLoading ? "" : `${classStats?.published || 0} published`}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Curricula</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{curriculaLoading ? "Loading..." : curriculaData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Available for lessons
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AIGenerationCard />
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common administrative tasks</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/admin/classes">
                    <BookOpen className="h-5 w-5 mb-1" />
                    <span>Manage Classes</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/admin/programs">
                    <Calendar className="h-5 w-5 mb-1" />
                    <span>Manage Programs</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/admin/marketplace">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span>Marketplace</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/admin/analytics">
                    <BarChart2 className="h-5 w-5 mb-1" />
                    <span>Analytics</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {usersLoading ? (
                  <div>Loading user statistics...</div>
                ) : (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Admins</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usersData?.byRole?.admin || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Educators</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usersData?.byRole?.educator || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Parents</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usersData?.byRole?.parent || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Learners</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usersData?.byRole?.learner || 0}</div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
              <div className="flex justify-end">
                <Button asChild>
                  <Link href="/admin/users">View All Users</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Management</CardTitle>
              <CardDescription>Manage educational content and resources</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/curriculum">
                    <BookOpen className="h-8 w-8 mb-2" />
                    <span>Manage Curricula</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/knowledge-base">
                    <BookOpen className="h-8 w-8 mb-2" />
                    <span>Knowledge Base</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-32 flex flex-col justify-center items-center">
                  <Link href="/admin/classes">
                    <Calendar className="h-8 w-8 mb-2" />
                    <span>Manage Classes</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Dashboard</CardTitle>
              <CardDescription>View platform usage and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <BarChart2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Analytics Visualization</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Detailed analytics dashboard is in development
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/admin/analytics">View Full Analytics</Link>
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