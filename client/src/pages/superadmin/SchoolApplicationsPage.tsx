
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  School,
  Users,
  Calendar,
  MapPin,
  Mail,
  Phone,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Search,
  Filter
} from "lucide-react";

interface SchoolApplication {
  id: string;
  schoolName: string;
  schoolType: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  website?: string;
  currentStudentCount: number;
  gradelevelsServed: string[];
  establishedYear: number;
  reasonForJoining: string;
  currentChallenges: string;
  expectedStudentGrowth: number;
  reference1Name: string;
  reference1Email: string;
  reference1Relationship: string;
  reference2Name?: string;
  reference2Email?: string;
  reference2Relationship?: string;
  status: 'pending' | 'under_review' | 'approved' | 'declined';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export default function SchoolApplicationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<SchoolApplication | null>(null);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'declined'>('approved');
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch all applications
  const { data: applications = [], isLoading, error } = useQuery<SchoolApplication[]>({
    queryKey: ["/api/school-applications"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/school-applications");
      if (!response.ok) throw new Error("Failed to fetch applications");
      return response.json();
    }
  });

  // Update application status mutation
  const updateApplicationMutation = useMutation({
    mutationFn: async ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes: string }) => {
      const response = await apiRequest("PATCH", `/api/school-applications/${id}/status`, {
        status,
        reviewNotes,
        reviewerEmail: "super-admin@asa.com" // This should come from auth context
      });
      if (!response.ok) throw new Error("Failed to update application");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-applications"] });
      setReviewDialog(false);
      setSelectedApplication(null);
      setReviewNotes("");
      toast({
        title: "Application Updated",
        description: "The application status has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const filteredApplications = applications.filter(app =>
    app.schoolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingApplications = filteredApplications.filter(app => app.status === 'pending');
  const underReviewApplications = filteredApplications.filter(app => app.status === 'under_review');
  const approvedApplications = filteredApplications.filter(app => app.status === 'approved');
  const declinedApplications = filteredApplications.filter(app => app.status === 'declined');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'under_review':
        return <Badge variant="default"><Eye className="h-3 w-3 mr-1" />Under Review</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleReviewApplication = (application: SchoolApplication) => {
    setSelectedApplication(application);
    setReviewDialog(true);
    setReviewStatus('approved');
    setReviewNotes("");
  };

  const submitReview = () => {
    if (!selectedApplication) return;
    
    updateApplicationMutation.mutate({
      id: selectedApplication.id,
      status: reviewStatus,
      reviewNotes
    });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading applications...</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="p-6">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Failed to load school applications. Please try again later.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">School Applications</h1>
            <p className="text-muted-foreground">
              Review and manage school applications to join the platform
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{applications.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingApplications.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedApplications.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Declined</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{declinedApplications.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Applications List */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingApplications.length})
            </TabsTrigger>
            <TabsTrigger value="under_review">
              Under Review ({underReviewApplications.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({approvedApplications.length})
            </TabsTrigger>
            <TabsTrigger value="declined">
              Declined ({declinedApplications.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All ({filteredApplications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <ApplicationsTable applications={pendingApplications} onReview={handleReviewApplication} />
          </TabsContent>

          <TabsContent value="under_review">
            <ApplicationsTable applications={underReviewApplications} onReview={handleReviewApplication} />
          </TabsContent>

          <TabsContent value="approved">
            <ApplicationsTable applications={approvedApplications} onReview={handleReviewApplication} />
          </TabsContent>

          <TabsContent value="declined">
            <ApplicationsTable applications={declinedApplications} onReview={handleReviewApplication} />
          </TabsContent>

          <TabsContent value="all">
            <ApplicationsTable applications={filteredApplications} onReview={handleReviewApplication} />
          </TabsContent>
        </Tabs>

        {/* Review Dialog */}
        <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Application: {selectedApplication?.schoolName}</DialogTitle>
              <DialogDescription>
                Review the school application details and make a decision.
              </DialogDescription>
            </DialogHeader>

            {selectedApplication && (
              <div className="space-y-6">
                {/* School Information */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold mb-2">School Information</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>Name:</strong> {selectedApplication.schoolName}</p>
                      <p><strong>Type:</strong> {selectedApplication.schoolType}</p>
                      <p><strong>Established:</strong> {selectedApplication.establishedYear}</p>
                      <p><strong>Current Students:</strong> {selectedApplication.currentStudentCount}</p>
                      <p><strong>Grade Levels:</strong> {selectedApplication.gradelevelsServed.join(", ")}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Administrator</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>Name:</strong> {selectedApplication.adminFirstName} {selectedApplication.adminLastName}</p>
                      <p><strong>Email:</strong> {selectedApplication.adminEmail}</p>
                      <p><strong>Phone:</strong> {selectedApplication.adminPhone}</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <h3 className="font-semibold mb-2">Location</h3>
                  <p className="text-sm">
                    {selectedApplication.address}, {selectedApplication.city}, {selectedApplication.state} {selectedApplication.zipCode}
                  </p>
                  {selectedApplication.website && (
                    <p className="text-sm"><strong>Website:</strong> {selectedApplication.website}</p>
                  )}
                </div>

                {/* Platform Interest */}
                <div>
                  <h3 className="font-semibold mb-2">Platform Interest</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Reason for Joining:</p>
                      <p className="text-sm bg-gray-50 p-2 rounded">{selectedApplication.reasonForJoining}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Current Challenges:</p>
                      <p className="text-sm bg-gray-50 p-2 rounded">{selectedApplication.currentChallenges}</p>
                    </div>
                    <p className="text-sm"><strong>Expected Growth:</strong> {selectedApplication.expectedStudentGrowth} students</p>
                  </div>
                </div>

                {/* References */}
                <div>
                  <h3 className="font-semibold mb-2">References</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="border rounded p-3">
                      <p className="text-sm font-medium">Reference 1</p>
                      <p className="text-sm">{selectedApplication.reference1Name}</p>
                      <p className="text-sm">{selectedApplication.reference1Email}</p>
                      <p className="text-sm">{selectedApplication.reference1Relationship}</p>
                    </div>
                    
                    {selectedApplication.reference2Name && (
                      <div className="border rounded p-3">
                        <p className="text-sm font-medium">Reference 2</p>
                        <p className="text-sm">{selectedApplication.reference2Name}</p>
                        <p className="text-sm">{selectedApplication.reference2Email}</p>
                        <p className="text-sm">{selectedApplication.reference2Relationship}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Review Section */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Review Decision</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="status">Decision</Label>
                      <div className="flex gap-4 mt-2">
                        <Button
                          variant={reviewStatus === 'approved' ? 'default' : 'outline'}
                          onClick={() => setReviewStatus('approved')}
                          className="flex items-center gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          variant={reviewStatus === 'declined' ? 'destructive' : 'outline'}
                          onClick={() => setReviewStatus('declined')}
                          className="flex items-center gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Decline
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="notes">Review Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder={reviewStatus === 'approved' 
                          ? "Optional: Add any notes for the approval..."
                          : "Please provide a reason for declining this application..."
                        }
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialog(false)}>
                Cancel
              </Button>
              <Button onClick={submitReview} disabled={updateApplicationMutation.isPending}>
                {updateApplicationMutation.isPending ? "Processing..." : "Submit Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

interface ApplicationsTableProps {
  applications: SchoolApplication[];
  onReview: (application: SchoolApplication) => void;
}

function ApplicationsTable({ applications, onReview }: ApplicationsTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'under_review':
        return <Badge variant="default"><Eye className="h-3 w-3 mr-1" />Under Review</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No applications found</h3>
          <p className="text-muted-foreground text-center">
            No school applications match your current filter criteria.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Administrator</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{app.schoolName}</div>
                    <div className="text-sm text-muted-foreground">{app.schoolType}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{app.adminFirstName} {app.adminLastName}</div>
                    <div className="text-sm text-muted-foreground">{app.adminEmail}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{app.city}, {app.state}</div>
                    <div className="text-muted-foreground">{app.zipCode}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{app.currentStudentCount} current</div>
                    <div className="text-muted-foreground">+{app.expectedStudentGrowth} expected</div>
                  </div>
                </TableCell>
                <TableCell>
                  {getStatusBadge(app.status)}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {new Date(app.submittedAt).toLocaleDateString()}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReview(app)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
