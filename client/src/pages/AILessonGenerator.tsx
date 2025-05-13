import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAIStatus } from "@/hooks/useAIStatus";
import { useToast } from "@/hooks/use-toast";
import AppShell from "@/components/layout/AppShell";
import AIStatusPanel from "@/components/AIStatusPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Lightbulb, ArrowRight, Book, Clock, Brain, Target, AlertCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";

const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  subject: z.string().min(2, "Please select a subject"),
  gradeLevel: z.string().min(2, "Please select a grade level"),
  duration: z.coerce.number().min(15, "Duration must be at least 15 minutes").max(180, "Duration cannot exceed 180 minutes"),
  objectives: z.string().min(10, "Please provide learning objectives"),
  learningStyles: z.array(z.string()).min(1, "Select at least one learning style"),
  worksheetTypes: z.array(z.string()).optional(),
  knowledgeBaseIds: z.array(z.number()).optional(),
  additionalNotes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const GRADE_LEVELS = [
  "Pre-K", "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", 
  "Grade 6", "Grade 7", "Grade 8", 
  "Grade 9", "Grade 10", "Grade 11", "Grade 12",
  "College", "Adult Education"
];

const SUBJECTS = [
  "Mathematics", "Science", "Language Arts", "Social Studies", "History", 
  "Geography", "Physics", "Chemistry", "Biology", "Computer Science",
  "Art", "Music", "Physical Education", "Foreign Language", "Economics"
];

const LEARNING_STYLES = [
  { id: "visual", label: "Visual" },
  { id: "auditory", label: "Auditory" },
  { id: "reading", label: "Reading/Writing" },
  { id: "kinesthetic", label: "Kinesthetic" },
  { id: "logical", label: "Logical" },
  { id: "social", label: "Social" },
  { id: "solitary", label: "Solitary" }
];

const WORKSHEET_TYPES = [
  { id: "coloring_book", label: "Coloring Book" },
  { id: "crossword_puzzle", label: "Crossword Puzzle" },
  { id: "spot_the_difference", label: "Spot the Difference" },
  { id: "word_search", label: "Word Search" },
  { id: "matching_activity", label: "Matching Activity" },
  { id: "fill_in_the_blank", label: "Fill in the Blank" },
  { id: "labeling_diagram", label: "Labeling Diagram" },
  { id: "math_worksheet", label: "Math Worksheet" }
];

// Helper function to create worksheet templates based on type
function getWorksheetTemplate(
  type: string, 
  subject: string, 
  gradeLevel: string
): { type: string; title: string; description: string; content?: string; instructions?: string } | null {
  
  // Base title incorporating subject and grade level
  const baseTitle = `${subject} ${type.replace('_', ' ')} for ${gradeLevel}`;
  
  switch (type) {
    case 'coloring_book':
      return {
        type,
        title: `${subject} Coloring Activity`,
        description: `A coloring book page that reinforces key ${subject} concepts through visual engagement.`,
        instructions: `Print out this coloring page and have students color in the images while discussing key ${subject} concepts. Great for visual and kinesthetic learners.`
      };
      
    case 'crossword_puzzle':
      return {
        type,
        title: `${subject} Vocabulary Crossword`,
        description: `A crossword puzzle using important ${subject} terminology appropriate for ${gradeLevel}.`,
        instructions: `Students should complete this crossword puzzle using key vocabulary terms from the ${subject} unit. Can be done individually or in pairs.`
      };
      
    case 'spot_the_difference':
      return {
        type,
        title: `${subject} Spot the Difference`,
        description: `Two similar images with subtle differences that relate to key ${subject} concepts.`,
        instructions: `Have students identify the differences between these two images. Each difference relates to an important concept in ${subject}. Discuss why these differences matter.`
      };
      
    case 'word_search':
      return {
        type,
        title: `${subject} Word Search Challenge`,
        description: `A word search puzzle containing key terminology from the ${subject} unit.`,
        instructions: `Students should find all the hidden words related to ${subject}. After finding all words, have students define each term or use it in a sentence.`
      };
      
    case 'matching_activity':
      return {
        type,
        title: `${subject} Matching Exercise`,
        description: `A two-column matching activity connecting ${subject} concepts with their definitions or examples.`,
        instructions: `Draw lines connecting the terms in the left column with their correct matches in the right column. Discuss the connections as a class afterward.`
      };
      
    case 'fill_in_the_blank':
      return {
        type,
        title: `${subject} Fill-in-the-Blank Exercise`,
        description: `A paragraph or series of sentences about ${subject} with key terms removed for students to complete.`,
        instructions: `Fill in each blank with the appropriate ${subject} term from the word bank. Check answers as a class and discuss why each term fits in its context.`
      };
      
    case 'labeling_diagram':
      return {
        type,
        title: `${subject} Diagram Labeling Activity`,
        description: `A diagram related to ${subject} that students must correctly label with provided terms.`,
        instructions: `Label each part of the diagram using the terms provided. Be prepared to explain the function or significance of each labeled part.`
      };
      
    case 'math_worksheet':
      return {
        type,
        title: `${subject} Mathematical Practice`,
        description: `A set of math problems that apply or relate to ${subject} concepts.`,
        instructions: `Solve each problem, showing all your work. These problems demonstrate how mathematical concepts apply to ${subject}.`
      };
      
    default:
      return null;
  }
}

