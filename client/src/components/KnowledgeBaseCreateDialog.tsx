import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertKnowledgeBaseSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from @/hooks/useAuth00";

const validationSchema = insertKnowledgeBaseSchema.extend({
  tags: z.string().optional(),
  objectives: z.string().optional(),
  fileUpload: z.instanceof(FileList).optional(),
});

type FormValues = z.infer<typeof validationSchema>;

interface FileData {
  name: string;
  type: string;
  url: string; // This would be a data URL in our case
}

type KnowledgeBaseCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function KnowledgeBaseCreateDialog({
  open,
  onOpenChange,
}: KnowledgeBaseCreateDialogProps) {
  console.log("KnowledgeBaseCreateDialog rendered, open:", open);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      title: "",
      description: "",
      subject: "",
      difficulty: "beginner", // Default to beginner
      price: 0, // Default to free
      isPublic: true, // Default to public
      tags: "",
      objectives: "",
      fileUpload: undefined, // Make sure this is included
    },
    mode: "onSubmit", // Only validate on submit
  });

  const createKnowledgeBaseMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/knowledge-bases", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/author/me"] });
      toast({
        title: "Success",
        description: "Knowledge base created successfully",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error creating knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to create knowledge base",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const handleFileChange = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    // Show loading toast for large files
    if (Array.from(fileList).some(file => file.size > 5 * 1024 * 1024)) { // 5MB threshold
      toast({
        title: "Processing large files",
        description: "Please wait while we process your files. This may take a moment.",
      });
    }
    
    // Process files sequentially to avoid memory issues with large files
    const processFiles = async () => {
      const newFiles: FileData[] = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        // Skip extremely large files that might cause issues
        if (file.size > 40 * 1024 * 1024) { // 40MB limit
          toast({
            title: "File too large",
            description: `${file.name} exceeds the 40MB limit and was skipped.`,
            variant: "destructive",
          });
          continue;
        }
        
        try {
          const fileData = await new Promise<FileData>((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
              resolve({
                name: file.name,
                type: file.type,
                url: e.target?.result as string,
              });
            };
            
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsDataURL(file);
          });
          
          newFiles.push(fileData);
        } catch (error) {
          console.error("Error processing file:", error);
          toast({
            title: "File Error",
            description: `Failed to process ${file.name}. Please try again.`,
            variant: "destructive",
          });
        }
      }
      
      // Update state with all successfully processed files
      setUploadedFiles(prev => [...prev, ...newFiles]);
    };
    
    await processFiles();
  };

  const onSubmit = async (data: FormValues) => {
    try {
      console.log("Form submission started with data:", data);
      setIsSubmitting(true);
      
      // Construct a simpler payload
      const payload = {
        title: data.title || "Untitled Resource",
        description: data.description || "",
        subject: data.subject || "General",
        difficulty: data.difficulty || "beginner",
        price: parseInt(data.price?.toString() || "0"),
        isPublic: Boolean(data.isPublic),
        files: uploadedFiles,
        metadata: {
          tags: data.tags ? data.tags.split(",").map(tag => tag.trim()) : [],
          objectives: data.objectives ? data.objectives.split("\n").filter(o => o.trim().length > 0) : [],
        },
      };
      
      console.log("Submitting simplified payload:", payload);
      
      // Use a simpler, direct fetch call
      const response = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include' // Important for cookies/session
      });
      
      const responseText = await response.text();
      console.log("Response status:", response.status);
      console.log("Response text:", responseText);
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log("Parsed result:", result);
      } catch (e) {
        console.log("Could not parse response as JSON");
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
      }
      
      // Success handling
      form.reset();
      setUploadedFiles([]);
      setIsSubmitting(false);
      onOpenChange(false);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/author/me"] });
      
      toast({
        title: "Success",
        description: "Knowledge base created successfully",
      });
      
    } catch (error) {
      console.error("Error creating knowledge base:", error);
      setIsSubmitting(false);
      toast({
        title: "Error",
        description: "Failed to create knowledge base. Please check console for details.",
        variant: "destructive",
      });
    }
  };

  // Add an effect to handle escape key presses
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    // Add event listener when component mounts
    document.addEventListener('keydown', handleEscapeKey);
    
    // Clean up event listener when component unmounts
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, onOpenChange]);

  // If the dialog is not open, don't render anything
  if (!open) return null;
  
  // Create a modal dialog directly in the DOM without using Dialog components
  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={(e) => {
        // Close the dialog when clicking the backdrop (outside the content)
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div 
        className="bg-background p-6 rounded-lg w-full max-w-[600px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        <div className="flex flex-row justify-between items-start mb-4">
          <div className="flex flex-col space-y-1.5 text-left">
            <h2 className="text-lg font-semibold leading-none tracking-tight">Create Knowledge Base</h2>
            <p className="text-sm text-muted-foreground">
              Share your educational resources with other educators and learners
            </p>
          </div>
          <button 
            type="button"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
        {/* Log dialog visibility for debugging */}
        <div className="sr-only">{console.log("Custom dialog content rendered, dialog state:", open)}</div>
        
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              console.log("Form submitted via event handler");
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter a title for your knowledge base" {...field} />
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
                    <Textarea
                      placeholder="Describe your knowledge base and what it contains"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Mathematics, Science, History" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty Level</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <select
                          className="w-full h-10 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </FormControl>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6"/>
                        </svg>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (in USD cents)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0 for free"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Set to 0 for a free resource or specify price in cents (e.g., 500 = $5.00 USD)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Public Resource</FormLabel>
                    <FormDescription>
                      Make this knowledge base publicly visible to all users
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter tags separated by commas"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Tags help users find your resources (e.g., algebra, polynomials, equations)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="objectives"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Learning Objectives</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter learning objectives (one per line)"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    What will users learn from this knowledge base?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="fileUpload"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Upload Files</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      multiple
                      {...field}
                      onChange={(e) => {
                        handleFileChange(e.target.files);
                        onChange(e.target.files);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Upload PDFs, documents, slides, or other educational resources
                  </FormDescription>
                  <FormMessage />
                  {uploadedFiles.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium mb-1">Files to upload:</p>
                      <ul className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <li key={index} className="flex items-center justify-between border rounded p-2 bg-gray-50">
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-blue-500">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                              <span className="text-sm">{file.name}</span>
                            </div>
                            <button 
                              type="button" 
                              className="text-red-500 hover:bg-red-50 p-1 rounded-full"
                              onClick={() => {
                                const newFiles = [...uploadedFiles];
                                newFiles.splice(index, 1);
                                setUploadedFiles(newFiles);
                              }}
                              aria-label="Remove file"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </FormItem>
              )}
            />
            
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                disabled={isSubmitting}
                onClick={() => {
                  console.log("Manual submit button clicked");
                  
                  // Get the form values directly
                  const formValues = form.getValues();
                  console.log("Form values:", formValues);
                  
                  // Call submit function directly with current values
                  onSubmit(formValues);
                }}
              >
                {isSubmitting ? "Creating..." : "Create Knowledge Base"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}