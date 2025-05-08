import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLessons, createLesson } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAIStatusContext } from "@/contexts/AIStatusContext";
import AIStatusBadge from "@/components/ui/AIStatusBadge";
import { Clock, Edit, Plus, TrashIcon, ClipboardCheck, BookOpen, Brain } from "lucide-react";
import { Lesson } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function Lessons() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isAIAvailable } = useAIStatusContext();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  
  // Form state
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    subject: string;
    gradeLevel: string;
    duration: number;
    content: any;
  }>({
    title: "",
    description: "",
    subject: "",
    gradeLevel: "",
    duration: 45,
    content: {
      activities: [],
      resources: [],
      assessments: []
    }
  });

  // Fetch lessons
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["/api/lessons"],
    queryFn: fetchLessons,
  });

  // Create lesson mutation
  const createMutation = useMutation({
    mutationFn: createLesson,
    onSuccess: () => {
      // Reset form
      setFormData({
        title: "",
        description: "",
        subject: "",
        gradeLevel: "",
        duration: 45,
        content: {
          activities: [],
          resources: [],
          assessments: []
        }
      });
      
      // Close dialog
      setIsCreateDialogOpen(false);
      
      // Show success message
      toast({
        title: "Lesson Created",
        description: "Your lesson has been successfully created.",
      });
      
      // Invalidate and refetch lessons
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create lesson. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Handle form submission
  const handleCreateLesson = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create lesson object
    const lessonData = {
      ...formData,
      isPublished: false,
      status: "draft" as const,
    };
    
    // Submit mutation
    createMutation.mutate(lessonData);
  };

  // Filter lessons based on active tab
  const filteredLessons = lessons?.filter(lesson => {
    if (activeTab === "all") return true;
    if (activeTab === "draft") return lesson.status === "draft";
    if (activeTab === "published") return lesson.status === "published";
    if (activeTab === "archived") return lesson.status === "archived";
    return true;
  }) || [];

  // Status display helper
  const getStatusBadge = (status: string) => {
    const statusClasses = {
      draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
      published: "bg-green-100 text-green-800 border-green-200",
      archived: "bg-gray-100 text-gray-800 border-gray-200",
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[status as keyof typeof statusClasses]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Lessons</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage your educational lessons
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <AIStatusBadge />
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Lesson
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Create New Lesson</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleCreateLesson} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="title">Lesson Title</Label>
                    <Input 
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Enter lesson title"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter lesson description"
                      rows={3}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="subject">Subject</Label>
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
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input 
                      id="duration"
                      type="number"
                      min={5}
                      max={180}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || !formData.title || !formData.subject || !formData.gradeLevel}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Lesson"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline">
            <Brain className="mr-2 h-4 w-4" />
            AI Generate
          </Button>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader className="bg-muted/50 border-b">
          <CardTitle>Manage Lessons</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">All Lessons</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="pt-2">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredLessons.length > 0 ? (
                <div className="space-y-4">
                  {filteredLessons.map((lesson) => (
                    <div key={lesson.id} className="flex items-start justify-between border rounded-lg p-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-muted rounded-md p-2">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium">{lesson.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {lesson.subject} • {lesson.gradeLevel}
                          </p>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 mr-1" />
                              <span>{lesson.duration} minutes</span>
                            </div>
                            {getStatusBadge(lesson.status)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost">
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button size="sm" variant="ghost">
                          <ClipboardCheck className="h-4 w-4" />
                          <span className="sr-only">Publish</span>
                        </Button>
                        <Button size="sm" variant="ghost">
                          <TrashIcon className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-30" />
                  <h3 className="mt-4 text-lg font-medium">No lessons found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeTab === "all" 
                      ? "You haven't created any lessons yet" 
                      : `You don't have any ${activeTab} lessons`}
                  </p>
                  <Button 
                    className="mt-4" 
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Lesson
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </AppShell>
  );
}