import React, { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { ProgramList } from "@/components/registration/ProgramList";
import { ProgramEnrollmentForm } from "@/components/registration/ProgramEnrollmentForm";
import { EnrollmentList } from "@/components/registration/EnrollmentList";
import { Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, DollarSign, BookOpen, Users, Filter, Sparkles, CalendarDays, Backpack } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";

// Separate component for Programs content to avoid hooks issues
function ProgramsContent({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Get childId from URL query parameters if present
  const urlParams = new URLSearchParams(window.location.search);
  const childId = urlParams.get('childId');

  // Fetch categories for classes
  const { data: classCategories = [] } = useQuery<string[]>({
    queryKey: ["/api/classes/categories/names"],
    enabled: true,
  });

  // Fetch classes with filters
  interface ClassData {
    id: number;
    title: string;
    description: string;
    price: number;
    category: string;
    categoryName: string;
    startDate?: string;
    endDate?: string;
    numSessions?: number;
    totalOrders: number;
    totalWaitlisted: number;
  }

  interface ClassesResponse {
    classes: ClassData[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
    }
  }

  const { data: classesData = { classes: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 } }, isLoading: classesLoading } = useQuery<ClassesResponse>({
    queryKey: ["/api/classes", { page: currentPage, limit: 12, search: searchTerm, category: categoryFilter }],
    enabled: activeTab === "classes" || activeTab === "all",
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount / 100);
  };

  // Check if there are any summer camp classes
  const summerCamps = classesData.classes.filter(c => c.category === "summer-camp");
  const classesList = classesData.classes.filter(c => c.category === "academic" || c.category === "membership");

  return (
    <div className="space-y-6">
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Offerings</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="camps">Summer Camps</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Programs Card */}
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Academic Programs</CardTitle>
                  <CardDescription>Long-term structured learning paths</CardDescription>
                </div>
                <BookOpen className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent className="flex-1">
                <p>Our academic programs provide comprehensive educational paths designed to build skills progressively.</p>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => setActiveTab("programs")}>Browse Programs</Button>
              </CardFooter>
            </Card>

            {/* Classes Card */}
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Classes</CardTitle>
                  <CardDescription>Individual classes and short courses</CardDescription>
                </div>
                <Users className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent className="flex-1">
                <p>Join our wide variety of individual classes on specific topics, from science to arts and more.</p>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => setActiveTab("classes")}>Browse Classes</Button>
              </CardFooter>
            </Card>

            {/* Summer Camps Card */}
            <Card className="flex flex-col md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between bg-primary/5 rounded-t-lg">
                <div>
                  <CardTitle>Summer Camps 2025</CardTitle>
                  <CardDescription>Engaging summer learning experiences</CardDescription>
                </div>
                <Sparkles className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent className="flex-1">
                <p className="mb-4">Our summer camps offer immersive learning experiences during school breaks. Discover creativity, technology, and outdoor adventures!</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-primary/5">STEM Exploration</Badge>
                  <Badge variant="outline" className="bg-primary/5">Art & Design</Badge>
                  <Badge variant="outline" className="bg-primary/5">Coding Adventures</Badge>
                  <Badge variant="outline" className="bg-primary/5">Outdoor Learning</Badge>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => setActiveTab("camps")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Explore Summer Camps
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Featured Programs Section */}
          <h3 className="text-xl font-bold mt-8">Featured Programs</h3>
          <div className="space-y-4">
            <ProgramList isAdmin={isAdmin} childId={childId || undefined} limit={3} featured={true} />
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setActiveTab("programs")}>View All Programs</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="programs">
          <ProgramList isAdmin={isAdmin} childId={childId || undefined} />
        </TabsContent>

        <TabsContent value="classes">
          <div className="space-y-6">
            {/* Search & Filter */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle>Search Classes</CardTitle>
                <CardDescription>Find the perfect class for your child</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="search">Search</Label>
                    <Input
                      id="search"
                      placeholder="Search by title or description"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="programType">Program</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger id="programType">
                        <SelectValue placeholder="Any program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any program</SelectItem>
                        {classCategories.map((cat: string) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-3 flex justify-end gap-2">
                    {(searchTerm || (categoryFilter && categoryFilter !== 'all')) && (
                      <Button variant="outline" type="button" onClick={() => {
                        setSearchTerm("");
                        setCategoryFilter("all");
                      }}>
                        Clear Filters
                      </Button>
                    )}
                    <Button type="submit">Search</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Classes Grid */}
            {classesLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                <span className="ml-2">Loading classes...</span>
              </div>
            ) : classesList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classesList.map((classItem: ClassData) => (
                  <Card key={classItem.id} className="flex flex-col h-full">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between">
                        <CardTitle className="line-clamp-2">{classItem.title}</CardTitle>
                        <Badge variant={classItem.category === "academic" ? "default" : "secondary"}>
                          {classItem.category === "academic" ? "Academic" : "Membership"}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">{classItem.description || "No description provided"}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center"><DollarSign className="h-4 w-4 mr-1 opacity-70" />Price:</div>
                          <div className="font-semibold">{formatCurrency(classItem.price)}</div>
                        </div>

                        {classItem.totalOrders > 0 && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><Users className="h-4 w-4 mr-1 opacity-70" />Enrolled:</div>
                            <div className="font-medium">{classItem.totalOrders}</div>
                          </div>
                        )}

                        {classItem.numSessions && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><BookOpen className="h-4 w-4 mr-1 opacity-70" />Sessions:</div>
                            <div className="font-medium">{classItem.numSessions}</div>
                          </div>
                        )}

                        {(classItem.startDate && classItem.endDate) && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><CalendarIcon className="h-4 w-4 mr-1 opacity-70" />Dates:</div>
                            <div className="font-medium">
                              {new Date(classItem.startDate).toLocaleDateString()} - {new Date(classItem.endDate).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full">
                        Enroll Now
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Filter className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium">No classes found</h3>
                <p className="text-muted-foreground mt-2">
                  Try adjusting your filters or search term
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// This component uses the useAuth hook to manage authentication and redirects non-authenticated users to the login page.
export default function ProgramsParentPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth0();
  const isAdmin = user?.role === 'admin';

  // Redirect if not authenticated using useEffect instead of during render
  React.useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      setLocation('/login');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Programs</h2>
            <p className="text-muted-foreground">
              Browse and register for available programs and classes
            </p>
          </div>
        </div>

        <Switch>
          <Route path="/programs/enroll">
            <ProgramEnrollmentForm />
          </Route>
          <Route path="/programs/enrollments">
            <EnrollmentList />
          </Route>
          <Route path="/programs/enrollments/:childId">
            {(params) => (
              <EnrollmentList childId={parseInt(params.childId)} />
            )}
          </Route>
          <Route path="/programs">
            <ProgramsContent isAdmin={isAdmin} />
          </Route>
        </Switch>
      </div>
    </ParentAppShell>
  );
}