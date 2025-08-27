import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Schema for template form
const templateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  classId: z.number(),
  defaultStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"),
  defaultEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"),
  defaultSubject: z.string().min(1, "Subject is required"),
  isActive: z.boolean().default(true)
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

export default function DailyFlowTemplatesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/daily-flows/templates'],
  });

  // Fetch classes for dropdown
  const { data: classes = [] } = useQuery({
    queryKey: ['/api/schools/classes'],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: TemplateFormData) => apiRequest('POST', '/api/daily-flows/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-flows/templates'] });
      setIsCreateOpen(false);
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: TemplateFormData }) => 
      apiRequest('PUT', `/api/daily-flows/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-flows/templates'] });
      setEditingTemplate(null);
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/daily-flows/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-flows/templates'] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      classId: 0,
      defaultStartTime: "09:00",
      defaultEndTime: "10:00",
      defaultSubject: "",
      isActive: true,
    },
  });

  const onSubmit = (data: TemplateFormData) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || "",
      classId: template.classId,
      defaultStartTime: template.defaultStartTime,
      defaultEndTime: template.defaultEndTime,
      defaultSubject: template.defaultSubject,
      isActive: template.isActive,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplateMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setEditingTemplate(null);
    form.reset({
      name: "",
      description: "",
      classId: 0,
      defaultStartTime: "09:00",
      defaultEndTime: "10:00",
      defaultSubject: "",
      isActive: true,
    });
  };

  if (templatesLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Daily Flow Templates</h1>
          <p className="text-gray-600 mt-1">
            Create and manage templates for daily learning activities
          </p>
        </div>
        <Dialog open={isCreateOpen || !!editingTemplate} onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Template" : "Create New Template"}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate 
                  ? "Update the template settings below."
                  : "Fill in the details to create a new daily flow template."
                }
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Morning Routine" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Template description..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class</FormLabel>
                      <Select 
                        value={field.value?.toString()} 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(classes) && classes.map((cls: any) => (
                            <SelectItem key={cls.id} value={cls.id.toString()}>
                              {cls.className}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultStartTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultEndTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="defaultSubject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="Mathematics" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                  >
                    {createTemplateMutation.isPending || updateTemplateMutation.isPending 
                      ? "Saving..." 
                      : editingTemplate ? "Update Template" : "Create Template"
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.isArray(templates) && templates.map((template: any) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {template.description || "No description"}
                  </CardDescription>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                    disabled={deleteTemplateMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{template.defaultStartTime} - {template.defaultEndTime}</span>
                </div>
                <div>
                  <span className="font-medium">Subject:</span> {template.defaultSubject}
                </div>
                <div>
                  <span className="font-medium">Class:</span> {template.className || 'Unknown'}
                </div>
                <div className="flex items-center gap-2">
                  <span 
                    className={`px-2 py-1 rounded-full text-xs ${
                      template.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {template.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {Array.isArray(templates) && templates.length === 0 && (
        <div className="text-center py-12">
          <Clock className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No templates</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first daily flow template.
          </p>
          <div className="mt-6">
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}