import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, X, Link2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ClassInfo {
  id: number;
  title: string;
  category?: string;
}

interface ClassInclusion {
  id: number;
  parentClassId: number;
  includedClassId: number;
  createdAt?: string;
}

interface ClassInclusionsManagerProps {
  classId?: number;
  selectedInclusions: number[];
  onInclusionsChange: (inclusions: number[]) => void;
  isEditMode: boolean;
}

export function ClassInclusionsManager({
  classId,
  selectedInclusions,
  onInclusionsChange,
  isEditMode,
}: ClassInclusionsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClassToAdd, setSelectedClassToAdd] = useState<string>("");

  const { data: allClasses = [], isLoading: classesLoading } = useQuery<ClassInfo[]>({
    queryKey: ["/api/school-admin/classes"],
    select: (data: any) => {
      if (data?.items && Array.isArray(data.items)) {
        return data.items.map((c: any) => ({
          id: c.id,
          title: c.title,
          category: c.category || c.categoryName,
        }));
      }
      if (Array.isArray(data)) {
        return data.map((c: any) => ({
          id: c.id,
          title: c.title,
          category: c.category || c.categoryName,
        }));
      }
      return [];
    },
  });

  const { data: existingInclusions = [], isLoading: inclusionsLoading } = useQuery<ClassInclusion[]>({
    queryKey: ["/api/class-inclusions", classId],
    queryFn: async () => {
      if (!classId) return [];
      const token = localStorage.getItem("supabase_token");
      const response = await fetch(`/api/class-inclusions/${classId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error("Failed to fetch inclusions");
      }
      return response.json();
    },
    enabled: !!classId && isEditMode,
  });

  const addInclusionMutation = useMutation({
    mutationFn: async (includedClassId: number) => {
      const token = localStorage.getItem("supabase_token");
      const response = await fetch("/api/class-inclusions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        credentials: "include",
        body: JSON.stringify({
          parentClassId: classId,
          includedClassId,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add inclusion");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-inclusions", classId] });
      toast({
        title: "Class Included",
        description: "The class has been added to inclusions.",
      });
      setSelectedClassToAdd("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Inclusion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeInclusionMutation = useMutation({
    mutationFn: async (inclusionId: number) => {
      const token = localStorage.getItem("supabase_token");
      const response = await fetch(`/api/class-inclusions/${inclusionId}`, {
        method: "DELETE",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove inclusion");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-inclusions", classId] });
      toast({
        title: "Inclusion Removed",
        description: "The class has been removed from inclusions.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Inclusion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddInclusion = () => {
    if (!selectedClassToAdd) return;
    
    const includedClassId = parseInt(selectedClassToAdd, 10);
    
    if (isEditMode && classId) {
      addInclusionMutation.mutate(includedClassId);
    } else {
      if (!selectedInclusions.includes(includedClassId)) {
        onInclusionsChange([...selectedInclusions, includedClassId]);
      }
      setSelectedClassToAdd("");
    }
  };

  const handleRemoveInclusion = (inclusionIdOrClassId: number, isDbInclusion: boolean) => {
    if (isDbInclusion && isEditMode) {
      removeInclusionMutation.mutate(inclusionIdOrClassId);
    } else {
      onInclusionsChange(selectedInclusions.filter((id) => id !== inclusionIdOrClassId));
    }
  };

  const getIncludedClassIds = (): number[] => {
    if (isEditMode && classId) {
      return existingInclusions.map((inc) => inc.includedClassId);
    }
    return selectedInclusions;
  };

  const availableClasses = allClasses.filter((c) => {
    if (classId && c.id === classId) return false;
    const includedIds = getIncludedClassIds();
    return !includedIds.includes(c.id);
  });

  const includedClasses = getIncludedClassIds()
    .map((id) => allClasses.find((c) => c.id === id))
    .filter(Boolean) as ClassInfo[];

  const getInclusionId = (classId: number): number | undefined => {
    const inclusion = existingInclusions.find((inc) => inc.includedClassId === classId);
    return inclusion?.id;
  };

  const isLoading = classesLoading || (isEditMode && inclusionsLoading);

  if (isLoading) {
    return (
      <Card className="mt-6" data-testid="card-class-inclusions-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Included Classes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6" data-testid="card-class-inclusions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Included Classes
        </CardTitle>
        <CardDescription>
          Select classes that are automatically included when a student enrolls in this program. 
          For example, a "Full Day" program might include specific extracurricular activities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEditMode && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Class inclusions will be saved after the class is created.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Select
            value={selectedClassToAdd}
            onValueChange={setSelectedClassToAdd}
            disabled={availableClasses.length === 0}
          >
            <SelectTrigger className="flex-1" data-testid="select-class-to-include">
              <SelectValue placeholder={
                availableClasses.length === 0 
                  ? "No classes available to include" 
                  : "Select a class to include"
              } />
            </SelectTrigger>
            <SelectContent>
              {availableClasses.map((c) => (
                <SelectItem key={c.id} value={String(c.id)} data-testid={`option-class-${c.id}`}>
                  {c.title} {c.category && <span className="text-muted-foreground">({c.category})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleAddInclusion}
            disabled={!selectedClassToAdd || addInclusionMutation.isPending}
            data-testid="button-add-inclusion"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {includedClasses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Currently included:</p>
            <div className="flex flex-wrap gap-2">
              {includedClasses.map((c) => {
                const inclusionId = isEditMode ? getInclusionId(c.id) : undefined;
                const isRemoving = removeInclusionMutation.isPending;
                
                return (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="flex items-center gap-1 px-3 py-1.5"
                    data-testid={`badge-included-class-${c.id}`}
                  >
                    {c.title}
                    <button
                      type="button"
                      onClick={() => handleRemoveInclusion(
                        isEditMode && inclusionId ? inclusionId : c.id,
                        isEditMode && !!inclusionId
                      )}
                      disabled={isRemoving}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                      data-testid={`button-remove-inclusion-${c.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No classes are currently included in this program.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
