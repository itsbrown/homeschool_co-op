import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useAuth } from @/hooks/useAuth00";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Calendar, Clock, DownloadCloud, Eye, Layers, ListChecks, Tag, Users } from "lucide-react";

export default function CurriculumDetail() {
  const { user } = useAuth();
  const params = useParams();
  const [, navigate] = useLocation();
  const curriculumId = params.id;
  const queryClient = useQueryClient();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  // Ensure data is refreshed when component mounts
  useEffect(() => {
    if (user && curriculumId) {
      // Refresh both curriculum and lessons data
      queryClient.invalidateQueries({ queryKey: [`/api/curricula/${curriculumId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/curriculum/${curriculumId}`] });
    }
  }, [user, curriculumId, queryClient]);

  // Fetch curriculum details
  const { data: curriculum, isLoading: isLoadingCurriculum } = useQuery({
    queryKey: [`/api/curricula/${curriculumId}`],
    enabled: !!user && !!curriculumId,
  });

  // Fetch lessons related to this curriculum
  const { data: lessons, isLoading: isLoadingLessons } = useQuery({
    queryKey: [`/api/lessons/curriculum/${curriculumId}`],
    enabled: !!user && !!curriculumId,
  });

  if (!user || !curriculumId) {
    return null;
  }

  const isLoading = isLoadingCurriculum || isLoadingLessons;

  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <Button 
          variant="ghost" 
          className="mb-4" 
          onClick={() => navigate("/curriculum")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Curricula
        </Button>

        {isLoading ? (
          <>
            <Skeleton className="h-10 w-3/4 mb-2" />
            <Skeleton className="h-6 w-1/2 mb-6" />
            <Skeleton className="h-[400px] w-full" />
          </>
        ) : curriculum ? (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">{curriculum.title}</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {curriculum.subject}
                </Badge>
                <Badge variant="outline">{curriculum.gradeLevel}</Badge>
                {curriculum.learningStyles?.map((style: string) => (
                  <Badge key={style} variant="secondary">{style}</Badge>
                ))}
              </div>
              <p className="text-muted-foreground">
                {curriculum.description || "No description available."}
              </p>
              <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Created: {formatDate(curriculum.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  Status: {curriculum.isPublished ? "Published" : "Draft"}
                </span>
              </div>
            </div>

            <Tabs defaultValue="units">
              <TabsList className="mb-4">
                <TabsTrigger value="units">
                  <Layers className="h-4 w-4 mr-2" />
                  Units & Lessons
                </TabsTrigger>
                <TabsTrigger value="objectives">
                  <ListChecks className="h-4 w-4 mr-2" />
                  Objectives
                </TabsTrigger>
                <TabsTrigger value="schedule">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule
                </TabsTrigger>
              </TabsList>

              <TabsContent value="units" className="space-y-4">
                {curriculum.content?.units?.map((unit: any, index: number) => (
                  <Card key={index} className="overflow-hidden">
                    <CardHeader className="bg-muted/50 py-3">
                      <CardTitle className="text-lg">
                        Unit {index + 1}: {unit.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y">
                      {unit.lessons?.map((lesson: any, lessonIndex: number) => {
                        // Find the actual lesson from the database if it exists
                        const actualLesson = Array.isArray(lessons) ? 
                          lessons.find((l: any) => 
                            l.title?.includes(lesson.title) || 
                            lesson.title?.includes(l.title?.split(':').pop()?.trim() || '')
                          ) : null;
                          
                        return (
                          <div key={lessonIndex} className="py-3 px-1">
                            <div className="flex justify-between items-start">
                              <div className="w-full pr-4">
                                <h3 className="font-medium">
                                  {/* Clean up lesson title display */}
                                  {/^Lesson \d+/i.test(lesson.title) 
                                    ? lesson.title 
                                    : `Lesson ${lessonIndex + 1}: ${lesson.title}`}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {lesson.description}
                                </p>
                                
                                {/* Show activities if they exist */}
                                {lesson.activities && lesson.activities.length > 0 && (
                                  <div className="mt-3">
                                    <h4 className="text-sm font-medium">Activities:</h4>
                                    <ul className="text-sm text-muted-foreground list-disc pl-5 mt-1">
                                      {lesson.activities.map((activity: string, actIndex: number) => (
                                        <li key={actIndex}>{activity}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {/* Show resources if they exist */}
                                {lesson.resources && lesson.resources.length > 0 && (
                                  <div className="mt-2">
                                    <h4 className="text-sm font-medium">Resources:</h4>
                                    <ul className="text-sm text-muted-foreground list-disc pl-5 mt-1">
                                      {lesson.resources.map((resource: string, resIndex: number) => (
                                        <li key={resIndex}>{resource}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              
                              {/* Link to actual lesson if it exists in the database */}
                              {actualLesson && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => navigate(`/lessons/${actualLesson.id}`)}
                                >
                                  View Lesson
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
                
                {(!curriculum.content?.units || curriculum.content.units.length === 0) && (
                  <div className="text-center py-8 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">No units defined for this curriculum.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="objectives" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Learning Objectives</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {curriculum.content?.objectives ? (
                      <ul className="list-disc pl-5 space-y-2">
                        {curriculum.content.objectives.map((objective: string, index: number) => (
                          <li key={index}>{objective}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No objectives defined for this curriculum.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="schedule">
                <Card>
                  <CardHeader>
                    <CardTitle>Suggested Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {curriculum.content?.schedule ? (
                      <div dangerouslySetInnerHTML={{ __html: curriculum.content.schedule }} />
                    ) : (
                      <p className="text-muted-foreground">No schedule defined for this curriculum.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-8 pt-4 border-t">
              <Button variant="outline" className="flex gap-2">
                <DownloadCloud className="h-4 w-4" />
                Export Curriculum
              </Button>
              <Button variant="outline" className="flex gap-2">
                <Users className="h-4 w-4" />
                Share
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-12 bg-muted/50 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Curriculum Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The curriculum you are looking for does not exist or you don't have permission to view it.
            </p>
            <Button onClick={() => navigate("/curriculum")}>
              Back to My Curricula
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}