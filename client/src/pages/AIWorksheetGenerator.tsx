import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KnowledgeBaseSelector } from "@/components/KnowledgeBaseSelector";
import { Loader2, AlertCircle, CheckCircle, Download, Image } from "lucide-react";
import ImageServicesStatusPanel from "@/components/ImageServicesStatusPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppShell from "@/components/layout/AppShell";
import { useToast } from "@/hooks/use-toast";
import { useImageServicesStatus } from "@/hooks/useImageServicesStatus";

// Define types
interface ActivityGenerationParams {
  subject: string;
  ageRange: string;
  activityType: string;
  difficulty: string;
  instructions: string;
  knowledgeBaseIds: number[];
}

type ActivityType = "worksheet" | "crossword" | "coloring" | "wordsearch" | "maze";

// Form validation schema
const activityFormSchema = z.object({
  subject: z.string().min(2, { message: "Subject must be at least 2 characters." }),
  ageRange: z.string().min(2, { message: "Age range is required." }),
  activityType: z.string({
    required_error: "Activity type is required."
  }),
  difficulty: z.string({
    required_error: "Difficulty level is required."
  }),
  instructions: z.string().min(10, { message: "Instructions must be at least 10 characters." }),
  knowledgeBaseIds: z.array(z.number()).optional().default([]),
});

