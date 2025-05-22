import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  Loader2,
  ArrowLeft,
  Download,
  Edit,
  Tag,
  Clock,
  FileText,
  Database,
  Eye,
  Star,
  Share,
  Upload,
  FilePlus,
  Trash2,
  Filter,
  List,
  Grid,
  Search,
  ChevronDown,
  FileUp
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

// Sample file data for the knowledge base
const sampleFiles = [
  {
    id: 1,
    name: "Ordination Certificate.pdf",
    type: "PDF",
    size: "2.4 MB",
    uploadedAt: "2023-09-15",
    tags: ["Certificate", "Ordination"],
    description: "Original ordination certificate of Antoinette Brown Blackwell from 1853."
  },
  {
    id: 2,
    name: "Letters to Susan B. Anthony.docx",
    type: "Document",
    size: "1.8 MB",
    uploadedAt: "2023-09-16",
    tags: ["Correspondence", "Suffrage Movement"],
    description: "Collection of letters exchanged between Antoinette Brown Blackwell and Susan B. Anthony regarding women's rights."
  },
  {
    id: 3,
    name: "Sermon Notes 1854.pdf",
    type: "PDF",
    size: "3.2 MB",
    uploadedAt: "2023-09-18",
    tags: ["Sermons", "Ministry"],
    description: "Handwritten sermon notes from Antoinette Brown Blackwell's early ministry work."
  },
  {
    id: 4,
    name: "Studies in General Science.jpg",
    type: "Image",
    size: "1.5 MB",
    uploadedAt: "2023-09-20",
    tags: ["Publications", "Science"],
    description: "Cover image of Blackwell's book 'Studies in General Science' published in 1869."
  },
  {
    id: 5,
    name: "Congregational Church Documents.pdf",
    type: "PDF",
    size: "4.1 MB",
    uploadedAt: "2023-09-22",
    tags: ["Church", "Ministry"],
    description: "Official documents from the Congregational Church related to Blackwell's ordination and ministry."
  },
  {
    id: 6,
    name: "Oberlin College Records.docx",
    type: "Document",
    size: "2.7 MB",
    uploadedAt: "2023-09-25",
    tags: ["Education", "Oberlin"],
    description: "Records from Oberlin College showing Blackwell's theological studies and achievements."
  },
  {
    id: 7,
    name: "The Sexes Throughout Nature.pdf",
    type: "PDF",
    size: "5.3 MB",
    uploadedAt: "2023-09-28",
    tags: ["Publications", "Gender Studies"],
    description: "Digital copy of Blackwell's book 'The Sexes Throughout Nature' from 1875."
  },
  {
    id: 8,
    name: "Family Photographs.zip",
    type: "Archive",
    size: "8.7 MB",
    uploadedAt: "2023-10-01",
    tags: ["Photographs", "Family"],
    description: "Collection of family photographs including Blackwell with her husband and children."
  },
  {
    id: 9,
    name: "Lecture Notes on Women's Rights.pdf",
    type: "PDF",
    size: "3.8 MB",
    uploadedAt: "2023-10-05",
    tags: ["Lectures", "Women's Rights"],
    description: "Notes from Blackwell's lectures on women's rights and suffrage."
  },
  {
    id: 10,
    name: "Biography Draft.docx",
    type: "Document",
    size: "6.2 MB",
    uploadedAt: "2023-10-10",
    tags: ["Biography", "Research"],
    description: "Draft of a comprehensive biography of Antoinette Brown Blackwell's life and contributions."
  },
];

// File type icons mapping
const fileTypeIcons = {
  "PDF": <FileText className="h-10 w-10 text-red-500" />,
  "Document": <FileText className="h-10 w-10 text-blue-500" />,
  "Image": <FileText className="h-10 w-10 text-green-500" />,
  "Archive": <FileText className="h-10 w-10 text-yellow-500" />,
  "Audio": <FileText className="h-10 w-10 text-purple-500" />,
  "Video": <FileText className="h-10 w-10 text-pink-500" />,
  "Other": <FileText className="h-10 w-10 text-gray-500" />,
};

export default function KnowledgeBaseDetailsPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("files");
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all-types");
  const [tagFilter, setTagFilter] = useState("all-tags");
  
  // Fetch knowledge base details based on ID
  const { data: knowledgeBase, isLoading, error } = useQuery({
    queryKey: [`/api/schools/knowledge-bases/${id}`],
    queryFn: async () => {
      // For now, combine sample data with any locally stored knowledge bases
      let localKbs = [];
      try {
        localKbs = JSON.parse(localStorage.getItem('knowledgeBases') || '[]');
      } catch (e) {
        console.error('Error parsing knowledge bases:', e);
      }
      
      // Combine sample knowledge bases with local ones
      const sampleKnowledgeBases = [
        {
          id: 1,
          title: "American History Primary Documents",
          description: "A comprehensive collection of primary documents from American history, including the Declaration of Independence, Constitution, and other significant historical texts.",
          subjectArea: "History",
          gradeLevel: ["9-12"],
          status: "Published",
          visibility: "School",
          fileCount: 36,
          size: "128 MB",
          createdAt: "2023-09-15",
          updatedAt: "2023-10-20",
          tags: ["American History", "Primary Sources", "Constitution", "Revolution"],
          creator: "Dr. Sarah Johnson",
          rating: 4.8,
          usageCount: 85,
        },
        {
          id: 2,
          title: "Middle School Mathematics",
          description: "Core mathematics curriculum materials for grades 6-8, covering algebra, geometry, statistics, and more.",
          subjectArea: "Mathematics",
          gradeLevel: ["6-8"],
          status: "Published",
          visibility: "School",
          fileCount: 42,
          size: "95 MB",
          createdAt: "2023-08-05",
          updatedAt: "2023-11-10",
          tags: ["Mathematics", "Algebra", "Geometry", "Middle School"],
          creator: "Prof. Michael Chen",
          rating: 4.6,
          usageCount: 120,
        },
      ];
      
      const allKbs = [...sampleKnowledgeBases, ...localKbs];
      
      // Find the KB with the matching ID
      const foundKb = allKbs.find(kb => kb.id === Number(id));
      
      if (!foundKb) {
        throw new Error(`Knowledge base with ID ${id} not found`);
      }
      
      return foundKb;
    },
  });

  // Fetch files for the knowledge base
  const { data: files = sampleFiles } = useQuery({
    queryKey: [`/api/schools/knowledge-bases/${id}/files`],
    enabled: !!knowledgeBase,
    queryFn: async () => {
      // For now, return sample files
      return sampleFiles;
    },
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Knowledge Base - Loading">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading knowledge base details...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !knowledgeBase) {
    return (
      <SchoolAdminLayout pageTitle="Knowledge Base - Error">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <Button variant="outline" asChild>
              <Link href="/schools/knowledge-base">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Knowledge Bases
              </Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Knowledge Base</CardTitle>
              <CardDescription>
                The knowledge base you're looking for could not be found or there was an error loading its details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>The knowledge base with ID {id} could not be found. It may have been deleted or you may not have permission to view it.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </CardFooter>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  // Filter files based on search query and filters
  const filteredFiles = files.filter(file => {
    const matchesSearch = searchQuery === "" || 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFileType = fileTypeFilter === "all-types" || file.type === fileTypeFilter;
    const matchesTag = tagFilter === "all-tags" || 
      (file.tags && Array.isArray(file.tags) && file.tags.includes(tagFilter));
    
    return matchesSearch && matchesFileType && matchesTag;
  });

  // Get unique file types and tags for filters
  const fileTypes = Array.from(new Set(files.map(file => file.type)));
  const allTags = files.flatMap(file => file.tags || []);
  const uniqueTags = Array.from(new Set(allTags));

  return (
    <SchoolAdminLayout pageTitle={`Knowledge Base - ${knowledgeBase.title}`}>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <Button variant="outline" asChild>
              <Link href="/schools/knowledge-base">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Knowledge Bases
              </Link>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  Actions
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" />
                  Download All Files
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Share className="mr-2 h-4 w-4" />
                  Share Knowledge Base
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Tag className="mr-2 h-4 w-4" />
                  Edit Tags
                </DropdownMenuItem>
                {knowledgeBase.status !== "Published" && (
                  <DropdownMenuItem>
                    <Upload className="mr-2 h-4 w-4" />
                    Publish
                  </DropdownMenuItem>
                )}
                {knowledgeBase.status === "Published" && (
                  <DropdownMenuItem>
                    <Upload className="mr-2 h-4 w-4" />
                    Unpublish
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge 
                      variant="outline" 
                      className={knowledgeBase.status === "Published" ? "bg-green-100 text-green-800 border-green-200" :
                        knowledgeBase.status === "Draft" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                        knowledgeBase.status === "Archived" ? "bg-gray-100 text-gray-800 border-gray-200" :
                        knowledgeBase.status === "Under Review" ? "bg-blue-100 text-blue-800 border-blue-200" :
                        "bg-gray-100 text-gray-800 border-gray-200"}
                    >
                      {knowledgeBase.status}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={knowledgeBase.visibility === "Public" ? "bg-green-100 text-green-800 border-green-200" :
                        knowledgeBase.visibility === "School" ? "bg-blue-100 text-blue-800 border-blue-200" :
                        knowledgeBase.visibility === "Private" ? "bg-gray-100 text-gray-800 border-gray-200" :
                        "bg-gray-100 text-gray-800 border-gray-200"}
                    >
                      {knowledgeBase.visibility}
                    </Badge>
                    <Badge variant="secondary">{knowledgeBase.subjectArea}</Badge>
                    {knowledgeBase.gradeLevel && knowledgeBase.gradeLevel.map((grade, i) => (
                      <Badge key={i} variant="outline">Grades {grade}</Badge>
                    ))}
                  </div>
                  <CardTitle className="text-2xl">{knowledgeBase.title}</CardTitle>
                  <CardDescription className="mt-2">{knowledgeBase.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {knowledgeBase.tags && knowledgeBase.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="bg-secondary/30">{tag}</Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Created</span>
                      <span className="font-medium">{knowledgeBase.createdAt}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">{knowledgeBase.updatedAt}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Files</span>
                      <span className="font-medium">{knowledgeBase.fileCount}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Size</span>
                      <span className="font-medium">{knowledgeBase.size}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Created by</h4>
                      <p>{knowledgeBase.creator}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Usage Statistics</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span>{knowledgeBase.usageCount} uses in lessons/curricula</span>
                      </div>
                      {knowledgeBase.rating > 0 && (
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span>{knowledgeBase.rating} average rating</span>
                        </div>
                      )}
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Quick Actions</h4>
                      <div className="space-y-2">
                        <Button variant="outline" className="w-full justify-start">
                          <FilePlus className="mr-2 h-4 w-4" />
                          Add Files
                        </Button>
                        <Button variant="outline" className="w-full justify-start">
                          <Share className="mr-2 h-4 w-4" />
                          Share
                        </Button>
                        <Button variant="outline" className="w-full justify-start">
                          <Download className="mr-2 h-4 w-4" />
                          Download All
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="usage">Usage History</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search files by name or description..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="File Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-types">All Types</SelectItem>
                          {fileTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={tagFilter} onValueChange={setTagFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-tags">All Tags</SelectItem>
                          {uniqueTags.map((tag) => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center border rounded-md">
                        <Button
                          variant={viewMode === "grid" ? "default" : "ghost"}
                          size="icon"
                          onClick={() => setViewMode("grid")}
                          className="h-9 w-9 rounded-none rounded-l-md"
                        >
                          <Grid className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button
                          variant={viewMode === "list" ? "default" : "ghost"}
                          size="icon"
                          onClick={() => setViewMode("list")}
                          className="h-9 w-9 rounded-none rounded-r-md"
                        >
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      {filteredFiles.length} {filteredFiles.length === 1 ? "file" : "files"} found
                    </p>
                    <Button size="sm">
                      <FileUp className="mr-2 h-4 w-4" />
                      Upload Files
                    </Button>
                  </div>

                  {filteredFiles.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No files found</h3>
                      <p className="text-muted-foreground mb-6">
                        {searchQuery || fileTypeFilter !== "all-types" || tagFilter !== "all-tags"
                          ? "No files match your current filters. Try adjusting your search criteria."
                          : "This knowledge base doesn't have any files yet. Upload some files to get started."}
                      </p>
                      <Button>
                        <FileUp className="mr-2 h-4 w-4" />
                        Upload Files
                      </Button>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredFiles.map((file) => (
                        <Card key={file.id} className="overflow-hidden">
                          <div className="p-4 flex flex-col items-center">
                            {fileTypeIcons[file.type] || fileTypeIcons["Other"]}
                            <h4 className="font-medium mt-2 text-center line-clamp-1" title={file.name}>
                              {file.name}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">{file.size}</p>
                          </div>
                          <div className="p-3 bg-muted/20 border-t flex items-center justify-between">
                            <Badge variant="outline">{file.type}</Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="border rounded-md divide-y">
                      {filteredFiles.map((file) => (
                        <div key={file.id} className="flex items-center p-3 hover:bg-muted/50">
                          <div className="mr-3">
                            {fileTypeIcons[file.type] || fileTypeIcons["Other"]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                              <h4 className="font-medium line-clamp-1" title={file.name}>
                                {file.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 sm:mt-0">
                                <Badge variant="outline">{file.type}</Badge>
                                <span className="text-sm text-muted-foreground">{file.size}</span>
                                <span className="text-sm text-muted-foreground">Uploaded {file.uploadedAt}</span>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{file.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {file.tags && file.tags.map((tag, i) => (
                                <Badge key={i} variant="outline" className="bg-secondary/20 text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="ml-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="usage" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Usage History</CardTitle>
                  <CardDescription>
                    Track where and how this knowledge base is being used throughout the platform.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Eye className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Usage tracking coming soon</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      We're building a comprehensive usage tracking system to help you understand
                      how your knowledge bases are being utilized in lessons and curricula.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Permissions</CardTitle>
                  <CardDescription>
                    Manage access and editing permissions for this knowledge base.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Share className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Permission settings coming soon</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Soon, you'll be able to set granular permissions for who can view, edit,
                      and use this knowledge base in their own materials.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}