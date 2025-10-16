import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2 } from 'lucide-react';

interface FormField {
  id: number;
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
  title: string;
  description: string | null;
  fields: FormField[];
  settings: any;
}

export default function DynamicFormPage() {
  const [, params] = useRoute('/forms/:slug');
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const slug = params?.slug || '';

  // Fetch form by slug
  const { data: form, isLoading } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/by-slug/${slug}`],
    enabled: !!slug,
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
      acc[`field_${field.id}`] = field.fieldType === 'checkbox' ? false : '';
      return acc;
    }, {} as any) || {},
  });

  // Submit form mutation
  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/custom-forms/forms/${form?.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          responseData: data,
          submittedBy: null, // TODO: Get from auth context
          submitterEmail: data.email || null,
          submitterName: data.name || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: 'Success', description: form?.settings?.confirmationMessage || 'Form submitted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit form', variant: 'destructive' });
    },
  });

  const onSubmit = (data: any) => {
    submitMutation.mutate(data);
  };

  const renderField = (field: FormField) => {
    const fieldKey = `field_${field.id}`;

    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    type={field.fieldType}
                    placeholder={field.placeholder || ''}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'textarea':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...formField}
                    placeholder={field.placeholder || ''}
                    rows={4}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'number':
      case 'quantity':
      case 'price':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    type="number"
                    placeholder={field.placeholder || ''}
                    step={field.fieldType === 'price' ? '0.01' : '1'}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'date':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input {...formField} type="date" />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'dropdown':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || 'Select an option'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {field.fieldConfig?.options?.map((option: string) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'radio':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={formField.onChange}
                    defaultValue={formField.value}
                    className="flex flex-col space-y-1"
                  >
                    {field.fieldConfig?.options?.map((option: string) => (
                      <div key={option} className="flex items-center space-x-2">
                        <RadioGroupItem value={option} id={`${fieldKey}_${option}`} />
                        <Label htmlFor={`${fieldKey}_${option}`}>{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checkbox':
        return (
          <FormField
            control={form_hook.control}
            name={fieldKey}
            render={({ field: formField }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={formField.value}
                    onCheckedChange={formField.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    {field.label}
                    {field.isRequired && <span className="text-destructive ml-1">*</span>}
                  </FormLabel>
                  {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                </div>
              </FormItem>
            )}
          />
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Form Not Found</CardTitle>
            <CardDescription>The form you're looking for doesn't exist or has been removed.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Thank You!</CardTitle>
            <CardDescription className="text-base">
              {form.settings?.confirmationMessage || 'Your form has been submitted successfully.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{form.title}</CardTitle>
            {form.description && (
              <CardDescription className="text-base">{form.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Form {...form_hook}>
              <form onSubmit={form_hook.handleSubmit(onSubmit)} className="space-y-6">
                {form.fields.map((field) => (
                  <div key={field.id}>{renderField(field)}</div>
                ))}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
