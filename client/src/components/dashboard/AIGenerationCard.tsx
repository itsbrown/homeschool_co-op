import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useMutation } from "@tanstack/react-query";
import { generateCurriculum } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  { id: "visual", label: "Visual" },
  { id: "auditory", label: "Auditory" },
  { id: "reading-writing", label: "Reading/Writing" },
  { id: "kinesthetic", label: "Kinesthetic" }
];

export default function AIGenerationCard() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<AIGenerationFormData>({
    subject: "",
    gradeLevel: "",
    learningStyles: [],
    additionalDetails: ""
  });

  const generateMutation = useMutation({
    mutationFn: generateCurriculum,
    onSuccess: () => {
      toast({
        title: "Curriculum Generated",
        description: "Your curriculum has been successfully generated.",
      });
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
        <CardTitle>AI Curriculum Generation</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Generate personalized curriculum based on student needs, learning styles, and educational goals.
        </p>
        
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
                  key={style.id}
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
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={!formData.subject || !formData.gradeLevel || formData.learningStyles.length === 0 || generateMutation.isPending}
          >
            {generateMutation.isPending ? "Generating..." : "Generate Curriculum"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
