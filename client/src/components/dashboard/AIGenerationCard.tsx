import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Book, FileText, PenTool, Wand2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

export default function AIGenerationCard() {
  const [activeTab, setActiveTab] = useState('curriculum');
  
  const { data: aiStatus, isLoading } = useQuery({
    queryKey: ['/api/ai/status'],
    queryFn: () => fetch('/api/ai/status').then(res => res.json()),
  });

  const isAIAvailable = aiStatus?.anthropic?.available;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5">
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" /> 
          AI-Powered Content Creation
        </CardTitle>
        <CardDescription>
          Generate personalized educational content
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs
          defaultValue="curriculum"
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
            <TabsTrigger value="lesson">Lesson</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 space-y-4">
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full mr-2 ${isAIAvailable ? 'bg-green-500' : 'bg-amber-500'}`}></div>
              <span className="text-sm">
                {isLoading
                  ? "Checking AI service status..."
                  : isAIAvailable
                    ? "AI Service: Ready"
                    : "AI Service: Limited (using templates)"
                }
              </span>
            </div>

            <TabsContent value="curriculum" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a complete curriculum with learning objectives, multiple lessons, and assessments.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card/50">
                  <CardContent className="pt-6 text-center">
                    <Book className="h-10 w-10 mb-2 mx-auto text-primary" />
                    <h3 className="font-medium">Subject-Based</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate curricula for specific subjects
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardContent className="pt-6 text-center">
                    <PenTool className="h-10 w-10 mb-2 mx-auto text-primary" />
                    <h3 className="font-medium">Custom Skills</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Target specific learning outcomes
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardContent className="pt-6 text-center">
                    <FileText className="h-10 w-10 mb-2 mx-auto text-primary" />
                    <h3 className="font-medium">Knowledge Base</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use your existing materials
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="lesson" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate individual lessons with clear objectives, content, activities, and assessments.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/50">
                  <CardContent className="pt-6 pb-6 flex items-center gap-4">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Wand2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Quick Lesson</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Generate a complete lesson plan in minutes
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardContent className="pt-6 pb-6 flex items-center gap-4">
                    <div className="rounded-full bg-primary/10 p-3">
                      <PenTool className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Multi-Style</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Adapt for various learning styles
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="activity" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate standalone activities and exercises for various subjects and learning objectives.
              </p>
              <div className="border rounded-lg p-4">
                <h3 className="font-medium">Quick Activity Generator</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Create activities based on subject, grade level, and duration
                </p>
                <div className="flex justify-end">
                  <Button size="sm" asChild>
                    <Link href="/activities/create">Create Activity</Link>
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
      <CardFooter className="bg-muted/50 px-6 py-4">
        <Button asChild className="w-full">
          <Link href={`/ai-generator/${activeTab}`}>
            <Wand2 className="mr-2 h-4 w-4" />
            Start {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Generator
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}