import React from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { Redirect, Link } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Calendar, School, BookOpen, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// Child Enrollments Component
function ChildEnrollments({ childId }: { childId: number }) {
  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: [`/api/children/${childId}/enrollments`],
    enabled: !!childId,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!enrollments || enrollments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <p>No active enrollments found</p>
        <p className="text-sm">Browse our programs to find the perfect fit</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {enrollments.map((enrollment: any) => (
        <div key={enrollment.id} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium">{enrollment.className}</h4>
              <p className="text-sm text-muted-foreground">
                Enrolled on {new Date(enrollment.enrollmentDate).toLocaleDateString()}
              </p>
            </div>
            <Badge 
              variant={enrollment.status === 'enrolled' ? 'default' : 'secondary'}
              className={enrollment.status === 'enrolled' ? 'bg-green-100 text-green-800' : ''}
            >
              {enrollment.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  parentEmail?: string;
  school?: string;
  learningStyle?: string;
  interests?: string[];
  age?: number;
}

export default function ChildrenPage() {
  const { user, isAuthenticated } = useAuth();
  
  // Fetch children data - always call the hook
  const { data: children = [], isLoading: isLoadingChildren } = useQuery<Child[]>({
    queryKey: ["/api/parent/children"],
    enabled: isAuthenticated,
  });
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  return (
    <ParentAppShell>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Children</h1>
            <p className="text-muted-foreground mt-1">
              Manage your children's profiles and program enrollments
            </p>
          </div>
          <Button asChild>
            <Link href="/children/register">
              <UserPlus className="mr-2 h-4 w-4" />
              Register New Child
            </Link>
          </Button>
        </div>
        
        <Tabs defaultValue="profiles">
          <TabsList className="mb-4">
            <TabsTrigger value="profiles">Child Profiles</TabsTrigger>
            <TabsTrigger value="enrollments">Program Enrollments</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profiles">
            {isLoadingChildren ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : children && children.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {children.map((child: any) => (
                  <Card key={child.id}>
                    <CardHeader>
                      <CardTitle>{child.firstName} {child.lastName}</CardTitle>
                      <CardDescription>
                        Age: {child.age} • Grade: {child.gradeLevel}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <School className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>School: {child.school || "Not specified"}</span>
                        </div>
                        <div className="flex items-center">
                          <BookOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>Learning Style: {child.learningStyle || "Not specified"}</span>
                        </div>
                      </div>
                      <Separator className="my-4" />
                      <div className="flex flex-wrap gap-2">
                        {child.interests && (() => {
                          // Handle both string and array formats for interests
                          const interestsArray = Array.isArray(child.interests) 
                            ? child.interests 
                            : typeof child.interests === 'string' 
                              ? child.interests.split(',').map((i: string) => i.trim())
                              : [];
                          
                          return interestsArray.map((interest: string, i: number) => (
                            <Badge key={i} variant="secondary">{interest}</Badge>
                          ));
                        })()}
                        {(!child.interests || (Array.isArray(child.interests) ? child.interests.length === 0 : !child.interests.trim())) && (
                          <span className="text-sm text-muted-foreground">No interests specified</span>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="outline" asChild>
                        <Link href={`/children/${child.id}/edit`}>Edit Profile</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href={`/children/${child.id}/enrollments`}>View Enrollments</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No Children Registered</CardTitle>
                  <CardDescription>
                    You haven't registered any children yet. Register a child to get started.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center py-6">
                  <Button asChild>
                    <Link href="/children/register">
                      <Plus className="mr-2 h-4 w-4" />
                      Register Child
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="enrollments">
            {isLoadingChildren ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : children && children.length > 0 ? (
              <div className="space-y-6">
                {children.map((child: any) => (
                  <Card key={child.id} className="overflow-hidden">
                    <CardHeader className="bg-muted/50">
                      <CardTitle>{child.firstName} {child.lastName}'s Enrollments</CardTitle>
                      <CardDescription>
                        View and manage program enrollments
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {/* We'll need to fetch the enrollments for each child */}
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold">Current Enrollments</h3>
                          <Button size="sm" asChild>
                            <Link href={`/programs?childId=${child.id}`}>
                              <Plus className="mr-2 h-3 w-3" />
                              Enroll in Program
                            </Link>
                          </Button>
                        </div>
                        
                        <ChildEnrollments childId={child.id} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No Children Registered</CardTitle>
                  <CardDescription>
                    You need to register a child before enrolling in programs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center py-6">
                  <Button asChild>
                    <Link href="/children/register">
                      <Plus className="mr-2 h-4 w-4" />
                      Register Child
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}