import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  ArrowLeft, 
  User, 
  Users, 
  GraduationCap, 
  CreditCard, 
  Calendar, 
  Phone, 
  Mail,
  MapPin,
  AlertTriangle,
  DollarSign,
  Clock,
  CheckCircle,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface ParentProfile {
  parent: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  children: Array<{
    id: number;
    schoolStudentId: number | null;
    firstName: string;
    lastName: string;
    birthDate: string;
    grade: string;
    schoolId: number | null;
    parentEmail: string;
    allergies: string | null;
    medicalConditions: string | null;
    emergencyContact: string | null;
    additionalLanguages: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  enrollments: Array<{
    id: number;
    classId: number;
    className: string;
    classDescription?: string;
    childId: number;
    childName: string;
    enrollmentDate: string;
    status: string;
    amount: number;
    depositRequired: number;
    totalCost: number;
    remainingBalance: number;
    paymentPlan?: string;
  }>;
  paymentHistory: Array<{
    id: number;
    amount: number;
    status: string;
    paymentDate: string;
    paymentMethod: string;
    description: string;
    transactionId: string;
  }>;
  scheduledPayments: Array<{
    id: number;
    amount: number;
    dueDate: string;
    status: string;
    description: string;
    enrollmentId: number | null;
  }>;
  emergencyContacts: Array<{
    childId: number;
    childName: string;
    emergencyContact: string;
  }>;
  summary: {
    totalChildren: number;
    totalEnrollments: number;
    totalAmountPaid: number;
    totalAmountDue: number;
    activeEnrollments: number;
  };
}

// School Admin Enrollment Form Component for creating enrollments
function SchoolAdminEnrollmentForm({ parentEmail, children, onSuccess, onCancel }: {
  parentEmail: string;
  children: any[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    childId: '',
    classId: '',
  });

  // Fetch available classes for enrollment
  const { data: classesResponse, isLoading: classesLoading } = useQuery({
    queryKey: ['/api/school-admin/classes'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/school-admin/classes?limit=100");
      const data = await response.json();
      return data;
    },
  });

  const classes = classesResponse?.items || [];


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.childId || !formData.classId) {
      toast({
        title: "Error",
        description: "Please select both a child and a class",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create enrollment using the class enrollment endpoint
      await apiRequest("POST", `/api/classes/${formData.classId}/enroll`, {
        childId: parseInt(formData.childId),
      });

      toast({
        title: "Success",
        description: "Child enrolled successfully",
      });

      // Invalidate parent profile query to refresh enrollments list
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile`] });
      onSuccess();
    } catch (error) {
      console.error("Failed to create enrollment:", error);
      toast({
        title: "Error",
        description: "Failed to create enrollment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (classesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Select Child</label>
        <Select
          value={formData.childId}
          onValueChange={(value) => setFormData({ ...formData, childId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a child" />
          </SelectTrigger>
          <SelectContent>
            {children.map((child) => (
              <SelectItem key={child.id} value={child.id.toString()}>
                {child.firstName} {child.lastName} (Grade: {child.grade})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Select Class</label>
        <Select
          value={formData.classId}
          onValueChange={(value) => setFormData({ ...formData, classId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((classItem: any) => (
              <SelectItem key={classItem.id} value={classItem.id.toString()}>
                <div>
                  <div className="font-medium">{classItem.title}</div>
                  <div className="text-sm text-muted-foreground">
                    ${classItem.price.toFixed(2)} - {classItem.categoryName}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Enrollment"}
        </Button>
      </div>
    </form>
  );
}

// School Admin Child Form Component for managing children within parent profiles
function SchoolAdminChildForm({ parentEmail, childToEdit, onSuccess, onCancel }: {
  parentEmail: string;
  childToEdit?: any;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    firstName: childToEdit?.firstName || '',
    lastName: childToEdit?.lastName || '',
    birthdate: childToEdit?.birthDate || '',
    gradeLevel: childToEdit?.grade || '',
    allergies: childToEdit?.allergies || '',
    medicalConditions: childToEdit?.medicalConditions || '',
    additionalLanguages: childToEdit?.additionalLanguages || '',
    notes: childToEdit?.notes || '',
  });

  const gradeLevels = [
    "Littles", "Pre-K", "Kindergarten", "1st Grade", "2nd Grade", "3rd Grade",
    "4th Grade", "5th Grade", "6th Grade", "7th Grade", "8th Grade",
    "9th Grade", "10th Grade", "11th Grade", "12th Grade",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const childData = {
        ...formData,
        parentEmail,
        specialNeeds: null,
        medicalInfo: formData.medicalConditions,
        interests: null,
        emergencyContact: null,
        profileImage: null,
        school: null,
        learningStyle: null,
      };

      if (childToEdit) {
        // Update existing child using school admin endpoint
        await apiRequest("PATCH", `/api/school-admin/children/${childToEdit.id}`, childData);
        toast({
          title: "Success",
          description: "Child information updated successfully",
        });
      } else {
        // Create new child using school admin endpoint
        await apiRequest("POST", "/api/school-admin/children", childData);
        toast({
          title: "Success", 
          description: "Child added successfully",
        });
      }

      // Invalidate parent profile query to refresh children list
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile`] });
      onSuccess();

    } catch (error) {
      console.error("Failed to save child:", error);
      toast({
        title: "Error",
        description: "Failed to save child information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">First Name</label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded-md"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Last Name</label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded-md"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Birth Date</label>
          <input
            type="date"
            className="w-full p-2 border border-gray-300 rounded-md"
            value={formData.birthdate}
            onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Grade Level</label>
          <select
            className="w-full p-2 border border-gray-300 rounded-md"
            value={formData.gradeLevel}
            onChange={(e) => setFormData({ ...formData, gradeLevel: e.target.value })}
            required
          >
            <option value="">Select grade level</option>
            {gradeLevels.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Allergies</label>
        <textarea
          className="w-full p-2 border border-gray-300 rounded-md"
          rows={2}
          value={formData.allergies}
          onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
          placeholder="Any known allergies..."
        />
      </div>

      <div>
        <label className="text-sm font-medium">Medical Conditions</label>
        <textarea
          className="w-full p-2 border border-gray-300 rounded-md"
          rows={2}
          value={formData.medicalConditions}
          onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
          placeholder="Any medical conditions to note..."
        />
      </div>

      <div>
        <label className="text-sm font-medium">Additional Languages</label>
        <input
          type="text"
          className="w-full p-2 border border-gray-300 rounded-md"
          value={formData.additionalLanguages}
          onChange={(e) => setFormData({ ...formData, additionalLanguages: e.target.value })}
          placeholder="Languages spoken at home..."
        />
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          className="w-full p-2 border border-gray-300 rounded-md"
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes about the child..."
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : childToEdit ? "Update Child" : "Add Child"}
        </Button>
      </div>
    </form>
  );
}

export default function ParentProfilePage() {
  const [match, params] = useRoute('/schools/parents/:parentId');
  const parentId = params?.parentId;
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
  const [editChildDialogOpen, setEditChildDialogOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState<any>(null);
  const [addEnrollmentDialogOpen, setAddEnrollmentDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error } = useQuery<ParentProfile>({
    queryKey: [`/api/parent-profile/${parentId}`],
    enabled: !!parentId,
  });

  // Child management handlers
  const handleAddChildSuccess = () => {
    setAddChildDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
  };

  const handleEditChildSuccess = () => {
    setEditChildDialogOpen(false);
    setSelectedChild(null);
    queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
  };

  const handleDeleteChild = async () => {
    if (!childToDelete) return;

    try {
      // Delete the child using the school admin endpoint
      await apiRequest("DELETE", `/api/school-admin/children/${childToDelete.id}`);
      
      toast({
        title: "Success",
        description: `${childToDelete.firstName} ${childToDelete.lastName} has been removed successfully.`,
      });
      
      // Refresh the parent profile data
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      
      setDeleteDialogOpen(false);
      setChildToDelete(null);
    } catch (error) {
      console.error("Failed to delete child:", error);
      toast({
        title: "Error",
        description: "Failed to delete child. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Parent Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !profile) {
    return (
      <SchoolAdminLayout pageTitle="Parent Profile">
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Parent Not Found</h2>
          <p className="text-muted-foreground">The requested parent profile could not be found.</p>
          <Link href="/schools/users">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
      </SchoolAdminLayout>
    );
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'enrolled':
        return 'default';
      case 'pending_payment':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getPaymentStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
      case 'succeeded':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <SchoolAdminLayout pageTitle={`${profile.parent.firstName} ${profile.parent.lastName}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/schools/users">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>

        {/* Parent Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {profile.parent.firstName} {profile.parent.lastName}
                </CardTitle>
                <CardDescription className="flex items-center space-x-4 mt-2">
                  <span className="flex items-center">
                    <Mail className="h-4 w-4 mr-1" />
                    {profile.parent.email}
                  </span>
                  {profile.parent.phone && (
                    <span className="flex items-center">
                      <Phone className="h-4 w-4 mr-1" />
                      {profile.parent.phone}
                    </span>
                  )}
                  <Badge variant={profile.parent.isActive ? 'default' : 'secondary'}>
                    {profile.parent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Children</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.summary.totalChildren}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.summary.totalEnrollments}</div>
              <p className="text-xs text-muted-foreground">
                {profile.summary.activeEnrollments} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${profile.summary.totalAmountPaid.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Amount Due</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${profile.summary.totalAmountDue.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {new Date(profile.parent.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information */}
        <Tabs defaultValue="children" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="children">Children</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="emergency">Emergency Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="children">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Children</CardTitle>
                    <CardDescription>
                      Information about {profile.parent.firstName}'s children
                    </CardDescription>
                  </div>
                  <Dialog open={addChildDialogOpen} onOpenChange={setAddChildDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Child
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add New Child</DialogTitle>
                        <DialogDescription>
                          Add a new child to {profile.parent.firstName} {profile.parent.lastName}'s family
                        </DialogDescription>
                      </DialogHeader>
                      <SchoolAdminChildForm
                        parentEmail={profile.parent.email}
                        onSuccess={handleAddChildSuccess}
                        onCancel={() => setAddChildDialogOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {profile.children.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No children found.</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Click "Add Child" to add the first child to this family.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profile.children.map((child) => (
                      <Card key={child.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">
                              {child.firstName} {child.lastName}
                            </h3>
                            <div className="text-sm text-muted-foreground space-y-1 mt-2">
                              <p>Grade: {child.grade}</p>
                              <p>Birth Date: {child.birthDate ? new Date(child.birthDate + 'T00:00:00').toLocaleDateString() : 'No date set'}</p>
                              {child.allergies && <p>Allergies: {child.allergies}</p>}
                              {child.medicalConditions && <p>Medical Conditions: {child.medicalConditions}</p>}
                              {child.additionalLanguages && <p>Languages: {child.additionalLanguages}</p>}
                              {child.notes && <p>Notes: {child.notes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">ID: {child.schoolStudentId || child.id}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedChild(child);
                                setEditChildDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setChildToDelete(child);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit Child Dialog */}
            <Dialog open={editChildDialogOpen} onOpenChange={setEditChildDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Child Information</DialogTitle>
                  <DialogDescription>
                    Update {selectedChild?.firstName} {selectedChild?.lastName}'s information
                  </DialogDescription>
                </DialogHeader>
                {selectedChild && (
                  <SchoolAdminChildForm
                    parentEmail={profile.parent.email}
                    childToEdit={selectedChild}
                    onSuccess={handleEditChildSuccess}
                    onCancel={() => {
                      setEditChildDialogOpen(false);
                      setSelectedChild(null);
                    }}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Delete Child Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Child</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {childToDelete?.firstName} {childToDelete?.lastName}? 
                    This action cannot be undone and will remove all associated enrollment and payment history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => {
                    setDeleteDialogOpen(false);
                    setChildToDelete(null);
                  }}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteChild}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Child
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="enrollments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle>Enrollments</CardTitle>
                  <CardDescription>
                    Current and past enrollments for all children
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setAddEnrollmentDialogOpen(true)}
                  disabled={profile.children.length === 0}
                  className="ml-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Enrollment
                </Button>
              </CardHeader>
              <CardContent>
                {profile.enrollments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No enrollments found.</p>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Child</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Enrollment Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Remaining Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.enrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              {enrollment.childName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{enrollment.className}</div>
                                {enrollment.classDescription && (
                                  <div className="text-sm text-muted-foreground">
                                    {enrollment.classDescription}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(enrollment.status)}>
                                {enrollment.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>${enrollment.totalCost.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={enrollment.remainingBalance > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                                ${enrollment.remainingBalance.toFixed(2)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Enrollment Dialog */}
            <Dialog open={addEnrollmentDialogOpen} onOpenChange={setAddEnrollmentDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Enrollment</DialogTitle>
                  <DialogDescription>
                    Enroll a child in a class for {profile.parent.firstName} {profile.parent.lastName}
                  </DialogDescription>
                </DialogHeader>
                <SchoolAdminEnrollmentForm
                  parentEmail={profile.parent.email}
                  children={profile.children}
                  onSuccess={() => {
                    setAddEnrollmentDialogOpen(false);
                    toast({
                      title: "Success",
                      description: "Enrollment created successfully",
                    });
                  }}
                  onCancel={() => setAddEnrollmentDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="payments">
            <div className="space-y-6">
              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>All completed payments</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.paymentHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No payment history found.</p>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Transaction ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profile.paymentHistory.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                {new Date(payment.paymentDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{payment.description}</TableCell>
                              <TableCell>${payment.amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={getPaymentStatusBadgeVariant(payment.status)}>
                                  {payment.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {payment.transactionId}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Scheduled Payments */}
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Payments</CardTitle>
                  <CardDescription>Upcoming and overdue payments</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.scheduledPayments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No scheduled payments found.</p>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profile.scheduledPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                {new Date(payment.dueDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{payment.description}</TableCell>
                              <TableCell>${payment.amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={getPaymentStatusBadgeVariant(payment.status)}>
                                  {payment.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="emergency">
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contacts</CardTitle>
                <CardDescription>
                  Emergency contact information for each child
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profile.emergencyContacts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No emergency contacts found.</p>
                ) : (
                  <div className="space-y-4">
                    {profile.emergencyContacts.map((contact) => (
                      <Card key={contact.childId} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{contact.childName}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {contact.emergencyContact}
                            </p>
                          </div>
                          <Badge variant="outline">Child ID: {contact.childId}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}