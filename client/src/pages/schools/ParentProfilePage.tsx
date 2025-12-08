import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
  AlertDialogTrigger,
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
  AlertCircle,
  DollarSign,
  Clock,
  CheckCircle,
  Plus,
  Edit,
  Trash2,
  Award,
  Copy,
  Loader2,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { useSchoolAdmin } from '@/hooks/useSchoolAdmin';

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
    memberId: string | null;
  };
  children: Array<{
    id: number;
    schoolStudentId: number | null;
    firstName: string;
    lastName: string;
    birthdate: string;
    gradeLevel: string;
    schoolId: number | null;
    parentEmail: string;
    allergies: string | null;
    medicalInfo: string | null;
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
  membershipEnrollments: Array<{
    id: number;
    schoolId: number;
    schoolName: string;
    membershipYear: number;
    amount: number;
    totalCost: number;
    remainingBalance: number;
    status: string;
    dueDate: string;
    expirationDate: string;
    gracePeriodEnd: string;
    membershipTier?: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    startDate?: string;
    renewalDate?: string;
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
    totalMemberships: number;
    totalAmountPaid: number;
    totalAmountDue: number;
    activeEnrollments: number;
    activeMemberships: number;
  };
}

// School Admin Enrollment Form Component for creating enrollments
function SchoolAdminEnrollmentForm({ parentEmail, parentId, children, onSuccess, onCancel }: {
  parentEmail: string;
  parentId: string;
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
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
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
                {child.firstName} {child.lastName} (Grade: {child.gradeLevel})
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
  const [membershipPaymentDialog, setMembershipPaymentDialog] = useState<{ open: boolean; membership: any }>({ open: false, membership: null });
  const [createMembershipDialog, setCreateMembershipDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { schoolId } = useSchoolAdmin();

  const { data: profile, isLoading, error } = useQuery<ParentProfile>({
    queryKey: [`/api/parent-profile/${parentId}`],
    enabled: !!parentId,
  });

  // Membership payment mutation
  const markMembershipPaidMutation = useMutation({
    mutationFn: async ({ membershipId, parentEmail, amount }: { membershipId: number; parentEmail: string; amount: number }) => {
      return apiRequest("POST", "/api/payment-history/membership/manual", {
        membershipId,
        parentEmail,
        amount,
        description: `Manual membership payment marked as paid`,
        notes: `Payment marked as paid by school administrator`
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Recorded",
        description: "Membership has been marked as paid successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setMembershipPaymentDialog({ open: false, membership: null });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record membership payment",
        variant: "destructive",
      });
    },
  });

  // Create membership mutation
  const createMembershipMutation = useMutation({
    mutationFn: async (membershipData: { parentUserId: number; schoolId: number; membershipYear: number }) => {
      return apiRequest("POST", "/api/admin/membership-enrollments", membershipData);
    },
    onSuccess: () => {
      toast({
        title: "Membership Created",
        description: "Annual membership has been created successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setCreateMembershipDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create membership",
        variant: "destructive",
      });
    },
  });

  // Stripe checkout mutation
  const createCheckoutMutation = useMutation({
    mutationFn: async ({ membershipId, tier }: { membershipId: number; tier: string }) => {
      const response = await apiRequest("POST", "/api/membership/checkout", {
        membershipId,
        tier,
      });
      
      // apiRequest returns Response, need to parse JSON manually
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}: Failed to create checkout session`);
      }
      
      return await response.json();
    },
    onSuccess: (data: any) => {
      // Now data is parsed JSON, check for sessionUrl or url
      const checkoutUrl = data.sessionUrl || data.url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        toast({
          title: "Error",
          description: "No checkout URL returned from server",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    },
  });

  // Comp/Free membership mutation
  const compFreeMutation = useMutation({
    mutationFn: async (membershipId: number) => {
      return apiRequest("PATCH", `/api/admin/membership-enrollments/${membershipId}`, {
        status: 'active',
        amountPaid: 0,
        remainingBalance: 0,
        paymentMethod: 'comp',
        notes: 'Marked as complimentary/free by school administrator'
      });
    },
    onSuccess: () => {
      toast({
        title: "Membership Updated",
        description: "Membership has been marked as complimentary/free."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update membership",
        variant: "destructive",
      });
    },
  });

  // Change tier mutation
  const changeTierMutation = useMutation({
    mutationFn: async ({ membershipId, tier }: { membershipId: number; tier: string }) => {
      return apiRequest("PATCH", `/api/admin/membership-enrollments/${membershipId}`, {
        membershipTier: tier
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Tier Changed",
        description: `Membership tier changed to ${variables.tier}.`
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change membership tier",
        variant: "destructive",
      });
    },
  });

  // Delete membership mutation
  const deleteMembershipMutation = useMutation({
    mutationFn: async (membershipId: number) => {
      return apiRequest("DELETE", `/api/admin/membership-enrollments/${membershipId}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Membership Deleted",
        description: "Membership has been deleted successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete membership",
        variant: "destructive",
      });
    },
  });

  // Activate membership mutation (generates Member ID)
  const activateMembershipMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", `/api/admin/parents/${userId}/membership/activate`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to activate membership');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Membership Activated",
        description: `Member ID ${data.memberId} has been generated for this parent.`
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate membership",
        variant: "destructive",
      });
    },
  });

  // Revoke membership mutation (clears Member ID)
  const revokeMembershipMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", `/api/admin/parents/${userId}/membership/revoke`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to revoke membership');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Membership Revoked",
        description: "Member ID has been removed from this parent's account."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke membership",
        variant: "destructive",
      });
    },
  });

  // Copy Member ID to clipboard
  const handleCopyMemberId = () => {
    if (profile?.parent.memberId) {
      navigator.clipboard.writeText(profile.parent.memberId);
      toast({
        title: "Copied",
        description: "Member ID copied to clipboard."
      });
    }
  };

  // Membership action handlers
  const handlePayViaStripe = (membership: any) => {
    createCheckoutMutation.mutate({
      membershipId: membership.id,
      tier: membership.membershipTier || 'basic'
    });
  };

  const handleCompFree = (membership: any) => {
    compFreeMutation.mutate(membership.id);
  };

  const handleChangeTier = (membership: any, tier: 'basic' | 'standard' | 'premium' | 'vip') => {
    changeTierMutation.mutate({
      membershipId: membership.id,
      tier
    });
  };

  const handleDeleteMembership = (membership: any) => {
    if (confirm(`Are you sure you want to delete this membership? This action cannot be undone.`)) {
      deleteMembershipMutation.mutate(membership.id);
    }
  };

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
    const errorMessage = (error as any)?.message || 'The requested parent profile could not be found.';
    const isNotParent = errorMessage.toLowerCase().includes('not a parent');
    const isAccessDenied = errorMessage.toLowerCase().includes('permission');
    
    let title = 'Parent Not Found';
    let description = 'The requested parent profile could not be found.';
    
    if (isNotParent) {
      title = 'Not a Parent Account';
      description = 'This user does not have a parent role assigned to their account.';
    } else if (isAccessDenied) {
      title = 'Access Denied';
      description = 'You do not have permission to view this parent profile.';
    }
    
    return (
      <SchoolAdminLayout pageTitle="Parent Profile">
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold" data-testid="error-title">{title}</h2>
          <p className="text-muted-foreground text-center max-w-md" data-testid="error-description">{description}</p>
          <Link href="/schools/users">
            <Button data-testid="button-back-users">
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
            <div className="flex items-center justify-between">
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
              
              {/* Membership Status Badge */}
              {profile.membershipEnrollments.length > 0 && (() => {
                // Helper to check if status is active (enrolled = active in DB schema)
                const isActiveStatus = (status: string) => status === 'enrolled' || status === 'active';
                
                // Prioritize: enrolled/active > grace_period > pending_payment by latest renewal date
                const sortedEnrollments = [...profile.membershipEnrollments].sort((a, b) => {
                  const statusPriority = { enrolled: 0, active: 0, grace_period: 1, pending_payment: 2, expired: 3, cancelled: 4, suspended: 5 };
                  const aPriority = statusPriority[a.status as keyof typeof statusPriority] ?? 999;
                  const bPriority = statusPriority[b.status as keyof typeof statusPriority] ?? 999;
                  
                  if (aPriority !== bPriority) return aPriority - bPriority;
                  
                  // Same status: prefer latest renewal date
                  const aDate = a.renewalDate ? new Date(a.renewalDate).getTime() : 0;
                  const bDate = b.renewalDate ? new Date(b.renewalDate).getTime() : 0;
                  return bDate - aDate;
                });
                
                const activeMembership = sortedEnrollments[0];
                const tierDisplay = (activeMembership.membershipTier || 'basic').charAt(0).toUpperCase() + (activeMembership.membershipTier || 'basic').slice(1);
                const renewalDate = activeMembership.renewalDate ? new Date(activeMembership.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                
                // Display status text (show "ACTIVE" for "enrolled")
                const displayStatus = isActiveStatus(activeMembership.status) ? 'ACTIVE' : activeMembership.status.replace('_', ' ').toUpperCase();
                
                return (
                  <div className="flex flex-col items-end space-y-2" data-testid="membership-status-badge">
                    <Badge 
                      variant={
                        isActiveStatus(activeMembership.status) ? 'default' :
                        activeMembership.status === 'pending_payment' ? 'secondary' :
                        activeMembership.status === 'grace_period' ? 'outline' :
                        activeMembership.status === 'expired' ? 'destructive' : 'secondary'
                      }
                      className="text-sm"
                    >
                      {isActiveStatus(activeMembership.status) && <CheckCircle className="h-3 w-3 mr-1" />}
                      {activeMembership.status === 'pending_payment' && <Clock className="h-3 w-3 mr-1" />}
                      {activeMembership.status === 'grace_period' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {activeMembership.status === 'expired' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {tierDisplay} Membership
                    </Badge>
                    <div className="flex flex-col items-end text-xs text-muted-foreground">
                      <span className="font-medium">{displayStatus}</span>
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        Renews: {renewalDate}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardHeader>
        </Card>

        {/* Member ID Card */}
        <Card data-testid="card-member-id">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Member ID</CardTitle>
                  <CardDescription>Manage membership status for this parent</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {profile.parent.memberId ? (
                  <>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active Member
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline">
                    <XCircle className="h-3 w-3 mr-1" />
                    No Membership
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {profile.parent.memberId ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Member ID:</span>
                    <code className="text-lg font-mono font-bold text-primary bg-white/50 px-3 py-1 rounded" data-testid="text-admin-member-id">
                      {profile.parent.memberId}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleCopyMemberId}
                      className="h-8"
                      data-testid="btn-admin-copy-member-id"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        data-testid="btn-admin-revoke-membership"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Revoke Membership
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Membership</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to revoke membership for {profile.parent.firstName} {profile.parent.lastName}?
                          This will remove their Member ID ({profile.parent.memberId}) from their account.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => revokeMembershipMutation.mutate(profile.parent.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {revokeMembershipMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Revoke Membership
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {/* Show warning if member has ID but no enrollment record for this school */}
                {profile.summary.totalMemberships === 0 && (
                  <div className="flex items-center justify-between p-4 rounded-lg border border-amber-200 bg-amber-50">
                    <div className="flex items-center gap-2 text-sm text-amber-800">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Missing Enrollment Record</p>
                        <p className="text-xs text-amber-700">This member has an ID but no enrollment record. Click "Create Enrollment" to add one.</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => activateMembershipMutation.mutate(profile.parent.id)}
                      disabled={activateMembershipMutation.isPending || !schoolId}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                      data-testid="btn-admin-create-enrollment"
                    >
                      {activateMembershipMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Award className="h-4 w-4 mr-1" />
                      )}
                      Create Enrollment
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-lg border border-dashed">
                <div className="text-sm text-muted-foreground">
                  <p>This parent does not have a Member ID yet.</p>
                  <p className="text-xs mt-1">Generate a Member ID to activate their membership manually, or it will be created automatically when they complete a membership payment.</p>
                </div>
                <Button 
                  onClick={() => activateMembershipMutation.mutate(profile.parent.id)}
                  disabled={activateMembershipMutation.isPending}
                  data-testid="btn-admin-activate-membership"
                >
                  {activateMembershipMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Award className="h-4 w-4 mr-1" />
                  )}
                  Activate Membership
                </Button>
              </div>
            )}
          </CardContent>
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
              <CardTitle className="text-sm font-medium">Memberships</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.summary.totalMemberships}</div>
              <p className="text-xs text-muted-foreground">
                {profile.summary.activeMemberships} active
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information */}
        <Tabs defaultValue="children" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="children">Children</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="memberships">Memberships</TabsTrigger>
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
                      <Card key={child.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                          <Link href={`/children/${child.id}`} className="flex-1 cursor-pointer">
                            <div>
                              <h3 className="font-semibold text-lg hover:text-primary">
                                {child.firstName} {child.lastName}
                              </h3>
                              <div className="text-sm text-muted-foreground space-y-1 mt-2">
                                <p>Grade: {child.gradeLevel}</p>
                                <p>Birth Date: {child.birthdate ? new Date(child.birthdate + 'T00:00:00').toLocaleDateString() : 'No date set'}</p>
                                {child.allergies && <p>Allergies: {child.allergies}</p>}
                                {child.medicalInfo && <p>Medical Info: {child.medicalInfo}</p>}
                                {child.additionalLanguages && <p>Languages: {child.additionalLanguages}</p>}
                                {child.notes && <p>Notes: {child.notes}</p>}
                              </div>
                            </div>
                          </Link>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">ID: {child.schoolStudentId || child.id}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedChild(child);
                                setEditChildDialogOpen(true);
                              }}
                              data-testid={`button-edit-child-${child.id}`}
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
                              data-testid={`button-delete-child-${child.id}`}
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
                  parentId={parentId!}
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

          <TabsContent value="memberships">
            <Card>
              <CardHeader>
                <CardTitle>Annual Membership</CardTitle>
                <CardDescription>
                  Family membership status and payment history
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profile.membershipEnrollments.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center space-y-4">
                      <GraduationCap className="h-12 w-12 text-muted-foreground/50" />
                      <p>No membership enrollments found</p>
                      <p className="text-sm">This family hasn't been enrolled in any membership programs yet.</p>
                      <Button 
                        onClick={() => setCreateMembershipDialog(true)}
                        className="mt-4"
                      >
                        Create Membership
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profile.membershipEnrollments.map((membership) => (
                      <div key={membership.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-lg">{membership.schoolName} Membership {membership.membershipYear}</h3>
                              <Badge variant="outline" className="font-medium">
                                {(membership.membershipTier || 'basic').toUpperCase()}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {membership.startDate && (
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Started: {new Date(membership.startDate).toLocaleDateString()}
                                </span>
                              )}
                              {membership.renewalDate && (
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Renews: {new Date(membership.renewalDate).toLocaleDateString()}
                                </span>
                              )}
                              {!membership.startDate && !membership.renewalDate && (
                                <>
                                  <span>Due: {new Date(membership.dueDate).toLocaleDateString()}</span>
                                  <span>Expires: {new Date(membership.expirationDate).toLocaleDateString()}</span>
                                </>
                              )}
                              {membership.stripeSubscriptionId && (
                                <a 
                                  href={`https://dashboard.stripe.com/subscriptions/${membership.stripeSubscriptionId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                                  data-testid={`link-stripe-subscription-${membership.id}`}
                                >
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  View in Stripe
                                </a>
                              )}
                            </div>
                          </div>
                          <Badge variant={
                            (membership.status === 'active' || membership.status === 'enrolled') ? 'default' :
                            membership.status === 'pending_payment' ? 'secondary' :
                            membership.status === 'grace_period' ? 'outline' :
                            membership.status === 'expired' ? 'destructive' : 'secondary'
                          }>
                            {membership.status === 'enrolled' ? 'ACTIVE' : membership.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Cost</p>
                            <p className="font-semibold">${membership.totalCost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Amount Paid</p>
                            <p className="font-semibold text-green-600">${membership.amount.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Balance Due</p>
                            <p className={`font-semibold ${membership.remainingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              ${membership.remainingBalance.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {membership.status === 'grace_period' && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <div className="flex items-center">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                              <p className="text-sm text-yellow-800">
                                Grace period ends {new Date(membership.gracePeriodEnd).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Admin Controls */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {membership.remainingBalance > 0 && (
                            <>
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => handlePayViaStripe(membership)}
                                disabled={createCheckoutMutation.isPending}
                                data-testid={`button-pay-stripe-${membership.id}`}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                {createCheckoutMutation.isPending ? "Processing..." : "Pay via Stripe"}
                              </Button>
                              
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setMembershipPaymentDialog({ open: true, membership })}
                                disabled={markMembershipPaidMutation.isPending}
                                data-testid={`button-already-paid-${membership.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {markMembershipPaidMutation.isPending ? "Processing..." : "Already Paid"}
                              </Button>
                              
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleCompFree(membership)}
                                disabled={compFreeMutation.isPending}
                                data-testid={`button-comp-free-${membership.id}`}
                              >
                                <DollarSign className="h-4 w-4 mr-1" />
                                {compFreeMutation.isPending ? "Processing..." : "Comp/Free"}
                              </Button>
                            </>
                          )}
                          
                          <Select
                            defaultValue={membership.membershipTier || 'basic'}
                            onValueChange={(tier) => handleChangeTier(membership, tier as 'basic' | 'standard' | 'premium' | 'vip')}
                            disabled={changeTierMutation.isPending}
                          >
                            <SelectTrigger className="w-[140px] h-9" data-testid={`select-tier-${membership.id}`}>
                              <SelectValue placeholder="Change Tier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="vip">VIP</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleDeleteMembership(membership)}
                            disabled={deleteMembershipMutation.isPending}
                            data-testid={`button-delete-${membership.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            {deleteMembershipMutation.isPending ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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

        {/* Mark Membership as Paid Dialog */}
        <Dialog open={membershipPaymentDialog.open} onOpenChange={(open) => setMembershipPaymentDialog({ open, membership: membershipPaymentDialog.membership })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark Membership as Paid</DialogTitle>
              <DialogDescription>
                Record a manual payment for this membership. This action will mark the full remaining balance as paid.
              </DialogDescription>
            </DialogHeader>
            {membershipPaymentDialog.membership && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">{membershipPaymentDialog.membership.schoolName} Membership {membershipPaymentDialog.membership.membershipYear}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Parent:</span>
                      <p className="font-medium">{profile?.parent.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Remaining Balance:</span>
                      <p className="font-medium text-orange-600">${membershipPaymentDialog.membership.remainingBalance.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p>• This will create a manual payment record</p>
                  <p>• The membership status will be updated to "Active"</p>
                  <p>• A payment receipt will be emailed to the parent</p>
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setMembershipPaymentDialog({ open: false, membership: null })}
                disabled={markMembershipPaidMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (membershipPaymentDialog.membership && profile?.parent.email) {
                    markMembershipPaidMutation.mutate({
                      membershipId: membershipPaymentDialog.membership.id,
                      parentEmail: profile.parent.email,
                      amount: membershipPaymentDialog.membership.remainingBalance
                    });
                  }
                }}
                disabled={markMembershipPaidMutation.isPending}
              >
                {markMembershipPaidMutation.isPending ? "Processing..." : "Mark as Paid"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Membership Dialog */}
        <Dialog open={createMembershipDialog} onOpenChange={setCreateMembershipDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Annual Membership</DialogTitle>
              <DialogDescription>
                Create a new annual membership enrollment for this family
              </DialogDescription>
            </DialogHeader>
            {profile && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Family Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Parent:</span>
                      <p className="font-medium">{profile.parent.firstName} {profile.parent.lastName}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <p className="font-medium">{profile.parent.email}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Membership Details</h4>
                  <div className="text-sm space-y-1">
                    <p>• Membership Year: {new Date().getFullYear()}</p>
                    <p>• School: American Seekers Academy</p>
                    <p>• Status: Pending Payment</p>
                    <p>• Annual membership fee will be determined by school settings</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p>• This will create a new membership enrollment for the current school year</p>
                  <p>• The family will be able to see and pay for their membership</p>
                  <p>• Membership fees are configured in school settings</p>
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setCreateMembershipDialog(false)}
                disabled={createMembershipMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (profile && schoolId) {
                    createMembershipMutation.mutate({
                      parentUserId: profile.parent.id,
                      schoolId: schoolId,
                      membershipYear: new Date().getFullYear()
                    });
                  }
                }}
                disabled={createMembershipMutation.isPending}
              >
                {createMembershipMutation.isPending ? "Creating..." : "Create Membership"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SchoolAdminLayout>
  );
}