import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, Calendar, Award, Clock, GraduationCap, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth0";
import { Progress } from "@/components/ui/progress";

export default function LearnerDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["/api/enrollments/me"],
    queryFn: () => fetch("/api/enrollments/me").then(res => res.json()).catch(() => []),
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery({
    queryKey: ["/api/lessons/assigned"],
    queryFn: () => fetch("/api/lessons/assigned").then(res => res.json()).catch(() => []),
  });

  const { data: badgesData, isLoading: badgesLoading } = useQuery({
    queryKey: ["/api/badges/me"],
    queryFn: () => fetch("/api/badges/me").then(res => res.json()).catch(() => []),
  });

  const { data: upcomingEventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events/upcoming/me"],
    queryFn: () => fetch("/api/events/upcoming/me").then(res => res.json()).catch(() => []),
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Learning Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/lessons/explore">
              <BookOpen className="mr-2 h-4 w-4" />
              Explore Lessons
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lessons">My Lessons</TabsTrigger>
          <TabsTrigger value="progress">My Progress</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Lessons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lessonsLoading ? "Loading..." : lessonsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Assigned lessons
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Programs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{enrollmentsLoading ? "Loading..." : enrollmentsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enrolled programs
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{eventsLoading ? "Loading..." : upcomingEventsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In the next 7 days
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Badges</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{badgesLoading ? "Loading..." : badgesData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Earned achievements
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Continue Learning</CardTitle>
                <CardDescription>Pick up where you left off</CardDescription>
              </CardHeader>
              <CardContent>
                {lessonsLoading ? (
                  <div className="text-center py-8">Loading your lessons...</div>
                ) : lessonsData?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-2" />
                    <p>No lessons assigned yet</p>
                    <Button className="mt-4" asChild>
                      <Link href="/lessons/explore">Explore Lessons</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {lessonsData?.slice(0, 3).map((lesson, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium">{lesson.title}</h3>
                          <span className="text-xs text-muted-foreground">{lesson.progress || 0}% Complete</span>
                        </div>
                        <Progress value={lesson.progress || 0} className="h-2" />
                        <div className="flex justify-end mt-1">
                          <Button size="sm" asChild>
                            <Link href={`/lessons/${lesson.id}`}>Continue</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end mt-2">
                      <Button variant="link" asChild>
                        <Link href="/lessons">View All Lessons</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common learning tasks</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/schedule">
                    <Calendar className="h-5 w-5 mb-1" />
                    <span>My Schedule</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/badges">
                    <Award className="h-5 w-5 mb-1" />
                    <span>My Badges</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/assessments">
                    <GraduationCap className="h-5 w-5 mb-1" />
                    <span>Assessments</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/community">
                    <Users className="h-5 w-5 mb-1" />
                    <span>Community</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lessons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Learning Content</CardTitle>
              <CardDescription>Track your lesson progress</CardDescription>
            </CardHeader>
            <CardContent>
              {lessonsLoading ? (
                <div className="text-center py-8">Loading your lessons...</div>
              ) : lessonsData?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-2" />
                  <p>No lessons assigned yet</p>
                  <Button className="mt-4" asChild>
                    <Link href="/lessons/explore">Explore Lessons</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {lessonsData?.map((lesson, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">{lesson.title}</h3>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          {lesson.subject}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{lesson.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{lesson.progress || 0}% Complete</span>
                        <Button size="sm" asChild>
                          <Link href={`/lessons/${lesson.id}`}>Continue</Link>
                        </Button>
                      </div>
                      <Progress value={lesson.progress || 0} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Learning Progress</CardTitle>
              <CardDescription>Track your achievements and milestones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Progress Tracker</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Detailed progress tracking is in development
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/progress">View Detailed Progress</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Learning Community</CardTitle>
              <CardDescription>Connect with other learners</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Community Hub</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Join discussions and share your learning journey
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/community">Join Community</Link>
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