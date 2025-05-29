import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from @/hooks/useAuth00";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { BookOpen, Clock, Tag } from "lucide-react";

export default function Curriculum() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  // Ensure data is refreshed when component mounts
  useEffect(() => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: ['/api/curricula'] });
    }
  }, [user, queryClient]);

  // Fetch curricula created by the current user
  const { data: curricula, isLoading, error } = useQuery({
    queryKey: ['/api/curricula'],
    enabled: !!user,
  });

  if (!user) {
    return null;
  }

  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Curriculum</h1>
          <Button onClick={() => navigate("/dashboard")}>
            Generate New Curriculum
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="cursor-pointer">
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading your curricula.</p>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()} 
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        ) : curricula?.length === 0 ? (
          <div className="text-center py-12 bg-muted/50 rounded-lg">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Curricula Yet</h2>
            <p className="text-muted-foreground mb-6">
              You haven't created any curricula yet. Generate your first curriculum to get started.
            </p>
            <Button onClick={() => navigate("/dashboard")}>
              Generate Curriculum
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.isArray(curricula) && curricula.map((curriculum: any) => (
              <Card 
                key={curriculum.id} 
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/curriculum/${curriculum.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle>{curriculum.title}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {curriculum.subject}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {curriculum.description || "No description available."}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline">{curriculum.gradeLevel}</Badge>
                    {curriculum.learningStyles?.map((style: string) => (
                      <Badge key={style} variant="secondary">{style}</Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(curriculum.createdAt)}
                  </div>
                  <div>
                    {curriculum.isPublic ? "Public" : "Private"}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}