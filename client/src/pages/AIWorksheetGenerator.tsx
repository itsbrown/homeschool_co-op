import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { KnowledgeBaseSelector } from "@/components/KnowledgeBaseSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActivityGenerationParams {
  subject: string;
  ageRange: string;
  activityType: string;
  difficulty: string;
  instructions: string;
  knowledgeBaseIds: number[];
}

type ActivityType = "worksheet" | "crossword" | "coloring" | "wordsearch" | "maze";

export default function AIWorksheetGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<number[]>([]);
  const [subject, setSubject] = useState("");
  const [ageRange, setAgeRange] = useState("6-7");
  const [activityType, setActivityType] = useState<ActivityType>("worksheet");
  const [difficulty, setDifficulty] = useState("beginner");
  const [instructions, setInstructions] = useState("");
  const [generatedActivityUrl, setGeneratedActivityUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Fetch AI service status
  const { data: aiStatus } = useQuery({
    queryKey: ["/api/ai/status"],
  });

  // Check if AI service is available
  const isAIAvailable = aiStatus?.anthropic?.available;

  // Generate activity mutation
  const generateActivityMutation = useMutation({
    mutationFn: async (params: ActivityGenerationParams) => {
      const response = await apiRequest("/api/activities/generate", {
        method: "POST",
        body: params,
      });
      return response;
    },
    onSuccess: (data) => {
      setGeneratedActivityUrl(data.activityUrl);
      toast({
        title: "Activity Generated",
        description: "Your activity has been successfully generated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateActivity = () => {
    if (!subject) {
      toast({
        title: "Subject Required",
        description: "Please enter a subject for your activity.",
        variant: "destructive",
      });
      return;
    }

    generateActivityMutation.mutate({
      subject,
      ageRange,
      activityType,
      difficulty,
      instructions,
      knowledgeBaseIds,
    });
  };

  const getActivityTypeDescription = (type: ActivityType) => {
    switch (type) {
      case "worksheet":
        return "Generate practice problems, equations, or questions based on the subject";
      case "crossword":
        return "Create a crossword puzzle with subject-specific words and clues";
      case "coloring":
        return "Create coloring pages with subject-related illustrations";
      case "wordsearch":
        return "Generate a word search puzzle with hidden vocabulary words";
      case "maze":
        return "Create a maze with educational checkpoints along the path";
      default:
        return "";
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">AI Worksheet & Activity Generator</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Generate Educational Activities</CardTitle>
              <CardDescription>
                Create customized worksheets, puzzles, and activities for your lessons
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="mb-4">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g., Addition and Subtraction, Vowels and Consonants"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              
              <div className="mb-4">
                <Label htmlFor="ageRange">Age Range</Label>
                <Select value={ageRange} onValueChange={setAgeRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select age range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4-5">4-5 years (Pre-K)</SelectItem>
                    <SelectItem value="6-7">6-7 years (K-1st Grade)</SelectItem>
                    <SelectItem value="8-10">8-10 years (2nd-4th Grade)</SelectItem>
                    <SelectItem value="11-13">11-13 years (5th-7th Grade)</SelectItem>
                    <SelectItem value="14-18">14-18 years (8th-12th Grade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Tabs defaultValue="worksheet" value={activityType} onValueChange={(value) => setActivityType(value as ActivityType)}>
                <Label>Activity Type</Label>
                <TabsList className="grid grid-cols-3 mb-2">
                  <TabsTrigger value="worksheet">Worksheets</TabsTrigger>
                  <TabsTrigger value="crossword">Puzzles</TabsTrigger>
                  <TabsTrigger value="coloring">Coloring Pages</TabsTrigger>
                </TabsList>
                
                <TabsContent value="worksheet">
                  <div className="bg-muted/50 p-4 rounded-md mb-4">
                    <h3 className="font-medium mb-2">Worksheet</h3>
                    <p className="text-sm text-muted-foreground">
                      {getActivityTypeDescription("worksheet")}
                    </p>
                  </div>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Difficulty level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>
                
                <TabsContent value="crossword">
                  <div className="bg-muted/50 p-4 rounded-md mb-4">
                    <h3 className="font-medium mb-2">Puzzles</h3>
                    <p className="text-sm text-muted-foreground">
                      Create engaging puzzles like crosswords or word searches
                    </p>
                  </div>
                  <Select value={activityType} onValueChange={(value) => setActivityType(value as ActivityType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select puzzle type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crossword">Crossword Puzzle</SelectItem>
                      <SelectItem value="wordsearch">Word Search</SelectItem>
                      <SelectItem value="maze">Educational Maze</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>
                
                <TabsContent value="coloring">
                  <div className="bg-muted/50 p-4 rounded-md mb-4">
                    <h3 className="font-medium mb-2">Coloring Pages</h3>
                    <p className="text-sm text-muted-foreground">
                      {getActivityTypeDescription("coloring")}
                    </p>
                  </div>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Detail level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Simple (Few details)</SelectItem>
                      <SelectItem value="intermediate">Moderate (Some details)</SelectItem>
                      <SelectItem value="advanced">Complex (Many details)</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>
              </Tabs>
              
              <div className="mb-4">
                <Label htmlFor="instructions">Additional Instructions (Optional)</Label>
                <Textarea
                  id="instructions"
                  placeholder="Specific topics, concepts, or instructions for the activity"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="mb-4">
                <Label>Knowledge Base</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Select knowledge bases to use for content generation
                </p>
                <KnowledgeBaseSelector
                  selectedIds={knowledgeBaseIds}
                  onChange={setKnowledgeBaseIds}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleGenerateActivity} 
                disabled={generateActivityMutation.isPending || !isAIAvailable}
                className="w-full"
              >
                {generateActivityMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Activity...
                  </>
                ) : (
                  "Generate Activity"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Generated Activities</CardTitle>
              <CardDescription>
                Preview and download your activities
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px] flex flex-col items-center justify-center">
              {generatedActivityUrl ? (
                <div className="space-y-4 text-center">
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-16 w-16 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Your activity has been generated successfully
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Button asChild className="w-full" variant="outline">
                      <a href={generatedActivityUrl} target="_blank" rel="noopener noreferrer">
                        Preview Activity
                      </a>
                    </Button>
                    <Button asChild className="w-full">
                      <a href={generatedActivityUrl} download>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>Generated activities will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}