export default function AIWorksheetGenerator() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generatedActivity, setGeneratedActivity] = React.useState<any>(null);
  const [selectedTab, setSelectedTab] = React.useState<string>("form");
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState<boolean>(false);
  
  // Get image services status for coloring pages and other image-based activities
  const { anyServiceAvailable, isHuggingFaceAvailable, isSageMakerAvailable, preferredService, isLoading: checkingImageServices } = useImageServicesStatus();

  // Initialize form with react-hook-form
  const form = useForm<z.infer<typeof activityFormSchema>>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      subject: "",
      ageRange: "6-8",
      activityType: "worksheet",
      difficulty: "beginner",
      instructions: "",
      knowledgeBaseIds: [],
    },
  });

  // Check AI services status
  const { data: aiStatus, isLoading: checkingAIStatus } = useQuery({
    queryKey: ['/api/ai/status'],
    queryFn: () => fetch('/api/ai/status').then(res => res.json()),
  });
  
  // Poll for job completion if we have a background job
  React.useEffect(() => {
    if (generatedActivity?.jobId && generatedActivity?.message?.includes("queued")) {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/activity-status/${generatedActivity.jobId}`);
          const data = await response.json();
          
          // Check if the job is complete
          if (data.status === "completed" && data.result) {
            clearInterval(pollInterval);
            
            // Log the result to understand the data structure
            console.log('Job completed with result:', data.result);
            
            // Process the result to ensure we have the activity ID at the top level
            const processedResult = {
              ...data.result,
              // The activity ID should come from data.result.data.activity.id
              id: data.result.id || 
                  data.result.data?.activity?.id || 
                  (data.result.data?.activity && typeof data.result.data.activity === 'object' ? data.result.data.activity.id : null)
            };
            
            console.log('Processed result with extracted ID:', processedResult);
            setGeneratedActivity(processedResult);
            
            toast({
              title: "Activity Ready!",
              description: "Your activity has been generated successfully.",
              variant: "default",
            });
          } 
          // Check if the job failed
          else if (data.status === "failed") {
            clearInterval(pollInterval);
            toast({
              title: "Generation Failed",
              description: data.error || "Failed to generate activity",
              variant: "destructive",
            });
            // Update with error information
            setGeneratedActivity({
              ...generatedActivity,
              error: data.error || "Failed to generate the activity after multiple attempts.",
              message: "Generation process failed."
            });
          }
        } catch (error) {
          console.error("Error polling for job status:", error);
        }
      }, 3000); // Poll every 3 seconds
      
      // Cleanup interval
      return () => clearInterval(pollInterval);
    }
  }, [generatedActivity?.jobId, toast]);

  // Activity generation mutation
  const activityMutation = useMutation({
    mutationFn: async (params: ActivityGenerationParams) => {
      const response = await fetch('/api/activity-gen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Handle successful generation
      if (data.success) {
        // Log the entire data structure to understand its shape
        console.log('Activity generation response:', data);
        
        // Normalize the data structure to ensure we have the activity ID
        const processedData = {
          ...data,
          // If data contains a nested 'data.activity' object with an ID, make sure it's accessible at the top level too
          id: data.id || (data.data?.activity?.id) || null
        };
        
        setGeneratedActivity(processedData);
        setSelectedTab("preview");
        toast({
          title: "Activity Generated!",
          description: "Your activity has been created successfully.",
          variant: "default",
        });
      } else {
        toast({
          title: "Generation Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      // Handle error
      console.error("Error generating activity:", error);
      toast({
        title: "Error",
        description: "Failed to generate activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  // Generate PDF for an activity
  const generatePDF = async (activityId: number | null) => {
    if (!activityId) {
      console.error('Cannot generate PDF: No activity ID provided');
      toast({
        title: "Error",
        description: "Unable to generate PDF - missing activity ID",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Generating PDF for activity ID:', activityId);
    setIsGeneratingPdf(true);
    
    try {
      // Add a delay to ensure the UI updates before the request
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('Sending PDF generation request to:', `/api/activities/${activityId}/generate-pdf`);
      toast({
        title: "Processing",
        description: "Generating PDF, please wait...",
      });
      
      const response = await fetch(`/api/activities/${activityId}/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'  // Include credentials for session cookies
      });
      
      console.log('PDF generation response status:', response.status, 'statusText:', response.statusText);
      
      if (!response.ok) {
        console.error('PDF generation failed with status:', response.status);
        const errorData = await response.json().catch(() => ({}));
        console.error('Error details:', errorData);
        throw new Error(`Failed to generate PDF: ${errorData.message || response.statusText}`);
      }
      
      const data = await response.json();
      if (data.pdfUrl) {
        // Update the generatedActivity with the PDF URL
        setGeneratedActivity((prev: any) => ({
          ...prev,
          pdfUrl: data.pdfUrl
        }));
        
        toast({
          title: "PDF Generated",
          description: "Your PDF is ready to download",
          variant: "default",
        });
        
        // Open the PDF in a new tab
        window.open(data.pdfUrl, '_blank');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      
      let errorMessage = "Failed to generate PDF. Please try again.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error Generating PDF",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Log additional debugging information
      console.log('PDF generation attempt failed for activity ID:', generatedActivity?.id);
      console.log('Activity data:', generatedActivity);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const onSubmit = (values: z.infer<typeof activityFormSchema>) => {
    activityMutation.mutate(values);
  };

  // Handle knowledge base selection
  const handleKnowledgeBaseChange = (selectedIds: number[]) => {
    form.setValue("knowledgeBaseIds", selectedIds);
  };

  // Get activity type description
  const getActivityTypeDescription = (type: ActivityType) => {
    switch (type) {
      case "worksheet":
        return "Standard educational worksheets with questions and exercises";
      case "crossword":
        return "Crossword puzzles based on educational content";
      case "coloring":
        return "Educational coloring pages with learning elements";
      case "wordsearch":
        return "Word search puzzles based on subject vocabulary";
      case "maze":
        return "Maze puzzles with educational checkpoints";
      default:
        return "Educational activity";
    }
  };

  // Format activity content for preview
  const renderActivityPreview = () => {
    if (!generatedActivity) return null;
    
    // Check if this is a background job
    if (generatedActivity.jobId && generatedActivity.message && generatedActivity.message.includes("queued")) {
      return (
        <div className="border p-6 rounded-lg bg-white">
          <h2 className="text-2xl font-bold mb-2">Activity Generation In Progress</h2>
          <p className="text-gray-600 mb-4">
            {generatedActivity.message}
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Processing with {generatedActivity.services?.primary}</span>
          </div>
          {generatedActivity.services?.fallback && (
            <p className="text-sm text-gray-500 mt-2">
              Fallback service ({generatedActivity.services.fallback}) available if needed
            </p>
          )}
          <div className="mt-4 p-4 bg-gray-50 rounded text-sm">
            <p className="font-medium">Job ID: {generatedActivity.jobId}</p>
            <p className="text-xs text-gray-500 mt-1">The page will refresh when the activity is ready</p>
          </div>
        </div>
      );
    }
    
    const activity = generatedActivity.activityContent;
    if (!activity) {
      return (
        <div className="border p-6 rounded-lg bg-white">
          <h2 className="text-2xl font-bold mb-2">Error Generating Activity</h2>
          <p className="text-gray-600 mb-4">
            {generatedActivity.error || "The activity could not be generated. Please try again with different parameters."}
          </p>
          <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto text-sm">
            {JSON.stringify(generatedActivity, null, 2)}
          </pre>
        </div>
      );
    }
    
    const activityType = form.getValues().activityType as ActivityType;
    
    return (
      <div className="space-y-6">
        <div className="border p-6 rounded-lg bg-white">
          <h2 className="text-2xl font-bold mb-2">{activity?.title || "Generated Activity"}</h2>
          <p className="text-gray-600 mb-4">{activity?.description || "No description available."}</p>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2">Instructions:</h3>
            <p>{activity?.instructions || "No instructions available."}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-sm font-medium text-gray-500">Age Range:</span>
              <span className="ml-2">{activity?.ageRange || form.getValues().ageRange}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Difficulty:</span>
              <span className="ml-2">{activity?.difficulty || form.getValues().difficulty}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Estimated Time:</span>
              <span className="ml-2">{activity?.timeRequired || "Not specified"}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Target Skills:</span>
              <span className="ml-2">{activity?.targetSkills?.join(", ") || "None specified"}</span>
            </div>
          </div>
          
          <div className="mt-6 border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Content Preview:</h3>
            
            {activityType === "worksheet" && activity?.content?.questions && (
              <div className="space-y-4">
                {activity.content.questions.map((q: any, i: number) => (
                  <div key={i} className="p-3 border rounded">
                    <p className="font-medium">{i + 1}. {q?.question || "Question not available"}</p>
                    {q?.type === "multiple_choice" && q?.options && (
                      <div className="ml-6 mt-2 space-y-1">
                        {q.options.map((opt: string, j: number) => (
                          <div key={j} className="flex items-center">
                            <div className="w-5 h-5 rounded-full border flex items-center justify-center mr-2">
                              {String.fromCharCode(65 + j)}
                            </div>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {activityType === "crossword" && activity?.content?.words && (
              <div className="space-y-4">
                <p>Crossword puzzle with {activity.content.words.length} words</p>
                <div className="space-y-2">
                  <h4 className="font-medium">Clues:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activity.content.words.map((w: any, i: number) => (
                      <div key={i} className="p-2 border rounded">
                        <p>
                          <span className="font-medium">
                            {w?.direction ? 
                              `${w.direction.charAt(0).toUpperCase() + w.direction.slice(1)} ${i + 1}:` : 
                              `Clue ${i + 1}:`}
                          </span> {w?.clue || "No clue provided"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {activityType === "coloring" && activity?.content && (
              <div className="space-y-4">
                <p className="italic">{activity.content?.image || "Image description not available"}</p>
                {activity.content?.elements && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Elements to Color:</h4>
                    <ul className="list-disc list-inside">
                      {activity.content.elements.map((el: any, i: number) => (
                        <li key={i}>{el?.name || `Element ${i+1}`}: {el?.description || "No description"}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {activity.content?.learningFacts && (
                  <div className="mt-4">
                    <h4 className="font-medium">Learning Facts:</h4>
                    <ul className="list-disc list-inside">
                      {activity.content.learningFacts.map((fact: string, i: number) => (
                        <li key={i}>{fact || "No fact available"}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {activityType === "wordsearch" && activity?.content?.words && (
              <div className="space-y-4">
                <p>Word search puzzle with {activity.content.words.length} words to find</p>
                <div className="space-y-2">
                  <h4 className="font-medium">Words to Find:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activity.content.words.map((word: string, i: number) => (
                      <div key={i} className="p-2 border rounded text-center">
                        {word || `Word ${i+1}`}
                      </div>
                    ))}
                  </div>
                </div>
                {activity.content?.clues && (
                  <div className="mt-4">
                    <h4 className="font-medium">Clues:</h4>
                    <ol className="list-decimal list-inside">
                      {activity.content.clues.map((clue: string, i: number) => (
                        <li key={i}>{clue || "No clue available"}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            
            {activityType === "maze" && activity?.content && (
              <div className="space-y-4">
                <p>Maze with theme: <strong>{activity.content?.theme || "No theme specified"}</strong></p>
                <p>Complexity level: {activity.content?.complexity || "?"}/10</p>
                {activity.content?.educationalCheckpoints && (
                  <div className="mt-4">
                    <h4 className="font-medium">Educational Checkpoints:</h4>
                    <ol className="list-decimal list-inside">
                      {activity.content.educationalCheckpoints.map((cp: any, i: number) => (
                        <li key={i} className="mb-2">
                          <p><strong>Q:</strong> {cp?.question || "Question not available"}</p>
                          <p className="ml-6"><strong>A:</strong> {cp?.answer || "Answer not available"}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">AI Worksheet Generator</h1>
        
        {!checkingAIStatus && aiStatus && !aiStatus.openai?.available && !aiStatus.anthropic?.available && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>AI Services Unavailable</AlertTitle>
            <AlertDescription>
              Both OpenAI and Anthropic services are currently unavailable. Worksheet generation will not work.
            </AlertDescription>
          </Alert>
        )}
        
        {!checkingAIStatus && aiStatus && !aiStatus.openai?.available && aiStatus.anthropic?.available && (
          <Alert variant="default" className="mb-6 bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>OpenAI Service Unavailable</AlertTitle>
            <AlertDescription>
              The OpenAI service is currently unavailable, but Anthropic/Claude is available as a backup.
              Worksheet generation will use Anthropic/Claude instead.
            </AlertDescription>
          </Alert>
        )}
      
      {!checkingAIStatus && aiStatus && aiStatus.openai?.available && (
        <Alert variant="default" className="mb-6 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>AI Service Ready</AlertTitle>
          <AlertDescription>
            The OpenAI service is operational and ready to generate educational materials.
            {aiStatus.anthropic?.available && " Anthropic/Claude is also available as backup if needed."}
          </AlertDescription>
        </Alert>
      )}

      {/* Image service availability alerts for coloring pages and other image-dependent activities */}
      {form.watch('activityType') === 'coloring' && !checkingImageServices && !anyServiceAvailable && (
        <Alert variant="destructive" className="mb-6">
          <Image className="h-4 w-4" />
          <AlertTitle>Image Generation Services Unavailable</AlertTitle>
          <AlertDescription>
            Image generation services are currently unavailable. Coloring pages require image generation capabilities 
            and will not work properly. Please try another activity type or try again later.
          </AlertDescription>
        </Alert>
      )}
      
      {form.watch('activityType') === 'coloring' && !checkingImageServices && anyServiceAvailable && 
       ((isHuggingFaceAvailable && !isSageMakerAvailable) || (!isHuggingFaceAvailable && isSageMakerAvailable)) && (
        <Alert variant="default" className="mb-6 bg-amber-50 border-amber-200">
          <Image className="h-4 w-4 text-amber-600" />
          <AlertTitle>Limited Image Generation Service</AlertTitle>
          <AlertDescription>
            Only one image generation service is currently available ({isHuggingFaceAvailable ? 'Hugging Face' : 'SageMaker'}). 
            Coloring pages will be generated using the available service, but generation quality or speed may be affected.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Image Services Status Panel - For image-dependent activities like coloring pages */}
      <div className="mb-6">
        <ImageServicesStatusPanel />
      </div>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="form">Create Worksheet</TabsTrigger>
          <TabsTrigger value="preview" disabled={!generatedActivity}>Preview</TabsTrigger>
        </TabsList>
        
        <TabsContent value="form">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Create Educational Worksheet</CardTitle>
                  <CardDescription>
                    Generate custom educational worksheets, puzzles, and activities with AI.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="subject"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Mathematics, Science" {...field} />
                              </FormControl>
                              <FormDescription>
                                The subject matter of the activity.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="ageRange"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Age Range</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select age range" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="3-5">Ages 3-5 (Preschool)</SelectItem>
                                  <SelectItem value="6-8">Ages 6-8 (Early Elementary)</SelectItem>
                                  <SelectItem value="9-11">Ages 9-11 (Upper Elementary)</SelectItem>
                                  <SelectItem value="12-14">Ages 12-14 (Middle School)</SelectItem>
                                  <SelectItem value="15-18">Ages 15-18 (High School)</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Target age group for the activity.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="activityType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Activity Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select activity type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="worksheet">Worksheet</SelectItem>
                                  <SelectItem value="crossword">Crossword Puzzle</SelectItem>
                                  <SelectItem value="coloring">Coloring Page</SelectItem>
                                  <SelectItem value="wordsearch">Word Search</SelectItem>
                                  <SelectItem value="maze">Maze Activity</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                {getActivityTypeDescription(form.watch("activityType") as ActivityType)}
                              </FormDescription>
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
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select difficulty" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="beginner">Beginner</SelectItem>
                                  <SelectItem value="intermediate">Intermediate</SelectItem>
                                  <SelectItem value="advanced">Advanced</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                The difficulty level of the activity.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="instructions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Specific Instructions</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="e.g. Include problems about addition and subtraction, focus on animals in the Arctic..."
                                className="min-h-[120px]"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              Provide specific instructions about what you want included in the activity.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="knowledgeBaseIds"
                        render={() => (
                          <FormItem>
                            <FormLabel>Knowledge Bases (Optional)</FormLabel>
                            <FormControl>
                              <KnowledgeBaseSelector 
                                selectedIds={form.watch("knowledgeBaseIds")} 
                                onChange={handleKnowledgeBaseChange} 
                              />
                            </FormControl>
                            <FormDescription>
                              Select knowledge bases to use as reference material.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={activityMutation.isPending || checkingAIStatus}
                      >
                        {activityMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Generate Activity
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
            
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>How It Works</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal list-inside space-y-4">
                    <li>Fill in the activity details and provide specific instructions</li>
                    <li>Optionally select knowledge bases to use as reference material</li>
                    <li>Click "Generate Activity" to create your educational material</li>
                    <li>Preview the generated content and download if satisfied</li>
                  </ol>
                  
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="font-medium text-lg mb-3">Activity Types</h3>
                    
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium">Worksheets</h4>
                        <p className="text-sm text-gray-600">Educational worksheets with questions and exercises</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium">Crossword Puzzles</h4>
                        <p className="text-sm text-gray-600">Custom puzzles based on educational content</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium">Coloring Pages</h4>
                        <p className="text-sm text-gray-600">Educational coloring pages with learning elements</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium">Word Searches</h4>
                        <p className="text-sm text-gray-600">Word puzzles based on subject vocabulary</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium">Maze Activities</h4>
                        <p className="text-sm text-gray-600">Maze puzzles with educational checkpoints</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="preview">
          {generatedActivity && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Activity Preview</h2>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    console.log('Activity data for PDF generation:', generatedActivity);
                    
                    // Try various paths to find the activity ID
                    if (generatedActivity.pdfUrl) {
                      // Already have a PDF URL, just open it
                      window.open(generatedActivity.pdfUrl);
                    } else {
                      // Look for an ID in various locations based on the data structure
                      let activityId = null;
                      
                      if (generatedActivity.id) {
                        // Direct ID at the top level
                        activityId = generatedActivity.id;
                      } else if (generatedActivity.data?.activity?.id) {
                        // Nested in data.activity
                        activityId = generatedActivity.data.activity.id;
                      } else if (generatedActivity.success?.data?.activity?.id) {
                        // Might be nested in success.data.activity
                        activityId = generatedActivity.success.data.activity.id;
                      } else if (generatedActivity.result?.data?.activity?.id) {
                        // Might be in result.data.activity from job result
                        activityId = generatedActivity.result.data.activity.id;
                      }
                      
                      // New: Check if the ID is directly in the generatedActivity object from the job API
                      // This field is explicitly added by our server-side code
                      if (!activityId && typeof generatedActivity === 'object') {
                        console.log('Looking in additional locations for activity ID');
                        // Check for ID in direct properties or in result object
                        if (generatedActivity.id) {
                          activityId = generatedActivity.id;
                          console.log('Found ID in direct property:', activityId);
                        } else if (generatedActivity.activityId) {
                          activityId = generatedActivity.activityId;
                          console.log('Found ID in activityId property:', activityId);
                        } else if (generatedActivity.result?.id) {
                          activityId = generatedActivity.result.id;
                          console.log('Found ID in result property:', activityId);
                        } else if (generatedActivity.result?.activityId) {
                          activityId = generatedActivity.result.activityId;
                          console.log('Found ID in result.activityId property:', activityId);
                        } else if (generatedActivity.result?.data?.id) {
                          activityId = generatedActivity.result.data.id;
                          console.log('Found ID in result.data property:', activityId);
                        } else if (generatedActivity.result?.data?.activityId) {
                          activityId = generatedActivity.result.data.activityId;
                          console.log('Found ID in result.data.activityId property:', activityId);
                        }
                        
                        // Last resort - if we have a jobId, try to get the activity ID directly from our dedicated endpoint
                        if (!activityId && generatedActivity.jobId) {
                          try {
                            const fetchActivityId = async () => {
                              console.log('Attempting to fetch activity ID directly using job ID:', generatedActivity.jobId);
                              // First try our dedicated endpoint
                              const response = await fetch(`/api/activities/job/${generatedActivity.jobId}/activity-id`);
                              if (response.ok) {
                                const data = await response.json();
                                if (data.success && data.activityId) {
                                  activityId = data.activityId;
                                  console.log('Successfully retrieved activity ID from dedicated endpoint:', activityId);
                                  // Immediately use the activity ID now that we have it
                                  generatePDF(activityId);
                                  return;
                                } else {
                                  console.log('Dedicated endpoint responded but no activity ID found');
                                }
                              }
                              
                              // Fall back to the regular job status endpoint
                              const jobResponse = await fetch(`/api/activity-status/${generatedActivity.jobId}`);
                              if (jobResponse.ok) {
                                const jobData = await jobResponse.json();
                                
                                // Log the entire job data to debug
                                console.log('Job status response:', jobData);
                                
                                if (jobData.result?.activity?.id) {
                                  activityId = jobData.result.activity.id;
                                  console.log('Retrieved activity ID from job API:', activityId);
                                  generatePDF(activityId);
                                } else if (jobData.id) {
                                  activityId = jobData.id;
                                  console.log('Retrieved activity ID from job API id field:', activityId);
                                  generatePDF(activityId);
                                }
                              }
                            };
                            
                            // Execute the fetch
                            fetchActivityId();
                            
                            // Since we're handling the generatePDF call in the async function,
                            // return here to prevent the normal flow from continuing
                            return;
                          } catch (error) {
                            console.error('Error fetching activity ID:', error);
                          }
                        }
                      }
                      
                      // If we found an ID, use it
                      if (activityId) {
                        console.log('Found activity ID for PDF generation:', activityId);
                        generatePDF(activityId);
                      } else {
                        console.error('No activity ID found in:', generatedActivity);
                        toast({
                          title: "Error",
                          description: "Cannot generate PDF - activity ID not found",
                          variant: "destructive",
                        });
                      }
                    }
                  }}
                  disabled={isGeneratingPdf}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isGeneratingPdf ? "Generating PDF..." : (generatedActivity.pdfUrl ? "Download PDF" : "Generate PDF")}
                </Button>
              </div>
              
              {renderActivityPreview()}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </AppShell>
  );
}