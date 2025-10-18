import { useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
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
  slug: string;
  formType: string;
  isActive: boolean;
  accessLevel: string;
  description: string | null;
  fields: FormField[];
  settings: any;
}

export default function PreviewFormPage() {
  const [, params] = useRoute('/school-admin/forms/:id/preview');
  const [, navigate] = useLocation();
  const formId = params?.id ? parseInt(params.id) : null;

  // Fetch form with authentication
  const { data: form, isLoading, error } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/${formId}`],
    enabled: !!formId,
  });

  // Build dynamic validation schema
  const buildValidationSchema = (fields: FormField[]) => {
    const shape: any = {};
    fields.forEach((field) => {
      let fieldSchema: any;
      
      switch (field.fieldType) {
        case 'email':
          fieldSchema = z.string().email('Invalid email address');
          break;
        case 'phone':
          fieldSchema = z.string().regex(/^[0-9\-\+\(\)\s]+$/, 'Invalid phone number');
          break;
        case 'number':
        case 'quantity':
          fieldSchema = z.coerce.number();
          break;
        case 'price':
          fieldSchema = z.coerce.number().min(0, 'Price must be positive');
          break;
        case 'date':
          fieldSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');
          break;
        case 'checkbox':
          fieldSchema = z.boolean();
          break;
        case 'multi_checkbox':
          fieldSchema = z.array(z.string());
          break;
        default:
          fieldSchema = z.string();
      }

      if (field.isRequired && field.fieldType !== 'checkbox') {
        fieldSchema = fieldSchema.min(1, `${field.label} is required`);
      }

      if (!field.isRequired) {
        fieldSchema = fieldSchema.optional();
      }

      shape[`field_${field.id}`] = fieldSchema;
    });
    return z.object(shape);
  };

  const form_hook = useForm({
    resolver: form ? zodResolver(buildValidationSchema(form.fields)) : undefined,
    defaultValues: form?.fields.reduce((acc, field) => {
      acc[`field_${field.id}`] = field.fieldType === 'checkbox' ? false : 
                                 field.fieldType === 'multi_checkbox' ? [] : '';
      return acc;
    }, {} as any) || {},
  });

  const onSubmit = (data: any) => {
    // Preview mode - don't actually submit
    console.log('Preview form data:', data);
    alert('This is preview mode. In the live form, this data would be submitted.');
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Preview Form">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !form) {
    return (
      <SchoolAdminLayout pageTitle="Preview Form">
        <div className="container mx-auto py-8 px-4 max-w-3xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Unable to load form preview. The form may not exist or you may not have permission to view it.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            onClick={() => navigate('/school-admin/forms')}
            className="mt-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forms
          </Button>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={`Preview: ${form.title}`}>
      <div className="container mx-auto py-8 px-4 max-w-3xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/school-admin/forms')}
            data-testid="button-back-to-forms"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forms
          </Button>
        </div>

        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">Preview Mode</AlertTitle>
          <AlertDescription className="text-blue-700">
            This is a preview of how your form will appear to users. Form submissions are disabled in preview mode.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl">{form.title}</CardTitle>
                {form.description && (
                  <CardDescription className="mt-2 text-base">
                    {form.description}
                  </CardDescription>
                )}
              </div>
              <div className="flex gap-2">
                <Badge variant={form.isActive ? 'default' : 'destructive'}>
                  {form.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {form.accessLevel}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {form.fields.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Fields</AlertTitle>
                <AlertDescription>
                  This form has no fields yet. Add fields in the form editor to see them here.
                </AlertDescription>
              </Alert>
            ) : (
              <Form {...form_hook}>
                <form onSubmit={form_hook.handleSubmit(onSubmit)} className="space-y-6">
                  {form.fields.map((field) => (
                    <FormField
                      key={field.id}
                      control={form_hook.control}
                      name={`field_${field.id}`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>
                            {field.label}
                            {field.isRequired && <span className="text-destructive ml-1">*</span>}
                          </FormLabel>
                          <FormControl>
                            {(() => {
                              switch (field.fieldType) {
                                case 'textarea':
                                  return (
                                    <Textarea
                                      {...formField}
                                      placeholder={field.placeholder || ''}
                                      data-testid={`input-field-${field.id}`}
                                    />
                                  );
                                
                                case 'dropdown':
                                  return (
                                    <Select
                                      onValueChange={formField.onChange}
                                      defaultValue={formField.value}
                                    >
                                      <SelectTrigger data-testid={`select-field-${field.id}`}>
                                        <SelectValue placeholder={field.placeholder || 'Select an option'} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {field.fieldConfig?.options?.map((option: string, idx: number) => (
                                          <SelectItem key={idx} value={option}>
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  );
                                
                                case 'radio':
                                  return (
                                    <RadioGroup
                                      onValueChange={formField.onChange}
                                      defaultValue={formField.value}
                                      className="space-y-2"
                                    >
                                      {field.fieldConfig?.options?.map((option: string, idx: number) => (
                                        <div key={idx} className="flex items-center space-x-2">
                                          <RadioGroupItem value={option} id={`${field.id}-${idx}`} />
                                          <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
                                        </div>
                                      ))}
                                    </RadioGroup>
                                  );
                                
                                case 'checkbox':
                                  return (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        checked={formField.value}
                                        onCheckedChange={formField.onChange}
                                        data-testid={`checkbox-field-${field.id}`}
                                      />
                                      <Label>{field.label}</Label>
                                    </div>
                                  );
                                
                                case 'multi_checkbox':
                                  return (
                                    <div className="space-y-2">
                                      {field.fieldConfig?.options?.map((option: string, idx: number) => (
                                        <div key={idx} className="flex items-center space-x-2">
                                          <Checkbox
                                            checked={(formField.value || []).includes(option)}
                                            onCheckedChange={(checked) => {
                                              const current = formField.value || [];
                                              if (checked) {
                                                formField.onChange([...current, option]);
                                              } else {
                                                formField.onChange(current.filter((v: string) => v !== option));
                                              }
                                            }}
                                          />
                                          <Label>{option}</Label>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                
                                case 'date':
                                  return (
                                    <Input
                                      {...formField}
                                      type="date"
                                      data-testid={`input-field-${field.id}`}
                                    />
                                  );
                                
                                case 'file_upload':
                                  return (
                                    <Input
                                      type="file"
                                      onChange={(e) => formField.onChange(e.target.files)}
                                      data-testid={`file-field-${field.id}`}
                                    />
                                  );
                                
                                default:
                                  return (
                                    <Input
                                      {...formField}
                                      type={field.fieldType === 'email' ? 'email' : 
                                            field.fieldType === 'number' || field.fieldType === 'quantity' || field.fieldType === 'price' ? 'number' : 
                                            field.fieldType === 'phone' ? 'tel' : 'text'}
                                      placeholder={field.placeholder || ''}
                                      data-testid={`input-field-${field.id}`}
                                    />
                                  );
                              }
                            })()}
                          </FormControl>
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground">{field.helpText}</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  
                  <div className="pt-4">
                    <Button type="submit" className="w-full" data-testid="button-submit-preview">
                      Submit (Preview Only)
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}
