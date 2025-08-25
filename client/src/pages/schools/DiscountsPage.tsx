import React, { useState } from 'react';
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
import { Loader2, Plus, Edit, Trash2, Percent, DollarSign, Users, Calendar, Eye, Target } from 'lucide-react';
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
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  currentUsageCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  priority: number;
  combinableWithOthers: boolean;
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
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  priority: number;
  combinableWithOthers: boolean;
}

const categoryOptions = [
  'academic', 'arts', 'music', 'sports', 'stem', 'language', 'coding', 'cooking', 'crafts'
];

const gradeLevelOptions = [
  'PreK', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'
];

export default function DiscountsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGradeLevels, setSelectedGradeLevels] = useState<string[]>([]);
  
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
    usageLimit: null,
    usageLimitPerUser: null,
    validFrom: '',
    validUntil: '',
    isActive: true,
    priority: 0,
    combinableWithOthers: false,
  });

  const [formData, setFormData] = useState<DiscountFormData>(getInitialFormData());

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
      usageLimit: discount.usageLimit,
      usageLimitPerUser: discount.usageLimitPerUser,
      validFrom: discount.validFrom ? discount.validFrom.split('T')[0] : '',
      validUntil: discount.validUntil ? discount.validUntil.split('T')[0] : '',
      isActive: discount.isActive,
      priority: discount.priority,
      combinableWithOthers: discount.combinableWithOthers,
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
    <SchoolAdminLayout pageTitle="Discount Management">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Discount Management
                </CardTitle>
                <CardDescription>
                  Create and manage discounts for classes and enrollments. Set up automatic discounts or apply manual discounts as needed.
                </CardDescription>
              </div>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button>
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
          </CardHeader>
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
                          <div className="font-medium">{discount.name}</div>
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
                          >
                            <Edit className="h-4 w-4" />
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
                  <SelectValue />
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
                  <SelectValue />
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

            <div className="flex items-center space-x-2">
              <Switch
                id="siblingDiscount"
                checked={formData.siblingDiscount}
                onCheckedChange={(checked) => setFormData({ ...formData, siblingDiscount: checked })}
              />
              <Label htmlFor="siblingDiscount">Sibling discount</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="combinableWithOthers"
                checked={formData.combinableWithOthers}
                onCheckedChange={(checked) => setFormData({ ...formData, combinableWithOthers: checked })}
              />
              <Label htmlFor="combinableWithOthers">Can combine with other discounts</Label>
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