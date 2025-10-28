import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { Trash2, Plus, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

type KnowledgeBaseEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: number;
};

export function KnowledgeBaseEditDialog({
  open,
  onOpenChange,
  knowledgeBaseId,
}: KnowledgeBaseEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [existingFiles, setExistingFiles] = useState<FileData[]>([]);

  // Fetch the knowledge base data
  const knowledgeBaseQuery = useQuery({
    queryKey: [`/api/knowledge-bases/${knowledgeBaseId}`],
    enabled: open && !!knowledgeBaseId,
    refetchOnWindowFocus: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      title: "",
      description: "",
      subject: "",
      difficulty: "beginner",
      price: 0,
      isPublic: true,
      tags: "",
      objectives: "",
    },
  });

  // Track which knowledge base has been initialized to prevent re-initialization on refetch
  const initializedKbIdRef = useRef<number | null>(null);

  // Clear the initialized ref and file state when the dialog closes or when KB ID changes
  useEffect(() => {
    if (!open) {
      // Dialog closed - clear everything so it reinitializes fresh on next open
      initializedKbIdRef.current = null;
      setExistingFiles([]);
      setUploadedFiles([]);
    }
  }, [open]);

  useEffect(() => {
    // KB ID changed - clear the ref and file state so it initializes with the new KB data
    initializedKbIdRef.current = null;
    setExistingFiles([]);
    setUploadedFiles([]);
  }, [knowledgeBaseId]);

  // Set form values when knowledge base data is loaded (only once per KB per dialog opening)
  useEffect(() => {
    if (knowledgeBaseQuery.data) {
      const kb = knowledgeBaseQuery.data;
      
      // Only initialize once per knowledgeBaseId per dialog opening to prevent wiping user edits on refetch
      if (kb.id !== initializedKbIdRef.current) {
        console.log("Initializing knowledge base form for KB ID:", kb.id);
        form.reset({
          title: kb.title,
          description: kb.description || "",
          subject: kb.subject,
          difficulty: kb.difficulty,
          price: kb.price,
          isPublic: kb.isPublic,
          tags: kb.metadata?.tags?.join(", ") || "",
          objectives: kb.metadata?.objectives?.join("\n") || "",
        });
        
        // Load existing files (or clear if none)
        if (kb.files && kb.files.length > 0) {
          setExistingFiles(kb.files);
        } else {
          setExistingFiles([]);
        }
        
        // Clear uploaded files on fresh initialization
        setUploadedFiles([]);
        
        // Mark this KB as initialized
        initializedKbIdRef.current = kb.id;
      }
    }
  }, [knowledgeBaseQuery.data, form]);

  const updateKnowledgeBaseMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/knowledge-bases/${knowledgeBaseId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/author/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-bases/${knowledgeBaseId}`] });
      toast({
        title: "Success",
        description: "Knowledge base updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error updating knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to update knowledge base",
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

  const removeExistingFile = (index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: FormValues) => {
    try {
      console.log("Edit form submission started with data:", data);
      setIsSubmitting(true);
      
      // Construct a standardized payload
      const payload = {
        title: data.title || "",
        description: data.description || "",
        subject: data.subject || "General",
        difficulty: data.difficulty || "beginner",
        price: parseInt(data.price?.toString() || "0"),
        isPublic: Boolean(data.isPublic),
        files: [...existingFiles, ...uploadedFiles],
        metadata: {
          tags: data.tags ? data.tags.split(",").map(tag => tag.trim()) : [],
          objectives: data.objectives ? data.objectives.split("\n").filter(o => o.trim().length > 0) : [],
        },
      };
      
      console.log("Submitting edit payload:", payload);
      
      // Use a direct fetch call instead of the mutation
      const response = await fetch(`/api/knowledge-bases/${knowledgeBaseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include' // Important for cookies/session
      });
      
      const responseText = await response.text();
      console.log("Edit response status:", response.status);
      console.log("Edit response text:", responseText);
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log("Parsed edit result:", result);
      } catch (e) {
        console.log("Could not parse edit response as JSON");
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
      }
      
      // Success handling
      setIsSubmitting(false);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-bases/author/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-bases/${knowledgeBaseId}`] });
      
      toast({
        title: "Success",
        description: "Knowledge base updated successfully",
      });
      
      onOpenChange(false);
      
    } catch (error) {
      console.error("Error updating knowledge base:", error);
      setIsSubmitting(false);
      toast({
        title: "Error",
        description: "Failed to update knowledge base. Please check console for details.",
        variant: "destructive",
      });
    }
  };

  if (knowledgeBaseQuery.isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="w-full h-8 bg-gray-200 animate-pulse rounded"></div>
            <div className="w-full h-24 bg-gray-200 animate-pulse rounded"></div>
            <div className="w-full h-8 bg-gray-200 animate-pulse rounded"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Knowledge Base</DialogTitle>
          <DialogDescription>
            Update your educational resources
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <FormLabel>Price (in cents)</FormLabel>
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
                    Set to 0 for a free resource or specify price in cents (e.g., 500 = $5.00)
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
            
            {/* Existing Files Section */}
            {existingFiles.length > 0 && (
              <div className="border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">Current Files</h4>
                <div className="space-y-2">
                  {existingFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExistingFile(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Newly Uploaded Files Section */}
            {uploadedFiles.length > 0 && (
              <div className="border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">New Files to Add</h4>
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                        <Badge variant="outline" className="ml-2 bg-primary/10">New</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUploadedFile(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* File Upload Field */}
            <FormField
              control={form.control}
              name="fileUpload"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Add More Files</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        multiple
                        {...field}
                        onChange={(e) => {
                          handleFileChange(e.target.files);
                          onChange(e.target.files);
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Upload PDFs, documents, slides, or other educational resources
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                disabled={isSubmitting}
                onClick={() => {
                  console.log("Manual update button clicked");
                  
                  // Get the form values directly
                  const formValues = form.getValues();
                  console.log("Update form values:", formValues);
                  
                  // Call submit function directly with current values
                  onSubmit(formValues);
                }}
              >
                {isSubmitting ? "Updating..." : "Update Knowledge Base"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}