interface GeneratedLesson {
  title: string;
  duration: number;
  objectives: string[];
  materials: string[];
  activities: {
    title: string;
    duration: number;
    description: string;
    learningStyles: string[];
  }[];
  assessments: string[];
  extensions: string[];
  worksheets?: {
    type: string;
    title: string;
    description: string;
    content?: string;
    instructions?: string;
  }[];
  knowledgeBases?: {
    id: number;
    title: string;
    subject: string;
    difficulty: string;
  }[];
}

export default function AILessonGenerator() {
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [generateErrorMessage, setGenerateErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("form");
  
  const { isAIAvailable, aiStatus } = useAIStatus();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Query to fetch knowledge bases for selection (combines public and user's knowledge bases)
  const knowledgeBasesQuery = useQuery<any[]>({
    queryKey: ["/api/knowledge-bases/all"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      subject: "",
      gradeLevel: "",
      duration: 45,
      objectives: "",
      learningStyles: [],
      worksheetTypes: [],
      knowledgeBaseIds: [],
      additionalNotes: "",
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      setIsGenerating(true);
      try {
        // In a real app, this would be an API call
        // return await apiRequest("/api/lessons/generate", data);
        
        // For now, we'll simulate a response after a delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // This is just a placeholder for demonstration
        if (!isAIAvailable) {
          throw new Error("AI services are currently unavailable. Please try again later.");
        }
        
        const result: GeneratedLesson = {
          title: data.title,
          duration: data.duration,
          objectives: [
            "Understand the key concepts of " + data.subject,
            "Apply critical thinking to real-world scenarios",
            "Demonstrate mastery through hands-on activities"
          ],
          materials: [
            "Textbook or digital resources",
            "Worksheets or handouts",
            "Visual aids or manipulatives"
          ],
          activities: [
            {
              title: "Introduction",
              duration: Math.round(data.duration * 0.2),
              description: "Begin with an engaging hook that connects to students' prior knowledge about " + data.subject,
              learningStyles: ["visual", "auditory"]
            },
            {
              title: "Main Activity",
              duration: Math.round(data.duration * 0.5),
              description: "Students will work through concepts with guided practice and collaborative learning",
              learningStyles: data.learningStyles
            },
            {
              title: "Conclusion",
              duration: Math.round(data.duration * 0.3),
              description: "Review key points and check for understanding through summary activities",
              learningStyles: ["social", "reading"]
            }
          ],
          assessments: [
            "Formative assessment through questioning and observation",
            "Exit ticket summarizing main concepts",
            "Optional extension activity for advanced learners"
          ],
          extensions: [
            "Additional resources for students who want to explore further",
            "Modifications for different learning needs",
            "Home learning extension activities"
          ]
        };
        
        // Generate worksheets if any selected
        if (data.worksheetTypes && data.worksheetTypes.length > 0) {
          result.worksheets = [];
          
          // Create worksheet for each selected type
          data.worksheetTypes.forEach(type => {
            const worksheetTemplate = getWorksheetTemplate(type, data.subject, data.gradeLevel);
            if (worksheetTemplate) {
              result.worksheets?.push(worksheetTemplate);
            }
          });
        }
        
        // Include knowledge base references if any selected
        if (data.knowledgeBaseIds && data.knowledgeBaseIds.length > 0) {
          // Find the selected knowledge bases from the query data
          const selectedKnowledgeBases = knowledgeBasesQuery.data?.filter(kb => 
            data.knowledgeBaseIds?.includes(kb.id)
          ) || [];
          
          // Include knowledge base information in the generated lesson
          if (selectedKnowledgeBases.length > 0) {
            result.knowledgeBases = selectedKnowledgeBases.map(kb => ({
              id: kb.id,
              title: kb.title,
              subject: kb.subject,
              difficulty: kb.difficulty
            }));
            
            // Enhance the lesson content with knowledge base-specific information
            if (result.objectives) {
              result.objectives.push(
                `Apply concepts from the selected knowledge bases: ${selectedKnowledgeBases.map(kb => kb.title).join(', ')}`
              );
            }
            
            if (result.materials) {
              result.materials.push(
                `Knowledge base resources: ${selectedKnowledgeBases.map(kb => kb.title).join(', ')}`
              );
            }
          }
        }
        
        return result;
      } catch (error: any) {
        console.error("Generation error:", error);
        throw new Error(error.message || "Failed to generate lesson plan");
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: (data) => {
      setGeneratedLesson(data);
      setActiveTab("preview");
      setGenerateErrorMessage(null);
      toast({
        title: "Lesson plan generated!",
        description: "Your AI-powered lesson plan is ready to view and save.",
      });
    },
    onError: (error: Error) => {
      setGenerateErrorMessage(error.message);
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveLessonMutation = useMutation({
    mutationFn: async () => {
      if (!generatedLesson) return;
      
      // This would be an actual API call in a real app
      // return await apiRequest("/api/lessons", {
      //   ...generatedLesson,
      //   ...form.getValues(),
      //   authorId: user?.id,
      //   status: "draft",
      // });
      
      // For now, simulate a successful save after a delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { id: Math.floor(Math.random() * 1000) };
    },
    onSuccess: () => {
      toast({
        title: "Lesson saved!",
        description: "Your lesson has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "There was an error saving your lesson. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    generateMutation.mutate(data);
  };

  const saveLesson = () => {
    saveLessonMutation.mutate();
  };

  const renderLessonPreview = () => {
    if (!generatedLesson) return null;
    
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">{generatedLesson.title}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className="flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {generatedLesson.duration} minutes
            </Badge>
            <Badge variant="outline" className="flex items-center">
              <Book className="h-3 w-3 mr-1" />
              {form.getValues("subject")}
            </Badge>
            <Badge variant="outline" className="flex items-center">
              <Brain className="h-3 w-3 mr-1" />
              {form.getValues("gradeLevel")}
            </Badge>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium flex items-center">
            <Target className="h-4 w-4 mr-2" />
            Learning Objectives
          </h3>
          <Separator className="my-2" />
          <ul className="list-disc pl-5 space-y-1">
            {generatedLesson.objectives.map((objective, i) => (
              <li key={i} className="text-sm">{objective}</li>
            ))}
          </ul>
        </div>
        
        <div>
          <h3 className="text-lg font-medium">Materials Needed</h3>
          <Separator className="my-2" />
          <ul className="list-disc pl-5 space-y-1">
            {generatedLesson.materials.map((material, i) => (
              <li key={i} className="text-sm">{material}</li>
            ))}
          </ul>
        </div>
        
        <div>
          <h3 className="text-lg font-medium">Lesson Activities</h3>
          <Separator className="my-2" />
          <div className="space-y-4">
            {generatedLesson.activities.map((activity, i) => (
              <div key={i} className="bg-muted/40 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{activity.title}</h4>
                  <span className="text-xs text-muted-foreground">{activity.duration} min</span>
                </div>
                <p className="text-sm mb-2">{activity.description}</p>
                <div className="flex flex-wrap gap-1">
                  {activity.learningStyles.map(style => (
                    <Badge key={style} variant="secondary" className="text-xs">
                      {LEARNING_STYLES.find(s => s.id === style)?.label || style}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium">Assessment Strategies</h3>
          <Separator className="my-2" />
          <ul className="list-disc pl-5 space-y-1">
            {generatedLesson.assessments.map((assessment, i) => (
              <li key={i} className="text-sm">{assessment}</li>
            ))}
          </ul>
        </div>
        
        <div>
          <h3 className="text-lg font-medium">Extensions & Modifications</h3>
          <Separator className="my-2" />
          <ul className="list-disc pl-5 space-y-1">
            {generatedLesson.extensions.map((extension, i) => (
              <li key={i} className="text-sm">{extension}</li>
            ))}
          </ul>
        </div>
        
        {generatedLesson.knowledgeBases && generatedLesson.knowledgeBases.length > 0 && (
          <div>
            <h3 className="text-lg font-medium">Knowledge Base Resources</h3>
            <Separator className="my-2" />
            <div className="space-y-2">
              {generatedLesson.knowledgeBases.map((kb, i) => (
                <div key={i} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md">
                  <Book className="h-5 w-5 text-primary/70" />
                  <div>
                    <p className="text-sm font-medium">{kb.title}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{kb.subject}</Badge>
                      <Badge variant="outline" className="text-xs">{kb.difficulty}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {generatedLesson.worksheets && generatedLesson.worksheets.length > 0 && (
          <div>
            <h3 className="text-lg font-medium">Worksheets</h3>
            <Separator className="my-2" />
            <div className="space-y-4">
              {generatedLesson.worksheets.map((worksheet, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{worksheet.title}</CardTitle>
                    <CardDescription className="text-xs">{worksheet.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="text-sm space-y-2">
                      <div className="font-medium">Instructions:</div>
                      <div className="text-sm text-muted-foreground">{worksheet.instructions}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={() => setActiveTab("form")}>
            Edit Form
          </Button>
          <Button onClick={saveLesson} disabled={saveLessonMutation.isPending}>
            {saveLessonMutation.isPending ? "Saving..." : "Save Lesson"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center">
          <Sparkles className="h-6 w-6 mr-2 text-primary" />
          AI Lesson Generator
        </h1>
        <p className="text-muted-foreground mt-1">
          Create comprehensive lesson plans powered by AI that adapt to different learning styles
        </p>
      </div>
      
      {/* AI Status Panel */}
      <div className="mb-6">
        <AIStatusPanel />
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md mb-6">
          <TabsTrigger value="form">Create Lesson</TabsTrigger>
          <TabsTrigger value="preview" disabled={!generatedLesson}>Preview & Save</TabsTrigger>
        </TabsList>
        
        <TabsContent value="form" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="h-5 w-5 mr-2" />
                Lesson Plan Details
              </CardTitle>
              <CardDescription>
                Fill in the form below to generate a custom lesson plan tailored to your needs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lesson Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Introduction to Photosynthesis" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (minutes)</FormLabel>
                          <FormControl>
                            <Input type="number" min={15} max={180} {...field} />
                          </FormControl>
                          <FormDescription>
                            Recommended: 30-60 minutes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a subject" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SUBJECTS.map(subject => (
                                <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="gradeLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade Level</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a grade level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {GRADE_LEVELS.map(grade => (
                                <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="objectives"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Learning Objectives</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="What students should learn and be able to do after this lesson"
                            className="min-h-[80px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="learningStyles"
                    render={() => (
                      <FormItem>
                        <div className="mb-2">
                          <FormLabel>Learning Styles</FormLabel>
                          <FormDescription>
                            Select the learning styles you want to incorporate
                          </FormDescription>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {LEARNING_STYLES.map((style) => (
                            <FormField
                              key={style.id}
                              control={form.control}
                              name="learningStyles"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={style.id}
                                    className="flex flex-row items-center space-x-2 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(style.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, style.id])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== style.id
                                                )
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm cursor-pointer">
                                      {style.label}
                                    </FormLabel>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="worksheetTypes"
                    render={() => (
                      <FormItem>
                        <div className="mb-2">
                          <FormLabel>Worksheet Types (Optional)</FormLabel>
                          <FormDescription>
                            Select the types of worksheets you want to include in the lesson
                          </FormDescription>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {WORKSHEET_TYPES.map((type) => (
                            <FormField
                              key={type.id}
                              control={form.control}
                              name="worksheetTypes"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={type.id}
                                    className="flex flex-row items-center space-x-2 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(type.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), type.id])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== type.id
                                                )
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm cursor-pointer">
                                      {type.label}
                                    </FormLabel>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="knowledgeBaseIds"
                    render={() => (
                      <FormItem>
                        <div className="mb-2">
                          <FormLabel>Knowledge Base Resources (Optional)</FormLabel>
                          <FormDescription>
                            Select knowledge bases to use as reference for this lesson
                          </FormDescription>
                        </div>
                        {knowledgeBasesQuery.isLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                          </div>
                        ) : knowledgeBasesQuery.isError ? (
                          <div className="text-center py-6 text-muted-foreground border rounded-md bg-destructive/5">
                            <AlertCircle className="h-10 w-10 mx-auto text-destructive opacity-70" />
                            <p className="mt-2 font-medium text-destructive">Failed to load knowledge bases</p>
                            <p className="text-sm text-destructive/80">
                              There was an issue loading knowledge bases. Please try refreshing the page.
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-3"
                              onClick={() => knowledgeBasesQuery.refetch()}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          </div>
                        ) : knowledgeBasesQuery.data && knowledgeBasesQuery.data.length > 0 ? (
                          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                            {knowledgeBasesQuery.data.map((kb) => (
                              <FormField
                                key={kb.id}
                                control={form.control}
                                name="knowledgeBaseIds"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={kb.id}
                                      className="flex items-start space-x-3 space-y-0 py-2 border-b last:border-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(kb.id)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...(field.value || []), kb.id])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== kb.id
                                                  )
                                                )
                                          }}
                                        />
                                      </FormControl>
                                      <div className="space-y-1">
                                        <FormLabel className="text-sm font-medium cursor-pointer">
                                          {kb.title}
                                        </FormLabel>
                                        <div className="text-xs text-muted-foreground">
                                          {kb.description && kb.description.length > 120 
                                            ? `${kb.description.substring(0, 120)}...` 
                                            : kb.description}
                                        </div>
                                        <div className="flex gap-1">
                                          <Badge variant="outline" className="text-xs">
                                            {kb.subject}
                                          </Badge>
                                          <Badge variant="outline" className="text-xs">
                                            {kb.difficulty}
                                          </Badge>
                                        </div>
                                      </div>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground border rounded-md">
                            <Book className="h-10 w-10 mx-auto opacity-50" />
                            <p className="mt-2">No knowledge bases available</p>
                            <p className="text-sm">
                              <Link to="/knowledge-base" className="text-primary hover:underline">
                                Create knowledge bases in the Knowledge Base section
                              </Link>
                            </p>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="additionalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any specific requirements, themes, or concepts to include"
                            className="min-h-[80px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {generateErrorMessage && (
                    <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                      {generateErrorMessage}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">
                      {!isAIAvailable && (
                        <p className="text-amber-600">
                          AI services are currently unavailable. Using template-based generation.
                        </p>
                      )}
                    </div>
                    <Button 
                      type="submit"
                      disabled={isGenerating || !isAIAvailable}
                      className="flex items-center"
                    >
                      {isGenerating ? "Generating..." : "Generate Lesson"}
                      {!isGenerating && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="preview" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Lesson Plan Preview</CardTitle>
              <CardDescription>
                Review your AI-generated lesson plan before saving
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isGenerating ? (
                <div className="space-y-6">
                  <Skeleton className="h-8 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-20 w-full mb-2" />
                    <Skeleton className="h-20 w-full mb-2" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              ) : (
                renderLessonPreview()
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}