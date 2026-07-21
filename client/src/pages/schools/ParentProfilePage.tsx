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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Pencil,
  Trash2,
  Award,
  Copy,
  Loader2,
  XCircle,
  Gift,
  Download,
  FileText
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
    locationId?: number | null;
    locationName?: string | null;
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
    locationId?: number | null;
    locationName?: string | null;
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
    totalPaid?: number;
    remainingBalance: number;
    effectiveBalance?: number;
    paymentPlan?: string;
    compPercentage?: number;
    compAmountCents?: number;
    compReason?: string;
  }>;
  membershipEnrollments: Array<{
    id: number;
    schoolId: number;
    schoolName: string;
    membershipYear: number;
    amount: number;
    amountPaid: number;
    totalCost: number;
    remainingBalance: number;
    balanceDue: number;
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
    cardAmount?: number;
    creditsApplied?: number;
    totalSettlement?: number;
    hasCreditsBreakdown?: boolean;
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
    childName?: string;
    className?: string;
    programStartDate?: string;
    programEndDate?: string;
  }>;
  emergencyContacts: Array<{
    childId: number;
    childName: string;
    emergencyContact: string;
  }>;
  credits: Array<{
    id: number;
    creditType: string;
    title: string;
    description: string | null;
    creditAmountCents: number;
    usedAmountCents: number;
    remainingAmountCents: number;
    status: string;
    rejectionReason?: string | null;
    expiresAt: string | null;
    createdAt: string;
    approvedAt: string | null;
    usageLogs: Array<{
      id: number;
      amountCents: number;
      description: string | null;
      createdAt: string;
      enrollmentId?: number;
      childName?: string;
      className?: string;
    }>;
  }>;
  summary: {
    totalChildren: number;
    totalEnrollments: number;
    totalMemberships: number;
    totalCredits: number;
    totalCreditAmountCents: number;
    totalCreditUsedCents: number;
    availableCreditBalanceCents: number;
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

function ParentDocumentsTab({ parentId }: { parentId: string }) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ success: boolean; documents: Array<{
    id: number;
    title: string;
    category: string;
    fileSize: number;
    createdAt: string;
    fileName: string;
  }> }>({
    queryKey: ['/api/schools/parents', parentId, 'documents'],
    enabled: !!parentId,
  });

  const documents = data?.documents ?? [];

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const categoryColors: Record<string, string> = {
    policy: 'bg-blue-100 text-blue-800',
    form: 'bg-green-100 text-green-800',
    handbook: 'bg-purple-100 text-purple-800',
    announcement: 'bg-orange-100 text-orange-800',
    other: 'bg-gray-100 text-gray-800',
  };

  async function handleDownload(docId: number) {
    try {
      const response = await apiRequest('GET', `/api/schools/documents/${docId}/download`);
      if (!response.ok) {
        toast({ title: 'Download failed', description: 'Could not download the document.', variant: 'destructive' });
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Download failed', description: 'Could not download the document.', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Published documents visible to this parent</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg animate-pulse">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-8 w-8 bg-gray-200 rounded" />
                  <div className="space-y-1 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-32" />
                  </div>
                </div>
                <div className="h-8 w-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No documents available</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No published documents are currently visible to this parent.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-xs ${categoryColors[doc.category] ?? categoryColors.other}`}>
                        {doc.category.charAt(0).toUpperCase() + doc.category.slice(1)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-4 shrink-0"
                  onClick={() => handleDownload(doc.id)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Returns the effective balance owed for an enrollment in DOLLARS (parent-profile API). */
function enrollmentEffectiveBalance(e: {
  effectiveBalance?: number;
  totalCost: number;
  totalPaid?: number;
  compAmountCents?: number;
}): number {
  if (typeof e.effectiveBalance === 'number') return e.effectiveBalance;
  const compDollars = (e.compAmountCents ?? 0) / 100;
  return Math.max(0, e.totalCost - (e.totalPaid || 0) - compDollars);
}

type ParentProfilePageProps = {
  /** When embedded in unified /schools/users/:userId profile */
  userIdOverride?: string;
  embedded?: boolean;
};

function ProfileShell({
  embedded,
  pageTitle,
  children,
}: {
  embedded?: boolean;
  pageTitle: string;
  children: React.ReactNode;
}) {
  if (embedded) return <>{children}</>;
  return <SchoolAdminLayout pageTitle={pageTitle}>{children}</SchoolAdminLayout>;
}

export default function ParentProfilePage({ userIdOverride, embedded }: ParentProfilePageProps = {}) {
  const [match, params] = useRoute('/schools/parents/:parentId');
  const parentId = userIdOverride ?? params?.parentId;
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
  const [editChildDialogOpen, setEditChildDialogOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState<any>(null);
  const [addEnrollmentDialogOpen, setAddEnrollmentDialogOpen] = useState(false);
  const [membershipPaymentDialog, setMembershipPaymentDialog] = useState<{ open: boolean; membership: any }>({ open: false, membership: null });
  const [createMembershipDialog, setCreateMembershipDialog] = useState(false);
  
  // Enrollment management state
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);
  const [unenrollDialogOpen, setUnenrollDialogOpen] = useState(false);
  const [reallocateDialogOpen, setReallocateDialogOpen] = useState(false);
  const [reallocateType, setReallocateType] = useState<'enrollment' | 'credit' | 'refund' | 'manual_refund'>('credit');
  const [reallocateAmount, setReallocateAmount] = useState('');
  const [reallocateTargetEnrollmentId, setReallocateTargetEnrollmentId] = useState('');
  const [reallocateComment, setReallocateComment] = useState('');
  
  // Comp enrollment state
  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const [compPercentage, setCompPercentage] = useState('100');
  const [compReason, setCompReason] = useState('');
  
  // Reschedule payment state
  const [reschedulePaymentDialog, setReschedulePaymentDialog] = useState<{ 
    open: boolean; 
    payment: ParentProfile['scheduledPayments'][0] | null 
  }>({ open: false, payment: null });
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleComment, setRescheduleComment] = useState('');
  
  // Delete payment plan state
  const [deletePaymentPlanDialog, setDeletePaymentPlanDialog] = useState<{
    open: boolean;
    enrollmentId: number | null;
    enrollmentName: string;
    paymentCount: number;
  }>({ open: false, enrollmentId: null, enrollmentName: '', paymentCount: 0 });
  
  // Delete single scheduled payment state
  const [deleteScheduledPaymentDialog, setDeleteScheduledPaymentDialog] = useState<{
    open: boolean;
    payment: ParentProfile['scheduledPayments'][0] | null;
  }>({ open: false, payment: null });
  
  // Credit management state
  const [creditToRevoke, setCreditToRevoke] = useState<any>(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [isAwardCreditOpen, setIsAwardCreditOpen] = useState(false);
  const [awardCreditForm, setAwardCreditForm] = useState({
    creditAmountDollars: '',
    title: '',
    description: '',
    notes: '',
    expiresAt: '',
  });
  const [creditToEdit, setCreditToEdit] = useState<ParentProfile['credits'][0] | null>(null);
  const [editCreditForm, setEditCreditForm] = useState({
    creditAmountDollars: '',
    title: '',
    description: '',
    notes: '',
    expiresAt: '',
  });

  // Edit parent state
  const [editParentDialogOpen, setEditParentDialogOpen] = useState(false);
  const [editParentFirstName, setEditParentFirstName] = useState('');
  const [editParentLastName, setEditParentLastName] = useState('');
  const [editParentPhone, setEditParentPhone] = useState('');

  // Campus change state
  const [pendingCampusLocationId, setPendingCampusLocationId] = useState<string | null>(null);
  const [campusConfirmOpen, setCampusConfirmOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { schoolId } = useSchoolAdmin();

  // Helper to format dates consistently with local timezone
  // Prevents off-by-one day display when dates are stored as ISO date strings (YYYY-MM-DD)
  const formatDate = (dateValue: string | Date) => {
    if (!dateValue) return 'N/A';
    const dateStr = typeof dateValue === 'string' ? dateValue : dateValue.toISOString();
    // If it's a date-only string (no time component), append T00:00:00 to interpret as local time
    const normalizedDate = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
    return new Date(normalizedDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric', 
      year: 'numeric'
    });
  };

  const { data: profile, isLoading, error } = useQuery<ParentProfile>({
    queryKey: [`/api/parent-profile/${parentId}`],
    enabled: !!parentId,
  });

  const { data: schoolLocations = [] } = useQuery<Array<{ id: number; name: string; isActive?: boolean }>>({
    queryKey: ['/api/locations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/locations');
      return res.json();
    },
    enabled: !!parentId,
  });

  const changeCampusMutation = useMutation({
    mutationFn: async (locationId: number) => {
      return apiRequest('PATCH', `/api/locations/parent/${parentId}/location`, { locationId });
    },
    onSuccess: async (_res, locationId) => {
      const campusName =
        schoolLocations.find((l) => l.id === locationId)?.name ?? `Campus #${locationId}`;
      toast({
        title: 'Campus updated',
        description: `Moved family to ${campusName}. Existing enrollments were not changed.`,
      });
      setCampusConfirmOpen(false);
      setPendingCampusLocationId(null);
      await queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/school-admin/students'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not update campus',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
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

  // Reschedule payment mutation
  const reschedulePaymentMutation = useMutation({
    mutationFn: async ({ paymentId, newDate, adminComment }: { paymentId: number; newDate: string; adminComment: string }) => {
      return apiRequest("PATCH", `/api/admin/enrollments/scheduled-payments/${paymentId}/reschedule`, {
        newDate,
        adminComment
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Rescheduled",
        description: "The payment due date has been updated successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      // Also invalidate parent's upcoming payments view to keep data in sync
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      setReschedulePaymentDialog({ open: false, payment: null });
      setRescheduleDate('');
      setRescheduleComment('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reschedule payment",
        variant: "destructive",
      });
    },
  });

  // Delete payment plan mutation
  const deletePaymentPlanMutation = useMutation({
    mutationFn: async ({ enrollmentId }: { enrollmentId: number }) => {
      const response = await apiRequest("DELETE", `/api/admin/enrollments/${enrollmentId}/scheduled-payments`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete payment plan');
      }
      return response.json();
    },
    onSuccess: (data: { deletedCount: number }) => {
      toast({
        title: "Payment Plan Deleted",
        description: `Successfully removed ${data.deletedCount} scheduled payment(s).`
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      // Also invalidate parent's upcoming payments view to remove stale data
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      setDeletePaymentPlanDialog({ open: false, enrollmentId: null, enrollmentName: '', paymentCount: 0 });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment plan",
        variant: "destructive",
      });
    },
  });

  // Delete single scheduled payment mutation
  const deleteScheduledPaymentMutation = useMutation({
    mutationFn: async ({ paymentId }: { paymentId: number }) => {
      const response = await apiRequest("DELETE", `/api/admin/enrollments/scheduled-payments/${paymentId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete scheduled payment');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Deleted",
        description: "The scheduled payment has been removed successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      setDeleteScheduledPaymentDialog({ open: false, payment: null });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete scheduled payment",
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
  // Comp/Free membership — server applies full waiver + member ID when paymentMethod is comp
  const compFreeMutation = useMutation({
    mutationFn: async (membershipId: number) => {
      return apiRequest("PATCH", `/api/admin/membership-enrollments/${membershipId}`, {
        paymentMethod: "comp",
        notes: "Complimentary membership (school administrator)",
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

  const createCreditMutation = useMutation({
    mutationFn: async (data: {
      userId: number;
      creditAmountCents: number;
      title: string;
      description?: string;
      notes?: string;
      expiresAt?: string;
    }) => {
      const response = await apiRequest('POST', '/api/credits/manual', {
        ...data,
        autoApprove: true,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to award credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Credit awarded', description: 'The credit is available on this account.' });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setIsAwardCreditOpen(false);
      setAwardCreditForm({ creditAmountDollars: '', title: '', description: '', notes: '', expiresAt: '' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateCreditMutation = useMutation({
    mutationFn: async (data: {
      creditId: number;
      creditAmountCents?: number;
      title?: string;
      description?: string;
      notes?: string;
      expiresAt?: string | null;
    }) => {
      const response = await apiRequest('POST', '/api/credits/update', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Credit updated', description: 'Credit details saved.' });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setCreditToEdit(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Revoke credit mutation
  const revokeCreditMutation = useMutation({
    mutationFn: async ({ creditId, reason }: { creditId: number; reason?: string }) => {
      const response = await apiRequest('POST', '/api/credits/revoke', { creditId, reason });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Credit removed",
        description: "The credit has been removed from this account."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setCreditToRevoke(null);
      setRevocationReason('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove credit",
        variant: "destructive",
      });
    },
  });

  // Unenroll mutation
  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      const response = await apiRequest("DELETE", `/api/admin/enrollments/${enrollmentId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Unenrolled",
        description: "Enrollment has been deleted successfully."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setUnenrollDialogOpen(false);
      setSelectedEnrollment(null);
    },
    onError: (error: any) => {
      if (error.error === 'PAYMENTS_EXIST') {
        toast({
          title: "Cannot Unenroll",
          description: `This enrollment has ${error.details?.totalPaidFormatted} in payments. Please reallocate or refund the payments first.`,
          variant: "destructive",
        });
        // Open reallocate dialog instead
        setUnenrollDialogOpen(false);
        setReallocateDialogOpen(true);
        setReallocateAmount(String((error.details?.totalPaid || 0) / 100));
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to unenroll",
          variant: "destructive",
        });
      }
    },
  });

  // Comp enrollment mutation
  const compEnrollmentMutation = useMutation({
    mutationFn: async ({ enrollmentId, compPercentage, compReason }: { 
      enrollmentId: number; 
      compPercentage: number; 
      compReason: string;
    }) => {
      const response = await apiRequest("POST", `/api/admin/enrollments/${enrollmentId}/comp`, {
        compPercentage,
        compReason
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to comp enrollment');
      }
      return response.json();
    },
    onSuccess: (data) => {
      const msg = data.compedEnrollment.isFullyComped 
        ? `${data.compedEnrollment.childName} is now enrolled in ${data.compedEnrollment.className}` 
        : `${data.compedEnrollment.compPercentage}% discount applied`;
      toast({
        title: "Enrollment Comped",
        description: msg
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/class-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      setCompDialogOpen(false);
      setSelectedEnrollment(null);
      setCompPercentage('100');
      setCompReason('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to comp enrollment",
        variant: "destructive",
      });
    },
  });

  // Reallocate payment mutation. The endpoint contract is cents-only
  // (`amountCents: positive integer`); callers convert at the boundary so
  // the dollar→cents math lives in exactly one place per call site.
  const reallocatePaymentMutation = useMutation({
    mutationFn: async ({ enrollmentId, targetType, amountCents, targetEnrollmentId, adminComment }: {
      enrollmentId: number;
      targetType: 'enrollment' | 'credit' | 'refund' | 'manual_refund';
      amountCents: number;
      targetEnrollmentId?: number;
      adminComment: string;
    }) => {
      const response = await apiRequest("POST", `/api/admin/enrollments/${enrollmentId}/reallocate-payment`, {
        targetType,
        amountCents,
        targetEnrollmentId: targetEnrollmentId || undefined,
        adminComment
      });
      if (!response.ok) {
        const errorData = await response.json();
        const message: string = errorData.error || 'Failed to reallocate payment';
        const suggestManualRefund: boolean = errorData.suggestManualRefund || false;
        const details: string = errorData.details || '';
        throw Object.assign(new Error(message), { suggestManualRefund, details });
      }
      return response.json();
    },
    onSuccess: (data) => {
      let description = '';
      if (data.targetType === 'enrollment') {
        description = `Payment transferred to ${data.targetEnrollment?.className || 'another enrollment'}`;
      } else if (data.targetType === 'credit') {
        description = `$${(data.amount / 100).toFixed(2)} added as account credit`;
      } else if (data.targetType === 'refund') {
        description = `$${(data.amount / 100).toFixed(2)} refunded to original payment method`;
      } else if (data.targetType === 'manual_refund') {
        description = `$${(data.amount / 100).toFixed(2)} recorded as manual refund — please handle the money transfer externally`;
      }
      toast({
        title: "Payment Reallocated",
        description
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      setReallocateDialogOpen(false);
      setSelectedEnrollment(null);
      resetReallocateForm();
    },
    onError: (error: any) => {
      const description = error.suggestManualRefund
        ? `${error.message} Use "Manual Refund" to record this without Stripe.`
        : (error.message || "Failed to reallocate payment");
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const resetReallocateForm = () => {
    setReallocateType('credit');
    setReallocateAmount('');
    setReallocateTargetEnrollmentId('');
    setReallocateComment('');
  };

  // Edit parent mutation
  const editParentMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/parents/${parentId}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update parent');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Parent Updated",
        description: "Parent information has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/parent-profile/${parentId}`] });
      setEditParentDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update parent",
        variant: "destructive",
      });
    },
  });

  const handleEditParentSubmit = () => {
    if (!editParentFirstName.trim() || !editParentLastName.trim()) {
      toast({
        title: "Required Fields",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }
    editParentMutation.mutate({
      firstName: editParentFirstName.trim(),
      lastName: editParentLastName.trim(),
      phone: editParentPhone.trim()
    });
  };

  const handleReallocateSubmit = () => {
    if (!selectedEnrollment) return;
    const amount = parseFloat(reallocateAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    if (!reallocateComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a reason for this reallocation",
        variant: "destructive",
      });
      return;
    }
    if (reallocateType === 'enrollment' && !reallocateTargetEnrollmentId) {
      toast({
        title: "Select Target",
        description: "Please select a target enrollment",
        variant: "destructive",
      });
      return;
    }
    // Convert dollars → cents at the call boundary (multiply by 100, round
    // to nearest integer to avoid floating-point drift like 12.34 * 100).
    const amountCents = Math.round(amount * 100);
    reallocatePaymentMutation.mutate({
      enrollmentId: selectedEnrollment.id,
      targetType: reallocateType,
      amountCents,
      targetEnrollmentId: reallocateType === 'enrollment' ? parseInt(reallocateTargetEnrollmentId) : undefined,
      adminComment: reallocateComment
    });
  };

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

  const handleCompFree = (membershipId: number) => {
    compFreeMutation.mutate(membershipId);
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
    } catch (error: any) {
      console.error("Failed to delete child:", error);
      
      // Check if this is a blocking reference error (409 Conflict)
      let errorMessage = "Failed to delete child. Please try again.";
      
      if (error?.message) {
        // The apiRequest throws with the server message
        errorMessage = error.message;
      }
      
      toast({
        title: "Cannot Delete Child",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Close dialog so user can see the error
      setDeleteDialogOpen(false);
      setChildToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <ProfileShell embedded={embedded} pageTitle="Parent Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </ProfileShell>
    );
  }

  if (error || !profile) {
    const errorMessage = (error as any)?.message || 'The requested parent profile could not be found.';
    const lower = errorMessage.toLowerCase();
    const isNotParent = lower.includes('not a parent');
    const isAccessDenied =
      lower.includes('permission') ||
      lower.includes('associated with a school');
    const isServerError = /^5\d{2}:/.test(errorMessage) || lower.includes('internal server error');
    
    let title = 'Parent Not Found';
    let description = 'The requested parent profile could not be found.';
    
    if (isNotParent) {
      title = 'Not a Parent Account';
      description = 'This user does not have a parent role assigned to their account.';
    } else if (isAccessDenied) {
      title = 'Access Denied';
      description = 'You do not have permission to view this parent profile.';
    } else if (isServerError) {
      title = 'Could Not Load Profile';
      description =
        'The server failed while loading this parent profile. Refresh the page or check Replit logs for PARENT_PROFILE_FETCH_ERROR.';
    }
    
    return (
      <ProfileShell embedded={embedded} pageTitle="Parent Profile">
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold" data-testid="error-title">{title}</h2>
          <p className="text-muted-foreground text-center max-w-md" data-testid="error-description">{description}</p>
          {!embedded && (
            <Link href="/schools/users">
              <Button data-testid="button-back-users">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Users
              </Button>
            </Link>
          )}
        </div>
      </ProfileShell>
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
    <ProfileShell
      embedded={embedded}
      pageTitle={`${profile.parent.firstName} ${profile.parent.lastName}`}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          {!embedded && (
            <Link href="/schools/users">
              <Button variant="ghost">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Users
              </Button>
            </Link>
          )}
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
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl">
                      {profile.parent.firstName} {profile.parent.lastName}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditParentFirstName(profile.parent.firstName || '');
                        setEditParentLastName(profile.parent.lastName || '');
                        setEditParentPhone(profile.parent.phone || '');
                        setEditParentDialogOpen(true);
                      }}
                      data-testid="btn-edit-parent"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
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
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Label htmlFor="parent-campus-select" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Campus
                    </Label>
                    <Select
                      value={
                        profile.parent.locationId != null
                          ? String(profile.parent.locationId)
                          : undefined
                      }
                      onValueChange={(value) => {
                        if (
                          profile.parent.locationId != null &&
                          String(profile.parent.locationId) === value
                        ) {
                          return;
                        }
                        setPendingCampusLocationId(value);
                        setCampusConfirmOpen(true);
                      }}
                      disabled={changeCampusMutation.isPending || schoolLocations.length === 0}
                    >
                      <SelectTrigger
                        id="parent-campus-select"
                        className="w-[200px]"
                        data-testid="parent-campus-select"
                      >
                        <SelectValue placeholder={profile.parent.locationName || 'Select campus'} />
                      </SelectTrigger>
                      <SelectContent position="item-aligned">
                        {schoolLocations
                          .filter((loc) => loc.isActive !== false)
                          .map((loc) => (
                            <SelectItem key={loc.id} value={String(loc.id)}>
                              {loc.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {profile.parent.locationName ? (
                      <span className="text-sm text-muted-foreground" data-testid="parent-campus-label">
                        {profile.parent.locationName}
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        No campus set
                      </span>
                    )}
                  </div>
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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="children">Children</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="memberships">Memberships</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="credits">Credits</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
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
                          <TableHead>Paid</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.enrollments.map((enrollment) => {
                          const totalPaid = enrollment.totalPaid || 0;
                          return (
                          <TableRow key={enrollment.id} data-testid={`enrollment-row-${enrollment.id}`}>
                            <TableCell className="font-medium">
                              {enrollment.childName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{enrollment.className}</div>
                                {enrollment.categoryName && (
                                  <Badge variant="secondary" className="text-xs mt-0.5 mb-0.5">{enrollment.categoryName}</Badge>
                                )}
                                {enrollment.classDescription && (
                                  <div className="text-sm text-muted-foreground line-clamp-2">
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
                              <span className={totalPaid > 0 ? 'text-green-600 font-medium' : ''}>
                                ${totalPaid.toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={enrollmentEffectiveBalance(enrollment) > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                                ${enrollmentEffectiveBalance(enrollment).toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {totalPaid > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedEnrollment(enrollment);
                                      setReallocateAmount(String(totalPaid));
                                      setReallocateDialogOpen(true);
                                    }}
                                    data-testid={`btn-reallocate-${enrollment.id}`}
                                  >
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Reallocate
                                  </Button>
                                )}
                                {/* Comp button - show for pending or enrolled enrollments with remaining balance and no existing comp */}
                                {['pending_payment', 'enrolled', 'pending_admin_approval'].includes(enrollment.status) && !enrollment.compPercentage && enrollmentEffectiveBalance(enrollment) > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-green-600 border-green-600 hover:bg-green-50"
                                    onClick={() => {
                                      setSelectedEnrollment(enrollment);
                                      setCompPercentage('100');
                                      setCompReason('');
                                      setCompDialogOpen(true);
                                    }}
                                    data-testid={`btn-comp-${enrollment.id}`}
                                  >
                                    <Gift className="h-4 w-4 mr-1" />
                                    Comp
                                  </Button>
                                )}
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedEnrollment(enrollment);
                                    setUnenrollDialogOpen(true);
                                  }}
                                  data-testid={`btn-unenroll-${enrollment.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Unenroll
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )})}
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

            {/* Unenroll Confirmation Dialog */}
            <AlertDialog open={unenrollDialogOpen} onOpenChange={setUnenrollDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unenroll from Class</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to unenroll {selectedEnrollment?.childName} from {selectedEnrollment?.className}?
                    {selectedEnrollment && (selectedEnrollment.totalPaid || 0) > 0 && (
                      <span className="block mt-2 text-amber-600 font-medium">
                        Note: This enrollment has ${(selectedEnrollment.totalPaid || 0).toFixed(2)} in payments. 
                        You may need to reallocate these funds first.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => {
                    setUnenrollDialogOpen(false);
                    setSelectedEnrollment(null);
                  }}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => selectedEnrollment && unenrollMutation.mutate(selectedEnrollment.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={unenrollMutation.isPending}
                    data-testid="btn-confirm-unenroll"
                  >
                    {unenrollMutation.isPending ? "Processing..." : "Unenroll"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Comp Enrollment Dialog */}
            <Dialog open={compDialogOpen} onOpenChange={(open) => {
              setCompDialogOpen(open);
              if (!open) {
                setSelectedEnrollment(null);
                setCompPercentage('100');
                setCompReason('');
              }
            }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-green-600" />
                    Comp Enrollment
                  </DialogTitle>
                  <DialogDescription>
                    Apply a complimentary discount to waive some or all of the enrollment cost.
                  </DialogDescription>
                </DialogHeader>
                {selectedEnrollment && (
                  <div className="space-y-4 py-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="font-medium">{selectedEnrollment.childName}</p>
                      <p className="text-sm text-muted-foreground">{selectedEnrollment.className}</p>
                      <p className="text-sm mt-2">
                        Total Cost: <span className="font-medium">${(selectedEnrollment.totalCost || 0).toFixed(2)}</span>
                      </p>
                      <p className="text-sm">
                        Already Paid: <span className="font-medium">${(selectedEnrollment.totalPaid || 0).toFixed(2)}</span>
                      </p>
                      <p className="text-sm">
                        Current Balance: <span className="font-medium text-red-600">${(enrollmentEffectiveBalance(selectedEnrollment) || selectedEnrollment.totalCost || 0).toFixed(2)}</span>
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">Comp Percentage</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={compPercentage}
                          onChange={(e) => setCompPercentage(e.target.value)}
                          className="w-24 p-2 border border-gray-300 rounded-md text-center"
                          data-testid="input-comp-percentage"
                        />
                        <span className="text-lg font-medium">%</span>
                        <div className="flex gap-1 ml-2">
                          {[25, 50, 75, 100].map((pct) => (
                            <Button
                              key={pct}
                              type="button"
                              variant={compPercentage === String(pct) ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCompPercentage(String(pct))}
                            >
                              {pct}%
                            </Button>
                          ))}
                        </div>
                      </div>
                      {selectedEnrollment && compPercentage && (
                        <p className="text-sm text-green-600 mt-2">
                          Comp amount: ${(((enrollmentEffectiveBalance(selectedEnrollment) || selectedEnrollment.totalCost) * parseInt(compPercentage || '0')) / 100).toFixed(2)}
                          {parseInt(compPercentage || '0') === 100 && (
                            <span className="text-green-700 font-medium ml-2">
                              (Fully comped - will be enrolled immediately)
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">Reason for Comp (optional)</label>
                      <input
                        type="text"
                        value={compReason}
                        onChange={(e) => setCompReason(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="e.g., Special arrangement, scholarship, etc."
                        data-testid="input-comp-reason"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setCompDialogOpen(false);
                          setSelectedEnrollment(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          if (selectedEnrollment && compPercentage) {
                            compEnrollmentMutation.mutate({
                              enrollmentId: selectedEnrollment.id,
                              compPercentage: parseInt(compPercentage),
                              compReason: compReason || `${compPercentage}% comp applied by administrator`
                            });
                          }
                        }}
                        disabled={compEnrollmentMutation.isPending || !compPercentage || parseInt(compPercentage) < 1 || parseInt(compPercentage) > 100}
                        data-testid="btn-confirm-comp"
                      >
                        {compEnrollmentMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Gift className="h-4 w-4 mr-2" />
                            Apply {compPercentage}% Comp
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Reallocate Payment Dialog */}
            <Dialog open={reallocateDialogOpen} onOpenChange={(open) => {
              setReallocateDialogOpen(open);
              if (!open) {
                setSelectedEnrollment(null);
                resetReallocateForm();
              }
            }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Reallocate Payment</DialogTitle>
                  <DialogDescription>
                    Move payment from {selectedEnrollment?.className} ({selectedEnrollment?.childName}) to another destination.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Amount to Reallocate</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={selectedEnrollment ? (selectedEnrollment.totalCost - enrollmentEffectiveBalance(selectedEnrollment)) : 0}
                        value={reallocateAmount}
                        onChange={(e) => setReallocateAmount(e.target.value)}
                        className="w-full pl-8 p-2 border border-gray-300 rounded-md"
                        placeholder="0.00"
                        data-testid="input-reallocate-amount"
                      />
                    </div>
                    {selectedEnrollment && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Available: ${(selectedEnrollment.totalCost - enrollmentEffectiveBalance(selectedEnrollment)).toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">Reallocation Type</label>
                    <Select value={reallocateType} onValueChange={(v: 'enrollment' | 'credit' | 'refund' | 'manual_refund') => setReallocateType(v)}>
                      <SelectTrigger data-testid="select-reallocate-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Add as Account Credit</SelectItem>
                        <SelectItem value="enrollment">Transfer to Another Enrollment</SelectItem>
                        <SelectItem value="refund">Refund to Original Payment Method</SelectItem>
                        <SelectItem value="manual_refund">Manual Refund (No Stripe)</SelectItem>
                      </SelectContent>
                    </Select>
                    {reallocateType === 'manual_refund' && (
                      <p className="text-xs text-amber-600 mt-1">Records the refund in the system only. Handle the actual money transfer externally.</p>
                    )}
                  </div>

                  {reallocateType === 'enrollment' && (
                    <div>
                      <label className="text-sm font-medium block mb-2">Target Enrollment</label>
                      <Select value={reallocateTargetEnrollmentId} onValueChange={setReallocateTargetEnrollmentId}>
                        <SelectTrigger data-testid="select-target-enrollment">
                          <SelectValue placeholder="Select target enrollment" />
                        </SelectTrigger>
                        <SelectContent>
                          {profile.enrollments
                            .filter(e => e.id !== selectedEnrollment?.id && enrollmentEffectiveBalance(e) > 0)
                            .map(e => (
                              <SelectItem key={e.id} value={String(e.id)}>
                                {e.childName} - {e.className} (Balance: ${enrollmentEffectiveBalance(e).toFixed(2)})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {profile.enrollments.filter(e => e.id !== selectedEnrollment?.id && enrollmentEffectiveBalance(e) > 0).length === 0 && (
                        <p className="text-sm text-amber-600 mt-1">No other enrollments with remaining balance available.</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium block mb-2">Reason for Reallocation *</label>
                    <textarea
                      value={reallocateComment}
                      onChange={(e) => setReallocateComment(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows={3}
                      placeholder="Enter reason for this reallocation..."
                      data-testid="input-reallocate-comment"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                    setReallocateDialogOpen(false);
                    setSelectedEnrollment(null);
                    resetReallocateForm();
                  }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReallocateSubmit}
                    disabled={reallocatePaymentMutation.isPending}
                    data-testid="btn-confirm-reallocate"
                  >
                    {reallocatePaymentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Reallocate Payment"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Campus change confirm */}
            <AlertDialog
              open={campusConfirmOpen}
              onOpenChange={(open) => {
                setCampusConfirmOpen(open);
                if (!open) setPendingCampusLocationId(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Change family campus?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move {profile.parent.firstName} {profile.parent.lastName} and{' '}
                    {profile.children.length} student
                    {profile.children.length === 1 ? '' : 's'} from{' '}
                    {profile.parent.locationName || 'no campus'} to{' '}
                    {schoolLocations.find((l) => String(l.id) === pendingCampusLocationId)?.name ||
                      'the selected campus'}
                    . Existing class enrollments and payment plans are not moved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={changeCampusMutation.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="confirm-campus-change"
                    disabled={!pendingCampusLocationId || changeCampusMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!pendingCampusLocationId) return;
                      changeCampusMutation.mutate(parseInt(pendingCampusLocationId, 10));
                    }}
                  >
                    {changeCampusMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating…
                      </>
                    ) : (
                      'Move family'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Edit Parent Dialog */}
            <Dialog open={editParentDialogOpen} onOpenChange={setEditParentDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Parent Information</DialogTitle>
                  <DialogDescription>
                    Update the parent's name and contact information.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">First Name *</label>
                      <input
                        type="text"
                        value={editParentFirstName}
                        onChange={(e) => setEditParentFirstName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="First name"
                        data-testid="input-edit-first-name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={editParentLastName}
                        onChange={(e) => setEditParentLastName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Last name"
                        data-testid="input-edit-last-name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={editParentPhone}
                      onChange={(e) => setEditParentPhone(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="Phone number"
                      data-testid="input-edit-phone"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditParentDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleEditParentSubmit}
                    disabled={editParentMutation.isPending}
                    data-testid="btn-confirm-edit-parent"
                  >
                    {editParentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
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
                            <p className="font-semibold">${(membership.totalCost ?? 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Amount Paid</p>
                            <p className="font-semibold text-green-600">${(membership.amountPaid ?? 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Balance Due</p>
                            <p className={`font-semibold ${(membership.remainingBalance ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              ${(membership.remainingBalance ?? 0).toFixed(2)}
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
                                onClick={() => handleCompFree(membership.id)}
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
                            <TableHead>Credits</TableHead>
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
                              <TableCell>
                                {payment.hasCreditsBreakdown ? (
                                  <div className="space-y-0.5 text-sm">
                                    <div>Card: ${(payment.cardAmount ?? payment.amount).toFixed(2)}</div>
                                    <div className="text-muted-foreground">
                                      Total: ${(payment.totalSettlement ?? payment.amount).toFixed(2)}
                                    </div>
                                  </div>
                                ) : (
                                  `$${payment.amount.toFixed(2)}`
                                )}
                              </TableCell>
                              <TableCell>
                                {payment.hasCreditsBreakdown && payment.creditsApplied != null ? (
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    ${payment.creditsApplied.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
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
                    <div className="space-y-6">
                      {/* Group payments by enrollmentId */}
                      {(() => {
                        const groupedPayments = profile.scheduledPayments.reduce((acc, payment) => {
                          const key = payment.enrollmentId || 'other';
                          if (!acc[key]) {
                            acc[key] = {
                              enrollmentId: payment.enrollmentId,
                              className: payment.className || payment.description,
                              childName: payment.childName,
                              payments: []
                            };
                          }
                          acc[key].payments.push(payment);
                          return acc;
                        }, {} as Record<string | number, { enrollmentId: number | null; className: string; childName?: string; payments: typeof profile.scheduledPayments }>);
                        
                        return Object.entries(groupedPayments).map(([key, group]) => {
                          const pendingCount = group.payments.filter(p => p.status === 'pending').length;
                          return (
                            <div key={key} className="border rounded-lg">
                              <div className="flex items-center justify-between p-4 bg-muted/50 border-b">
                                <div>
                                  <h4 className="font-medium">{group.className}</h4>
                                  {group.childName && (
                                    <p className="text-sm text-muted-foreground">Student: {group.childName}</p>
                                  )}
                                </div>
                                {group.enrollmentId && pendingCount > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                    onClick={() => setDeletePaymentPlanDialog({
                                      open: true,
                                      enrollmentId: group.enrollmentId!,
                                      enrollmentName: group.className,
                                      paymentCount: pendingCount
                                    })}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete Plan ({pendingCount})
                                  </Button>
                                )}
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Program Dates</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                      <TableCell>
                                        {formatDate(payment.dueDate)}
                                      </TableCell>
                                      <TableCell>{payment.description}</TableCell>
                                      <TableCell className="text-sm">
                                        {payment.programStartDate && payment.programEndDate ? (
                                          <span className="text-muted-foreground">
                                            {formatDate(payment.programStartDate)} - {formatDate(payment.programEndDate)}
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell>${payment.amount.toFixed(2)}</TableCell>
                                      <TableCell>
                                        <Badge variant={getPaymentStatusBadgeVariant(payment.status)}>
                                          {payment.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right space-x-1">
                                        {payment.status === 'pending' && (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                setReschedulePaymentDialog({ open: true, payment });
                                                setRescheduleDate(new Date(payment.dueDate).toISOString().split('T')[0]);
                                              }}
                                            >
                                              <Pencil className="h-4 w-4 mr-1" />
                                              Edit Date
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-destructive hover:text-destructive"
                                              onClick={() => setDeleteScheduledPaymentDialog({ open: true, payment })}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </>
                                        )}
                                        {payment.status === 'processing' && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => setDeleteScheduledPaymentDialog({ open: true, payment })}
                                          >
                                            <Trash2 className="h-4 w-4 mr-1" />
                                            Delete
                                          </Button>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="credits">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5" />
                      Credits
                    </CardTitle>
                    <CardDescription>
                      Account credits and usage history. School-wide credit tools are under Finance → Credits.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setIsAwardCreditOpen(true)}
                    data-testid="button-award-credit"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Award Credit
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(!profile.credits || profile.credits.length === 0) ? (
                  <p className="text-center text-muted-foreground py-8">No credits found for this account.</p>
                ) : (
                  <div className="space-y-4">
                    {profile.credits.map((credit) => (
                      <Card key={credit.id} className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              {credit.title || 'Credit'}
                              <Badge variant={
                                credit.status === 'approved' ? 'default' :
                                credit.status === 'used' ? 'secondary' :
                                credit.status === 'partially_used' ? 'outline' :
                                credit.status === 'pending' ? 'secondary' :
                                'destructive'
                              }>
                                {credit.status}
                              </Badge>
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Type: {credit.creditType} | Created: {new Date(credit.createdAt).toLocaleDateString()}
                            </p>
                            {credit.description && (
                              <p className="text-sm text-muted-foreground">{credit.description}</p>
                            )}
                            {credit.status === 'revoked' && credit.rejectionReason && (
                              <p className="text-sm text-destructive/90 mt-1">
                                Removal reason: {credit.rejectionReason}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-lg">
                              ${(credit.creditAmountCents / 100).toFixed(2)}
                            </p>
                            {credit.usedAmountCents > 0 && (
                              <p className="text-sm text-muted-foreground">
                                Used: ${(credit.usedAmountCents / 100).toFixed(2)}
                              </p>
                            )}
                            {credit.remainingAmountCents > 0 && (
                              <p className="text-sm text-green-600">
                                Remaining: ${(credit.remainingAmountCents / 100).toFixed(2)}
                              </p>
                            )}
                            {credit.status === 'revoked' && (
                              <p className="text-sm text-muted-foreground">Not available</p>
                            )}
                          </div>
                        </div>
                        
                        {(credit.status === 'approved' || credit.status === 'partially_used') && (
                          <div className="flex justify-end gap-2 mb-2">
                            {credit.status === 'approved' && credit.usedAmountCents === 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCreditToEdit(credit);
                                  setEditCreditForm({
                                    creditAmountDollars: (credit.creditAmountCents / 100).toFixed(2),
                                    title: credit.title || '',
                                    description: credit.description || '',
                                    notes: '',
                                    expiresAt: credit.expiresAt
                                      ? new Date(credit.expiresAt).toISOString().slice(0, 10)
                                      : '',
                                  });
                                }}
                                data-testid={`button-edit-credit-${credit.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => { setCreditToRevoke(credit); setRevocationReason(''); }}
                                  data-testid={`button-remove-credit-${credit.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Remove Credit
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Credit</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove the {credit.title || 'credit'} of ${(credit.creditAmountCents / 100).toFixed(2)} from this account? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="px-1 pb-2">
                                  <textarea
                                    className="w-full border rounded-md p-2 text-sm resize-none"
                                    rows={3}
                                    placeholder="Reason for removal (optional)..."
                                    value={creditToRevoke?.id === credit.id ? revocationReason : ''}
                                    onChange={(e) => setRevocationReason(e.target.value)}
                                  />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => { setCreditToRevoke(null); setRevocationReason(''); }}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => revokeCreditMutation.mutate({ creditId: credit.id, reason: revocationReason.trim() || undefined })}
                                    disabled={revokeCreditMutation.isPending}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid={`button-confirm-remove-credit-${credit.id}`}
                                  >
                                    {revokeCreditMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    ) : null}
                                    Remove Credit
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}

                        {credit.expiresAt && (
                          <p className="text-xs text-muted-foreground mb-2">
                            Expires: {new Date(credit.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                        
                        {credit.usageLogs && credit.usageLogs.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-sm font-medium mb-2">Usage History:</p>
                            <div className="space-y-2">
                              {credit.usageLogs.map((log) => (
                                <div key={log.id} className="flex justify-between items-center text-sm bg-muted/50 rounded p-2">
                                  <div>
                                    <p className="font-medium">
                                      {log.childName && log.className 
                                        ? `Applied to ${log.childName} – ${log.className}`
                                        : log.description || 'Credit applied'}
                                    </p>
                                    {log.childName && log.className && log.description && (
                                      <p className="text-xs text-muted-foreground">{log.description}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(log.createdAt).toLocaleDateString()} at {new Date(log.createdAt).toLocaleTimeString()}
                                    </p>
                                  </div>
                                  <p className="font-semibold text-red-600">
                                    -${(log.amountCents / 100).toFixed(2)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                    
                    {/* Credit Summary */}
                    <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total Issued:</span>
                        <span className="font-semibold">${((profile.summary?.totalCreditAmountCents || 0) / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Total Used:</span>
                        <span>${((profile.summary?.totalCreditUsedCents || 0) / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-green-600 font-medium border-t mt-2 pt-2">
                        <span>Available Balance:</span>
                        <span data-testid="text-credits-available-balance">
                          ${((profile.summary?.availableCreditBalanceCents ?? 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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

          <TabsContent value="documents">
            <ParentDocumentsTab parentId={parentId!} />
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

        {/* Reschedule Payment Dialog */}
        <Dialog 
          open={reschedulePaymentDialog.open} 
          onOpenChange={(open) => {
            setReschedulePaymentDialog({ open, payment: open ? reschedulePaymentDialog.payment : null });
            if (!open) {
              setRescheduleDate('');
              setRescheduleComment('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule Payment</DialogTitle>
              <DialogDescription>
                Change the due date for this scheduled payment. A comment is required to document the change.
              </DialogDescription>
            </DialogHeader>
            {reschedulePaymentDialog.payment && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Payment Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Amount:</span>
                      <p className="font-medium">${reschedulePaymentDialog.payment.amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Current Due Date:</span>
                      <p className="font-medium">{formatDate(reschedulePaymentDialog.payment.dueDate)}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-600">Description:</span>
                      <p className="font-medium">{reschedulePaymentDialog.payment.description}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Due Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border rounded-md"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason for Change (Required)</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md"
                    rows={3}
                    placeholder="Enter reason for rescheduling this payment..."
                    value={rescheduleComment}
                    onChange={(e) => setRescheduleComment(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setReschedulePaymentDialog({ open: false, payment: null });
                  setRescheduleDate('');
                  setRescheduleComment('');
                }}
                disabled={reschedulePaymentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (reschedulePaymentDialog.payment && rescheduleDate && rescheduleComment.trim()) {
                    reschedulePaymentMutation.mutate({
                      paymentId: reschedulePaymentDialog.payment.id,
                      newDate: rescheduleDate,
                      adminComment: rescheduleComment.trim()
                    });
                  }
                }}
                disabled={reschedulePaymentMutation.isPending || !rescheduleDate || !rescheduleComment.trim()}
              >
                {reschedulePaymentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : "Save New Date"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Scheduled Payment Dialog */}
        <AlertDialog 
          open={deleteScheduledPaymentDialog.open} 
          onOpenChange={(open) => setDeleteScheduledPaymentDialog({ open, payment: open ? deleteScheduledPaymentDialog.payment : null })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Scheduled Payment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this scheduled payment? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteScheduledPaymentDialog.payment && (
              <div className="p-4 bg-gray-50 rounded-lg my-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Amount:</span>
                    <p className="font-medium">${deleteScheduledPaymentDialog.payment.amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Due Date:</span>
                    <p className="font-medium">{formatDate(deleteScheduledPaymentDialog.payment.dueDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <p className="font-medium">{deleteScheduledPaymentDialog.payment.status}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Description:</span>
                    <p className="font-medium">{deleteScheduledPaymentDialog.payment.description}</p>
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteScheduledPaymentMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteScheduledPaymentDialog.payment) {
                    deleteScheduledPaymentMutation.mutate({ paymentId: deleteScheduledPaymentDialog.payment.id });
                  }
                }}
                disabled={deleteScheduledPaymentMutation.isPending}
              >
                {deleteScheduledPaymentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : "Delete Payment"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

        {/* Delete Payment Plan Confirmation Dialog */}
        <AlertDialog 
          open={deletePaymentPlanDialog.open} 
          onOpenChange={(open) => {
            if (!open) {
              setDeletePaymentPlanDialog({ open: false, enrollmentId: null, enrollmentName: '', paymentCount: 0 });
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Payment Plan</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete all {deletePaymentPlanDialog.paymentCount} pending scheduled payment(s) for <strong>{deletePaymentPlanDialog.enrollmentName}</strong>?
                <br /><br />
                This action cannot be undone. The enrollment will remain active but will have no scheduled payments.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePaymentPlanMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletePaymentPlanMutation.isPending}
                onClick={() => {
                  if (deletePaymentPlanDialog.enrollmentId) {
                    deletePaymentPlanMutation.mutate({ enrollmentId: deletePaymentPlanDialog.enrollmentId });
                  }
                }}
              >
                {deletePaymentPlanMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : "Delete Payment Plan"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isAwardCreditOpen} onOpenChange={setIsAwardCreditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Award Credit</DialogTitle>
              <DialogDescription>
                Add an approved credit to {profile?.parent.firstName} {profile?.parent.lastName}&apos;s account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="award-amount">Amount ($)</Label>
                <Input
                  id="award-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={awardCreditForm.creditAmountDollars}
                  onChange={(e) => setAwardCreditForm((f) => ({ ...f, creditAmountDollars: e.target.value }))}
                  data-testid="input-award-credit-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="award-title">Title</Label>
                <Input
                  id="award-title"
                  value={awardCreditForm.title}
                  onChange={(e) => setAwardCreditForm((f) => ({ ...f, title: e.target.value }))}
                  data-testid="input-award-credit-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="award-description">Description (optional)</Label>
                <Textarea
                  id="award-description"
                  rows={2}
                  value={awardCreditForm.description}
                  onChange={(e) => setAwardCreditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="award-expires">Expires (optional)</Label>
                <Input
                  id="award-expires"
                  type="date"
                  value={awardCreditForm.expiresAt}
                  onChange={(e) => setAwardCreditForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAwardCreditOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!profile?.parent.id) return;
                  const amountCents = Math.round(parseFloat(awardCreditForm.creditAmountDollars) * 100);
                  if (!awardCreditForm.title.trim() || Number.isNaN(amountCents) || amountCents <= 0) {
                    toast({ title: 'Error', description: 'Enter a valid amount and title.', variant: 'destructive' });
                    return;
                  }
                  let expiresAt: string | undefined;
                  if (awardCreditForm.expiresAt) {
                    const d = new Date(awardCreditForm.expiresAt);
                    d.setHours(23, 59, 59, 999);
                    expiresAt = d.toISOString();
                  }
                  createCreditMutation.mutate({
                    userId: profile.parent.id,
                    creditAmountCents: amountCents,
                    title: awardCreditForm.title.trim(),
                    description: awardCreditForm.description.trim() || undefined,
                    notes: awardCreditForm.notes.trim() || undefined,
                    expiresAt,
                  });
                }}
                disabled={createCreditMutation.isPending}
                data-testid="button-submit-award-credit"
              >
                {createCreditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Award Credit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!creditToEdit} onOpenChange={(open) => { if (!open) setCreditToEdit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Credit</DialogTitle>
              <DialogDescription>
                Update this unused approved credit. Credits with usage history cannot be edited.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount ($)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editCreditForm.creditAmountDollars}
                  onChange={(e) => setEditCreditForm((f) => ({ ...f, creditAmountDollars: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editCreditForm.title}
                  onChange={(e) => setEditCreditForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Textarea
                  id="edit-description"
                  rows={2}
                  value={editCreditForm.description}
                  onChange={(e) => setEditCreditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-expires">Expires (optional)</Label>
                <Input
                  id="edit-expires"
                  type="date"
                  value={editCreditForm.expiresAt}
                  onChange={(e) => setEditCreditForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreditToEdit(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!creditToEdit) return;
                  const amountCents = Math.round(parseFloat(editCreditForm.creditAmountDollars) * 100);
                  if (!editCreditForm.title.trim() || Number.isNaN(amountCents) || amountCents <= 0) {
                    toast({ title: 'Error', description: 'Enter a valid amount and title.', variant: 'destructive' });
                    return;
                  }
                  let expiresAt: string | null | undefined;
                  if (editCreditForm.expiresAt) {
                    const d = new Date(editCreditForm.expiresAt);
                    d.setHours(23, 59, 59, 999);
                    expiresAt = d.toISOString();
                  } else {
                    expiresAt = null;
                  }
                  updateCreditMutation.mutate({
                    creditId: creditToEdit.id,
                    creditAmountCents: amountCents,
                    title: editCreditForm.title.trim(),
                    description: editCreditForm.description.trim() || undefined,
                    expiresAt,
                  });
                }}
                disabled={updateCreditMutation.isPending}
                data-testid="button-submit-edit-credit"
              >
                {updateCreditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProfileShell>
  );
}