import React, { useState, useEffect } from "react";
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
  
  // Initialize the Antoinette Brown Blackwell record if not already present
  useEffect(() => {
    // Check if localStorage has the Antoinette Brown Blackwell record
    const existingData = localStorage.getItem('knowledgeBases');
    let hasAntoinette = false;
    
    if (existingData) {
      try {
        const knowledgeBases = JSON.parse(existingData);
        hasAntoinette = knowledgeBases.some(kb => kb.title.includes("Antoinette Brown Blackwell"));
      } catch (e) {
        console.error('Error parsing knowledge bases:', e);
      }
    }
    
    // If Antoinette record doesn't exist, create it
    if (!hasAntoinette) {
      const antoinetteKB = {
        id: 9999,
        title: "Antoinette Brown Blackwell Collection",
        description: "Historical documents describing the life and impact of Antoinette Brown Blackwell, the first woman ordained as a minister in the United States.",
        subjectArea: "History",
        gradeLevel: ["3-5", "6-8"],
        status: "Published",
        visibility: "School",
        fileCount: 24,
        size: "72 MB",
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
        tags: ["History", "Women's Rights", "Religion", "Abolitionism"],
        creator: "School Admin",
        rating: 4.5,
        usageCount: 12
      };
      
      // Save to localStorage (either as a new array or append to existing)
      try {
        const knowledgeBases = existingData ? JSON.parse(existingData) : [];
        knowledgeBases.push(antoinetteKB);
        localStorage.setItem('knowledgeBases', JSON.stringify(knowledgeBases));
        console.log('Added Antoinette Brown Blackwell knowledge base');
      } catch (e) {
        console.error('Error saving knowledge base:', e);
        localStorage.setItem('knowledgeBases', JSON.stringify([antoinetteKB]));
      }
    }
  }, []);

  // Fetch knowledge bases for the school
  const { data: knowledgeBases, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/schools/knowledge-bases'],
    queryFn: async () => {
      // For now, combine sample data with any locally stored knowledge bases
      let localKbs = [];
      try {
        const storedData = localStorage.getItem('knowledgeBases');
        if (storedData) {
          localKbs = JSON.parse(storedData);
          console.log('Local knowledge bases loaded:', localKbs);
        }
      } catch (e) {
        console.error('Error parsing knowledge bases:', e);
      }
      
      const combined = [...sampleKnowledgeBases, ...localKbs];
      console.log('Combined knowledge bases:', combined);
      return combined;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always refetch when component mounts
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
      (kb.tags && Array.isArray(kb.tags) && kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    const matchesSubject = subjectFilter === "" || kb.subjectArea === subjectFilter;
    const matchesGradeLevel = gradeLevelFilter === "" || 
      (kb.gradeLevel && Array.isArray(kb.gradeLevel) && 
        kb.gradeLevel.some(gl => gl.includes(gradeLevelFilter)));
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
  const subjects = knowledgeBases ? Array.from(new Set(knowledgeBases.map(kb => kb.subjectArea))) : [];
  const gradeLevels = ["K-2", "3-5", "6-8", "9-12"];
  const statuses = knowledgeBases ? Array.from(new Set(knowledgeBases.map(kb => kb.status))) : [];

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
                        <SelectItem value="">All Subjects</SelectItem>
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
                              {kb.gradeLevel && kb.gradeLevel.map((grade, i) => (
                                <Badge key={i} variant="outline">Grades {grade}</Badge>
                              ))}
                            </div>
                            <h3 className="text-xl font-bold mb-2">{kb.title}</h3>
                            <p className="text-muted-foreground mb-4">{kb.description}</p>
                            
                            <div className="flex flex-wrap gap-1 mb-4">
                              {kb.tags && kb.tags.map((tag, i) => (
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
                                <span>Updated {kb.updatedAt}</span>
                              </div>
                              <div className="flex items-center">
                                <Eye className="w-4 h-4 mr-1" />
                                <span>{kb.usageCount} uses</span>
                              </div>
                              {kb.rating > 0 && (
                                <div className="flex items-center">
                                  <Star className="w-4 h-4 mr-1 text-yellow-500 fill-yellow-500" />
                                  <span>{kb.rating}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="md:w-1/3 bg-muted/20 p-6 flex flex-col justify-between">
                            <div>
                              <p className="text-sm font-medium mb-1">Created by</p>
                              <p className="text-muted-foreground mb-6">{kb.creator}</p>
                            </div>
                            
                            <div className="space-y-3">
                              <Button className="w-full" asChild>
                                <Link href={`/schools/knowledge-base/${kb.id}`}>
                                  View Details
                                </Link>
                              </Button>
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" className="w-full">
                                    Actions
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[200px]">
                                  <DropdownMenuItem>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download All Files
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Browse Files
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>
                                    <Tag className="mr-2 h-4 w-4" />
                                    Edit Tags
                                  </DropdownMenuItem>
                                  {kb.status !== "Published" && (
                                    <DropdownMenuItem>
                                      <Upload className="mr-2 h-4 w-4" />
                                      Publish
                                    </DropdownMenuItem>
                                  )}
                                  {kb.status === "Published" && (
                                    <DropdownMenuItem>
                                      <Upload className="mr-2 h-4 w-4" />
                                      Unpublish
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No knowledge bases found</h3>
                      <p className="text-muted-foreground mb-6">
                        {searchQuery || subjectFilter || gradeLevelFilter || statusFilter || activeTab !== "all" 
                          ? "No results match your current filters. Try adjusting your search criteria."
                          : "Start by creating a new knowledge base or importing existing resources."}
                      </p>
                      <Button asChild>
                        <Link href="/schools/knowledge-base/new">
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Create Knowledge Base
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}