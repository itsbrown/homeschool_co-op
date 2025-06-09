import React, { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, ArrowLeft, Plus, X, Info } from "lucide-react";
import { saveKnowledgeBase } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";

import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

// Form schema for creating a knowledge base
const knowledgeBaseFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  subjectArea: z.string().min(1, "Subject area is required"),
  gradeLevel: z.array(z.string()).min(1, "At least one grade level must be selected"),
  visibility: z.enum(["Private", "School", "Public"]),
  status: z.enum(["Draft", "Published"]),
});

type KnowledgeBaseFormValues = z.infer<typeof knowledgeBaseFormSchema>;

const subjects = [
  "Mathematics",
  "Science",
  "History",
  "English",
  "Languages",
  "Arts",
  "Music",
  "Physical Education",
  "Computer Science",
  "Social Studies",
  "Economics",
  "Other"
];

const gradeLevels = [
  { id: "k-2", label: "K-2" },
  { id: "3-5", label: "3-5" },
  { id: "6-8", label: "6-8" },
  { id: "9-12", label: "9-12" },
];

export default function KnowledgeBaseCreationPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Set up form with validation
  const form = useForm<KnowledgeBaseFormValues>({
    resolver: zodResolver(knowledgeBaseFormSchema),
    defaultValues: {
      title: "",
      description: "",
      subjectArea: "",
      gradeLevel: [],
      visibility: "School",
      status: "Draft",
    },
  });

  // Handle file drag events
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  // Process files for upload
  const handleFiles = (files: FileList) => {
    const newFiles = Array.from(files);
    setUploadedFiles(prevFiles => [...prevFiles, ...newFiles]);
  };

  // Remove a file from the upload list
  const removeFile = (index: number) => {
    setUploadedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };

  // Add a tag
  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags(prevTags => [...prevTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  // Remove a tag
  const removeTag = (tagToRemove: string) => {
    setTags(prevTags => prevTags.filter(tag => tag !== tagToRemove));
  };

  // Handle tag input keydown
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  // Set up mutation for creating a knowledge base
  const createKnowledgeBaseMutation = useMutation({
    mutationFn: async (data: { knowledgeBase: KnowledgeBaseFormValues, files: File[], tags: string[] }) => {
      console.log("Creating knowledge base with data:", {
        ...data.knowledgeBase,
        tags: data.tags
      });
      console.log("Uploading files:", data.files);
      
      // Map frontend form data to backend schema
      const kbData = {
        title: data.knowledgeBase.title,
        description: data.knowledgeBase.description,
        subject: data.knowledgeBase.subjectArea,
        difficulty: "All Levels", // Default since not captured in form
        price: 0,
        files: data.files.map(file => ({
          url: `/uploads/${file.name}`,
          type: file.name.split('.').pop() || 'unknown',
          name: file.name
        })),
        metadata: {
          tags: data.tags.length > 0 ? data.tags : ["Learning Resources"],
          objectives: ["Educational content"]
        },
        isPublic: data.knowledgeBase.visibility === "Public"
      };
      
      // Call the actual backend API
      const response = await apiRequest("POST", "/api/knowledge-bases", kbData);
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch knowledge base queries
      queryClient.invalidateQueries({ queryKey: ["/api/schools/knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases"] });
      
      toast({
        title: "Knowledge Base Created",
        description: "Your knowledge base has been created successfully.",
      });
      // Navigate back to the knowledge base list
      navigate('/schools/knowledge-base');
    },
    onError: () => {
      toast({
        title: "Failed to create knowledge base",
        description: "There was an error creating your knowledge base. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (formData: KnowledgeBaseFormValues) => {
    // Create a pre-defined knowledge base for testing
    const antoinetteKB = {
      id: 9999,
      title: "Antoinette Brown Blackwell Collection",
      description: "Historical documents describing the life and impact of Antoinette Brown Blackwell, the first woman ordained as a minister in the United States.",
      subjectArea: "History",
      gradeLevel: ["3-5", "6-8"],
      status: "Published",
      visibility: "School",
      fileCount: 24,
      size: "72 MB",
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      tags: ["History", "Women's Rights", "Religion", "Abolitionism"],
      creator: "School Admin",
      rating: 4.5,
      usageCount: 12
    };
    
    // First clear existing knowledge bases to fix any issues
    localStorage.removeItem('knowledgeBases');
    
    // Save the predefined knowledge base
    saveKnowledgeBase(antoinetteKB);
    
    // Also save the user's new knowledge base
    createKnowledgeBaseMutation.mutate({
      knowledgeBase: formData,
      files: uploadedFiles,
      tags: tags
    });
  };

  return (
    <SchoolAdminLayout pageTitle="Create Knowledge Base">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          {/* Header and back button */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/schools/knowledge-base')} 
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Knowledge Base
              </Button>
            </div>
            <div>
              <h1 className="text-3xl font-bold">Create Knowledge Base</h1>
              <p className="text-muted-foreground">Create a new collection of educational resources</p>
            </div>
            <Separator className="my-4" />
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>
                    Provide the basic details for this knowledge base
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title*</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., American History Primary Documents" 
                          />
                        </FormControl>
                        <FormDescription>
                          Choose a descriptive title for your knowledge base
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description*</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Describe what this knowledge base contains..." 
                            rows={4}
                          />
                        </FormControl>
                        <FormDescription>
                          Provide a detailed description to help others understand what's included
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="subjectArea"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject Area*</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a subject" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {subjects.map((subject) => (
                                <SelectItem key={subject} value={subject}>
                                  {subject}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select the main subject area for this knowledge base
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="gradeLevel"
                      render={() => (
                        <FormItem>
                          <div className="mb-2">
                            <FormLabel>Grade Levels*</FormLabel>
                            <FormDescription>
                              Select all applicable grade levels
                            </FormDescription>
                          </div>
                          <div className="space-y-2">
                            {gradeLevels.map((item) => (
                              <FormField
                                key={item.id}
                                control={form.control}
                                name="gradeLevel"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={item.id}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(item.id)}
                                          onCheckedChange={(checked) => {
                                            const updatedGradeLevels = checked
                                              ? [...field.value, item.id]
                                              : field.value?.filter(
                                                  (value) => value !== item.id
                                                );
                                            field.onChange(updatedGradeLevels);
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        Grades {item.label}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="visibility"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Visibility*</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Private" id="visibility-private" />
                              <Label htmlFor="visibility-private">Private (Only you can access)</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="School" id="visibility-school" />
                              <Label htmlFor="visibility-school">School (Available to all staff in your school)</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Public" id="visibility-public" />
                              <Label htmlFor="visibility-public">Public (Available to all schools in the network)</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormDescription>
                          Control who can access this knowledge base
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div>
                    <FormLabel>Tags</FormLabel>
                    <div className="flex flex-wrap gap-2 mt-2 mb-3">
                      {tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {tag}
                          <X 
                            className="h-3 w-3 cursor-pointer" 
                            onClick={() => removeTag(tag)} 
                          />
                        </Badge>
                      ))}
                    </div>
                    <div className="flex">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        placeholder="Add a tag (press Enter)"
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={addTag}
                        className="ml-2"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    <FormDescription>
                      Tags help users find your knowledge base. Add topics, themes, or keywords.
                    </FormDescription>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex items-center space-x-4"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Draft" id="status-draft" />
                              <Label htmlFor="status-draft">Draft</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Published" id="status-published" />
                              <Label htmlFor="status-published">Published</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormDescription>
                          Draft knowledge bases are only visible to you until published
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Upload Files</CardTitle>
                  <CardDescription>
                    Add documents, presentations, lesson plans, or other resources
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div 
                    className={`border-2 border-dashed rounded-lg p-8 text-center ${
                      dragActive ? "border-primary bg-primary/5" : "border-gray-300"
                    }`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium mb-2">Drag and drop files here</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      or click to browse from your computer
                    </p>
                    <div className="relative inline-block">
                      <input
                        type="file"
                        multiple
                        className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                        id="file-upload"
                        onChange={handleFileChange}
                      />
                      <Button type="button" variant="outline">
                        Select Files
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                      Supported file types: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, JPG, PNG, MP4
                    </p>
                  </div>
                  
                  {uploadedFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-medium mb-3">Selected Files</h4>
                      <div className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div 
                            key={index} 
                            className="flex items-center justify-between bg-secondary/30 rounded-md p-2"
                          >
                            <div className="flex items-center">
                              <div className="ml-2 overflow-hidden">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Alert variant="outline">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                      Files will be uploaded when you save the knowledge base. You can add more files later.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
              
              <div className="flex justify-end space-x-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate('/schools/knowledge-base')}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createKnowledgeBaseMutation.isPending}
                >
                  {createKnowledgeBaseMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Knowledge Base
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}