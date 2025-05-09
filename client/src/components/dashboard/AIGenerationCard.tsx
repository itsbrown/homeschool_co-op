import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AIGenerationFormData } from "@/lib/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { generateCurriculum } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { KnowledgeBase } from "@shared/schema";
import { useAIStatusContext } from "@/contexts/AIStatusContext";
import { AlertCircle, BookOpen, Brain, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  { id: "visual", label: "Visual", uniqueKey: "style-visual" },
  { id: "auditory", label: "Auditory", uniqueKey: "style-auditory" },
  { id: "reading-writing", label: "Reading/Writing", uniqueKey: "style-reading-writing" },
  { id: "kinesthetic", label: "Kinesthetic", uniqueKey: "style-kinesthetic" }
];

export default function AIGenerationCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAIAvailable, isEnhancedAIAvailable } = useAIStatusContext();
  const [formData, setFormData] = useState<AIGenerationFormData>({
    subject: "",
    gradeLevel: "",
    learningStyles: [],
    additionalDetails: "",
    knowledgeBaseIds: []
  });

  // Fetch available knowledge bases
  const { data: personalKnowledgeBases, isLoading: isLoadingPersonalKnowledgeBases } = useQuery({
    queryKey: ['/api/knowledge-bases/author/me'],
    enabled: !!user
  });

  const { data: publicKnowledgeBases, isLoading: isLoadingPublicKnowledgeBases } = useQuery({
    queryKey: ['/api/knowledge-bases/public']
  });

  // Combine personal and public knowledge bases
  const allKnowledgeBases: KnowledgeBase[] = [
    ...(Array.isArray(personalKnowledgeBases) ? personalKnowledgeBases : []), 
    ...(Array.isArray(publicKnowledgeBases) ? publicKnowledgeBases : [])
  ];
  const isLoadingKnowledgeBases = isLoadingPersonalKnowledgeBases || isLoadingPublicKnowledgeBases;
  
  // Handle knowledge base selection
  const handleKnowledgeBaseChange = (kbId: number, checked: boolean) => {
    setFormData(prev => {
      const newState = checked
        ? {
            ...prev,
            knowledgeBaseIds: [...(prev.knowledgeBaseIds || []), kbId]
          }
        : {
            ...prev,
            knowledgeBaseIds: (prev.knowledgeBaseIds || []).filter(id => id !== kbId)
          };
      
      console.log('Knowledge base selection changed:', {
        kbId,
        checked,
        currentSelection: prev.knowledgeBaseIds,
        newSelection: newState.knowledgeBaseIds
      });
      
      return newState;
    });
  };

  const [, navigate] = useLocation();
  
  const generateMutation = useMutation({
    mutationFn: generateCurriculum,
    onSuccess: (data) => {
      // Invalidate the curricula cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/curricula'] });
      
      toast({
        title: "Curriculum Generated",
        description: "Your curriculum has been successfully generated.",
      });
      
      // Redirect to curricula page after a short delay
      setTimeout(() => {
        navigate("/curriculum");
      }, 1500);
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate curriculum. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting form data for curriculum generation:', formData);
    generateMutation.mutate(formData);
  };

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

  return (
    <Card>
      <CardHeader className="bg-muted/50 border-b">
        <CardTitle className="flex items-center gap-2">
          <span>AI Curriculum Generation</span>
          {isEnhancedAIAvailable && (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
              <Brain size={12} />
              <span>Enhanced AI</span>
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Create personalized learning paths with {isEnhancedAIAvailable ? 'advanced AI semantic understanding' : 'AI-powered generation'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {!isAIAvailable ? (
          <div className="bg-amber-50 text-amber-800 p-3 rounded-md flex items-start gap-2 mb-4">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">AI is currently unavailable</p>
              <p className="text-sm">The system will use pre-defined templates instead of AI-generated content.</p>
            </div>
          </div>
        ) : isEnhancedAIAvailable ? (
          <div className="bg-indigo-50 text-indigo-800 p-3 rounded-md flex items-start gap-2 mb-4">
            <Brain className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Enhanced AI Enabled</p>
              <p className="text-sm">Knowledge bases will be analyzed with advanced semantic understanding for richer curriculum content.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            Generate personalized curriculum based on student needs, learning styles, and educational goals.
          </p>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
          
          <div>
            <Label>Learning Style</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {learningStyles.map(style => (
                <div
                  key={style.uniqueKey}
                  className="flex items-center p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    id={style.id}
                    checked={formData.learningStyles.includes(style.id)}
                    onCheckedChange={(checked) => 
                      handleLearningStyleChange(style.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={style.id}
                    className="ml-3 text-sm font-normal cursor-pointer"
                  >
                    {style.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <Label htmlFor="additionalDetails">Additional Details (Optional)</Label>
            <Textarea
              id="additionalDetails"
              placeholder="Special interests, educational goals, etc."
              rows={3}
              value={formData.additionalDetails}
              onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value })}
            />
          </div>
          
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Knowledge Bases</Label>
              {isEnhancedAIAvailable && (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs">
                  Enhanced Understanding
                </Badge>
              )}
            </div>
            
            {isLoadingKnowledgeBases ? (
              <div className="flex items-center justify-center p-4 border rounded">
                <div className="animate-spin h-5 w-5 border-t-2 border-primary rounded-full" />
                <span className="ml-2 text-sm">Loading knowledge bases...</span>
              </div>
            ) : allKnowledgeBases.length === 0 ? (
              <div className="p-4 border rounded text-center text-sm text-muted-foreground">
                No knowledge bases available. Create knowledge bases to enhance curriculum generation.
              </div>
            ) : (
              <div className={`max-h-[200px] overflow-y-auto border rounded p-2 ${isEnhancedAIAvailable ? 'border-indigo-200 bg-indigo-50/30' : ''}`}>
                {allKnowledgeBases.map((kb, index) => (
                  <div key={`knowledge-base-${kb.id}-${index}`} className="flex items-center p-2 hover:bg-muted/50 rounded">
                    <Checkbox
                      id={`kb-${kb.id}`}
                      checked={formData.knowledgeBaseIds?.includes(kb.id)}
                      onCheckedChange={(checked) => 
                        handleKnowledgeBaseChange(kb.id, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={`kb-${kb.id}`}
                      className="ml-3 text-sm font-normal cursor-pointer flex-1"
                    >
                      <span className="font-medium">{kb.title}</span> <span className="text-xs text-muted-foreground">({kb.subject})</span>
                    </Label>
                    {isEnhancedAIAvailable && formData.knowledgeBaseIds?.includes(kb.id) && (
                      <BookOpen size={16} className="text-indigo-500 ml-2" />
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs mt-1 flex items-center gap-1">
              {isEnhancedAIAvailable ? (
                <>
                  <Brain size={12} className="text-indigo-500" />
                  <span className="text-indigo-700">
                    Selected resources will be deeply analyzed for semantic content understanding
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Selected knowledge bases will be used to enhance the generated curriculum
                </span>
              )}
            </p>
          </div>
          
          <Button 
            type="submit" 
            className={`w-full ${isEnhancedAIAvailable && formData.knowledgeBaseIds?.length ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
            disabled={!formData.subject || !formData.gradeLevel || formData.learningStyles.length === 0 || generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {isEnhancedAIAvailable && formData.knowledgeBaseIds?.length ? "Analyzing Content & Generating..." : "Generating..."}
              </>
            ) : (
              <>
                {isEnhancedAIAvailable && formData.knowledgeBaseIds?.length ? (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Generate Enhanced Curriculum
                  </>
                ) : "Generate Curriculum"}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
