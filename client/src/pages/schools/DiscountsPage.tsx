import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, Percent, DollarSign, Users, Calendar, Eye, Target, Copy } from 'lucide-react';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface Discount {
  id: number;
  schoolId: number;
  name: string;
  description: string | null;
  code: string | null;
  type: 'percentage' | 'fixed_amount';
  value: number;
  applicationMethod: 'automatic' | 'manual' | 'both';
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  applicableToClasses: number[];
  applicableToCategories: string[];
  applicableToGradeLevels: string[];
  newStudentsOnly: boolean;
  siblingDiscount: boolean;
  appliesToMembership: boolean;
  requiredRoles: string[] | null;
  roleMatchLogic: 'and' | 'or' | null;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  currentUsageCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  priority: number;
  combinableWithOthers: boolean;
  adminOnly: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

interface DiscountFormData {
  name: string;
  description: string;
  code: string;
  type: 'percentage' | 'fixed_amount';
  value: number;
  applicationMethod: 'automatic' | 'manual' | 'both';
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  applicableToCategories: string[];
  applicableToGradeLevels: string[];
  newStudentsOnly: boolean;
  siblingDiscount: boolean;
  appliesToMembership: boolean;
  requiredRoles: string[];
  roleMatchLogic: 'and' | 'or';
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  priority: number;
  combinableWithOthers: boolean;
  adminOnly: boolean;
}

const categoryOptions = [
  'academic', 'arts', 'music', 'sports', 'stem', 'language', 'coding', 'cooking', 'crafts'
];

const gradeLevelOptions = [
  'PreK', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'
];

const roleOptions = [
  { value: 'parent', label: 'Parent' },
  { value: 'educator', label: 'Educator' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
  { value: 'learner', label: 'Learner' },
];

export default function DiscountsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGradeLevels, setSelectedGradeLevels] = useState<string[]>([]);
  
  // Free After Threshold settings
  const [freeAfterEnabled, setFreeAfterEnabled] = useState(false);
  const [freeAfterThreshold, setFreeAfterThreshold] = useState(3);
  
  const queryClient = useQueryClient();

  // Initial form data
  const getInitialFormData = (): DiscountFormData => ({
    name: '',
    description: '',
    code: '',
    type: 'percentage',
    value: 0,
    applicationMethod: 'manual',
    minOrderAmount: null,
    maxDiscountAmount: null,
    applicableToCategories: [],
    applicableToGradeLevels: [],
    newStudentsOnly: false,
    siblingDiscount: false,
    appliesToMembership: false,
    requiredRoles: [],
    roleMatchLogic: 'or',
    usageLimit: null,
    usageLimitPerUser: null,
    validFrom: '',
    validUntil: '',
    isActive: true,
    priority: 0,
    combinableWithOthers: false,
    adminOnly: false,
  });

  const [formData, setFormData] = useState<DiscountFormData>(getInitialFormData());

  // Fetch school settings for Free After Threshold
  const { data: schoolData } = useQuery({
    queryKey: ['/api/school-admin/my-school'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/my-school', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch school settings');
      }
      return response.json();
    },
  });

  // Sync local state with fetched school data
  useEffect(() => {
    if (schoolData) {
      setFreeAfterEnabled(schoolData.freeAfterThresholdEnabled || false);
      setFreeAfterThreshold(schoolData.freeAfterThreshold || 3);
    }
  }, [schoolData]);

  // Fetch discounts
  const { data: discountsData, isLoading } = useQuery({
    queryKey: ['/api/school-admin/discounts'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/discounts', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch discounts');
      }
      return response.json();
    },
  });

  // Create discount mutation
  const createDiscountMutation = useMutation({
    mutationFn: async (discountData: DiscountFormData) => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/discounts', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discountData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create discount');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/discounts'] });
      setShowCreateDialog(false);
      setFormData(getInitialFormData());
      setSelectedCategories([]);
      setSelectedGradeLevels([]);
      toast({
        title: "Success",
        description: "Discount created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update discount mutation
  const updateDiscountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DiscountFormData> }) => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/school-admin/discounts/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update discount');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/discounts'] });
      setShowEditDialog(false);
      setEditingDiscount(null);
      setFormData(getInitialFormData());
      setSelectedCategories([]);
      setSelectedGradeLevels([]);
      toast({
        title: "Success",
        description: "Discount updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Duplicate discount mutation
  const duplicateDiscountMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/school-admin/discounts/${id}/duplicate`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to duplicate discount');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/discounts'] });
      toast({
        title: "Success",
        description: "Discount duplicated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete discount mutation
  const deleteDiscountMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/school-admin/discounts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete discount');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/discounts'] });
      toast({
        title: "Success",
        description: "Discount deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update Free After Threshold settings mutation
  const updateFreeAfterMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/school-admin/my-school/free-after-threshold', {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          freeAfterThresholdEnabled: freeAfterEnabled,
          freeAfterThreshold: freeAfterThreshold,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
      toast({
        title: "Success",
        description: "Free after threshold settings updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      applicableToCategories: selectedCategories,
      applicableToGradeLevels: selectedGradeLevels,
    };

    if (editingDiscount) {
      updateDiscountMutation.mutate({ id: editingDiscount.id, data: submitData });
    } else {
      createDiscountMutation.mutate(submitData);
    }
  };

  const handleEdit = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      name: discount.name,
      description: discount.description || '',
      code: discount.code || '',
      type: discount.type,
      value: discount.type === 'percentage' ? discount.value : discount.value / 100,
      applicationMethod: discount.applicationMethod,
      minOrderAmount: discount.minOrderAmount ? discount.minOrderAmount / 100 : null,
      maxDiscountAmount: discount.maxDiscountAmount ? discount.maxDiscountAmount / 100 : null,
      applicableToCategories: discount.applicableToCategories || [],
      applicableToGradeLevels: discount.applicableToGradeLevels || [],
      newStudentsOnly: discount.newStudentsOnly,
      siblingDiscount: discount.siblingDiscount,
      appliesToMembership: discount.appliesToMembership || false,
      requiredRoles: discount.requiredRoles || [],
      roleMatchLogic: discount.roleMatchLogic || 'or',
      usageLimit: discount.usageLimit,
      usageLimitPerUser: discount.usageLimitPerUser,
      validFrom: discount.validFrom ? discount.validFrom.split('T')[0] : '',
      validUntil: discount.validUntil ? discount.validUntil.split('T')[0] : '',
      isActive: discount.isActive,
      priority: discount.priority,
      combinableWithOthers: discount.combinableWithOthers,
      adminOnly: discount.adminOnly || false,
    });
    setSelectedCategories(discount.applicableToCategories || []);
    setSelectedGradeLevels(discount.applicableToGradeLevels || []);
    setShowEditDialog(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatDiscountValue = (discount: Discount) => {
    if (discount.type === 'percentage') {
      return `${discount.value}%`;
    }
    return formatCurrency(discount.value);
  };

  const discounts = discountsData?.discounts || [];

  return (
    <SchoolAdminLayout pageTitle="Discounts">
      <div className="space-y-6">
        {/* Create Button Section */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">Create and manage discounts for classes and enrollments. Set up automatic discounts or apply manual discounts as needed.</p>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-discount">
                <Plus className="mr-2 h-4 w-4" />
                Create Discount
              </Button>
            </DialogTrigger>
                <DiscountFormDialog
                  title="Create New Discount"
                  description="Set up a new discount for your school. Choose whether it applies automatically or manually."
                  formData={formData}
                  setFormData={setFormData}
                  selectedCategories={selectedCategories}
                  setSelectedCategories={setSelectedCategories}
                  selectedGradeLevels={selectedGradeLevels}
                  setSelectedGradeLevels={setSelectedGradeLevels}
                  onSubmit={handleSubmit}
                  isLoading={createDiscountMutation.isPending}
                  onCancel={() => {
                    setShowCreateDialog(false);
                    setFormData(getInitialFormData());
                    setSelectedCategories([]);
                    setSelectedGradeLevels([]);
                  }}
                />
          </Dialog>
        </div>

        {/* Free After Threshold Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Free Enrollment After X Children
            </CardTitle>
            <CardDescription>
              Automatically make the cheapest enrollments free when families have multiple children enrolled. Formula: freeCount = max(0, uniqueChildren - threshold)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Feature</Label>
                <p className="text-sm text-muted-foreground" data-testid="text-free-after-description">
                  When enabled, families with {freeAfterThreshold}+ unique children get free enrollments for their cheapest classes
                </p>
              </div>
              <Switch 
                checked={freeAfterEnabled}
                onCheckedChange={setFreeAfterEnabled}
                data-testid="switch-free-after-enabled"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="threshold">Threshold (number of children before free enrollments apply)</Label>
              <div className="flex gap-2">
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  max={10}
                  value={freeAfterThreshold}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      setFreeAfterThreshold(Math.max(1, Math.min(10, val)));
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure value is valid on blur
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      setFreeAfterThreshold(1);
                    }
                  }}
                  disabled={!freeAfterEnabled}
                  className="w-32"
                  data-testid="input-free-after-threshold"
                />
                <span className="text-sm text-muted-foreground flex items-center">
                  children before free enrollments
                </span>
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2" data-testid="section-free-after-examples">
              <p className="text-sm font-medium">Examples:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li data-testid="text-example-at-threshold">• {freeAfterThreshold} children → 0 free enrollments</li>
                <li data-testid="text-example-one-above">• {freeAfterThreshold + 1} children → 1 free enrollment (cheapest class)</li>
                <li data-testid="text-example-two-above">• {freeAfterThreshold + 2} children → 2 free enrollments (2 cheapest classes)</li>
              </ul>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2" data-testid="text-override-warning">
                ⚠️ When active, this discount overrides sibling discounts and promo codes to prevent double-dipping
              </p>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={() => updateFreeAfterMutation.mutate()}
                disabled={updateFreeAfterMutation.isPending}
                data-testid="button-save-free-after-settings"
              >
                {updateFreeAfterMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Discounts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active Discounts</CardTitle>
            <CardDescription>
              Manage your school's discount codes and automatic discounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : discounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No discounts created yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first discount to get started.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Admin Only</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount: Discount) => (
                    <TableRow key={discount.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {discount.name}
                            {discount.appliesToMembership && (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                Membership
                              </Badge>
                            )}
                          </div>
                          {discount.code && (
                            <div className="text-sm text-muted-foreground">
                              Code: {discount.code}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          {discount.type === 'percentage' ? (
                            <Percent className="h-3 w-3" />
                          ) : (
                            <DollarSign className="h-3 w-3" />
                          )}
                          {discount.type === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatDiscountValue(discount)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={discount.applicationMethod === 'automatic' ? 'default' : 'outline'}
                          className="capitalize"
                        >
                          {discount.applicationMethod}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {discount.adminOnly ? (
                          <Badge variant="destructive" className="text-xs">
                            Admin Only
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            All Users
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{discount.currentUsageCount} used</div>
                          {discount.usageLimit && (
                            <div className="text-muted-foreground">
                              of {discount.usageLimit} limit
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={discount.isActive ? 'default' : 'secondary'}>
                          {discount.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(discount)}
                            title="Edit discount"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => duplicateDiscountMutation.mutate(discount.id)}
                            disabled={duplicateDiscountMutation.isPending}
                            title="Duplicate discount"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Discount</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{discount.name}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteDiscountMutation.mutate(discount.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DiscountFormDialog
            title="Edit Discount"
            description="Update the discount settings and conditions."
            formData={formData}
            setFormData={setFormData}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            selectedGradeLevels={selectedGradeLevels}
            setSelectedGradeLevels={setSelectedGradeLevels}
            onSubmit={handleSubmit}
            isLoading={updateDiscountMutation.isPending}
            onCancel={() => {
              setShowEditDialog(false);
              setEditingDiscount(null);
              setFormData(getInitialFormData());
              setSelectedCategories([]);
              setSelectedGradeLevels([]);
            }}
          />
        </Dialog>
      </div>
    </SchoolAdminLayout>
  );
}

// Separate component for the discount form dialog
function DiscountFormDialog({
  title,
  description,
  formData,
  setFormData,
  selectedCategories,
  setSelectedCategories,
  selectedGradeLevels,
  setSelectedGradeLevels,
  onSubmit,
  isLoading,
  onCancel,
}: {
  title: string;
  description: string;
  formData: DiscountFormData;
  setFormData: (data: DiscountFormData) => void;
  selectedCategories: string[];
  setSelectedCategories: (categories: string[]) => void;
  selectedGradeLevels: string[];
  setSelectedGradeLevels: (levels: string[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleGradeLevelToggle = (grade: string) => {
    if (selectedGradeLevels.includes(grade)) {
      setSelectedGradeLevels(selectedGradeLevels.filter(g => g !== grade));
    } else {
      setSelectedGradeLevels([...selectedGradeLevels, grade]);
    }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Discount Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Early Bird Discount"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the discount"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="code">Discount Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Optional code for manual application"
              />
            </div>
          </div>

          {/* Discount Settings */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="type">Discount Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'percentage' | 'fixed_amount') =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select discount type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="value">
                Discount Value * ({formData.type === 'percentage' ? '%' : '$'})
              </Label>
              <Input
                id="value"
                type="number"
                min="0"
                step={formData.type === 'percentage' ? "1" : "0.01"}
                max={formData.type === 'percentage' ? "100" : undefined}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div>
              <Label htmlFor="applicationMethod">Application Method *</Label>
              <Select
                value={formData.applicationMethod}
                onValueChange={(value: 'automatic' | 'manual' | 'both') =>
                  setFormData({ ...formData, applicationMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select application method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="space-y-4">
          <h4 className="font-medium">Discount Conditions</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="minOrderAmount">Minimum Order Amount ($)</Label>
              <Input
                id="minOrderAmount"
                type="number"
                min="0"
                step="0.01"
                value={formData.minOrderAmount || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  minOrderAmount: e.target.value ? parseFloat(e.target.value) : null 
                })}
                placeholder="No minimum"
              />
            </div>

            <div>
              <Label htmlFor="maxDiscountAmount">Maximum Discount Amount ($)</Label>
              <Input
                id="maxDiscountAmount"
                type="number"
                min="0"
                step="0.01"
                value={formData.maxDiscountAmount || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  maxDiscountAmount: e.target.value ? parseFloat(e.target.value) : null 
                })}
                placeholder="No maximum"
              />
            </div>
          </div>

          {/* Categories */}
          <div>
            <Label>Applicable Categories</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categoryOptions.map((category) => (
                <Button
                  key={category}
                  type="button"
                  variant={selectedCategories.includes(category) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleCategoryToggle(category)}
                  className="capitalize"
                >
                  {category}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Leave empty to apply to all categories
            </p>
          </div>

          {/* Grade Levels */}
          <div>
            <Label>Applicable Grade Levels</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {gradeLevelOptions.map((grade) => (
                <Button
                  key={grade}
                  type="button"
                  variant={selectedGradeLevels.includes(grade) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleGradeLevelToggle(grade)}
                >
                  {grade}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Leave empty to apply to all grade levels
            </p>
          </div>

          {/* Role-Based Eligibility */}
          <div className="p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20 space-y-4">
            <div>
              <Label className="text-base font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Role-Based Discount Eligibility
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Restrict this discount to users with specific roles. Useful for giving special discounts to parents who are also educators.
              </p>
            </div>

            <div>
              <Label>Required User Roles</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {roleOptions.map((role) => (
                  <Button
                    key={role.value}
                    type="button"
                    variant={formData.requiredRoles.includes(role.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newRoles = formData.requiredRoles.includes(role.value)
                        ? formData.requiredRoles.filter(r => r !== role.value)
                        : [...formData.requiredRoles, role.value];
                      setFormData({ ...formData, requiredRoles: newRoles });
                    }}
                    data-testid={`button-role-${role.value}`}
                  >
                    {role.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Leave empty to apply to all users regardless of role
              </p>
            </div>

            {formData.requiredRoles.length > 1 && (
              <div className="space-y-2">
                <Label>Role Match Logic</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="roleMatchOr"
                      name="roleMatchLogic"
                      value="or"
                      checked={formData.roleMatchLogic === 'or'}
                      onChange={() => setFormData({ ...formData, roleMatchLogic: 'or' })}
                      className="h-4 w-4"
                      data-testid="radio-role-match-or"
                    />
                    <Label htmlFor="roleMatchOr" className="font-normal cursor-pointer">
                      <span className="font-medium">OR</span> - User needs ANY of the selected roles
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="roleMatchAnd"
                      name="roleMatchLogic"
                      value="and"
                      checked={formData.roleMatchLogic === 'and'}
                      onChange={() => setFormData({ ...formData, roleMatchLogic: 'and' })}
                      className="h-4 w-4"
                      data-testid="radio-role-match-and"
                    />
                    <Label htmlFor="roleMatchAnd" className="font-normal cursor-pointer">
                      <span className="font-medium">AND</span> - User needs ALL of the selected roles
                    </Label>
                  </div>
                </div>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  {formData.roleMatchLogic === 'and' 
                    ? `Users must have ALL of these roles: ${formData.requiredRoles.join(' AND ')}`
                    : `Users must have ANY of these roles: ${formData.requiredRoles.join(' OR ')}`
                  }
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Usage Limits */}
        <div className="space-y-4">
          <h4 className="font-medium">Usage Limits</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="usageLimit">Total Usage Limit</Label>
              <Input
                id="usageLimit"
                type="number"
                min="1"
                value={formData.usageLimit || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  usageLimit: e.target.value ? parseInt(e.target.value) : null 
                })}
                placeholder="Unlimited"
              />
            </div>

            <div>
              <Label htmlFor="usageLimitPerUser">Per User Limit</Label>
              <Input
                id="usageLimitPerUser"
                type="number"
                min="1"
                value={formData.usageLimitPerUser || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  usageLimitPerUser: e.target.value ? parseInt(e.target.value) : null 
                })}
                placeholder="Unlimited"
              />
            </div>
          </div>
        </div>

        {/* Date Range */}
        <div className="space-y-4">
          <h4 className="font-medium">Valid Date Range</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="validFrom">Valid From</Label>
              <Input
                id="validFrom"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="validUntil">Valid Until</Label>
              <Input
                id="validUntil"
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Advanced Options */}
        <div className="space-y-4">
          <h4 className="font-medium">Advanced Options</h4>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="newStudentsOnly"
                checked={formData.newStudentsOnly}
                onCheckedChange={(checked) => setFormData({ ...formData, newStudentsOnly: checked })}
              />
              <Label htmlFor="newStudentsOnly">New students only</Label>
            </div>

            <div className="p-4 border rounded-lg bg-blue-50/50 space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="siblingDiscount"
                  checked={formData.siblingDiscount}
                  onCheckedChange={(checked) => setFormData({ ...formData, siblingDiscount: checked })}
                />
                <Label htmlFor="siblingDiscount" className="font-medium">Sibling Discount</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Apply this discount automatically when families enroll multiple children. 
                {formData.siblingDiscount && formData.type === 'percentage' && (
                  <span className="font-medium text-blue-600"> Active: {formData.value}% off when 2+ siblings are enrolled.</span>
                )}
                {formData.siblingDiscount && formData.type === 'fixed_amount' && (
                  <span className="font-medium text-blue-600"> Active: ${formData.value} off when 2+ siblings are enrolled.</span>
                )}
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-green-50/50 space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="appliesToMembership"
                  checked={formData.appliesToMembership}
                  onCheckedChange={(checked) => setFormData({ ...formData, appliesToMembership: checked })}
                  data-testid="switch-applies-to-membership"
                />
                <Label htmlFor="appliesToMembership" className="font-medium">Membership Discount</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Apply this discount to membership fees. 
                {formData.appliesToMembership && formData.type === 'percentage' && (
                  <span className="font-medium text-green-600"> Active: {formData.value}% off membership fees.</span>
                )}
                {formData.appliesToMembership && formData.type === 'fixed_amount' && (
                  <span className="font-medium text-green-600"> Active: ${formData.value} off membership fees.</span>
                )}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="combinableWithOthers"
                checked={formData.combinableWithOthers}
                onCheckedChange={(checked) => setFormData({ ...formData, combinableWithOthers: checked })}
              />
              <Label htmlFor="combinableWithOthers">Can combine with other discounts</Label>
            </div>

            <div className="p-4 border rounded-lg bg-orange-50/50 space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="adminOnly"
                  checked={formData.adminOnly}
                  onCheckedChange={(checked) => setFormData({ ...formData, adminOnly: checked })}
                />
                <Label htmlFor="adminOnly" className="font-medium">Admin Only Discount</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                This discount can only be applied by school administrators. 
                {formData.adminOnly && (
                  <span className="font-medium text-orange-600"> Parents cannot see or apply this discount - admins only.</span>
                )}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="priority">Priority (higher numbers apply first)</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Discount'
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}