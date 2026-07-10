import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Control } from 'react-hook-form';
import { uploadPublicFormAttachment } from '@/lib/publicFormUpload';

type FormFileAttachment = {
  fileName: string;
  objectPath: string;
};

function FileUploadField({
  field,
  formId,
  control,
  onUploaded,
  onError,
}: {
  field: FormFieldType;
  formId: number;
  control: Control<any>;
  onUploaded: (fileName: string) => void;
  onError: (message: string) => void;
}) {
  const fieldKey = `field_${field.id}`;
  const [uploading, setUploading] = useState(false);
  const accept = field.fieldConfig?.accept || '.pdf,.doc,.docx';

  return (
    <FormField
      control={control}
      name={fieldKey}
      render={({ field: formField }) => {
        const attachment = formField.value as FormFileAttachment | null;
        return (
          <FormItem>
            <FormLabel>
              {field.label}
              {field.isRequired && <span className="text-destructive ml-1">*</span>}
            </FormLabel>
            <FormControl>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept={accept}
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const data = await uploadPublicFormAttachment(formId, file);
                      formField.onChange({
                        fileName: data.fileName,
                        objectPath: data.objectPath,
                      });
                      onUploaded(data.fileName);
                    } catch (err: any) {
                      onError(err?.message || 'Could not upload file');
                      e.target.value = '';
                    } finally {
                      setUploading(false);
                    }
                  }}
                  data-testid={`file-field-${field.id}`}
                />
                {uploading && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </p>
                )}
                {attachment?.fileName && !uploading && (
                  <p
                    className="text-sm text-green-700"
                    data-testid={`file-uploaded-${field.id}`}
                  >
                    Uploaded: {attachment.fileName}
                  </p>
                )}
              </div>
            </FormControl>
            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
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
import { CheckCircle2, Share2, Facebook, Mail, Linkedin, Link2, School } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FormFieldType {
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

interface SchoolInfo {
  id: number;
  name: string;
  logo: string | null;
  website: string | null;
}

interface CustomForm {
  id: number;
  title: string;
  description: string | null;
  fields: FormFieldType[];
  settings: any;
  school?: SchoolInfo | null;
}

function SocialShareButtons({ formTitle, formUrl, formDescription }: { formTitle: string; formUrl: string; formDescription?: string | null }) {
  const { toast } = useToast();
  
  const descriptionText = formDescription ? `\n\n${formDescription}` : '';
  const shareText = `${formTitle}${descriptionText}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(formUrl);
  const encodedQuote = encodeURIComponent(formDescription || formTitle);
  
  const emailBody = formDescription 
    ? `${formDescription}\n\nFill out the form here: ${formUrl}`
    : `Check out this form: ${formUrl}`;
  
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedQuote}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent(formTitle)}&body=${encodeURIComponent(emailBody)}`,
  };
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      toast({ title: 'Link copied!', description: 'Form link has been copied to your clipboard.' });
    } catch (err) {
      toast({ title: 'Failed to copy', description: 'Could not copy link to clipboard.', variant: 'destructive' });
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground flex items-center gap-1">
        <Share2 className="h-4 w-4" />
        Share:
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" data-testid="button-share-facebook">
                <Facebook className="h-4 w-4 text-blue-600" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on Facebook</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={shareLinks.twitter} target="_blank" rel="noopener noreferrer" data-testid="button-share-twitter">
                <SiX className="h-4 w-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on X</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={shareLinks.linkedin} target="_blank" rel="noopener noreferrer" data-testid="button-share-linkedin">
                <Linkedin className="h-4 w-4 text-blue-700" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on LinkedIn</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={shareLinks.email} data-testid="button-share-email">
                <Mail className="h-4 w-4 text-gray-600" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share via Email</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={copyToClipboard}
              data-testid="button-copy-link"
            >
              <Link2 className="h-4 w-4 text-gray-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy Link</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function SchoolBranding({ school }: { school: SchoolInfo }) {
  const [logoError, setLogoError] = useState(false);
  
  const hasValidLogo = school.logo && !logoError;
  
  return (
    <div className="mb-6 pb-6 border-b" data-testid="school-branding">
      {hasValidLogo ? (
        <div className="flex justify-center">
          <img 
            src={school.logo!} 
            alt={school.name}
            className="h-16 max-w-[280px] object-contain"
            onError={() => setLogoError(true)}
            data-testid="img-school-logo"
          />
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <School className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground" data-testid="text-school-name">
              {school.name}
            </h2>
            {school.website && (
              <a 
                href={school.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-school-website"
              >
                {school.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DynamicFormPage() {
  const [, params] = useRoute('/forms/:slug');
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const slug = params?.slug || '';
  
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const { data: form, isLoading } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/by-slug/${slug}`],
    enabled: !!slug,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const buildValidationSchema = (fields: FormFieldType[]) => {
    const shape: any = {};
    
    const numericPreprocess = (val: unknown) => {
      if (val === '' || val === null || val === undefined) return undefined;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '') return undefined;
        const num = parseFloat(trimmed);
        return num;
      }
      if (typeof val === 'number') return val;
      return NaN;
    };
    
    fields.forEach((field) => {
      let fieldSchema: any;
      
      switch (field.fieldType) {
        case 'email':
          fieldSchema = z.string();
          if (field.isRequired) {
            fieldSchema = fieldSchema.min(1, `${field.label} is required`).email('Invalid email address');
          } else {
            fieldSchema = fieldSchema.email('Invalid email address').optional().or(z.literal(''));
          }
          break;
        case 'phone':
          fieldSchema = z.string();
          if (field.isRequired) {
            fieldSchema = fieldSchema.min(1, `${field.label} is required`).regex(/^[0-9\-\+\(\)\s]+$/, 'Invalid phone number');
          } else {
            fieldSchema = fieldSchema.regex(/^[0-9\-\+\(\)\s]*$/, 'Invalid phone number').optional();
          }
          break;
        case 'number':
        case 'quantity':
          if (field.isRequired) {
            fieldSchema = z.preprocess(
              numericPreprocess,
              z.number({ required_error: `${field.label} is required`, invalid_type_error: `${field.label} must be a valid number` }).finite(`${field.label} must be a valid number`)
            );
          } else {
            fieldSchema = z.preprocess(
              numericPreprocess,
              z.number({ invalid_type_error: `${field.label} must be a valid number` }).finite(`${field.label} must be a valid number`).optional()
            );
          }
          break;
        case 'price':
          if (field.isRequired) {
            fieldSchema = z.preprocess(
              numericPreprocess,
              z.number({ required_error: `${field.label} is required`, invalid_type_error: `${field.label} must be a valid number` }).finite(`${field.label} must be a valid number`).min(0, 'Price must be positive')
            );
          } else {
            fieldSchema = z.preprocess(
              numericPreprocess,
              z.number({ invalid_type_error: `${field.label} must be a valid number` }).finite(`${field.label} must be a valid number`).min(0, 'Price must be positive').optional()
            );
          }
          break;
        case 'date':
          if (field.isRequired) {
            fieldSchema = z.string().min(1, `${field.label} is required`).regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');
          } else {
            fieldSchema = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Invalid date').optional().or(z.literal(''));
          }
          break;
        case 'checkbox':
          if (field.isRequired) {
            fieldSchema = z.literal(true, {
              errorMap: () => ({ message: `${field.label} is required` }),
            });
          } else {
            fieldSchema = z.boolean().optional();
          }
          break;
        case 'multi_checkbox':
          if (field.isRequired) {
            fieldSchema = z.array(z.string()).min(1, `${field.label} is required`);
          } else {
            fieldSchema = z.array(z.string()).optional();
          }
          break;
        case 'file_upload':
          if (field.isRequired) {
            fieldSchema = z
              .object({
                fileName: z.string().min(1),
                objectPath: z.string().min(1),
              })
              .refine((v) => !!v.objectPath, { message: `${field.label} is required` });
          } else {
            fieldSchema = z
              .object({
                fileName: z.string().optional(),
                objectPath: z.string().optional(),
              })
              .optional()
              .nullable();
          }
          break;
        default:
          if (field.isRequired) {
            fieldSchema = z.string().min(1, `${field.label} is required`);
          } else {
            fieldSchema = z.string().optional();
          }
      }

      shape[`field_${field.id}`] = fieldSchema;
    });
    return z.object(shape);
  };

  const form_hook = useForm({
    resolver: form ? zodResolver(buildValidationSchema(form.fields)) : undefined,
    defaultValues: form?.fields.reduce((acc, field) => {
      if (field.fieldType === 'checkbox') {
        acc[`field_${field.id}`] = false;
      } else if (field.fieldType === 'multi_checkbox') {
        acc[`field_${field.id}`] = [];
      } else if (field.fieldType === 'file_upload') {
        acc[`field_${field.id}`] = null;
      } else {
        acc[`field_${field.id}`] = '';
      }
      return acc;
    }, {} as any) || {},
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!form?.id) {
        throw new Error('Form not loaded');
      }
      
      console.log('Submitting form data:', data);
      console.log('Form ID:', form.id);
      
      const emailField = form.fields.find(f => f.fieldType === 'email');
      const nameFields = form.fields.filter(f => 
        f.label.toLowerCase().includes('name') && f.fieldType === 'text'
      ) || [];
      
      const submitterEmail = emailField ? data[`field_${emailField.id}`] : null;
      const submitterName = nameFields.length > 0 
        ? nameFields.map(f => data[`field_${f.id}`]).filter(Boolean).join(' ')
        : null;
      
      const payload = {
        responseData: data,
        submittedBy: null,
        submitterEmail,
        submitterName,
        honeypot,
      };
      
      console.log('Payload:', payload);
      
      const response = await apiRequest('POST', `/api/custom-forms/forms/${form.id}/submit`, payload);
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: 'Success', description: form?.settings?.confirmationMessage || 'Form submitted successfully' });
    },
    onError: (error: any) => {
      console.error('Form submission error:', error);
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to submit form', 
        variant: 'destructive' 
      });
    },
  });

  const onSubmit = (data: any) => {
    submitMutation.mutate(data);
  };

  const renderField = (field: FormFieldType) => {
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
                    data-testid={`input-field-${field.id}`}
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
                    data-testid={`input-field-${field.id}`}
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
                    data-testid={`input-field-${field.id}`}
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
                  <Input {...formField} type="date" data-testid={`input-field-${field.id}`} />
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
                    <SelectTrigger data-testid={`select-field-${field.id}`}>
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
                    data-testid={`checkbox-field-${field.id}`}
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

      case 'multi_checkbox':
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
                <div className="space-y-2">
                  {field.fieldConfig?.options?.map((option: string) => {
                    const currentValue = formField.value || [];
                    const isChecked = Array.isArray(currentValue) && currentValue.includes(option);
                    return (
                      <div key={option} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${fieldKey}_${option}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const current = Array.isArray(formField.value) ? formField.value : [];
                            if (checked) {
                              formField.onChange([...current, option]);
                            } else {
                              formField.onChange(current.filter((v: string) => v !== option));
                            }
                          }}
                          data-testid={`checkbox-${field.id}-${option}`}
                        />
                        <Label 
                          htmlFor={`${fieldKey}_${option}`}
                          className="cursor-pointer"
                        >
                          {option}
                        </Label>
                      </div>
                    );
                  })}
                </div>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'file_upload':
        if (!form?.id) return null;
        return (
          <FileUploadField
            key={field.id}
            field={field}
            formId={form.id}
            control={form_hook.control}
            onUploaded={(fileName) =>
              toast({ title: 'File uploaded', description: fileName })
            }
            onError={(message) =>
              toast({ title: 'Upload failed', description: message, variant: 'destructive' })
            }
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
        <Card className="max-w-md text-center" data-testid="form-submit-success">
          <CardHeader>
            {form.school && <SchoolBranding school={form.school} />}
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
            {form.school && <SchoolBranding school={form.school} />}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl" data-testid="text-form-title">{form.title}</CardTitle>
                {form.description && (
                  <CardDescription className="text-base mt-2">{form.description}</CardDescription>
                )}
              </div>
              <SocialShareButtons formTitle={form.title} formUrl={currentUrl} formDescription={form.description} />
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form_hook}>
              <form onSubmit={form_hook.handleSubmit(onSubmit)} className="space-y-6">
                {/* Honeypot — hidden from users; bots that fill it are rejected */}
                <div
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
                >
                  <label htmlFor="form-website">Website</label>
                  <input
                    id="form-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    data-testid="input-honeypot"
                  />
                </div>
                {form.fields.map((field) => (
                  <div key={field.id}>{renderField(field)}</div>
                ))}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit"
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
