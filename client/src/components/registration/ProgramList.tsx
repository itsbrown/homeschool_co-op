import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProgramCard } from "./ProgramCard";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter } from "lucide-react";

// Program interface from ProgramCard component
interface Program {
  id: number;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  price: number;
  gradeLevels: string[];
  capacity: number;
  enrollmentCount: number;
  location: string;
  instructorName: string;
  imageUrl?: string;
  isPublished: boolean;
}

// Child interface from ProgramCard component
interface Child {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
}

interface ProgramListProps {
  isAdmin?: boolean;
  childId?: string;
  featured?: boolean;
  limit?: number;
}

export function ProgramList({ isAdmin = false, childId, featured = false, limit }: ProgramListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  
  // Get childId from URL if not provided as prop
  const params = new URLSearchParams(window.location.search);
  const urlChildId = params.get('childId');
  const selectedChildId = childId || urlChildId;

  // Fetch programs
  const { data: programs, isLoading: isLoadingPrograms } = useQuery({
    queryKey: ["/api/programs"],
    select: (data: any) => Array.isArray(data) ? data.filter((program: Program) => program.isPublished || isAdmin) : [],
  });

  // Fetch children (if not admin)
  const { data: children, isLoading: isLoadingChildren } = useQuery({
    queryKey: ["/api/children"],
    enabled: !isAdmin,
  });
  
  // Find selected child if childId is provided
  const selectedChild = useMemo(() => {
    if (!selectedChildId || !children || !Array.isArray(children)) return null;
    return children.find((child: Child) => 
      child.id === parseInt(selectedChildId as string)
    );
  }, [selectedChildId, children]);
  
  // Set grade level filter based on selected child
  useEffect(() => {
    if (selectedChild && selectedChild.gradeLevel) {
      setGradeLevelFilter(selectedChild.gradeLevel);
    }
  }, [selectedChild]);

  // Calculate available categories and grade levels from data
  const categories = useMemo(() => {
    if (!programs) return [];
    return Array.from(new Set(programs.map((p: Program) => p.category)));
  }, [programs]);

  const gradeLevels = useMemo(() => {
    if (!programs) return [];
    const allGradeLevels = programs.flatMap((p: Program) => p.gradeLevels);
    return Array.from(new Set(allGradeLevels));
  }, [programs]);

  // Filter programs based on search and filters
  const filteredPrograms = useMemo(() => {
    if (!programs) return [];
    
    let filtered = programs.filter((program: Program) => {
      // Search term filter
      const matchesSearch = 
        program.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.instructorName.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Category filter
      const matchesCategory = categoryFilter ? program.category === categoryFilter : true;
      
      // Grade level filter
      const matchesGradeLevel = gradeLevelFilter 
        ? program.gradeLevels.includes(gradeLevelFilter) 
        : true;
      
      // For featured programs, we'll simply take the ones that are published and have capacity
      const matchesFeatured = featured 
        ? program.isPublished && (program.capacity > program.enrollmentCount)
        : true;
      
      return matchesSearch && matchesCategory && matchesGradeLevel && matchesFeatured;
    });

    // Sort featured programs by enrollment percentage (most popular first)
    if (featured) {
      filtered.sort((a, b) => {
        const aPercentage = a.enrollmentCount / a.capacity;
        const bPercentage = b.enrollmentCount / b.capacity;
        return bPercentage - aPercentage;
      });
    }
    
    // Apply limit if specified
    if (limit && limit > 0) {
      filtered = filtered.slice(0, limit);
    }
    
    return filtered;
  }, [programs, searchTerm, categoryFilter, gradeLevelFilter, featured, limit]);

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("");
    setGradeLevelFilter("");
  };

  if (isLoadingPrograms) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Skeleton className="h-10 w-full md:w-1/3" />
          <Skeleton className="h-10 w-full md:w-1/3" />
          <Skeleton className="h-10 w-full md:w-1/3" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Skeleton key={n} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Only show search UI when not in featured mode */}
      {!featured && (
        <Card>
          <CardHeader>
            <CardTitle>Program Search</CardTitle>
            <CardDescription>
              Find the perfect program for your child
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by name, description, or instructor"
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="w-full md:w-1/4">
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    value={categoryFilter} 
                    onValueChange={setCategoryFilter}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All categories</SelectItem>
                      {Array.isArray(categories) && categories.map((category: string) => (
                        <SelectItem key={category} value={category}>
                          {typeof category === 'string' ? category.charAt(0).toUpperCase() + category.slice(1) : category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-full md:w-1/4">
                  <Label htmlFor="grade">Grade Level</Label>
                  <Select 
                    value={gradeLevelFilter} 
                    onValueChange={setGradeLevelFilter}
                  >
                    <SelectTrigger id="grade">
                      <SelectValue placeholder="All grades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All grades</SelectItem>
                      {gradeLevels.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {(searchTerm || categoryFilter || gradeLevelFilter) && (
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {filteredPrograms.length} program{filteredPrograms.length !== 1 ? 's' : ''} found
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {filteredPrograms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Filter className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">No programs found</h3>
          <p className="text-muted-foreground mt-2">
            Try adjusting your filters or search term
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrograms.map((program: Program) => (
            <ProgramCard 
              key={program.id} 
              program={program} 
              children={Array.isArray(children) ? children as Child[] : []}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}