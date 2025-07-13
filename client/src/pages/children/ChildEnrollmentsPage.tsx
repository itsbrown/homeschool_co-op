import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Calendar, Clock, MapPin, Trash2 } from "lucide-react";
import { Link } from "wouter";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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

interface Enrollment {
  id: number;
  childId: number;
  classId: number;
  className: string;
  classDescription: string;
  startDate: string;
  endDate: string;
  schedule: string;
  location: string;
  status: 'enrolled' | 'waitlisted' | 'completed' | 'pending_payment';
  enrollmentDate: string;
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

  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      return apiRequest("DELETE", `/api/enrollments/${enrollmentId}/unenroll`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/children/${childId}/enrollments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
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
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/children">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Children
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {childLoading ? (
                  <Skeleton className="h-8 w-48" />
                ) : (
                  `${child?.firstName} ${child?.lastName}'s Enrollments`
                )}
              </h1>
              <p className="text-muted-foreground">
                View and manage program enrollments
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/programs">
              <Plus className="h-4 w-4 mr-2" />
              Enroll in Program
            </Link>
          </Button>
        </div>

        {/* Child Info Card */}
        {childLoading ? (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ) : child ? (
          <Card>
            <CardHeader>
              <CardTitle>Child Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{child.firstName} {child.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grade Level</p>
                  <p className="font-medium">{child.gradeLevel}</p>
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
          ) : enrollments.length > 0 ? (
            <div className="space-y-4">
              {enrollments.map((enrollment) => (
                <Card key={enrollment.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{enrollment.className}</CardTitle>
                      <Badge className={getStatusColor(enrollment.status)}>
                        {enrollment.status.charAt(0).toUpperCase() + enrollment.status.slice(1)}
                      </Badge>
                    </div>
                    <CardDescription>{enrollment.classDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Duration</p>
                          <p className="text-muted-foreground">
                            {formatDate(enrollment.startDate)} - {formatDate(enrollment.endDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Schedule</p>
                          <p className="text-muted-foreground">{enrollment.schedule}</p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Location</p>
                          <p className="text-muted-foreground">{enrollment.location}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Enrolled on {formatDate(enrollment.enrollmentDate)}
                        </p>
                        <div className="space-x-2">
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                          {enrollment.status === 'enrolled' && (
                            <Button variant="outline" size="sm">
                              Manage Enrollment
                            </Button>
                          )}
                          {enrollment.status === 'pending_payment' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
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
                                    onClick={() => unenrollMutation.mutate(enrollment.id)}
                                    disabled={unenrollMutation.isPending}
                                  >
                                    {unenrollMutation.isPending ? "Unenrolling..." : "Unenroll"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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