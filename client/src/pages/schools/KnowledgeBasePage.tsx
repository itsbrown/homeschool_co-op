import { useState } from "react";
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
  ChevronDown
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

// Sample knowledge base data (will be replaced with API data)
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
  {
    id: 3,
    title: "Beginner Spanish Resources",
    description: "Spanish language learning materials for beginners, including vocabulary lists, grammar guides, and cultural readings.",
    subjectArea: "Languages",
    gradeLevel: ["6-12"],
    status: "Published",
    visibility: "Public",
    fileCount: 28,
    size: "75 MB",
    createdAt: "2023-10-12",
    updatedAt: "2023-11-15",
    tags: ["Spanish", "Language Learning", "Vocabulary", "Grammar"],
    creator: "Ms. Elena Rodriguez",
    rating: 4.5,
    usageCount: 65,
  },
  {
    id: 4,
    title: "Biology and Ecosystems",
    description: "Comprehensive materials on biology and ecosystems, including lesson plans, lab activities, and visual resources.",
    subjectArea: "Science",
    gradeLevel: ["9-10"],
    status: "Draft",
    visibility: "Private",
    fileCount: 24,
    size: "110 MB",
    createdAt: "2023-11-01",
    updatedAt: "2023-11-18",
    tags: ["Biology", "Ecosystems", "Environmental Science", "Labs"],
    creator: "Dr. Robert Williams",
    rating: 0,
    usageCount: 0,
  },
  {
    id: 5,
    title: "Creative Writing Prompts and Guides",
    description: "Collection of creative writing prompts, guides, and example works for middle school students.",
    subjectArea: "English",
    gradeLevel: ["7-9"],
    status: "Published",
    visibility: "School",
    fileCount: 18,
    size: "45 MB",
    createdAt: "2023-08-22",
    updatedAt: "2023-09-30",
    tags: ["Creative Writing", "English", "Literature", "Prompts"],
    creator: "Ms. Amanda Taylor",
    rating: 4.9,
    usageCount: 72,
  },
  {
    id: 6,
    title: "Physical Science Lab Activities",
    description: "Hands-on lab activities for physical science courses, covering forces, motion, energy, and simple machines.",
    subjectArea: "Science",
    gradeLevel: ["8-9"],
    status: "Published",
    visibility: "School",
    fileCount: 32,
    size: "88 MB",
    createdAt: "2023-07-15",
    updatedAt: "2023-10-05",
    tags: ["Physical Science", "Labs", "Hands-on Learning", "Scientific Method"],
    creator: "Mr. James Wilson",
    rating: 4.3,
    usageCount: 54,
  },
];

// Status and visibility badge colors
const STATUS_COLORS = {
  "Published": "green",
  "Draft": "yellow",
  "Archived": "gray",
  "Under Review": "blue",
};

