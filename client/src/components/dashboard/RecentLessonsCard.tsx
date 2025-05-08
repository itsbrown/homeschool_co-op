import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Copy, Edit } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchLessons } from "@/lib/api";
import { Lesson } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecentLessonsCard() {
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["/api/lessons"],
    queryFn: fetchLessons,
  });

  const handleEdit = (id: number) => {
    console.log(`Edit lesson ${id}`);
  };

  const handleDuplicate = (id: number) => {
    console.log(`Duplicate lesson ${id}`);
  };

  const viewAllLessons = () => {
    console.log("View all lessons");
  };

  const statusColors = {
    draft: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-800",
  };

  // Fallback data for loading state
  const dummyLessons: Lesson[] = [
    {
      id: 1,
      title: "",
      subject: "",
      gradeLevel: "",
      authorId: 1,
      isPublished: false,
      duration: 0,
      content: {},
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      title: "",
      subject: "",
      gradeLevel: "",
      authorId: 1,
      isPublished: false,
      duration: 0,
      content: {},
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      title: "",
      subject: "",
      gradeLevel: "",
      authorId: 1,
      isPublished: false,
      duration: 0,
      content: {},
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  const displayLessons = isLoading ? dummyLessons : (lessons || []).slice(0, 3);

  return (
    <Card>
      <CardHeader className="bg-muted/50 border-b px-6 py-5 flex flex-row items-center justify-between">
        <CardTitle>Recent Lessons</CardTitle>
        <Button variant="link" onClick={viewAllLessons}>
          View All
        </Button>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border">
        {displayLessons.map((lesson) => (
          <div key={lesson.id} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                {isLoading ? (
                  <>
                    <Skeleton className="h-5 w-48 mb-1" />
                    <Skeleton className="h-4 w-32" />
                  </>
                ) : (
                  <>
                    <h4 className="text-base font-medium">{lesson.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {lesson.subject} • {lesson.gradeLevel}
                    </p>
                  </>
                )}
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[lesson.status]}`}>
                  {lesson.status.charAt(0).toUpperCase() + lesson.status.slice(1)}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>{lesson.duration} minutes</span>
                </div>
              )}
              <div className="flex space-x-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleEdit(lesson.id)}
                  disabled={isLoading}
                >
                  <Edit className="h-5 w-5" />
                  <span className="sr-only">Edit</span>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDuplicate(lesson.id)}
                  disabled={isLoading}
                >
                  <Copy className="h-5 w-5" />
                  <span className="sr-only">Duplicate</span>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
