import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Loader2, 
  PlusCircle, 
  Search, 
  Database, 
  FileText, 
  Upload, 
  Download, 
  FileUp,
  Clock,
  Tag,
  Eye,
  Star,
  MoreHorizontal
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import AppShell from '@/components/layout/AppShell';

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeView, setActiveView] = useState("grid");
  const { toast } = useToast();

  // Fetch knowledge bases data from API
  const { data: knowledgeBases, isLoading, error } = useQuery({
    queryKey: ['/api/schools/knowledge-bases'],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading knowledge bases...</span>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Knowledge Bases</CardTitle>
              <CardDescription>
                There was a problem loading your school's knowledge base information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Please try again later or contact support if this issue persists.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Filter knowledge bases based on search query and filters
  const filteredKnowledgeBases = knowledgeBases ? knowledgeBases.filter((kb: any) => {
    const matchesSearch = searchQuery === "" || 
      kb.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSubject = subjectFilter === "all" || kb.subjectArea === subjectFilter;
    const matchesStatus = statusFilter === "all" || kb.status === statusFilter;
    
    return matchesSearch && matchesSubject && matchesStatus;
  }) : [];

  // Get unique values for filter dropdowns
  const subjects = knowledgeBases ? [...new Set(knowledgeBases.map((kb: any) => kb.subjectArea))] : [];
  const statuses = knowledgeBases ? [...new Set(knowledgeBases.map((kb: any) => kb.status))] : [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Knowledge Base</h1>
            <p className="text-muted-foreground">Manage your school's educational content and resources</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/schools/knowledge-base/create">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Knowledge Base
              </Link>
            </Button>
            <Button variant="outline">
              <FileUp className="mr-2 h-4 w-4" />
              Import Resources
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-6">
          <Tabs value={activeView} onValueChange={setActiveView}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                  <div>
                    <CardTitle>Knowledge Base Management</CardTitle>
                    <CardDescription>Organize and manage educational content for your curriculum</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <TabsList>
                      <TabsTrigger value="grid">Grid View</TabsTrigger>
                      <TabsTrigger value="list">List View</TabsTrigger>
                      <TabsTrigger value="categories">Categories</TabsTrigger>
                    </TabsList>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search knowledge bases, descriptions, or tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Subject Area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {subjects.map((subject: any) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map((status: any) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>

              <TabsContent value="grid" className="mt-0">
                <CardContent>
                  {filteredKnowledgeBases.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredKnowledgeBases.map((kb: any) => (
                        <Card key={kb.id} className="hover:shadow-md transition-shadow">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-lg line-clamp-2">{kb.title}</CardTitle>
                                <CardDescription className="mt-2 line-clamp-3">
                                  {kb.description}
                                </CardDescription>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/schools/knowledge-base/${kb.id}`}>View Details</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/schools/knowledge-base/${kb.id}/edit`}>Edit</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>
                                    <Download className="w-4 h-4 mr-2" />
                                    Export
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <Badge variant="outline">{kb.subjectArea}</Badge>
                              <Badge 
                                variant={kb.status === 'Published' ? 'default' : 'secondary'}
                                className={kb.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' : ''}
                              >
                                {kb.status}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <div className="flex items-center">
                                <FileText className="w-4 h-4 mr-1" />
                                {kb.fileCount || 0} files
                              </div>
                              <div className="flex items-center">
                                <Eye className="w-4 h-4 mr-1" />
                                {kb.usageCount || 0} uses
                              </div>
                            </div>

                            {kb.tags && kb.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {kb.tags.slice(0, 3).map((tag: string, index: number) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {kb.tags.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{kb.tags.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                Updated {kb.updatedAt ? new Date(kb.updatedAt).toLocaleDateString() : 'N/A'}
                              </div>
                              {kb.rating && (
                                <div className="flex items-center">
                                  <Star className="w-3 h-3 mr-1 fill-yellow-400 text-yellow-400" />
                                  {kb.rating}
                                </div>
                              )}
                            </div>
                          </CardContent>
                          <CardFooter className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" asChild>
                              <Link href={`/schools/knowledge-base/${kb.id}`}>View</Link>
                            </Button>
                            <Button size="sm" className="flex-1" asChild>
                              <Link href={`/schools/knowledge-base/${kb.id}/use`}>Use in Lesson</Link>
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-12 text-center">
                      <div className="space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <Database className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-medium">No Knowledge Bases Found</h3>
                          <p className="text-muted-foreground mt-2">
                            {searchQuery || subjectFilter || statusFilter 
                              ? "No knowledge bases match your current filters." 
                              : "Start by creating your first knowledge base to organize educational content."}
                          </p>
                        </div>
                        <Button asChild>
                          <Link href="/schools/knowledge-base/create">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create Knowledge Base
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </TabsContent>

              <TabsContent value="list" className="mt-0">
                <CardContent>
                  <div className="space-y-4">
                    {filteredKnowledgeBases.length > 0 ? (
                      filteredKnowledgeBases.map((kb: any) => (
                        <Card key={kb.id} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center space-x-3">
                                  <h3 className="text-lg font-medium">{kb.title}</h3>
                                  <Badge variant="outline">{kb.subjectArea}</Badge>
                                  <Badge 
                                    variant={kb.status === 'Published' ? 'default' : 'secondary'}
                                    className={kb.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' : ''}
                                  >
                                    {kb.status}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground line-clamp-2">{kb.description}</p>
                                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                  <div className="flex items-center">
                                    <FileText className="w-4 h-4 mr-1" />
                                    {kb.fileCount || 0} files
                                  </div>
                                  <div className="flex items-center">
                                    <Eye className="w-4 h-4 mr-1" />
                                    {kb.usageCount || 0} uses
                                  </div>
                                  <div className="flex items-center">
                                    <Clock className="w-4 h-4 mr-1" />
                                    Updated {kb.updatedAt ? new Date(kb.updatedAt).toLocaleDateString() : 'N/A'}
                                  </div>
                                  {kb.rating && (
                                    <div className="flex items-center">
                                      <Star className="w-4 h-4 mr-1 fill-yellow-400 text-yellow-400" />
                                      {kb.rating}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 ml-4">
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/schools/knowledge-base/${kb.id}`}>View</Link>
                                </Button>
                                <Button size="sm" asChild>
                                  <Link href={`/schools/knowledge-base/${kb.id}/use`}>Use</Link>
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link href={`/schools/knowledge-base/${kb.id}/edit`}>Edit</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Download className="w-4 h-4 mr-2" />
                                      Export
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <div className="mx-auto w-16 h-16 rounded-lg bg-muted flex items-center justify-center mb-4">
                          <Database className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No Knowledge Bases Found</h3>
                        <p className="text-muted-foreground mb-4">
                          {searchQuery || subjectFilter || statusFilter 
                            ? "No knowledge bases match your current filters." 
                            : "Start by creating your first knowledge base."}
                        </p>
                        <Button asChild>
                          <Link href="/schools/knowledge-base/create">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create Knowledge Base
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="categories" className="mt-0">
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Tag className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-medium">Categories View Coming Soon</h3>
                    <p className="text-muted-foreground mt-2 text-center">
                      Organize knowledge bases by categories and subject areas for easier navigation.
                    </p>
                  </div>
                </CardContent>
              </TabsContent>

              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" size="sm">
                  Export All
                </Button>
                <div>
                  <span className="text-sm text-muted-foreground mr-4">
                    {filteredKnowledgeBases.length} of {knowledgeBases?.length || 0} knowledge bases
                  </span>
                </div>
              </CardFooter>
            </Card>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}