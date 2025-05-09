import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Download, Search, Filter, BookOpen } from "lucide-react";
import type { KnowledgeBase } from "@shared/schema";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeBaseCreateDialog } from "@/components/KnowledgeBaseCreateDialog";

export default function KnowledgeBasePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const subjectsQuery = useQuery<string[]>({
    queryKey: ["/api/knowledge-bases/subjects"],
    refetchOnWindowFocus: false,
  });

  const publicKnowledgeBasesQuery = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-bases/public"],
    refetchOnWindowFocus: false,
  });

  const myKnowledgeBasesQuery = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge-bases/author/me"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const filteredPublicKnowledgeBases = publicKnowledgeBasesQuery.data?.filter(kb => {
    const matchesSearch = !searchTerm || 
      kb.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kb.description && kb.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesSubject = !selectedSubject || selectedSubject === "all" || kb.subject === selectedSubject;
    
    return matchesSearch && matchesSubject;
  });

  const filteredMyKnowledgeBases = myKnowledgeBasesQuery.data?.filter(kb => {
    const matchesSearch = !searchTerm || 
      kb.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kb.description && kb.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesSubject = !selectedSubject || selectedSubject === "all" || kb.subject === selectedSubject;
    
    return matchesSearch && matchesSubject;
  });

  const handleDownload = async (id: number) => {
    try {
      await fetch(`/api/knowledge-bases/${id}/download`, {
        method: "POST",
      });
      toast({
        title: "Success",
        description: "Download started successfully",
      });
    } catch (error) {
      console.error("Error downloading knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to download knowledge base",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container py-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Knowledge Base</h1>
          <p className="text-muted-foreground">Discover, share, and learn with educational resources</p>
        </div>
        {user && (
          <Button onClick={() => {
            console.log("Create button clicked");
            setShowCreateDialog(true);
          }}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row mb-6">
        <div className="flex-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              type="search"
              placeholder="Search by title or description..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full md:w-[200px]">
          <Select
            value={selectedSubject}
            onValueChange={setSelectedSubject}
          >
            <SelectTrigger>
              <div className="flex items-center">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by subject" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjectsQuery.data?.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="public" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="public">Public Resources</TabsTrigger>
          {user && <TabsTrigger value="my">My Resources</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="public">
          {publicKnowledgeBasesQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array(6).fill(0).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-10 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : filteredPublicKnowledgeBases?.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPublicKnowledgeBases.map((knowledgeBase) => (
                <KnowledgeBaseCard
                  key={knowledgeBase.id}
                  knowledgeBase={knowledgeBase}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No knowledge bases found</h3>
              <p className="mt-2 text-muted-foreground">
                {searchTerm || selectedSubject
                  ? "Try changing your search or filter criteria"
                  : "Be the first to share educational resources"}
              </p>
            </div>
          )}
        </TabsContent>
        
        {user && (
          <TabsContent value="my">
            {myKnowledgeBasesQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array(3).fill(0).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-10 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : filteredMyKnowledgeBases?.length ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredMyKnowledgeBases.map((knowledgeBase) => (
                  <KnowledgeBaseCard
                    key={knowledgeBase.id}
                    knowledgeBase={knowledgeBase}
                    onDownload={handleDownload}
                    isOwner
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">You haven't created any knowledge bases yet</h3>
                <p className="mt-2 text-muted-foreground">
                  Create your first knowledge base to share with others
                </p>
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Knowledge Base
                </Button>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {showCreateDialog && (
        <KnowledgeBaseCreateDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      )}
    </div>
  );
}

type KnowledgeBaseCardProps = {
  knowledgeBase: KnowledgeBase;
  onDownload: (id: number) => void;
  isOwner?: boolean;
};

function KnowledgeBaseCard({ knowledgeBase, onDownload, isOwner }: KnowledgeBaseCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl">{knowledgeBase.title}</CardTitle>
          <Badge variant={knowledgeBase.price > 0 ? "default" : "secondary"}>
            {knowledgeBase.price > 0 ? `$${(knowledgeBase.price / 100).toFixed(2)} USD` : "Free"}
          </Badge>
        </div>
        <CardDescription>
          <div className="flex space-x-2 mb-1">
            <Badge variant="outline">{knowledgeBase.subject}</Badge>
            <Badge variant="outline">{knowledgeBase.difficulty}</Badge>
          </div>
          {knowledgeBase.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {knowledgeBase.metadata?.tags?.map((tag, index) => (
            <Badge key={index} variant="outline" className="bg-muted">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Downloads: {knowledgeBase.downloadCount}</p>
          <p>Files: {knowledgeBase.files?.length || 0}</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Link href={`/knowledge-base/${knowledgeBase.id}`}>
          <Button variant="outline">View Details</Button>
        </Link>
        <Button onClick={() => onDownload(knowledgeBase.id)}>
          <Download className="mr-2 h-4 w-4" /> Download
        </Button>
      </CardFooter>
    </Card>
  );
}