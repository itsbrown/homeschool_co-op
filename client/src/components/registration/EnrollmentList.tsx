import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Child {
  id: number;
  firstName: string;
  lastName: string;
}

interface Program {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
}

interface Enrollment {
  id: number;
  programId: number;
  childId: number;
  program: Program;
  child: Child;
  status: "pending" | "confirmed" | "waitlisted" | "cancelled" | "completed";
  paymentStatus: "pending" | "paid" | "refunded" | "failed";
  enrollmentDate: string;
}

interface EnrollmentListProps {
  childId?: number; // If provided, only show enrollments for this child
  isAdmin?: boolean;
}

export function EnrollmentList({ childId, isAdmin = false }: EnrollmentListProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch enrollments
  const { data: enrollments, isLoading } = useQuery({
    queryKey: childId 
      ? ["/api/program-enrollments/child", childId] 
      : ["/api/program-enrollments"],
  });

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Handle enrollment cancellation
  const handleCancelEnrollment = async () => {
    if (!selectedEnrollment) return;
    
    setIsCancelling(true);
    try {
      await apiRequest("PATCH", `/api/program-enrollments/${selectedEnrollment.id}`, {
        status: "cancelled"
      });
      
      toast({
        title: "Success",
        description: "Enrollment has been cancelled",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
      if (childId) {
        queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments/child", childId] });
      }
      
      setCancelDialogOpen(false);
    } catch (error) {
      console.error("Failed to cancel enrollment:", error);
      toast({
        title: "Error",
        description: "Failed to cancel enrollment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Get badge variant based on status
  const getStatusBadgeVariant = (status: Enrollment["status"]) => {
    switch (status) {
      case "confirmed": return "default"; // Using default instead of success
      case "pending": return "secondary"; // Using secondary instead of warning
      case "waitlisted": return "secondary";
      case "cancelled": return "destructive";
      case "completed": return "default";
      default: return "secondary";
    }
  };

  // Get badge variant based on payment status
  const getPaymentStatusBadgeVariant = (status: Enrollment["paymentStatus"]) => {
    switch (status) {
      case "paid": return "default"; // Using default instead of success
      case "pending": return "secondary"; // Using secondary instead of warning
      case "refunded": return "secondary";
      case "failed": return "destructive";
      default: return "secondary";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!enrollments?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Enrollments Found</CardTitle>
          <CardDescription>
            {childId 
              ? "This child is not currently enrolled in any programs" 
              : "No program enrollments found"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-center text-muted-foreground">
            {childId 
              ? "Look for programs to enroll this child in"
              : "Enroll in a program to get started"}
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => window.location.href = "/programs"}>
            Browse Programs
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {childId ? "Program Enrollments" : "All Enrollments"}
        </CardTitle>
        <CardDescription>
          {childId 
            ? "Programs this child is enrolled in" 
            : "All program enrollments across your children"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>
            List of {childId ? "child's " : ""}program enrollments
          </TableCaption>
          <TableHeader>
            <TableRow>
              {!childId && <TableHead>Child Name</TableHead>}
              <TableHead>Program</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.map((enrollment: Enrollment) => (
              <TableRow key={enrollment.id}>
                {!childId && (
                  <TableCell>
                    {enrollment.child.firstName} {enrollment.child.lastName}
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {enrollment.program.title}
                </TableCell>
                <TableCell>
                  {formatDate(enrollment.program.startDate)} - {formatDate(enrollment.program.endDate)}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(enrollment.status)}>
                    {enrollment.status.charAt(0).toUpperCase() + enrollment.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getPaymentStatusBadgeVariant(enrollment.paymentStatus)}>
                    {enrollment.paymentStatus.charAt(0).toUpperCase() + enrollment.paymentStatus.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      {isAdmin && (
                        <>
                          <DropdownMenuItem onClick={() => window.location.href = `/admin/enrollments/${enrollment.id}`}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.location.href = `/admin/enrollments/${enrollment.id}/edit`}>
                            Edit Enrollment
                          </DropdownMenuItem>
                        </>
                      )}
                      {(enrollment.status === "pending" || enrollment.status === "confirmed" || enrollment.status === "waitlisted") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setSelectedEnrollment(enrollment);
                              setCancelDialogOpen(true);
                            }}
                          >
                            Cancel Enrollment
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Cancellation Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Enrollment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this enrollment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedEnrollment && (
              <div className="space-y-2">
                <p><strong>Program:</strong> {selectedEnrollment.program.title}</p>
                <p><strong>Child:</strong> {selectedEnrollment.child.firstName} {selectedEnrollment.child.lastName}</p>
                <p><strong>Dates:</strong> {formatDate(selectedEnrollment.program.startDate)} - {formatDate(selectedEnrollment.program.endDate)}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setCancelDialogOpen(false)}
            >
              Keep Enrollment
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelEnrollment}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel Enrollment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}