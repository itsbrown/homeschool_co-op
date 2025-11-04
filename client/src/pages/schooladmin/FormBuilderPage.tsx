import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Edit, Copy, Trash2, Eye, FileText, BarChart3, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth0';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

interface CustomForm {
  id: number;
  title: string;
  description: string | null;
  slug: string;
  formType: string;
  isActive: boolean;
  isTemplate: boolean;
  accessLevel: string;
  createdAt: string;
}

export default function FormBuilderPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    title: '',
    description: '',
    formType: 'custom',
    accessLevel: 'members',
  });

  // Fetch all forms for the school
  // Backend extracts school_id from authenticated user's Supabase token
  const { data: forms = [], isLoading } = useQuery<CustomForm[]>({
    queryKey: [`/api/custom-forms/schools/forms`],
  });

  // Fetch template forms
  const { data: templates = [] } = useQuery<CustomForm[]>({
    queryKey: [`/api/custom-forms/templates`],
  });

  // Create form mutation
  const createFormMutation = useMutation({
    mutationFn: async (formData: typeof newForm) => {
      const response = await apiRequest("POST", `/api/custom-forms/schools/forms`, {
        ...formData,
        slug: formData.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        // Note: createdBy is set on the backend from req.auth.dbUserId
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-forms/schools/forms`] });
      toast({ title: 'Success', description: 'Form created successfully' });
      setIsCreateDialogOpen(false);
      setNewForm({ title: '', description: '', formType: 'custom', accessLevel: 'members' });
      setLocation(`/school-admin/forms/${data.id}/edit`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create form', variant: 'destructive' });
    },
  });

  // Delete form mutation
  const deleteFormMutation = useMutation({
    mutationFn: async (formId: number) => {
      const response = await apiRequest("DELETE", `/api/custom-forms/forms/${formId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-forms/schools/forms`] });
      toast({ title: 'Success', description: 'Form deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete form', variant: 'destructive' });
    },
  });

  // Clone form mutation
  const cloneFormMutation = useMutation({
    mutationFn: async (formId: number) => {
      const response = await apiRequest("POST", `/api/custom-forms/forms/${formId}/clone`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-forms/schools/forms`] });
      toast({ title: 'Success', description: 'Form cloned successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to clone form', variant: 'destructive' });
    },
  });

  const getFormTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      student_registration: 'Student Registration',
      permission_slip: 'Permission Slip',
      survey: 'Survey',
      event_registration: 'Event Registration',
      product_order: 'Product Order',
      feedback: 'Feedback',
      custom: 'Custom Form',
    };
    return labels[type] || type;
  };

  const getAccessLevelBadge = (level: string) => {
    const variants: Record<string, any> = {
      public: 'default',
      members: 'secondary',
      parents: 'outline',
      students: 'outline',
      staff: 'outline',
      custom: 'outline',
    };
    return (
      <Badge variant={variants[level] || 'default'} className="capitalize">
        {level}
      </Badge>
    );
  };

  const copyShareLink = async (form: CustomForm) => {
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/forms/${form.slug}`;
    
    try {
      let copySuccess = false;
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        copySuccess = true;
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        copySuccess = document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      // Only show success if copy actually worked
      if (!copySuccess) {
        throw new Error('Copy command failed');
      }
      
      // Show success message
      if (form.accessLevel === 'public') {
        toast({
          title: 'Link Copied!',
          description: 'Public form link copied to clipboard',
        });
      } else {
        toast({
          title: 'Link Copied',
          description: `Note: This form requires "${form.accessLevel}" access. Change to "public" in settings to allow unauthenticated access.`,
          variant: 'default',
        });
      }
    } catch (error) {
      // Handle error - show URL so user can copy manually
      toast({
        title: 'Copy Failed',
        description: 'Could not copy link to clipboard. Please copy manually: ' + shareUrl,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Forms">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Forms">
      <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Form Builder</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage custom forms for your school
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-form">
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Form</DialogTitle>
              <DialogDescription>
                Create a new custom form for your school
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Form Title</Label>
                <Input
                  id="title"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  placeholder="e.g., Student Registration Form"
                  data-testid="input-form-title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  placeholder="Describe the purpose of this form"
                  data-testid="input-form-description"
                />
              </div>
              <div>
                <Label htmlFor="formType">Form Type</Label>
                <Select
                  value={newForm.formType}
                  onValueChange={(value) => setNewForm({ ...newForm, formType: value })}
                >
                  <SelectTrigger data-testid="select-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student_registration">Student Registration</SelectItem>
                    <SelectItem value="permission_slip">Permission Slip</SelectItem>
                    <SelectItem value="survey">Survey</SelectItem>
                    <SelectItem value="event_registration">Event Registration</SelectItem>
                    <SelectItem value="product_order">Product Order</SelectItem>
                    <SelectItem value="feedback">Feedback</SelectItem>
                    <SelectItem value="custom">Custom Form</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="accessLevel">Access Level</Label>
                <Select
                  value={newForm.accessLevel}
                  onValueChange={(value) => setNewForm({ ...newForm, accessLevel: value })}
                >
                  <SelectTrigger data-testid="select-access-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (Anyone with link)</SelectItem>
                    <SelectItem value="members">All Members</SelectItem>
                    <SelectItem value="parents">Parents Only</SelectItem>
                    <SelectItem value="students">Students Only</SelectItem>
                    <SelectItem value="staff">Staff Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => createFormMutation.mutate(newForm)}
                disabled={!newForm.title || createFormMutation.isPending}
                className="w-full"
                data-testid="button-submit-create-form"
              >
                {createFormMutation.isPending ? 'Creating...' : 'Create Form'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Template Forms Section */}
      {templates.filter(t => t.isTemplate).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Form Templates</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Click "Clone" to create a copy and customize it for your school
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.filter(t => t.isTemplate).map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.title}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {template.description || 'No description'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{getFormTypeLabel(template.formType)}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => cloneFormMutation.mutate(template.id)}
                      disabled={cloneFormMutation.isPending}
                      className="flex-1"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Clone Template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/forms/${template.slug}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* User's Forms Section */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Your Forms</h2>
      </div>

      {forms.length === 0 ? (
        <Card className="text-center py-12">
          <CardHeader>
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>No Forms Yet</CardTitle>
            <CardDescription>
              Create your first custom form to start collecting information from parents, students, and staff
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-form">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id} className="relative" data-testid={`card-form-${form.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{form.title}</CardTitle>
                    <CardDescription className="mt-2">
                      {form.description || 'No description'}
                    </CardDescription>
                  </div>
                  {form.isTemplate && (
                    <Badge variant="outline" className="ml-2">Template</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Badge variant="secondary">{getFormTypeLabel(form.formType)}</Badge>
                  {getAccessLevelBadge(form.accessLevel)}
                  <Badge variant={form.isActive ? 'default' : 'destructive'}>
                    {form.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/school-admin/forms/${form.id}/edit`)}
                    data-testid={`button-edit-form-${form.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/school-admin/forms/${form.id}/submissions`)}
                    data-testid={`button-view-submissions-${form.id}`}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/school-admin/forms/${form.id}/preview`)}
                    data-testid={`button-preview-form-${form.id}`}
                    title="Preview form"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyShareLink(form)}
                    data-testid={`button-share-form-${form.id}`}
                    title="Copy share link"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cloneFormMutation.mutate(form.id)}
                    disabled={cloneFormMutation.isPending}
                    data-testid={`button-clone-form-${form.id}`}
                    title="Clone form"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this form?')) {
                        deleteFormMutation.mutate(form.id);
                      }
                    }}
                    disabled={deleteFormMutation.isPending}
                    data-testid={`button-delete-form-${form.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </SchoolAdminLayout>
  );
}
