import { useState } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BookOpen, Calendar, Plus, User, GraduationCap, CreditCard, ShoppingCart, Clock, Star, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gradeLevel: string;
  parentId: string;
  birthdate?: string;
  age?: number;
  school?: string;
  interests?: string | string[];
  learningStyle?: string;
}

interface Program {
  id: number;
  name: string;
  description: string;
  ageRange: string;
  price: number;
  duration: string;
}

interface MembershipEnrollment {
  id: number;
  schoolId: number;
  parentUserId: number;
  membershipYear: number;
  amount: number;
  amountPaid: number;
  remainingBalance: number;
  status: 'pending_payment' | 'enrolled' | 'expired' | 'grace_period' | 'suspended';
  dueDate: string | null;
  expirationDate: string | null;
  membershipTier: string | null;
  schoolName: string;
  schoolLogo: string | null;
  membershipFeeAmount: number;
  membershipDescription: string | null;
}

export default function ParentDashboard() {
  const { user, session } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const { cart } = useCart();
  const cartItems = cart.items;
  const { toast } = useToast();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  // Query for children data
  const { data: children = [], isLoading: childrenLoading, error: childrenError } = useQuery<Child[]>({
    queryKey: ["/api/parent/children"],
    enabled: !!user,
  });

  // Query for available programs
  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
    enabled: !!user,
  });

  // Query for enrollment data
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/parent/enrollments"],
    enabled: !!user,
  });

  // Query for membership enrollments
  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<MembershipEnrollment[]>({
    queryKey: ["/api/parent/memberships"],
    enabled: !!user,
  });

  // Mutation to create Stripe checkout session for membership
  const membershipCheckoutMutation = useMutation({
    mutationFn: async ({ membershipEnrollmentId, tier }: { membershipEnrollmentId: number; tier: string }) => {
      const token = session?.access_token || localStorage.getItem("supabase_token");
      if (!token) {
        throw new Error('Authentication required');
      }
      const response = await fetch('/api/parent/memberships/checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ membershipEnrollmentId, tier })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
      setIsCheckoutLoading(false);
    }
  });

  const handleMembershipPayment = (membership: MembershipEnrollment) => {
    setIsCheckoutLoading(true);
    membershipCheckoutMutation.mutate({
      membershipEnrollmentId: membership.id,
      tier: membership.membershipTier || 'basic'
    });
  };

  // Get pending memberships
  const pendingMemberships = memberships.filter(m => m.status === 'pending_payment');
  const activeMemberships = memberships.filter(m => m.status === 'enrolled');
  const hasPendingMembership = pendingMemberships.length > 0;

  const isLoadingChildren = childrenLoading;
  
  // Calculate pending payment enrollments
  const pendingPaymentEnrollments = enrollments.filter(
    (e: any) => e.status === 'pending_payment'
  );
  const hasPendingPayments = pendingPaymentEnrollments.length > 0;
  const hasCartItems = cartItems.length > 0;

  return (
    <ParentAppShell>
      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Parent Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Welcome back, Parent! Manage your children's education journey.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto" data-testid="button-register-child">
            <Link href="/children/register">
              <Plus className="mr-2 h-4 w-4" />
              Register Child
            </Link>
          </Button>
        </div>

        {/* Payment Required Alert - High Visibility */}
        {(hasPendingPayments || hasCartItems) && (
          <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30" data-testid="alert-payment-required">
            <CreditCard className="h-5 w-5 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200 font-semibold">
              {hasCartItems ? "Complete Your Enrollment" : "Payment Required to Secure Your Spot"}
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              {hasCartItems ? (
                <div className="mt-2">
                  <p className="mb-3">
                    You have <strong>{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</strong> in your cart. 
                    <strong> Payment is required to save your seat and complete enrollment.</strong> Spots are limited and not guaranteed until payment is received.
                  </p>
                  <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                    <Link href="/cart">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Complete Payment Now
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="mb-3">
                    You have <strong>{pendingPaymentEnrollments.length} enrollment{pendingPaymentEnrollments.length !== 1 ? 's' : ''}</strong> pending payment. 
                    <strong> Your spot is not guaranteed until payment is complete.</strong> Please complete payment as soon as possible to secure your child's enrollment.
                  </p>
                  <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                    <Link href="/payments">
                      <CreditCard className="mr-2 h-4 w-4" />
                      View Pending Payments
                    </Link>
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Membership Payment Alert */}
        {hasPendingMembership && (
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30" data-testid="alert-membership-payment">
            <Star className="h-5 w-5 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-200 font-semibold">
              Annual Membership Payment Due
            </AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              <div className="mt-2">
                <p className="mb-3">
                  You have <strong>{pendingMemberships.length} membership{pendingMemberships.length !== 1 ? 's' : ''}</strong> pending payment.
                  Complete your membership payment to access all program benefits.
                </p>
                {pendingMemberships.map((membership) => (
                  <div key={membership.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
                    <span className="text-sm">
                      <strong>{membership.schoolName}</strong> - ${(membership.remainingBalance / 100).toFixed(2)}
                    </span>
                    <Button 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                      onClick={() => handleMembershipPayment(membership)}
                      disabled={isCheckoutLoading || membershipCheckoutMutation.isPending}
                      data-testid={`button-pay-membership-${membership.id}`}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      {isCheckoutLoading ? "Processing..." : "Pay Now"}
                    </Button>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons - Mobile Optimized */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild variant="default" size="lg" className="w-full sm:flex-1" data-testid="button-browse-classes">
            <Link href="/parent/programs">
              <BookOpen className="mr-2 h-5 w-5" />
              Browse Classes & Programs
            </Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          {/* Mobile-optimized tab list */}
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="children" className="text-xs sm:text-sm">Children</TabsTrigger>
            <TabsTrigger value="enrollments" className="text-xs sm:text-sm">Enrollments</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs sm:text-sm">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Stats Grid - Responsive */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Children</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{children.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Registered children
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{enrollments.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Active program enrollments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Available Programs</CardTitle>
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{programs.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Programs to explore
                  </p>
                </CardContent>
              </Card>

              <Card className={hasPendingPayments || hasCartItems ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${hasPendingPayments || hasCartItems ? "text-amber-800 dark:text-amber-200" : ""}`}>
                    Payments
                  </CardTitle>
                  <CreditCard className={`h-4 w-4 ${hasPendingPayments || hasCartItems ? "text-amber-600" : "text-muted-foreground"}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${hasPendingPayments || hasCartItems ? "text-amber-800 dark:text-amber-200" : ""}`}>
                    {pendingPaymentEnrollments.length + cartItems.length}
                  </div>
                  <p className={`text-xs ${hasPendingPayments || hasCartItems ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                    {hasPendingPayments || hasCartItems ? "Pending - Action Required" : "No pending payments"}
                  </p>
                  {(hasPendingPayments || hasCartItems) && (
                    <Button asChild size="sm" variant="link" className="px-0 h-auto mt-1 text-amber-700 dark:text-amber-300">
                      <Link href={hasCartItems ? "/cart" : "/payments"}>
                        Complete payment →
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Membership Status Card */}
            {membershipsLoading ? (
              <Card className="border-muted" data-testid="card-membership-loading">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      Family Membership
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading membership status...</span>
                  </div>
                </CardContent>
              </Card>
            ) : memberships.length > 0 && (
              <Card 
                className={
                  activeMemberships.length > 0 ? "border-green-500" :
                  memberships.some(m => m.status === 'grace_period') ? "border-amber-500" :
                  memberships.some(m => m.status === 'expired' || m.status === 'suspended') ? "border-red-500" :
                  "border-blue-500"
                } 
                data-testid="card-membership-status"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      Family Membership
                    </CardTitle>
                    {activeMemberships.length > 0 ? (
                      <Badge className="bg-green-500" data-testid="badge-membership-active">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : memberships.some(m => m.status === 'grace_period') ? (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800" data-testid="badge-membership-grace">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Grace Period
                      </Badge>
                    ) : memberships.some(m => m.status === 'expired') ? (
                      <Badge variant="destructive" data-testid="badge-membership-expired">
                        <XCircle className="h-3 w-3 mr-1" />
                        Expired
                      </Badge>
                    ) : memberships.some(m => m.status === 'suspended') ? (
                      <Badge variant="destructive" data-testid="badge-membership-suspended">
                        <XCircle className="h-3 w-3 mr-1" />
                        Suspended
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800" data-testid="badge-membership-pending">
                        <Clock className="h-3 w-3 mr-1" />
                        Payment Required
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    {activeMemberships.length > 0 
                      ? "Your family membership is active"
                      : memberships.some(m => m.status === 'grace_period')
                      ? "Your payment is past due - please pay to avoid service interruption"
                      : memberships.some(m => m.status === 'expired')
                      ? "Your membership has expired - renew to regain access"
                      : memberships.some(m => m.status === 'suspended')
                      ? "Your membership is suspended - please contact support"
                      : "Complete payment to activate your membership"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {memberships.map((membership) => {
                      const getDaysUntilExpiration = () => {
                        if (!membership.expirationDate) return null;
                        const now = new Date();
                        const expDate = new Date(membership.expirationDate);
                        const diffTime = expDate.getTime() - now.getTime();
                        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      };
                      const daysRemaining = getDaysUntilExpiration();

                      return (
                        <div 
                          key={membership.id} 
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg gap-3 ${
                            membership.status === 'enrolled' ? 'bg-green-50 dark:bg-green-950/30' :
                            membership.status === 'grace_period' ? 'bg-amber-50 dark:bg-amber-950/30' :
                            membership.status === 'expired' || membership.status === 'suspended' ? 'bg-red-50 dark:bg-red-950/30' :
                            'bg-muted/50'
                          }`}
                        >
                          <div>
                            <p className="font-medium">{membership.schoolName}</p>
                            <p className="text-sm text-muted-foreground">
                              {membership.membershipYear} Membership
                              {membership.membershipTier && ` • ${membership.membershipTier.charAt(0).toUpperCase() + membership.membershipTier.slice(1)} Tier`}
                            </p>
                            
                            {/* Status-specific messages */}
                            {membership.status === 'enrolled' && membership.expirationDate && (
                              <p className="text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3 inline mr-1" />
                                Expires: {new Date(membership.expirationDate).toLocaleDateString()}
                                {daysRemaining && daysRemaining <= 30 && (
                                  <span className="ml-1 text-amber-600">({daysRemaining} days remaining)</span>
                                )}
                              </p>
                            )}
                            
                            {membership.status === 'grace_period' && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                Payment past due - Balance: ${(membership.remainingBalance / 100).toFixed(2)}
                              </p>
                            )}
                            
                            {membership.status === 'expired' && (
                              <p className="text-xs text-red-600 dark:text-red-400">
                                <XCircle className="h-3 w-3 inline mr-1" />
                                Expired on {membership.expirationDate ? new Date(membership.expirationDate).toLocaleDateString() : 'N/A'}
                              </p>
                            )}
                            
                            {membership.status === 'suspended' && (
                              <p className="text-xs text-red-600 dark:text-red-400">
                                <XCircle className="h-3 w-3 inline mr-1" />
                                Membership suspended - Please contact support
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* Pending payment - show Pay Now */}
                            {membership.status === 'pending_payment' && (
                              <>
                                <span className="text-sm font-medium text-blue-600">
                                  ${(membership.remainingBalance / 100).toFixed(2)}
                                </span>
                                <Button 
                                  size="sm"
                                  onClick={() => handleMembershipPayment(membership)}
                                  disabled={isCheckoutLoading || membershipCheckoutMutation.isPending}
                                  data-testid={`button-pay-membership-card-${membership.id}`}
                                >
                                  {membershipCheckoutMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <CreditCard className="h-4 w-4 mr-1" />
                                  )}
                                  Pay Now
                                </Button>
                              </>
                            )}
                            
                            {/* Enrolled - show Paid badge */}
                            {membership.status === 'enrolled' && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Paid
                              </Badge>
                            )}
                            
                            {/* Grace period - show balance and Pay Now */}
                            {membership.status === 'grace_period' && (
                              <>
                                <span className="text-sm font-medium text-amber-600">
                                  ${(membership.remainingBalance / 100).toFixed(2)}
                                </span>
                                <Button 
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleMembershipPayment(membership)}
                                  disabled={isCheckoutLoading || membershipCheckoutMutation.isPending}
                                  data-testid={`button-pay-membership-grace-${membership.id}`}
                                >
                                  {membershipCheckoutMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <CreditCard className="h-4 w-4 mr-1" />
                                  )}
                                  Pay Now
                                </Button>
                              </>
                            )}
                            
                            {/* Expired - show Renew button */}
                            {membership.status === 'expired' && (
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => handleMembershipPayment(membership)}
                                disabled={isCheckoutLoading || membershipCheckoutMutation.isPending}
                                data-testid={`button-renew-membership-${membership.id}`}
                              >
                                {membershipCheckoutMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <Star className="h-4 w-4 mr-1" />
                                )}
                                Renew Membership
                              </Button>
                            )}
                            
                            {/* Suspended - show contact support message */}
                            {membership.status === 'suspended' && (
                              <Badge variant="destructive">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Contact Support
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Welcome Card - Full Width on Mobile */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Welcome to American Seekers Academy</CardTitle>
                  <CardDescription>Your children's educational journey starts here</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Use this dashboard to manage your children's enrollments, track their progress, 
                    and stay connected with their education. Browse our programs, register your children, 
                    and view your family schedule all in one place.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/children/register">
                      <User className="mr-2 h-4 w-4" />
                      Add Child Profile
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/parent/programs">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Browse Programs
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/schedule">
                      <Calendar className="mr-2 h-4 w-4" />
                      View Schedule
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="children" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold">My Children</h2>
                <p className="text-sm text-muted-foreground">Manage your children's profiles</p>
              </div>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/children/register">
                  <Plus className="mr-2 h-4 w-4" />
                  Register New Child
                </Link>
              </Button>
            </div>

            {isLoadingChildren ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : childrenError ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-red-600">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                    <p>Error loading children data</p>
                    <p className="text-sm text-muted-foreground mt-2">{String(childrenError)}</p>
                  </div>
                </CardContent>
              </Card>
            ) : children && children.length > 0 ? (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {children.map((child) => {
                  let age = child.age;
                  if (!age && child.birthdate) {
                    const birthDate = new Date(child.birthdate);
                    const today = new Date();
                    age = today.getFullYear() - birthDate.getFullYear();
                    const monthDiff = today.getMonth() - birthDate.getMonth();
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                      age--;
                    }
                  }

                  return (
                    <Card key={child.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold truncate">{child.firstName} {child.lastName}</h3>
                              <p className="text-sm text-muted-foreground">
                                {age ? `Age: ${age}` : 'Age: Not specified'} • {child.gradeLevel || 'Grade not set'}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" asChild className="flex-shrink-0">
                            <Link href={`/children/${child.id}/edit`}>
                              View
                            </Link>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          {child.school && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">School:</span>
                              <span className="truncate">{child.school}</span>
                            </div>
                          )}
                          {child.interests && child.interests.length > 0 && (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Interests:</span>
                              <span className="truncate">
                                {Array.isArray(child.interests) ? child.interests.slice(0, 2).join(", ") : child.interests}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No Children Registered</h3>
                    <p className="text-muted-foreground mb-4">
                      Register your first child to get started.
                    </p>
                    <Button asChild>
                      <Link href="/children/register">
                        <Plus className="mr-2 h-4 w-4" />
                        Register New Child
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="enrollments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Program Enrollments</CardTitle>
                <CardDescription>
                  View and manage your children's enrollments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollmentsLoading ? (
                  <div className="text-center py-8">Loading enrollments...</div>
                ) : enrollments.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-semibold">No active enrollments</h3>
                    <p className="mt-1 text-sm text-muted-foreground mb-4">
                      Enroll your children in programs to see them here.
                    </p>
                    <Button asChild>
                      <Link href="/parent/programs">
                        <Plus className="mr-2 h-4 w-4" />
                        Browse Programs
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {enrollments.map((enrollment: any) => (
                      <Card key={enrollment.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-6">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                            <div>
                              <h3 className="font-semibold">{enrollment.className}</h3>
                              <p className="text-sm text-muted-foreground">
                                {enrollment.childName}
                              </p>
                            </div>
                            <Badge>{enrollment.status}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Family Schedule</CardTitle>
                <CardDescription>
                  View your children's upcoming classes and events
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No upcoming events</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your schedule will appear here once you enroll in programs.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}
