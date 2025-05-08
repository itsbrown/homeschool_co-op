import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Filter, MoreVertical, Clock, Tag, GraduationCap, Wand2 } from "lucide-react";
import { AIStatusBadge } from "@/components/ui/AIStatusBadge";
import { useAIStatus } from "@/hooks/useAIStatus";

// Types
interface Lesson {
  id: number;
  title: string;
  subject: string;
  gradeLevel: string;
  authorId: number;
  duration: number;
  status: "draft" | "published" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export default function Lessons() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGrade, setFilterGrade] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("");
  
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["/api/lessons"],
    queryFn: async () => {
      // This would be replaced with actual API call
      return [
        {
          id: 1,
          title: "Introduction to Algebra",
          subject: "Mathematics",
          gradeLevel: "Grade 7",
          authorId: 1,
          duration: 45,
          status: "published",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          title: "Photosynthesis Exploration",
          subject: "Science",
          gradeLevel: "Grade 5",
          authorId: 1,
          duration: 60,
          status: "draft",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          title: "World History Overview",
          subject: "History",
          gradeLevel: "Grade 9",
          authorId: 1,
          duration: 90,
          status: "published",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 4,
          title: "Essay Writing Workshop",
          subject: "Language Arts",
          gradeLevel: "Grade 8",
          authorId: 1,
          duration: 75,
          status: "draft",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as Lesson[];
    }
  });

  const { isAIAvailable } = useAIStatus();
  
  // Filtering logic
  const filteredLessons = lessons?.filter(lesson => {
    const matchesSearch = searchQuery === "" || 
      lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.subject.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGrade = filterGrade === "" || lesson.gradeLevel === filterGrade;
    const matchesSubject = filterSubject === "" || lesson.subject === filterSubject;
    
    return matchesSearch && matchesGrade && matchesSubject;
  });
  
  // Status badge colors for different lesson statuses
  const statusColors = {
    draft: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-800",
  };

  // Helper to get unique values for filters
  const getUniqueValues = (key: keyof Lesson) => {
    return lessons ? [...new Set(lessons.map(lesson => lesson[key]))] : [];
  };

  return (
    <AppShell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Lessons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and organize your learning materials
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Lesson
          </Button>
          <Button variant="outline" asChild>
            <Link href="/lessons/ai-generator">
              <Wand2 className="mr-2 h-4 w-4" />
              AI Generator
              <AIStatusBadge className="ml-2" />
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Search and filter bar */}
      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search lessons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterGrade} onValueChange={setFilterGrade}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Grade level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All grades</SelectItem>
                {getUniqueValues("gradeLevel").map((grade) => (
                  <SelectItem key={grade as string} value={grade as string}>
                    {grade as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All subjects</SelectItem>
                {getUniqueValues("subject").map((subject) => (
                  <SelectItem key={subject as string} value={subject as string}>
                    {subject as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="icon" title="More filters">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Lessons grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          // Skeleton loading for lessons
          Array(6).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center mb-3">
                  <Skeleton className="h-4 w-4 mr-2 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex items-center">
                  <Skeleton className="h-4 w-4 mr-2 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-10" />
              </CardFooter>
            </Card>
          ))
        ) : (
          filteredLessons?.map((lesson) => (
            <Card key={lesson.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{lesson.title}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mt-1 -mr-2">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>Share</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[lesson.status]}`}>
                    {lesson.status.charAt(0).toUpperCase() + lesson.status.slice(1)}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center mb-3">
                  <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{lesson.subject}</span>
                </div>
                <div className="flex items-center">
                  <GraduationCap className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{lesson.gradeLevel}</span>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>{lesson.duration} minutes</span>
                </div>
                <Button variant="ghost" size="sm">View</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}