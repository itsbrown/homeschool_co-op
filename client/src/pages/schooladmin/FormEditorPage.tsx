import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Save, ArrowLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface FormField {
  id: number;
  formId: number;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  order: number;
  fieldConfig: any;
  validationRules: any;
}

interface CustomForm {
  id: number;
  schoolId: number;
  title: string;
  description: string | null;
  slug: string;
  formType: string;
  isActive: boolean;
  accessLevel: string;
  settings: any;
  fields: FormField[];
  isAllLocations: boolean;
  allowedLocationIds: number[] | null;
  platformFeeType: string;
  platformFeeAmount: number;
}

interface Location {
  id: number;
  name: string;
  schoolId: number;
}

function SortableField({ field, onUpdate, onDelete }: { field: FormField; onUpdate: (updates: Partial<FormField>) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border rounded-lg p-4 mb-3">
      <div className="flex items-start gap-3">
        <button {...attributes} {...listeners} className="mt-2 cursor-move text-gray-400 hover:text-gray-600">
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Field Type</Label>
              <Select value={field.fieldType} onValueChange={(value) => onUpdate({ fieldType: value })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="textarea">Text Area</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="radio">Radio Buttons</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="multi_checkbox">Multi-Select Checkboxes</SelectItem>
                  <SelectItem value="file_upload">File Upload</SelectItem>
                  <SelectItem value="product">Product (with variants)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="Field label"
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placeholder (optional)</Label>
              <Input
                value={field.placeholder || ''}
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
                placeholder="Placeholder text"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch
                checked={field.isRequired}
                onCheckedChange={(checked) => onUpdate({ isRequired: checked })}
              />
              <Label className="text-xs">Required</Label>
            </div>
          </div>
          {(field.fieldType === 'dropdown' || field.fieldType === 'radio' || field.fieldType === 'multi_checkbox') && (
            <div>
              <Label className="text-xs">Options (one per line)</Label>
              <Textarea
                value={field.fieldConfig?.options?.join('\n') || ''}
                onChange={(e) => onUpdate({
                  fieldConfig: { ...field.fieldConfig, options: e.target.value.split('\n') }
                })}
                onBlur={(e) => onUpdate({
                  fieldConfig: { ...field.fieldConfig, options: e.target.value.split('\n').filter(o => o.trim()) }
                })}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                className="h-20"
              />
            </div>
          )}
          {field.fieldType === 'product' && (
            <div className="space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs">Product Description</Label>
                <Textarea
                  value={field.fieldConfig?.description || ''}
                  onChange={(e) => onUpdate({
                    fieldConfig: { ...field.fieldConfig, description: e.target.value }
                  })}
                  placeholder="Brief product description"
                  className="h-16"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Base Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(field.fieldConfig?.price || 0) / 100}
                    onChange={(e) => onUpdate({
                      fieldConfig: { ...field.fieldConfig, price: Math.round(parseFloat(e.target.value) * 100) }
                    })}
                    placeholder="10.00"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Quantity</Label>
                  <Input
                    type="number"
                    value={field.fieldConfig?.maxQuantity || 10}
                    onChange={(e) => onUpdate({
                      fieldConfig: { ...field.fieldConfig, maxQuantity: parseInt(e.target.value) || 10 }
                    })}
                    placeholder="10"
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Variants (name:price, one per line)</Label>
                <Textarea
                  value={field.fieldConfig?.variants?.map((v: any) => `${v.name}:${(v.price / 100).toFixed(2)}`).join('\n') || ''}
                  onChange={(e) => {
                    const variants = e.target.value.split('\n')
                      .map(line => {
                        const [name, priceStr] = line.split(':');
                        return {
                          name: name?.trim() || '',
                          price: Math.round((parseFloat(priceStr) || 0) * 100)
                        };
                      });
                    onUpdate({
                      fieldConfig: { ...field.fieldConfig, variants }
                    });
                  }}
                  onBlur={(e) => {
                    const variants = e.target.value.split('\n')
                      .filter(line => line.trim())
                      .map(line => {
                        const [name, priceStr] = line.split(':');
                        return {
                          name: name?.trim() || 'Variant',
                          price: Math.round((parseFloat(priceStr) || 0) * 100)
                        };
                      });
                    onUpdate({
                      fieldConfig: { ...field.fieldConfig, variants }
                    });
                  }}
                  placeholder="Small:10.00&#10;Medium:15.00&#10;Large:20.00"
                  className="h-20"
                />
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function FormEditorPage() {
  const [, params] = useRoute('/school-admin/forms/:id/edit');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const formId = params?.id ? parseInt(params.id) : null;
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [formSettings, setFormSettings] = useState<any>({});
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isActive: true,
    accessLevel: 'members',
    isAllLocations: true,
    allowedLocationIds: [] as number[],
    platformFeeType: 'none' as string,
    platformFeeAmount: 0,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch form data
  const { data: form, isLoading } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/${formId}`],
    enabled: !!formId,
  });

  // Fetch locations for this school
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: [`/api/locations?schoolId=${form?.schoolId || ''}`],
    enabled: !!form?.schoolId,
  });

  useEffect(() => {
    if (form) {
      setFields(form.fields || []);
      setFormSettings(form.settings || {});
      setFormData({
        title: form.title,
        description: form.description || '',
        isActive: form.isActive,
        accessLevel: form.accessLevel,
        isAllLocations: form.isAllLocations ?? true,
        allowedLocationIds: form.allowedLocationIds || [],
        platformFeeType: form.platformFeeType || 'none',
        platformFeeAmount: form.platformFeeAmount || 0,
      });
    }
  }, [form]);

  // Add new field mutation
  const addFieldMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.order)) : -1;
      const response = await apiRequest("POST", `/api/custom-forms/forms/${formId}/fields`, {
        fieldType: 'text',
        label: 'New Field',
        placeholder: '',
        helpText: '',
        isRequired: false,
        order: maxOrder + 1,
        fieldConfig: {},
        validationRules: {},
      });
      return response.json();
    },
    onSuccess: (newField) => {
      setFields([...fields, newField]);
      toast({ title: 'Success', description: 'Field added' });
    },
  });

  // Add new product mutation
  const addProductMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.order)) : -1;
      const response = await apiRequest("POST", `/api/custom-forms/forms/${formId}/fields`, {
        fieldType: 'product',
        label: 'New Product',
        placeholder: '',
        helpText: 'Select quantity and variant',
        isRequired: false,
        order: maxOrder + 1,
        fieldConfig: {
          price: 1000, // Default price $10.00
          description: 'Product description',
          variants: [
            { name: 'Standard', price: 1000 }
          ],
          maxQuantity: 10,
          imageUrl: ''
        },
        validationRules: {},
      });
      return response.json();
    },
    onSuccess: (newField) => {
      setFields([...fields, newField]);
      toast({ title: 'Success', description: 'Product added' });
    },
  });

  // Update field mutation
  const updateFieldMutation = useMutation({
    mutationFn: async ({ fieldId, updates }: { fieldId: number; updates: Partial<FormField> }) => {
      const response = await apiRequest("PUT", `/api/custom-forms/fields/${fieldId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Field updated' });
    },
  });

  // Delete field mutation
  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: number) => {
      const response = await apiRequest("DELETE", `/api/custom-forms/fields/${fieldId}`);
      return response.json();
    },
    onSuccess: (_, fieldId) => {
      setFields(fields.filter(f => f.id !== fieldId));
      toast({ title: 'Success', description: 'Field deleted' });
    },
  });

  // Update form mutation
  const updateFormMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await apiRequest("PUT", `/api/custom-forms/forms/${formId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Form saved successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-forms/forms/${formId}`] });
    },
  });

  // Reorder fields mutation
  const reorderFieldsMutation = useMutation({
    mutationFn: async (fieldOrders: { id: number; order: number }[]) => {
      const response = await apiRequest("PUT", `/api/custom-forms/forms/${formId}/fields/reorder`, { fieldOrders });
      return response.json();
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      const newFields = arrayMove(fields, oldIndex, newIndex).map((f, index) => ({ ...f, order: index }));
      setFields(newFields);
      reorderFieldsMutation.mutate(newFields.map(f => ({ id: f.id, order: f.order })));
    }
  };

  const updateField = (fieldId: number, updates: Partial<FormField>) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
    updateFieldMutation.mutate({ fieldId, updates });
  };

  const saveForm = () => {
    updateFormMutation.mutate({
      title: formData.title,
      description: formData.description,
      isActive: formData.isActive,
      accessLevel: formData.accessLevel,
      isAllLocations: formData.isAllLocations,
      allowedLocationIds: formData.isAllLocations ? null : formData.allowedLocationIds,
      platformFeeType: formData.platformFeeType,
      platformFeeAmount: formData.platformFeeAmount,
      settings: formSettings,
    });
  };

  const toggleLocation = (locationId: number) => {
    const currentIds = formData.allowedLocationIds;
    const newIds = currentIds.includes(locationId)
      ? currentIds.filter(id => id !== locationId)
      : [...currentIds, locationId];
    setFormData({ ...formData, allowedLocationIds: newIds });
  };

  if (isLoading || !form) {
    return (
      <SchoolAdminLayout pageTitle="Edit Form">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={`Edit Form: ${form.title}`}>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/school-admin/forms')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{formData.title}</h1>
            <p className="text-sm text-muted-foreground">{formData.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/forms/${form.slug}`)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button onClick={saveForm} disabled={updateFormMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateFormMutation.isPending ? 'Saving...' : 'Save Form'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="fields" className="space-y-6">
        <TabsList>
          <TabsTrigger value="fields">Form Fields</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Form Fields</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => addFieldMutation.mutate()} disabled={addFieldMutation.isPending} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                  {form.formType === 'product_order' && (
                    <Button onClick={() => addProductMutation.mutate()} disabled={addProductMutation.isPending}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Product
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  {fields.map((field) => (
                    <SortableField
                      key={field.id}
                      field={field}
                      onUpdate={(updates) => updateField(field.id, updates)}
                      onDelete={() => deleteFieldMutation.mutate(field.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {fields.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No fields yet. Click "Add Field" to start building your form.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Form Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Form Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>Form is active</Label>
              </div>
              <div>
                <Label>Access Level</Label>
                <Select
                  value={formData.accessLevel}
                  onValueChange={(value) => setFormData({ ...formData, accessLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public - Anyone with the link</SelectItem>
                    <SelectItem value="members">Members - All school members</SelectItem>
                    <SelectItem value="parents">Parents Only</SelectItem>
                    <SelectItem value="students">Students Only</SelectItem>
                    <SelectItem value="staff">Staff Only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.accessLevel === 'public' 
                    ? '✓ This form can be accessed by anyone with the link (no login required)'
                    : `⚠️ This form requires authentication and ${formData.accessLevel} role to access`
                  }
                </p>
              </div>
              <div>
                <Label>Confirmation Message</Label>
                <Textarea
                  value={formSettings.confirmationMessage || 'Thank you for your submission!'}
                  onChange={(e) => setFormSettings({ ...formSettings, confirmationMessage: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formSettings.allowMultipleSubmissions || false}
                  onCheckedChange={(checked) => setFormSettings({ ...formSettings, allowMultipleSubmissions: checked })}
                />
                <Label>Allow multiple submissions</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formSettings.notifyOnSubmission || false}
                  onCheckedChange={(checked) => setFormSettings({ ...formSettings, notifyOnSubmission: checked })}
                />
                <Label>Send email notifications on submission</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location Targeting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isAllLocations}
                  onCheckedChange={(checked) => setFormData({ ...formData, isAllLocations: checked })}
                  data-testid="switch-all-locations"
                />
                <Label>Available at all locations</Label>
              </div>
              
              {!formData.isAllLocations && (
                <div className="space-y-2">
                  <Label>Select specific locations</Label>
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {locations.map((location) => (
                      <div key={location.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`location-${location.id}`}
                          checked={formData.allowedLocationIds.includes(location.id)}
                          onCheckedChange={() => toggleLocation(location.id)}
                          data-testid={`checkbox-location-${location.id}`}
                        />
                        <Label htmlFor={`location-${location.id}`} className="font-normal cursor-pointer">
                          {location.name}
                        </Label>
                      </div>
                    ))}
                    {locations.length === 0 && (
                      <p className="text-sm text-muted-foreground">No locations found for this school.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform Fees (for Product Order Forms)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Fee Type</Label>
                <Select
                  value={formData.platformFeeType}
                  onValueChange={(value) => setFormData({ ...formData, platformFeeType: value })}
                >
                  <SelectTrigger data-testid="select-platform-fee-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Platform Fee</SelectItem>
                    <SelectItem value="flat_per_item">Flat Fee Per Item Type</SelectItem>
                    <SelectItem value="percentage">Percentage of Total</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.platformFeeType === 'none' && 'No platform fee will be charged'}
                  {formData.platformFeeType === 'flat_per_item' && 'A flat fee per item type (not per quantity) will be charged'}
                  {formData.platformFeeType === 'percentage' && 'A percentage of the subtotal will be charged'}
                </p>
              </div>
              
              {formData.platformFeeType !== 'none' && (
                <div>
                  <Label>
                    {formData.platformFeeType === 'flat_per_item' 
                      ? 'Fee Amount (cents per item type)' 
                      : 'Fee Percentage (e.g., 5 for 5%)'}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step={formData.platformFeeType === 'percentage' ? '0.1' : '1'}
                    value={formData.platformFeeAmount}
                    onChange={(e) => setFormData({ ...formData, platformFeeAmount: parseFloat(e.target.value) || 0 })}
                    data-testid="input-platform-fee-amount"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.platformFeeType === 'flat_per_item' 
                      ? `Example: 50 cents per item type (if someone orders 2 candles and 3 eggs, fee = $0.50 × 2 = $1.00)`
                      : `Example: ${formData.platformFeeAmount}% of subtotal`}
                  </p>
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
