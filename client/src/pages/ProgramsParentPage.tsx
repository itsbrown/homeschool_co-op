import React, { useState, useEffect, useMemo } from "react";
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
import { CalendarIcon, DollarSign, BookOpen, Users, Filter, Sparkles, CalendarDays, Backpack, ShoppingCart, Plus, MapPin, Clock, ArrowUpDown, ClipboardList } from "lucide-react";
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
  const [sortField, setSortField] = useState<string>("startDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { addItem, hasItem, openCart, refreshCart } = useCart();
  // Use wouter's location hook for navigation
  const [, setLocation] = useLocation();
  
  // Load sort preferences from localStorage
  useEffect(() => {
    const savedSortField = localStorage.getItem('parentClassesSortField');
    const savedSortDirection = localStorage.getItem('parentClassesSortDirection');
    
    const validSortFields = ['startDate', 'title', 'location', 'price', 'enrollmentAvailability'];
    if (savedSortField && validSortFields.includes(savedSortField)) {
      setSortField(savedSortField);
    }
    
    if (savedSortDirection && (savedSortDirection === 'asc' || savedSortDirection === 'desc')) {
      setSortDirection(savedSortDirection as "asc" | "desc");
    }
  }, []);
  
  // Save sort preferences to localStorage
  useEffect(() => {
    localStorage.setItem('parentClassesSortField', sortField);
    localStorage.setItem('parentClassesSortDirection', sortDirection);
  }, [sortField, sortDirection]);

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
      
      if (response instanceof Response) {
        const jsonData = await response.json();
        return jsonData;
      }
      
      return response;
    },
    onSuccess: (data, variables) => {
      const selectedClass = classesData?.classes?.find(c => c.id === variables.classId);
      const selectedChild = children?.find(c => c.id === parseInt(variables.childId));
      const childName = selectedChild?.firstName || 'Your child';
      const className = selectedClass?.title || 'the class';

      if (data.isDuplicate) {
        const duplicateMessage = data.isWaitlisted
          ? `${childName} is already on the waitlist for ${className} at position #${data.waitlistPosition || '?'}.`
          : `${childName} is already enrolled in ${className}. Check your cart to complete payment.`;
        toast({
          title: data.isWaitlisted ? "Already on Waitlist" : "Already in Cart",
          description: duplicateMessage,
          variant: "default",
        });
        
        setEnrollmentDialog({ open: false });
        setSelectedChildId("");
        setSelectedVariantId("");
        
        if (!data.isWaitlisted) {
          setTimeout(() => {
            openCart();
          }, 500);
        }
        
        return;
      }

      if (data.isWaitlisted) {
        setEnrollmentDialog({ open: false });
        setSelectedChildId("");
        setSelectedVariantId("");

        toast({
          title: "Added to Waitlist",
          description: `${childName} is #${data.waitlistPosition || '?'} on the waitlist for ${className}. We'll notify you when a spot opens up.`,
        });

        queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
        return;
      }

      if (selectedClass && selectedChild && data.enrollment) {
        const selectedVariant = variables.variantId ? 
          selectedClass.variants?.find(v => v.id === variables.variantId) : 
          selectedClass.variants?.[0];
        
        const finalPrice = selectedVariant ? selectedVariant.price : selectedClass.price;
        
        setEnrollmentDialog({ open: false });
        setSelectedChildId("");
        setSelectedVariantId("");

        toast({
          title: "Added to Cart",
          description: `${childName} is enrolled in ${className}. Complete payment in your cart.`,
        });

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
        
        setTimeout(async () => {
          await refreshCart();
          openCart();
        }, 500);
      } else {
        toast({
          title: "Enrollment Successful",
          description: `${childName} has been enrolled in ${className}.`,
        });
        
        setEnrollmentDialog({ open: false });
        setSelectedChildId("");
        setSelectedVariantId("");
        queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
        queryClient.invalidateQueries({ queryKey: [`/api/enrollments/child/${variables.childId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/children/${variables.childId}/enrollments`] });
        queryClient.invalidateQueries({ queryKey: ["/api/parent/enrollments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "We couldn't complete the enrollment. The class may be full or there was a connection issue.",
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
    location?: string;
    instructorName?: string;
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

  // Fetch parent classes and transform the response
  const { data: schoolClassesResponse, isLoading: classesLoading, error: classesError } = useQuery({
    queryKey: ["/api/parent/classes"],
    enabled: activeTab === "classes" || activeTab === "all",
  });

  // Transform school admin classes data to match expected format
  // Filter out expired classes (endDate < today) for parent-facing view
  const now = new Date();
  const classesData: ClassesResponse = {
    classes: ((schoolClassesResponse as any)?.items || [])
      .filter((item: any) => {
        if (item.endDate && new Date(item.endDate) < now) return false;
        // Hide classes whose category has been hidden by an admin
        if (item.categoryId && item.categoryIsPublic === false) return false;
        return true;
      })
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price, // Keep price in dollars for cart compatibility
        category: item.category || item.categoryName || 'Academic',
        categoryName: item.categoryName || item.category || 'Academic',
        startDate: item.startDate,
        endDate: item.endDate,
        numSessions: item.numSessions,
        capacity: item.capacity,
        totalOrders: item.enrollmentCount || 0,
        totalWaitlisted: 0,
        location: item.locationName || item.location,
        instructorName: item.instructorName,
        variants: item.variants || []
      })),
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0
    }
  };
  classesData.pagination.totalItems = classesData.classes.length;


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


  // Apply search, category filters, and sorting to classes
  const classesList = useMemo(() => {
    // First filter
    const filtered = classesData.classes.filter(c => {
      // Filter by search term (search in title and description)
      const matchesSearch = !searchTerm || 
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Filter by category filter dropdown
      const matchesCategoryFilter = !categoryFilter || 
        categoryFilter === 'all' || 
        c.categoryName === categoryFilter;
      
      return matchesSearch && matchesCategoryFilter;
    });
    
    // Then sort
    const sorted = [...filtered];
    sorted.sort((a: any, b: any) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortField) {
        case 'title':
          aValue = (a.title || '').toLowerCase();
          bValue = (b.title || '').toLowerCase();
          break;
        case 'location':
          aValue = (a.location || 'zzz').toLowerCase();
          bValue = (b.location || 'zzz').toLowerCase();
          break;
        case 'price':
          aValue = a.price || 0;
          bValue = b.price || 0;
          break;
        case 'startDate':
          aValue = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
          bValue = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
          break;
        case 'enrollmentAvailability':
          const aAvailable = (a.capacity || 0) - (a.totalOrders || 0);
          const bAvailable = (b.capacity || 0) - (b.totalOrders || 0);
          aValue = aAvailable;
          bValue = bAvailable;
          break;
        default:
          aValue = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
          bValue = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
      }
      
      let comparison = 0;
      if (aValue < bValue) {
        comparison = -1;
      } else if (aValue > bValue) {
        comparison = 1;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [classesData.classes, searchTerm, categoryFilter, sortField, sortDirection]);


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
                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1">
                      <Label htmlFor="sortBy" className="flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" />
                        Sort By
                      </Label>
                      <Select value={sortField} onValueChange={setSortField}>
                        <SelectTrigger id="sortBy">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="startDate">Start Date</SelectItem>
                          <SelectItem value="title">Class Name</SelectItem>
                          <SelectItem value="location">Location</SelectItem>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="enrollmentAvailability">Availability</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex-1">
                      <Label htmlFor="sortDirection">Direction</Label>
                      <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as "asc" | "desc")}>
                        <SelectTrigger id="sortDirection">
                          <SelectValue placeholder="Direction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Ascending</SelectItem>
                          <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      {(searchTerm || (categoryFilter && categoryFilter !== 'all')) && (
                        <Button variant="outline" type="button" onClick={() => {
                          setSearchTerm("");
                          setCategoryFilter("all");
                        }}>
                          Clear Filters
                        </Button>
                      )}
                    </div>
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
                        <Badge variant="default">
                          {classItem.categoryName || classItem.category || "Uncategorized"}
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

                        {classItem.capacity && (() => {
                          const spotsLeft = Math.max(0, classItem.capacity - (classItem.totalOrders || 0));
                          const isFull = spotsLeft === 0;
                          const isLow = spotsLeft > 0 && spotsLeft <= 3;
                          return (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center"><Users className="h-4 w-4 mr-1 opacity-70" />Availability:</div>
                              <div className="font-medium">
                                {isFull ? (
                                  <Badge variant="destructive" className="text-xs">Class Full</Badge>
                                ) : isLow ? (
                                  <span className="text-amber-600 font-semibold">{spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left</span>
                                ) : (
                                  <span className="text-green-600">{spotsLeft} spots available</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {classItem.variants && classItem.variants.length > 0 && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><Clock className="h-4 w-4 mr-1 opacity-70" />Time:</div>
                            <div className="font-medium text-sm">
                              {formatClassSchedule({ variants: classItem.variants })}
                            </div>
                          </div>
                        )}

                        {(classItem.locationName || classItem.location) && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"><MapPin className="h-4 w-4 mr-1 opacity-70" />Location:</div>
                            <div className="font-medium text-sm">{classItem.locationName || classItem.location}</div>
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
                      {classItem.capacity && (classItem.totalOrders || 0) >= classItem.capacity ? (
                        <Button 
                          variant="outline"
                          className="flex-1 border-amber-500 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setEnrollmentDialog({ open: true, classId: classItem.id, classTitle: classItem.title, classData: classItem });
                          }}
                        >
                          Join Waitlist
                        </Button>
                      ) : (
                        <Button 
                          onClick={() => {
                            setEnrollmentDialog({ open: true, classId: classItem.id, classTitle: classItem.title, classData: classItem });
                          }}
                          className="flex-1"
                        >
                          Enroll Now
                        </Button>
                      )}
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
        if (!open && enrollmentMutation.isPending) return;
        setEnrollmentDialog({ open });
        if (!open) {
          setSelectedChildId("");
          setSelectedVariantId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {enrollmentDialog.classData?.capacity && (enrollmentDialog.classData?.totalOrders || 0) >= enrollmentDialog.classData?.capacity
                ? `Join Waitlist — ${enrollmentDialog.classTitle || 'Class'}`
                : `Enroll in ${enrollmentDialog.classTitle || 'Class'}`
              }
            </DialogTitle>
            <DialogDescription>
              {enrollmentDialog.classData?.capacity && (enrollmentDialog.classData?.totalOrders || 0) >= enrollmentDialog.classData?.capacity
                ? "This class is currently full. You can join the waitlist and we'll notify you when a spot opens up."
                : "Choose which child to enroll and select a time option if available."
              }
            </DialogDescription>
          </DialogHeader>

          {enrollmentDialog.classData?.capacity && (enrollmentDialog.classData?.totalOrders || 0) >= enrollmentDialog.classData?.capacity && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <ClipboardList className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-300">
                {(enrollmentDialog.classData?.totalWaitlisted || 0) > 0
                  ? `${enrollmentDialog.classData.totalWaitlisted} already on waitlist — you'll be #${(enrollmentDialog.classData.totalWaitlisted || 0) + 1}`
                  : "You'll be first on the waitlist — no payment required until a spot opens."
                }
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div>
                <Label htmlFor="child-select">Select Child</Label>
                {!isAuthenticated ? (
                  <div className="text-sm text-destructive mt-1">
                    Please log in to enroll your child.
                  </div>
                ) : childrenLoading ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    Loading your children...
                  </div>
                ) : childrenError ? (
                  <div className="text-sm text-destructive mt-1">
                    We couldn't load your children. Please try logging out and back in.
                  </div>
                ) : !children || children.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center mt-1">
                    <p className="mb-2">No children registered yet.</p>
                    <p className="text-xs">You need to register a child before enrolling in classes.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        setEnrollmentDialog({ open: false });
                        setLocation('/children/register');
                      }}
                    >
                      Register a Child
                    </Button>
                  </div>
                ) : (
                <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a child" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((child: any) => (
                      <SelectItem key={child.id} value={String(child.id)}>
                        {`${child.firstName || ''} ${child.lastName || ''}`.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1 && (
              <div>
                <Label htmlFor="variant-select">Time Option</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  Choose your preferred schedule and pricing
                </p>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a time option" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrollmentDialog.classData.variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.name} — {variant.days.join(', ')} {variant.startTime}-{variant.endTime} (${(variant.price / 100).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                const hasVariants = enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1;
                if (hasVariants && !selectedVariantId) {
                  toast({
                    title: "Missing Time Selection",
                    description: "Please choose a class time before enrolling.",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (selectedChildId && enrollmentDialog.classId) {
                  enrollmentMutation.mutate({
                    classId: enrollmentDialog.classId,
                    childId: selectedChildId,
                    variantId: selectedVariantId
                  });
                }
              }}
              disabled={!selectedChildId || enrollmentMutation.isPending || childrenLoading || (enrollmentDialog.classData?.variants && enrollmentDialog.classData.variants.length > 1 && !selectedVariantId)}
            >
              {(() => {
                const isClassFull = enrollmentDialog.classData?.capacity && (enrollmentDialog.classData?.totalOrders || 0) >= enrollmentDialog.classData?.capacity;
                if (enrollmentMutation.isPending) return isClassFull ? "Joining..." : "Enrolling...";
                return isClassFull ? "Join Waitlist" : "Enroll";
              })()}
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

  useEffect(() => {
    document.title = "Programs & Classes - American Seekers Academy";
  }, []);

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
          <Button onClick={() => setLocation("/enroll")} size="lg" className="shrink-0">
            Enroll Now
          </Button>
        </div>

        <Switch>
          <Route path="/parent/programs/enroll">
            <ProgramEnrollmentForm />
          </Route>
          <Route path="/parent/programs/enrollments">
            <EnrollmentList />
          </Route>
          <Route path="/parent/programs/enrollments/:childId">
            {(params) => (
              <EnrollmentList childId={parseInt(params.childId)} />
            )}
          </Route>
          <Route path="/parent/programs">
            <ProgramsContent isAdmin={isAdmin} />
          </Route>
        </Switch>
      </div>
    </ParentAppShell>
  );
}