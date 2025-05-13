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
import { Loader2, AlertCircle, CheckCircle, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppShell from "@/components/layout/AppShell";
import { useToast } from "@/hooks/use-toast";

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

  // Activity generation mutation
  const activityMutation = useMutation({
    mutationFn: async (params: ActivityGenerationParams) => {
      const response = await fetch('/api/activities/generate', {
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
        setGeneratedActivity(data);
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
    
    const activity = generatedActivity.activityContent;
    const activityType = form.getValues().activityType as ActivityType;
    
    return (
      <div className="space-y-6">
        <div className="border p-6 rounded-lg bg-white">
          <h2 className="text-2xl font-bold mb-2">{activity.title}</h2>
          <p className="text-gray-600 mb-4">{activity.description}</p>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2">Instructions:</h3>
            <p>{activity.instructions}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-sm font-medium text-gray-500">Age Range:</span>
              <span className="ml-2">{activity.ageRange}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Difficulty:</span>
              <span className="ml-2">{activity.difficulty}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Estimated Time:</span>
              <span className="ml-2">{activity.timeRequired}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Target Skills:</span>
              <span className="ml-2">{activity.targetSkills.join(", ")}</span>
            </div>
          </div>
          
          <div className="mt-6 border-t pt-4">
            <h3 className="text-lg font-medium mb-4">Content Preview:</h3>
            
            {activityType === "worksheet" && (
              <div className="space-y-4">
                {activity.content.questions.map((q: any, i: number) => (
                  <div key={i} className="p-3 border rounded">
                    <p className="font-medium">{i + 1}. {q.question}</p>
                    {q.type === "multiple_choice" && (
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
            
            {activityType === "crossword" && (
              <div className="space-y-4">
                <p>Crossword puzzle with {activity.content.words.length} words</p>
                <div className="space-y-2">
                  <h4 className="font-medium">Clues:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activity.content.words.map((w: any, i: number) => (
                      <div key={i} className="p-2 border rounded">
                        <p><span className="font-medium">{w.direction.charAt(0).toUpperCase() + w.direction.slice(1)} {i + 1}:</span> {w.clue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {activityType === "coloring" && (
              <div className="space-y-4">
                <p className="italic">{activity.content.image}</p>
                <div className="space-y-2">
                  <h4 className="font-medium">Elements to Color:</h4>
                  <ul className="list-disc list-inside">
                    {activity.content.elements.map((el: any, i: number) => (
                      <li key={i}>{el.name}: {el.description}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4">
                  <h4 className="font-medium">Learning Facts:</h4>
                  <ul className="list-disc list-inside">
                    {activity.content.learningFacts.map((fact: string, i: number) => (
                      <li key={i}>{fact}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            
            {activityType === "wordsearch" && (
              <div className="space-y-4">
                <p>Word search puzzle with {activity.content.words.length} words to find</p>
                <div className="space-y-2">
                  <h4 className="font-medium">Words to Find:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activity.content.words.map((word: string, i: number) => (
                      <div key={i} className="p-2 border rounded text-center">
                        {word}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <h4 className="font-medium">Clues:</h4>
                  <ol className="list-decimal list-inside">
                    {activity.content.clues.map((clue: string, i: number) => (
                      <li key={i}>{clue}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
            
            {activityType === "maze" && (
              <div className="space-y-4">
                <p>Maze with theme: <strong>{activity.content.theme}</strong></p>
                <p>Complexity level: {activity.content.complexity}/10</p>
                <div className="mt-4">
                  <h4 className="font-medium">Educational Checkpoints:</h4>
                  <ol className="list-decimal list-inside">
                    {activity.content.educationalCheckpoints.map((cp: any, i: number) => (
                      <li key={i} className="mb-2">
                        <p><strong>Q:</strong> {cp.question}</p>
                        <p className="ml-6"><strong>A:</strong> {cp.answer}</p>
                      </li>
                    ))}
                  </ol>
                </div>
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
        
        {!checkingAIStatus && aiStatus && !aiStatus.openai?.available && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>AI Service Unavailable</AlertTitle>
            <AlertDescription>
              The OpenAI service is currently unavailable. Worksheet generation may not work properly.
            </AlertDescription>
          </Alert>
        )}
      
      {!checkingAIStatus && aiStatus && aiStatus.openai?.available && (
        <Alert variant="default" className="mb-6 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>AI Service Ready</AlertTitle>
          <AlertDescription>
            The OpenAI service is operational and ready to generate educational materials.
          </AlertDescription>
        </Alert>
      )}
      
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
                <Button variant="outline" onClick={() => window.open(generatedActivity.filePath)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
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