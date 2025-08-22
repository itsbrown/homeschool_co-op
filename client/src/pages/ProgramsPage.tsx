import { useState } from "react";
import { DashboardShell } from "../components/ui/dashboard-shell";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useAuth } from "@/hooks/useAuth0";
import { ProgramList } from "../components/registration/ProgramList";
import { ProgramEnrollmentForm } from "../components/registration/ProgramEnrollmentForm";
import { EnrollmentList } from "../components/registration/EnrollmentList";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, DollarSign, BookOpen, Users, Filter, Sparkles, CalendarDays, Backpack } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Separate component for Programs content to avoid hooks issues
function ProgramsContent({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Cart and enrollment states
  const { addItem, openCart } = useCart();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrollmentDialog, setEnrollmentDialog] = useState<{
    open: boolean;
    classId?: number;
    className?: string;
  }>({ open: false });
  const [selectedChildId, setSelectedChildId] = useState<string>("");

  // Get childId from URL query parameters if present
  const urlParams = new URLSearchParams(window.location.search);
  const childId = urlParams.get('childId');

  // Fetch categories for classes
  const { data: classCategories = [] } = useQuery<string[]>({
    queryKey: ["/api/classes/categories/names"],
    enabled: true,
  });
  
  // Fetch children (if not admin)
  const { data: children = [] } = useQuery<any[]>({
    queryKey: ["/api/parent/children"],
    enabled: !isAdmin,
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
  
  // Enrollment mutation
  const enrollmentMutation = useMutation({
    mutationFn: async ({ classId, childId }: { classId: number; childId: string }) => {
      return apiRequest('POST', `/api/classes/${classId}/enroll`, { childId: parseInt(childId) });
    },
    onSuccess: (data, variables) => {
      // Find the selected child and class data for cart item
      const selectedClass = classesData?.classes?.find(c => c.id === variables.classId);
      const selectedChild = children?.find((c: any) => c.id === parseInt(variables.childId));

      if (selectedClass && selectedChild) {
        console.log('🛒 Adding enrolled class to cart:', selectedClass.title);

        // Add the enrollment to the cart
        addItem({
          classId: variables.classId,
          className: selectedClass.title,
          childId: selectedChild.id,
          childName: `${selectedChild.firstName} ${selectedChild.lastName}`,
          price: selectedClass.price,
          description: selectedClass.description,
          startDate: selectedClass.startDate,
          endDate: selectedClass.endDate,
          status: 'pending_payment',
          statusText: 'Payment Required',
          enrollmentId: (data as any).enrollment?.id,
          totalCost: selectedClass.price,
          amountPaid: 0,
          remainingBalance: selectedClass.price
        }, true); // Skip validation to avoid race condition

        console.log('🛒 Item added to cart, triggering cart update...');

        toast({
          title: "Added to Cart! 🛒",
          description: `${selectedChild.firstName} enrolled in ${selectedClass.title}. Complete payment in your cart.`,
        });

        // Open cart to show the new item after a brief delay
        setTimeout(() => {
          openCart();
        }, 800);
      } else {
        toast({
          title: "Enrollment Successful",
          description: "Child has been enrolled in the class.",
        });
      }

      setEnrollmentDialog({ open: false });
      setSelectedChildId("");
      // Invalidate all enrollment-related queries
      queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
      queryClient.invalidateQueries({ queryKey: [`/api/enrollments/child/${variables.childId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/children/${variables.childId}/enrollments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/parent/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "There was an error enrolling your child in the class.",
        variant: "destructive",
      });
    },
  });

  // Handle enrollment button click
  const handleEnrollClick = (classItem: ClassData) => {
    if (!children || children.length === 0) {
      toast({
        title: "No Children Found",
        description: "Please add a child to your account before enrolling in classes.",
        variant: "destructive",
      });
      return;
    }
    
    setEnrollmentDialog({
      open: true,
      classId: classItem.id,
      className: classItem.title
    });
    setSelectedChildId("");
  };

  // Handle enrollment submission
  const handleEnrollSubmit = () => {
    if (!selectedChildId || !enrollmentDialog.classId) {
      toast({
        title: "Error",
        description: "Please select a child to enroll",
        variant: "destructive",
      });
      return;
    }

    enrollmentMutation.mutate({
      classId: enrollmentDialog.classId,
      childId: selectedChildId
    });
  };
  
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
                      <Button 
                        className="w-full" 
                        onClick={() => handleEnrollClick(classItem)}
                        disabled={isAdmin}
                      >
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
            
            {/* Pagination controls would go here */}
          </div>
        </TabsContent>
        
        <TabsContent value="camps">
          <div className="space-y-6">
            {/* Summer Camps Hero */}
            <div className="relative overflow-hidden rounded-lg bg-primary/10 py-8 px-6 mb-8">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-bold mb-2">Summer Camps 2025</h2>
                <p className="text-lg mb-4">
                  Exciting, educational, and engaging summer experiences for all ages.
                </p>
                <p className="mb-6">
                  Our summer camps combine fun activities with meaningful learning experiences, guided by expert instructors in a supportive environment.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">June - August 2025</Badge>
                  <Badge variant="secondary">Ages 5-16</Badge>
                  <Badge variant="secondary">Full & Half Day Options</Badge>
                </div>
              </div>
              <Sparkles className="absolute right-4 bottom-4 h-32 w-32 text-primary opacity-10" />
            </div>
            
            {/* Summer Camps Grid */}
            {classesLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                <span className="ml-2">Loading summer camps...</span>
              </div>
            ) : summerCamps.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {summerCamps.map((camp: ClassData) => (
                  <Card key={camp.id} className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                    <CardHeader className="pb-3 border-b border-primary/10">
                      <CardTitle className="text-xl">{camp.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{camp.description || "An exciting summer adventure"}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1">
                      <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          <Badge className="bg-primary/10 hover:bg-primary/20 text-foreground border-0">
                            <CalendarDays className="mr-1 h-3 w-3" /> 
                            {camp.numSessions} Sessions
                          </Badge>
                          
                          <Badge className="bg-primary/10 hover:bg-primary/20 text-foreground border-0">
                            <DollarSign className="mr-1 h-3 w-3" />
                            {formatCurrency(camp.price)}
                          </Badge>
                        </div>
                        
                        {(camp.startDate && camp.endDate) && (
                          <div className="flex items-center text-sm">
                            <CalendarIcon className="h-4 w-4 mr-2 opacity-70" />
                            <span className="font-medium">
                              {new Date(camp.startDate).toLocaleDateString()} - {new Date(camp.endDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        
                        <p className="text-sm">{camp.description}</p>
                        
                        {camp.totalOrders > 0 && (
                          <div className="text-sm text-muted-foreground">
                            {camp.totalOrders} already enrolled
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Button className="w-full">
                        <Backpack className="mr-2 h-4 w-4" />
                        Register for Camp
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium">No summer camps available yet</h3>
                <p className="text-muted-foreground mt-2">
                  Check back soon for our upcoming summer programs
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Enrollment Dialog */}
      <Dialog open={enrollmentDialog.open} onOpenChange={(open) => setEnrollmentDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll in {enrollmentDialog.className}</DialogTitle>
            <DialogDescription>
              Select which child you would like to enroll in this class.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="child">Child</Label>
            <Select 
              value={selectedChildId} 
              onValueChange={setSelectedChildId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children?.map((child: any) => (
                  <SelectItem 
                    key={child.id} 
                    value={child.id.toString()}
                  >
                    {child.firstName} {child.lastName} ({child.gradeLevel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => setEnrollmentDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleEnrollSubmit} 
              disabled={enrollmentMutation.isPending || !selectedChildId}
            >
              {enrollmentMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProgramsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: userRole } = useQuery({ queryKey: ["/api/auth/role"] });
  
  // If not authenticated, redirect to login
  if (!isLoading && !user) {
    window.location.href = "/login";
    return null;
  }

  const isAdmin = userRole === "admin";

  return (
    <DashboardShell>
      <div className="flex flex-col space-y-8 p-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Programs</h2>
            <p className="text-muted-foreground">
              Browse and register for available programs, classes, and camps
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
    </DashboardShell>
  );
}