import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Calendar, Clock, MapPin, Trash2, CreditCard, User, Mail, Phone } from "lucide-react";
import { Link } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatClassSchedule } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Instructor {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  isPrimary: boolean;
}

interface Enrollment {
  id?: number;
  childId: number;
  classId: number;
  className?: string;
  classDescription?: string;
  status: 'enrolled' | 'waitlisted' | 'completed' | 'pending_payment';
  enrollmentDate: string;
  amount?: number;
  totalCost?: number;
  remainingBalance?: number;
  paymentIntentId?: string;
  childName?: string;
  depositRequired?: number;
  instructors?: Instructor[];
}

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
}

export default function ChildEnrollmentsPage() {
  const [match, params] = useRoute("/children/:id/enrollments");
  const childId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { refreshCart } = useCart();

  // Fetch child data
  const { data: child, isLoading: childLoading } = useQuery<Child>({
    queryKey: [`/api/children/${childId}`],
    enabled: !!childId,
  });

  // Fetch enrollments for this child
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<Enrollment[]>({
    queryKey: [`/api/children/${childId}/enrollments`],
    enabled: !!childId,
  });

  // Fetch marketplace classes to get class details
  const { data: marketplaceClasses = [] } = useQuery({
    queryKey: ['/api/classes'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/classes");
      const data = await response.json();
      // The API returns {classes: [...], pagination: {...}}
      return Array.isArray(data.classes) ? data.classes : [];
    },
  });

  // Fetch school classes to get school class details
  const { data: schoolClassesData } = useQuery({
    queryKey: ['/api/school-admin/classes'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/school-admin/classes");
      const data = await response.json();
      return data;
    },
  });

  const schoolClasses = schoolClassesData?.items || [];

  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      return apiRequest("DELETE", `/api/enrollments/${enrollmentId}/unenroll`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/children/${childId}/enrollments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
      // Refresh cart to remove unenrolled items
      refreshCart();
      toast({
        title: "Success",
        description: "Successfully unenrolled from the class",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unenroll from class",
        variant: "destructive",
      });
    },
  });

  if (!match || !childId) {
    return <div>Invalid child ID</div>;
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Memoized helper to get class details for enrollments
  const enrichedEnrollments = useMemo(() => {
    return enrollments.map((enrollment) => {
      const enrollmentAny = enrollment as any;
      const isSchoolClass = enrollmentAny.classType === 'school_class';
      
      // Try to find the class in the appropriate list
      let classData = null;
      
      if (isSchoolClass) {
        classData = schoolClasses.find((c: any) => c.id === enrollment.classId);
      } else {
        // For marketplace type, try marketplace classes first
        const marketplaceId = enrollmentAny.marketplaceClassId;
        classData = marketplaceClasses.find((c: any) => c.id === marketplaceId);
        
        // Fallback: if not found in marketplace, check school classes
        // (handles data inconsistency where classType is wrong)
        if (!classData && marketplaceId) {
          classData = schoolClasses.find((c: any) => c.id === marketplaceId);
        }
      }
      
      // Format schedule based on the class data
      let schedule = 'Schedule TBD';
      if (classData?.schedule) {
        if (typeof classData.schedule === 'object' && classData.schedule.variants) {
          const variants = classData.schedule.variants;
          if (variants.length > 0) {
            // Use the variant matching the enrollment's variantId, or the first one
            const enrolledVariant = enrollmentAny.variantId 
              ? variants.find((v: any) => v.id === enrollmentAny.variantId)
              : variants[0];
            const variant = enrolledVariant || variants[0];
            schedule = `${variant.days.join(', ')} ${variant.startTime} - ${variant.endTime}`;
          }
        } else if (typeof classData.schedule === 'string') {
          schedule = classData.schedule;
        }
      }
      
      // Get location from multiple possible sources
      let location = 'Location TBD';
      if (classData?.location) {
        // Direct location field
        location = typeof classData.location === 'string' 
          ? classData.location
          : classData.location?.name || 'Location TBD';
      } else if (enrollmentAny.locationName) {
        // Location from enrollment
        location = enrollmentAny.locationName;
      } else if (classData?.campus) {
        // Location from campus field (some class structures)
        location = classData.campus;
      }
      
      return {
        ...enrollment,
        enrichedData: {
          className: enrollment.className || classData?.title || 'Unknown Class',
          description: enrollment.classDescription || classData?.description || '',
          schedule,
          location,
          startDate: classData?.startDate,
          endDate: classData?.endDate
        }
      };
    });
  }, [enrollments, marketplaceClasses, schoolClasses]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enrolled':
        return 'bg-green-100 text-green-800';
      case 'waitlisted':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'pending_payment':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <ParentAppShell>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        {/* Header */}
        <div className="space-y-3 sm:space-y-4">
          {/* Back button - separate row on mobile */}
          <div>
            <Button variant="ghost" size="sm" asChild className="pl-0">
              <Link href="/children">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Children
              </Link>
            </Button>
          </div>
          
          {/* Title and action button */}
          <div className="space-y-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">
                {childLoading ? (
                  <Skeleton className="h-8 w-48" />
                ) : (
                  `${child?.firstName} ${child?.lastName}'s Enrollments`
                )}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                View and manage program enrollments
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/programs">
                <Plus className="h-4 w-4 mr-2" />
                <span className="sm:inline">Enroll in </span>Program
              </Link>
            </Button>
          </div>
        </div>

        {/* Child Info Card */}
        {childLoading ? (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ) : child ? (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Child Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Name</p>
                  <p className="font-medium text-sm sm:text-base">{child.firstName} {child.lastName}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Grade Level</p>
                  <p className="font-medium text-sm sm:text-base">{child.gradeLevel}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Enrollments */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Current Enrollments</h2>
          
          {enrollmentsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : enrichedEnrollments.length > 0 ? (
            <div className="space-y-4">
              {enrichedEnrollments.map((enrichedEnrollment, index) => {
                const enrollment = enrichedEnrollment as Enrollment;
                const details = (enrichedEnrollment as any).enrichedData;
                
                return (
                  <Card key={enrollment.id || `enrollment-${index}`}>
                    <CardHeader className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                        <CardTitle className="text-base sm:text-lg">{details.className}</CardTitle>
                        <Badge className={`${getStatusColor(enrollment.status)} self-start sm:self-auto text-xs`}>
                          {enrollment.status.replace('_', ' ').charAt(0).toUpperCase() + enrollment.status.replace('_', ' ').slice(1)}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm line-clamp-3 sm:line-clamp-none">{details.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-sm">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Duration</p>
                            <p className="text-muted-foreground">
                              {details.startDate && details.endDate
                                ? `${formatDate(details.startDate)} - ${formatDate(details.endDate)}`
                                : 'Full semester'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Schedule</p>
                            <p className="text-muted-foreground">{details.schedule ? formatClassSchedule(details.schedule) : 'Not set'}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Location</p>
                            <p className="text-muted-foreground">{details.location}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Instructor Contact Info */}
                      {enrollment.instructors && enrollment.instructors.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <p className="font-medium text-sm">
                              {enrollment.instructors.length === 1 ? 'Instructor' : 'Instructors'}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {enrollment.instructors.map((instructor) => (
                              <div 
                                key={instructor.id} 
                                className="p-3 bg-muted/50 rounded-lg"
                                data-testid={`instructor-card-${instructor.id}`}
                              >
                                <p className="font-medium text-sm flex items-center gap-1">
                                  {instructor.name}
                                  {instructor.isPrimary && (
                                    <Badge variant="secondary" className="text-xs ml-1">Primary</Badge>
                                  )}
                                </p>
                                <div className="mt-2 space-y-1">
                                  <a 
                                    href={`mailto:${instructor.email}`}
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                                    data-testid={`instructor-email-${instructor.id}`}
                                  >
                                    <Mail className="h-3 w-3" />
                                    {instructor.email}
                                  </a>
                                  {instructor.phone && (
                                    <a 
                                      href={`tel:${instructor.phone}`}
                                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                                      data-testid={`instructor-phone-${instructor.id}`}
                                    >
                                      <Phone className="h-3 w-3" />
                                      {instructor.phone}
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                      <div className="flex flex-col gap-3">
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Enrolled on {formatDate(enrollment.enrollmentDate)}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 w-full">
                          {enrollment.status === 'pending_payment' && (
                            <>
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                                onClick={async () => {
                                  // Refresh cart to load pending enrollments, then navigate to checkout
                                  console.log('🛒 Complete Payment clicked - refreshing cart');
                                  await refreshCart(); // CRITICAL: Await cart refresh before navigation
                                  console.log('🛒 Cart refresh complete - navigating to checkout');
                                  setLocation('/cart/checkout');
                                }}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                <span className="hidden sm:inline">Complete </span>Payment
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="w-full sm:w-auto"
                                    disabled={!enrollment.id}
                                    onClick={(e) => {
                                      if (!enrollment.id) {
                                        e.preventDefault();
                                        toast({
                                          title: "Cannot Unenroll",
                                          description: "This enrollment cannot be removed. Please contact support for assistance.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Unenroll
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Unenrollment</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to unenroll from "{enrollment.className}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => {
                                        if (enrollment.id) {
                                          unenrollMutation.mutate(enrollment.id);
                                        }
                                      }}
                                      disabled={unenrollMutation.isPending || !enrollment.id}
                                    >
                                      {unenrollMutation.isPending ? "Unenrolling..." : "Unenroll"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No active enrollments found</h3>
                <p className="text-muted-foreground mb-4">
                  Browse our programs to find the perfect fit for {child?.firstName}
                </p>
                <Button asChild>
                  <Link href="/programs">
                    <Plus className="h-4 w-4 mr-2" />
                    Browse Programs
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ParentAppShell>
  );
}