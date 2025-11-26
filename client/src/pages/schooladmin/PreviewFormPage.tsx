import { useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, AlertCircle, Share2, Facebook, Mail, Linkedin, Link2, School } from 'lucide-react';
import { SiX } from 'react-icons/si';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface FormFieldType {
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

interface SchoolInfo {
  id: number;
  name: string;
  logo: string | null;
  website: string | null;
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
  
  const openShareWindow = (url: string) => {
    window.open(url, '_blank', 'width=600,height=400,noopener,noreferrer');
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openShareWindow(shareLinks.facebook)}
              data-testid="button-share-facebook"
            >
              <Facebook className="h-4 w-4 text-blue-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on Facebook</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openShareWindow(shareLinks.twitter)}
              data-testid="button-share-twitter"
            >
              <SiX className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on X</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openShareWindow(shareLinks.linkedin)}
              data-testid="button-share-linkedin"
            >
              <Linkedin className="h-4 w-4 text-blue-700" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on LinkedIn</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(shareLinks.email, '_blank', 'noopener,noreferrer')}
              data-testid="button-share-email"
            >
              <Mail className="h-4 w-4 text-gray-600" />
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

export default function PreviewFormPage() {
  const [, params] = useRoute('/school-admin/forms/:id/preview');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const formId = params?.id ? parseInt(params.id) : null;
  
  const publicFormUrl = typeof window !== 'undefined' && formId 
    ? `${window.location.origin}/forms/{SLUG}` 
    : '';

  const { data: form, isLoading, error } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/${formId}`],
    enabled: !!formId,
  });

  const actualPublicUrl = form?.slug 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/forms/${form.slug}`
    : '';

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
          fieldSchema = z.boolean();
          break;
        case 'multi_checkbox':
          if (field.isRequired) {
            fieldSchema = z.array(z.string()).min(1, `${field.label} is required`);
          } else {
            fieldSchema = z.array(z.string()).optional();
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
      acc[`field_${field.id}`] = field.fieldType === 'checkbox' ? false : 
                                 field.fieldType === 'multi_checkbox' ? [] : '';
      return acc;
    }, {} as any) || {},
  });

  const onSubmit = (data: any) => {
    console.log('Preview form data:', data);
    toast({
      title: 'Preview Mode',
      description: 'Form submissions are disabled in preview mode. The form data is shown in the console.',
      variant: 'default',
    });
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
            {form.school && <SchoolBranding school={form.school} />}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl" data-testid="text-form-title">{form.title}</CardTitle>
                {form.description && (
                  <CardDescription className="mt-2 text-base">
                    {form.description}
                  </CardDescription>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-2">
                  <Badge variant={form.isActive ? 'default' : 'destructive'}>
                    {form.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {form.accessLevel}
                  </Badge>
                </div>
                {actualPublicUrl && (
                  <SocialShareButtons formTitle={form.title} formUrl={actualPublicUrl} formDescription={form.description} />
                )}
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
