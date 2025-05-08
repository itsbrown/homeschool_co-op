import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLesson } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAIStatusContext } from "@/contexts/AIStatusContext";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Lightbulb, Brain, ArrowRight } from "lucide-react";
import AIStatusBadge from "@/components/ui/AIStatusBadge";

// Common subjects and grade levels
const subjects = [
  "Mathematics",
  "Science",
  "Language Arts",
  "Social Studies",
  "Computer Science",
  "Art",
  "Music",
  "Physical Education"
];

const gradeLevels = [
  "Elementary (Grades K-5)",
  "Middle School (Grades 6-8)",
  "High School (Grades 9-12)",
  "College",
  "Adult Education"
];

const learningStyles = [
  { id: "visual", label: "Visual", description: "Emphasizes diagrams, charts, and visual aids" },
  { id: "auditory", label: "Auditory", description: "Focuses on discussions and verbal explanations" },
  { id: "reading-writing", label: "Reading/Writing", description: "Utilizes written materials and note-taking" },
  { id: "kinesthetic", label: "Kinesthetic", description: "Incorporates hands-on activities and movement" }
];

export default function AILessonGenerator() {
  const { toast } = useToast();
  const { isAIAvailable } = useAIStatusContext();
  const queryClient = useQueryClient();
  
  // Form state
  const [formData, setFormData] = useState({
    subject: "",
    gradeLevel: "",
    topic: "",
    learningStyles: [] as string[],
    duration: 45,
    additionalDetails: ""
  });
  
  // Generated lesson state
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);
  const [generationStep, setGenerationStep] = useState<"input" | "review">("input");
  
  // Create lesson mutation
  const createMutation = useMutation({
    mutationFn: createLesson,
    onSuccess: () => {
      toast({
        title: "Lesson Created",
        description: "Your AI-generated lesson has been successfully created.",
      });
      
      // Reset form and generated data
      setFormData({
        subject: "",
        gradeLevel: "",
        topic: "",
        learningStyles: [],
        duration: 45,
        additionalDetails: ""
      });
      setGeneratedLesson(null);
      setGenerationStep("input");
      
      // Invalidate and refetch lessons
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to save the AI-generated lesson. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // AI generation mutation (mock for now, will be replaced with real API call)
  const generateMutation = useMutation({
    mutationFn: async () => {
      // This simulates an API call - in a real implementation,
      // you would call your lesson generation API here
      if (!isAIAvailable) {
        throw new Error("AI service is unavailable");
      }
      
      // Artificial delay to simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock response structure - this would come from your API
      return {
        title: `Understanding ${formData.topic} in ${formData.subject}`,
        description: `A comprehensive lesson on ${formData.topic} designed for ${formData.gradeLevel} students, incorporating various learning styles.`,
        subject: formData.subject,
        gradeLevel: formData.gradeLevel,
        duration: formData.duration,
        content: {
          objectives: [
            `Understand the core concepts of ${formData.topic}`,
            `Apply ${formData.topic} principles to solve problems`,
            `Analyze real-world examples related to ${formData.topic}`
          ],
          materials: [
            "Digital presentation",
            "Student worksheets",
            "Interactive tools"
          ],
          activities: [
            "Guided discussion on key concepts",
            "Small group problem-solving exercise",
            "Interactive demonstration"
          ],
          assessments: [
            "Formative quiz on core concepts",
            "Group presentation on applications",
            "Individual reflection assignment"
          ]
        }
      };
    },
    onSuccess: (data) => {
      setGeneratedLesson(data);
      setGenerationStep("review");
    },
    onError: (error) => {
      if (error.message === "AI service is unavailable") {
        toast({
          title: "AI Service Unavailable",
          description: "The AI generation service is currently unavailable. Please try again later or create a lesson manually.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Generation Failed",
          description: "Failed to generate lesson. Please try again or adjust your parameters.",
          variant: "destructive"
        });
      }
    }
  });
  
  // Handle learning style change
  const handleLearningStyleChange = (styleId: string, checked: boolean) => {
    setFormData(prev => {
      if (checked) {
        return {
          ...prev, 
          learningStyles: [...prev.learningStyles, styleId]
        };
      } else {
        return {
          ...prev,
          learningStyles: prev.learningStyles.filter(id => id !== styleId)
        };
      }
    });
  };
  
  // Handle generate button click
  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    generateMutation.mutate();
  };
  
  // Handle save button click
  const handleSaveLesson = () => {
    if (!generatedLesson) return;
    
    // Prepare lesson data for saving
    const lessonData = {
      title: generatedLesson.title,
      description: generatedLesson.description,
      subject: generatedLesson.subject,
      gradeLevel: generatedLesson.gradeLevel,
      duration: generatedLesson.duration,
      content: generatedLesson.content,
      isPublished: false,
      status: "draft" as const
    };
    
    // Save the lesson
    createMutation.mutate(lessonData);
  };
  
  // Handle edit button click to go back to input form
  const handleEdit = () => {
    setGenerationStep("input");
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">AI Lesson Generator</h1>
          <p className="text-sm text-muted-foreground">
            Generate customized lesson plans using AI assistance
          </p>
        </div>
        
        <div className="flex items-center">
          <AIStatusBadge className="mr-2" />
        </div>
      </div>
      
      {/* Main content card */}
      <Card>
        <CardHeader className="bg-muted/50 border-b">
          <CardTitle>
            {generationStep === "input" ? (
              <div className="flex items-center">
                <Brain className="mr-2 h-5 w-5 text-primary" />
                <span>Lesson Generator Input</span>
              </div>
            ) : (
              <div className="flex items-center">
                <Sparkles className="mr-2 h-5 w-5 text-primary" />
                <span>Generated Lesson Preview</span>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-6">
          {generationStep === "input" ? (
            // Input form
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <Label htmlFor="subject">Subject Area</Label>
                  <Select 
                    value={formData.subject}
                    onValueChange={(value) => setFormData({ ...formData, subject: value })}
                  >
                    <SelectTrigger id="subject">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(subject => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="gradeLevel">Grade Level</Label>
                  <Select 
                    value={formData.gradeLevel}
                    onValueChange={(value) => setFormData({ ...formData, gradeLevel: value })}
                  >
                    <SelectTrigger id="gradeLevel">
                      <SelectValue placeholder="Select grade level" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeLevels.map(level => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="topic">Lesson Topic</Label>
                <Input
                  id="topic"
                  placeholder="e.g., Fractions, Photosynthesis, The American Revolution"
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="duration">Lesson Duration (minutes)</Label>
                <Input 
                  id="duration"
                  type="number"
                  min={15}
                  max={180}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                />
              </div>
              
              <div>
                <Label className="mb-2 block">Learning Styles</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {learningStyles.map(style => (
                    <div
                      key={style.id}
                      className="flex items-start p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        id={style.id}
                        checked={formData.learningStyles.includes(style.id)}
                        onCheckedChange={(checked) => 
                          handleLearningStyleChange(style.id, checked as boolean)
                        }
                        className="mt-1"
                      />
                      <div className="ml-3">
                        <Label
                          htmlFor={style.id}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {style.label}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {style.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <Label htmlFor="additionalDetails">Additional Details (Optional)</Label>
                <Textarea
                  id="additionalDetails"
                  placeholder="Special interests, preferred teaching approaches, connections to other lessons, etc."
                  rows={3}
                  value={formData.additionalDetails}
                  onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value })}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={!formData.subject || !formData.gradeLevel || !formData.topic || formData.learningStyles.length === 0 || generateMutation.isPending || !isAIAvailable} 
                className="w-full"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Lesson...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate AI Lesson Plan
                  </>
                )}
              </Button>
              
              {!isAIAvailable && (
                <div className="text-center text-amber-600 text-sm">
                  <Lightbulb className="inline-block mr-1 h-4 w-4" />
                  AI generation is currently unavailable. Some features will be limited.
                </div>
              )}
            </form>
          ) : (
            // Preview of generated lesson
            generatedLesson && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold">{generatedLesson.title}</h2>
                  <p className="mt-2 text-muted-foreground">
                    {generatedLesson.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {generatedLesson.subject}
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {generatedLesson.gradeLevel}
                    </Badge>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      {generatedLesson.duration} minutes
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                <Tabs defaultValue="objectives">
                  <TabsList className="w-full">
                    <TabsTrigger value="objectives">Objectives</TabsTrigger>
                    <TabsTrigger value="materials">Materials</TabsTrigger>
                    <TabsTrigger value="activities">Activities</TabsTrigger>
                    <TabsTrigger value="assessments">Assessments</TabsTrigger>
                  </TabsList>
                  
                  <div className="p-4 border rounded-md mt-2 bg-muted/30">
                    <TabsContent value="objectives" className="mt-0">
                      <ul className="space-y-2">
                        {generatedLesson.content.objectives.map((obj: string, i: number) => (
                          <li key={i} className="flex items-start">
                            <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                    
                    <TabsContent value="materials" className="mt-0">
                      <ul className="space-y-2">
                        {generatedLesson.content.materials.map((item: string, i: number) => (
                          <li key={i} className="flex items-start">
                            <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                    
                    <TabsContent value="activities" className="mt-0">
                      <ul className="space-y-2">
                        {generatedLesson.content.activities.map((item: string, i: number) => (
                          <li key={i} className="flex items-start">
                            <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                    
                    <TabsContent value="assessments" className="mt-0">
                      <ul className="space-y-2">
                        {generatedLesson.content.assessments.map((item: string, i: number) => (
                          <li key={i} className="flex items-start">
                            <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                  </div>
                </Tabs>
                
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={handleEdit}>
                    Edit Parameters
                  </Button>
                  <Button onClick={handleSaveLesson} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Saving..." : "Save Lesson"}
                  </Button>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

// Badge component needed for generated lesson preview
function Badge({ 
  children, 
  className, 
  variant = "default" 
}: { 
  children: React.ReactNode; 
  className?: string; 
  variant?: "default" | "outline" | "secondary" | "destructive"; 
}) {
  const baseClasses = "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset";
  
  const variantClasses = {
    default: "bg-primary/10 text-primary ring-primary/20",
    outline: "bg-transparent ring-1 ring-border",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };
  
  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className || ""}`}>
      {children}
    </span>
  );
}