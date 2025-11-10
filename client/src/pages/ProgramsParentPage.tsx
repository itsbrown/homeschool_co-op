import React, { useState } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useCart } from "@/contexts/CartContext";
import { ProgramList } from "@/components/registration/ProgramList";
import { ProgramEnrollmentForm } from "@/components/registration/ProgramEnrollmentForm";
import { EnrollmentList } from "@/components/registration/EnrollmentList";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, DollarSign, BookOpen, Users, Filter, Sparkles, CalendarDays, Backpack, ShoppingCart, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { formatClassSchedule } from "@/lib/utils";

// Separate component for Programs content to avoid hooks issues
function ProgramsContent({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState("classes");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [enrollmentDialog, setEnrollmentDialog] = useState<{ open: boolean; classId?: number; classTitle?: string; classData?: ClassData }>({ open: false });
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { addItem, hasItem, openCart, refreshCart } = useCart();
  // Use wouter's location hook for navigation
  const [, setLocation] = useLocation();

  // Get childId from URL query parameters if present
  const urlParams = new URLSearchParams(window.location.search);
  const childId = urlParams.get('childId');

  // Fetch categories for classes
  const { data: classCategories = [] } = useQuery<string[]>({
    queryKey: ["/api/classes/categories/names"],
    enabled: true,
  });

  // Fetch children for enrollment
  const { data: children = [], isLoading: childrenLoading, error: childrenError } = useQuery<any[]>({
    queryKey: ["/api/parent/children"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/parent/children');
      if (!response.ok) {
        throw new Error(`Failed to fetch children: ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    },
  });



  // Enrollment mutation
  const enrollmentMutation = useMutation({
    mutationFn: async ({ classId, childId, variantId }: { classId: number; childId: string; variantId?: string }) => {
      const response = await apiRequest('POST', `/api/classes/${classId}/enroll`, { 
        childId: parseInt(childId),
        variantId: variantId 
      });
      console.log('🎯 Raw API response:', response);
      
      // Parse the response as JSON if it's a Response object
      if (response instanceof Response) {
        const jsonData = await response.json();
        console.log('🎯 Parsed JSON data:', jsonData);
        return jsonData;
      }
      
      return response;
    },
    onSuccess: (data, variables) => {
      console.log('🎯 Enrollment success! Data:', data);
      console.log('🎯 Variables:', variables);
      console.log('🎯 Classes data:', classesData);
      console.log('🎯 Children:', children);
      
      // Find the selected child and class data for cart item
      const selectedClass = classesData?.classes?.find(c => c.id === variables.classId);
      const selectedChild = children?.find(c => c.id === parseInt(variables.childId));

      console.log('🎯 Found selected class:', selectedClass);
      console.log('🎯 Found selected child:', selectedChild);
      console.log('🎯 Enrollment from API:', data.enrollment);

      if (selectedClass && selectedChild && data.enrollment) {
        // Get the selected variant or use default pricing
        const selectedVariant = variables.variantId ? 
          selectedClass.variants?.find(v => v.id === variables.variantId) : 
          selectedClass.variants?.[0];
        
        const finalPrice = selectedVariant ? selectedVariant.price : selectedClass.price;

        // Add item to cart immediately for visual feedback, skip validation since we just created the enrollment
        const cartItem = {
          classId: variables.classId,
          className: selectedClass.title,
          childId: parseInt(variables.childId),
          childName: `${selectedChild.firstName} ${selectedChild.lastName}`,
          price: finalPrice, // Price is in dollars
          description: selectedClass.description,
          startDate: selectedClass.startDate,
          endDate: selectedClass.endDate,
          status: 'pending_payment',
          statusText: 'Payment Required',
          enrollmentId: data.enrollment.id,
          totalCost: finalPrice,
          amountPaid: 0,
          remainingBalance: finalPrice,
          variantId: variables.variantId,
          variantName: selectedVariant?.name
        };

        console.log('🛒 Adding enrollment to cart:', cartItem);

        addItem(cartItem, true); // Skip validation to avoid race condition

        console.log('🛒 Item added to cart, triggering cart update...');

        toast({
          title: "Added to Cart! 🛒",
          description: `${selectedChild.firstName} enrolled in ${selectedClass.title}. Complete payment in your cart.`,
        });

        // Open cart to show the new item after a brief delay
        setTimeout(() => {
          console.log('🛒 Opening cart...');
          openCart();
        }, 800);

        // Also store enrollment data for direct payment plans access
        const enrollmentData = {
          enrollmentId: data.enrollment.id,
          className: selectedClass.title,
          childName: `${selectedChild.firstName} ${selectedChild.lastName}`,
          totalCost: finalPrice,
          depositRequired: Math.round(finalPrice * 0.1),
          amountPaid: 0,
          remainingBalance: finalPrice
        };
        sessionStorage.setItem('enrollmentData', JSON.stringify(enrollmentData));
      } else {
        toast({
          title: "Enrollment Successful",
          description: "Child has been enrolled in the class.",
        });
      }

      setEnrollmentDialog({ open: false });
      setSelectedChildId("");
      setSelectedVariantId("");
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
    capacity?: number;
    totalOrders: number;
    totalWaitlisted: number;
    variants?: {
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      days: string[];
      price: number;
    }[];
  }

  interface ClassesResponse {
    classes: ClassData[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
    }
  }

  // Fetch school admin classes and transform the response
  const { data: schoolClassesResponse, isLoading: classesLoading, error: classesError } = useQuery({
    queryKey: ["/api/school-admin/classes"],
    enabled: activeTab === "classes" || activeTab === "all",
  });

  // Transform school admin classes data to match expected format
  // Filter out parent classes that have variants - parents should only see the individual variant classes
  const classesData: ClassesResponse = {
    classes: ((schoolClassesResponse as any)?.items || [])
      .filter((item: any) => {
        // Hide classes that have variants - these are parent classes
        // Parents should only see the individual variant classes like "Seekers | Half Day"
        return !item.variants || item.variants.length === 0;
      })
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price, // Keep price in dollars for cart compatibility
        category: 'academic', // Set all school admin classes as academic for now
        categoryName: item.category || 'Academic',
        startDate: item.startDate,
        endDate: item.endDate,
        numSessions: item.numSessions,
        capacity: item.capacity,
        totalOrders: item.enrollmentCount || 0,
        totalWaitlisted: 0,
        variants: item.variants || []
      })),
    pagination: {
      currentPage: (schoolClassesResponse as any)?.page || 1,
      totalPages: (schoolClassesResponse as any)?.totalPages || 1,
      totalItems: (schoolClassesResponse as any)?.total || 0
    }
  };

  // Debug logging
  console.log('School classes response:', schoolClassesResponse);
  console.log('Classes error:', classesError);
  console.log('Classes loading:', classesLoading);
  console.log('Active tab:', activeTab);
  console.log('Transformed classes data:', classesData);

  // Format currency (amount is always in cents)
  const formatCurrency = (amount: number, inCents: boolean = true) => {
    // Always divide by 100 since all prices are now stored in cents
    const dollars = amount / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(dollars);
  };


  // Check if there are any summer camp classes
  const summerCamps = classesData.classes.filter(c => c.category === "summer-camp");
  
  // Apply search and category filters to classes
  const classesList = classesData.classes.filter(c => {
    // Filter by category
    const matchesCategory = c.category === "academic" || c.category === "membership";
    
    // Filter by search term (search in title and description)
    const matchesSearch = !searchTerm || 
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filter by category filter dropdown
    const matchesCategoryFilter = !categoryFilter || 
      categoryFilter === 'all' || 
      c.categoryName === categoryFilter;
    
    return matchesCategory && matchesSearch && matchesCategoryFilter;
  });

  // Debug logging for filtered lists
  console.log('All classes:', classesData.classes);
  console.log('Search term:', searchTerm);
  console.log('Category filter:', categoryFilter);
  console.log('Filtered classesList:', classesList);
  console.log('Summer camps:', summerCamps);
  console.log('classesLoading:', classesLoading);
  console.log('classesList.length:', classesList.length);

  return (
    <div className="space-y-6">
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
                {classesList.map((classItem: ClassData, index) => (
                  <Card key={`${classItem.id}-${(classItem as any).variantId || 'main'}-${index}`} className="flex flex-col h-full">
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

                        {classItem.capacity && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><Users className="h-4 w-4 mr-1 opacity-70" />Capacity:</div>
                            <div className="font-medium">
                              <span className={classItem.totalOrders >= classItem.capacity ? "text-red-600" : "text-green-600"}>
                                {classItem.totalOrders || 0}
                              </span>
                              <span className="text-muted-foreground"> / {classItem.capacity}</span>
                            </div>
                          </div>
                        )}

                        {classItem.capacity && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><Users className="h-4 w-4 mr-1 opacity-70" />Spots Available:</div>
                            <div className="font-semibold">
                              {classItem.capacity - (classItem.totalOrders || 0) > 0 ? (
                                <span className="text-green-600">{classItem.capacity - (classItem.totalOrders || 0)}</span>
                              ) : (
                                <span className="text-red-600">Full</span>
                              )}
                            </div>
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
                    <CardFooter className="pt-0 flex gap-2">
                      <Button variant="outline" onClick={() => setLocation(`/parent/classes/${classItem.id}`)}>
                        View Details
                      </Button>
                      <Button 
                        onClick={() => {
                          console.log('🎯 Enroll Now clicked for class:', classItem);
                          setEnrollmentDialog({ open: true, classId: classItem.id, classTitle: classItem.title, classData: classItem });
                        }}
                        className="flex-1"
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
      </div>

      {/* Enrollment Dialog */}
      <Dialog open={enrollmentDialog.open} onOpenChange={(open) => {
        console.log("🔄 Dialog onOpenChange triggered, open:", open);
        setEnrollmentDialog({ open });
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll in Class</DialogTitle>
            <DialogDescription>
              Select which child you would like to enroll in "{enrollmentDialog.classTitle}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
                <Label htmlFor="child-select">Select Child</Label>
                <div className="text-xs text-muted-foreground mb-2">
                  Debug: Children: {Array.isArray(children) ? children.length : 0} | Auth: {isAuthenticated ? 'Yes' : 'No'} | Loading: {childrenLoading ? 'Yes' : 'No'} | User: {user?.email || 'None'}
                </div>
                {(() => {
                  console.log("🔄 Enrollment Dialog Debug:");
                  console.log("  - Children:", children);
                  console.log("  - Children loading:", childrenLoading);
                  console.log("  - Children error:", childrenError);
                  console.log("  - Is authenticated:", isAuthenticated);
                  console.log("  - User:", user);
                  return null;
                })()}

                {!isAuthenticated ? (
                  <div className="text-sm text-destructive">
                    Please log in to select a child for enrollment.
                  </div>
                ) : childrenLoading ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    Loading children...
                  </div>
                ) : childrenError ? (
                  <div className="text-sm text-destructive">
                    Error loading children: {childrenError?.message || 'Unknown error'}
                    <br />
                    <span className="text-xs">Please try logging out and back in.</span>
                  </div>
                ) : !children || children.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
                    <p className="mb-2">No children registered yet.</p>
                    <p className="text-xs">You need to register a child before enrolling in classes.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        setEnrollmentDialog({ open: false });
                        window.location.href = '/children/register';
                      }}
                    >
                      Register a Child
                    </Button>
                  </div>
                ) : (
                <div className="relative">
                  {(() => {
                    console.log("🔍 Select rendering debug:");
                    console.log("  - Children array:", children);
                    console.log("  - Array length:", children?.length);
                    console.log("  - First child:", children?.[0]);
                    return null;
                  })()}
                  <select 
                    className="w-full p-2 border border-input bg-background rounded-md"
                    value={selectedChildId} 
                    onChange={(e) => {
                      console.log("🎯 Select value changed:", e.target.value);
                      setSelectedChildId(e.target.value);
                    }}
                  >
                    <option value="">Choose a child</option>
                    {Array.isArray(children) && children.length > 0 ? 
                      children.map((child: any) => {
                        const childName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
                        const childValue = String(child.id);
                        console.log(`🔍 Rendering child: ${childName} (ID: ${childValue})`);

                        return (
                          <option 
                            key={child.id}
                            value={childValue}
                          >
                            {childName}
                          </option>
                        );
                      })
                      : 
                      <option value="" disabled>
                        No children found
                      </option>
                    }
                  </select>
                </div>
              )}
            </div>

            {/* Variant Selection - Show if multiple variants exist */}
            {enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1 && (
              <div>
                <Label htmlFor="variant-select">Time Option</Label>
                <div className="text-xs text-muted-foreground mb-2">
                  Choose your preferred time option with individual pricing
                </div>
                <select 
                  className="w-full p-2 border border-input bg-background rounded-md"
                  value={selectedVariantId} 
                  onChange={(e) => {
                    console.log("🎯 Variant select value changed:", e.target.value);
                    setSelectedVariantId(e.target.value);
                  }}
                >
                  <option value="">Choose a time option</option>
                  {enrollmentDialog.classData.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} - {variant.days.join(', ')} • {variant.startTime} - {variant.endTime} • ${(variant.price / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setEnrollmentDialog({ open: false });
                setSelectedChildId("");
                setSelectedVariantId("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                console.log('🎯 Enroll button clicked in dialog');
                console.log('🎯 Selected child ID:', selectedChildId);
                console.log('🎯 Selected variant ID:', selectedVariantId);
                console.log('🎯 Class ID:', enrollmentDialog.classId);
                
                // Check if variants exist and one is selected
                const hasVariants = enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1;
                if (hasVariants && !selectedVariantId) {
                  toast({
                    title: "Error",
                    description: "Please select a time option",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (selectedChildId && enrollmentDialog.classId) {
                  console.log('🎯 Starting enrollment mutation...');
                  enrollmentMutation.mutate({
                    classId: enrollmentDialog.classId,
                    childId: selectedChildId,
                    variantId: selectedVariantId
                  });
                } else {
                  console.log('❌ Missing data for enrollment:', { selectedChildId, classId: enrollmentDialog.classId });
                }
              }}
              disabled={!selectedChildId || enrollmentMutation.isPending || childrenLoading || (enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1 && !selectedVariantId)}
            >
              {enrollmentMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// This component uses the useAuth hook to manage authentication and redirects non-authenticated users to the login page.
export default function ProgramsParentPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
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
            <h2 className="text-3xl font-bold tracking-tight">Classes & Programs</h2>
            <p className="text-muted-foreground">
              Browse and enroll your children in educational classes
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