const VISIBILITY_COLORS = {
  "Public": "green",
  "School": "blue",
  "Private": "gray",
};

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch knowledge bases for the school (using sample data for now)
  const { data: knowledgeBases, isLoading, error } = useQuery({
    queryKey: ['/api/schools/knowledge-bases'],
    queryFn: () => Promise.resolve(sampleKnowledgeBases),
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Knowledge Base - Loading">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading knowledge bases...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error) {
    return (
      <SchoolAdminLayout pageTitle="Knowledge Base - Error">
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
      </SchoolAdminLayout>
    );
  }

  // Filter knowledge bases based on search query and filters
  const filteredKnowledgeBases = knowledgeBases ? knowledgeBases.filter(kb => {
    const matchesSearch = searchQuery === "" || 
      kb.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSubject = subjectFilter === "" || kb.subjectArea === subjectFilter;
    const matchesGradeLevel = gradeLevelFilter === "" || kb.gradeLevel.some(gl => gl.includes(gradeLevelFilter));
    const matchesStatus = statusFilter === "" || kb.status === statusFilter;
    
    // Filter by tab
    if (activeTab === "all") return matchesSearch && matchesSubject && matchesGradeLevel && matchesStatus;
    if (activeTab === "public") return matchesSearch && matchesSubject && matchesGradeLevel && matchesStatus && kb.visibility === "Public";
    if (activeTab === "school") return matchesSearch && matchesSubject && matchesGradeLevel && matchesStatus && kb.visibility === "School";
    if (activeTab === "private") return matchesSearch && matchesSubject && matchesGradeLevel && matchesStatus && kb.visibility === "Private";
    if (activeTab === "drafts") return matchesSearch && matchesSubject && matchesGradeLevel && matchesStatus && kb.status === "Draft";
    
    return false;
  }) : [];

  // Get unique subjects, grade levels, and statuses for filters
  const subjects = knowledgeBases ? [...new Set(knowledgeBases.map(kb => kb.subjectArea))] : [];
  const gradeLevels = ["K-2", "3-5", "6-8", "9-12"];
  const statuses = knowledgeBases ? [...new Set(knowledgeBases.map(kb => kb.status))] : [];

  return (
    <SchoolAdminLayout pageTitle="Knowledge Base">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold">Knowledge Base</h1>
              <p className="text-muted-foreground">Manage your school's educational resources and materials</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/schools/knowledge-base/import">
                  <FileUp className="mr-2 h-4 w-4" />
                  Import
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/schools/knowledge-base/marketplace">
                  <Database className="mr-2 h-4 w-4" />
                  Browse Marketplace
                </Link>
              </Button>
              <Button asChild>
                <Link href="/schools/knowledge-base/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New
                </Link>
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="all">All Resources</TabsTrigger>
              <TabsTrigger value="school">School Only</TabsTrigger>
              <TabsTrigger value="public">Public</TabsTrigger>
              <TabsTrigger value="private">Private</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
            </TabsList>

            <Card>
              <CardHeader>
                <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search knowledge bases by title, description, or tags..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-subjects">All Subjects</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={gradeLevelFilter} onValueChange={setGradeLevelFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Grade Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Grades</SelectItem>
                        {gradeLevels.map((gradeLevel) => (
                          <SelectItem key={gradeLevel} value={gradeLevel}>{gradeLevel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Statuses</SelectItem>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-6">
                  {filteredKnowledgeBases.length > 0 ? (
                    filteredKnowledgeBases.map((kb) => (
                      <Card key={kb.id} className="overflow-hidden">
                        <div className="flex flex-col md:flex-row">
                          <div className="md:w-2/3 p-6">
                            <div className="flex flex-wrap gap-2 mb-2">
                              <Badge 
                                variant="outline" 
                                className={kb.status === "Published" ? "bg-green-100 text-green-800 border-green-200" :
                                  kb.status === "Draft" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                                  kb.status === "Archived" ? "bg-gray-100 text-gray-800 border-gray-200" :
                                  kb.status === "Under Review" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                  "bg-gray-100 text-gray-800 border-gray-200"}
                              >
                                {kb.status}
                              </Badge>
                              <Badge 
                                variant="outline" 
                                className={kb.visibility === "Public" ? "bg-green-100 text-green-800 border-green-200" :
                                  kb.visibility === "School" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                  kb.visibility === "Private" ? "bg-gray-100 text-gray-800 border-gray-200" :
                                  "bg-gray-100 text-gray-800 border-gray-200"}
                              >
                                {kb.visibility}
                              </Badge>
                              <Badge variant="secondary">{kb.subjectArea}</Badge>
                              {kb.gradeLevel.map((grade, i) => (
                                <Badge key={i} variant="outline">Grades {grade}</Badge>
                              ))}
                            </div>
                            <h3 className="text-xl font-bold mb-2">{kb.title}</h3>
                            <p className="text-muted-foreground mb-4">{kb.description}</p>
                            
                            <div className="flex flex-wrap gap-1 mb-4">
                              {kb.tags.map((tag, i) => (
                                <Badge key={i} variant="outline" className="bg-secondary/30">{tag}</Badge>
                              ))}
                            </div>
                            
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                              <div className="flex items-center">
                                <FileText className="w-4 h-4 mr-1" />
                                <span>{kb.fileCount} files</span>
                              </div>
                              <div className="flex items-center">
                                <Database className="w-4 h-4 mr-1" />
                                <span>{kb.size}</span>
                              </div>
                              <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                <span>Updated {new Date(kb.updatedAt).toLocaleDateString()}</span>
                              </div>
                              {kb.rating > 0 && (
                                <div className="flex items-center">
                                  <Star className="w-4 h-4 mr-1 text-yellow-500" />
                                  <span>{kb.rating.toFixed(1)}</span>
                                </div>
                              )}
                              {kb.usageCount > 0 && (
                                <div className="flex items-center">
                                  <Eye className="w-4 h-4 mr-1" />
                                  <span>{kb.usageCount} uses</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="md:w-1/3 bg-muted/20 p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l">
                            <div>
                              <p className="text-sm mb-2">Created by:</p>
                              <p className="font-medium mb-4">{kb.creator}</p>
                              
                              <Accordion type="single" collapsible className="mb-4">
                                <AccordionItem value="details">
                                  <AccordionTrigger>Details</AccordionTrigger>
                                  <AccordionContent>
                                    <div className="space-y-2 text-sm">
                                      <div>
                                        <span className="font-medium">Created:</span> {new Date(kb.createdAt).toLocaleDateString()}
                                      </div>
                                      <div>
                                        <span className="font-medium">Last Updated:</span> {new Date(kb.updatedAt).toLocaleDateString()}
                                      </div>
                                      <div>
                                        <span className="font-medium">File Count:</span> {kb.fileCount}
                                      </div>
                                      <div>
                                        <span className="font-medium">Size:</span> {kb.size}
                                      </div>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            </div>
                            
                            <div className="flex flex-col gap-2 mt-4">
                              <Button variant="default" asChild>
                                <Link href={`/schools/knowledge-base/${kb.id}`}>
                                  View Contents
                                </Link>
                              </Button>
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" className="w-full">
                                    Actions
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem>
                                    <Link href={`/schools/knowledge-base/${kb.id}/edit`}>Edit Details</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Link href={`/schools/knowledge-base/${kb.id}/upload`}>Upload Files</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Download className="mr-2 h-4 w-4" />
                                    <span>Download All</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>
                                    <Link href={`/schools/knowledge-base/${kb.id}/share`}>Share Settings</Link>
                                  </DropdownMenuItem>
                                  {kb.status === "Draft" ? (
                                    <DropdownMenuItem className="text-green-600">Publish</DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem className="text-yellow-600">Unpublish</DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-600">Archive</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No Knowledge Bases Found</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mt-2">
                        No knowledge bases match your current filters. Try adjusting your search criteria or create a new knowledge base.
                      </p>
                      <Button className="mt-4" asChild>
                        <Link href="/schools/knowledge-base/new">
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Create New Knowledge Base
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex justify-between items-center border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredKnowledgeBases.length} of {knowledgeBases ? knowledgeBases.length : 0} knowledge bases
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={() => {
                    setSearchQuery("");
                    setSubjectFilter("");
                    setGradeLevelFilter("");
                    setStatusFilter("");
                    setActiveTab("all");
                  }}>
                    Reset Filters
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}