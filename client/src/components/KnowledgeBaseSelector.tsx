import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Library } from "lucide-react";

interface KnowledgeBaseSelectorProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

interface KnowledgeBase {
  id: number;
  title: string;
  subject: string;
  authorId: number;
  isPublic: boolean;
  files?: Array<{
    name: string;
    size: number;
    type: string;
    url: string;
  }>;
  fileCount?: number;
}

export function KnowledgeBaseSelector({ selectedIds, onChange }: KnowledgeBaseSelectorProps) {
  const [currentSelection, setCurrentSelection] = useState<string>("");

  const { data: knowledgeBases, isLoading, isError } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-base/combined"],
    queryFn: () => fetch('/api/knowledge-base/combined').then(res => res.json()),
  });

  // Debug logging
  useEffect(() => {
    if (knowledgeBases) {
      console.log('📚 Loaded knowledge bases:', knowledgeBases.length, knowledgeBases);
    }
  }, [knowledgeBases]);

  const handleAddSelection = () => {
    if (currentSelection && !selectedIds.includes(Number(currentSelection))) {
      onChange([...selectedIds, Number(currentSelection)]);
      setCurrentSelection("");
    }
  };

  const handleRemoveSelection = (id: number) => {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  };

  const getKnowledgeBaseById = (id: number) => {
    return Array.isArray(knowledgeBases) ? knowledgeBases.find((kb: KnowledgeBase) => kb.id === id) : undefined;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-red-500 p-2 border border-red-300 rounded-md">
        Error loading knowledge bases. Please try again later.
      </div>
    );
  }

  if (!knowledgeBases || !Array.isArray(knowledgeBases) || knowledgeBases.length === 0) {
    return (
      <div className="text-center p-4 border border-dashed border-gray-300 rounded-md">
        <Library className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-3">No knowledge bases found</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/knowledge-base/create">
            <Plus className="mr-2 h-4 w-4" />
            Create Knowledge Base
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex space-x-2">
        <Select value={currentSelection} onValueChange={setCurrentSelection}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a knowledge base" />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(knowledgeBases) && knowledgeBases.map((kb: KnowledgeBase) => (
              <SelectItem 
                key={kb.id} 
                value={kb.id.toString()}
                disabled={selectedIds.includes(kb.id)}
              >
                {kb.title} {kb.isPublic && <span className="text-xs">(Public)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAddSelection} disabled={!currentSelection}>
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {selectedIds.length > 0 ? (
          selectedIds.map((id) => {
            const kb = getKnowledgeBaseById(id);
            if (!kb) return null;
            
            return (
              <Badge key={id} variant="secondary" className="px-3 py-1 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {kb.title}
                <button 
                  onClick={() => handleRemoveSelection(id)}
                  className="ml-1 text-xs rounded-full hover:bg-background p-1 transition-colors"
                >
                  ×
                </button>
              </Badge>
            );
          })
        ) : (
          <div className="text-sm text-muted-foreground">
            No knowledge bases selected
          </div>
        )}
      </div>
    </div>
  );
}