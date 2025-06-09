import React, { useState, useEffect, useRef } from "react";
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
  FileUp,
  X,
  Check
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

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
const fileTypeIcons: Record<string, React.ReactNode> = {
  "PDF": <FileText className="h-10 w-10 text-red-500" />,
  "Document": <FileText className="h-10 w-10 text-blue-500" />,
  "Image": <FileText className="h-10 w-10 text-green-500" />,
  "Archive": <FileText className="h-10 w-10 text-yellow-500" />,
  "Audio": <FileText className="h-10 w-10 text-purple-500" />,
  "Video": <FileText className="h-10 w-10 text-pink-500" />,
  "Other": <FileText className="h-10 w-10 text-gray-500" />,
};

interface KnowledgeBaseFile {
  id: number;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  tags: string[];
  description: string;
}

export default function KnowledgeBaseDetailsPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("files");
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all-types");
  const [tagFilter, setTagFilter] = useState("all-tags");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadingFiles(Array.from(e.target.files));
    }
  };
  
  // Handle file upload button click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Remove a file from the upload list
  const removeFile = (index: number) => {
    setUploadingFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  // Simulate file upload process
  const uploadFiles = () => {
    if (uploadingFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsUploading(false);
            
            // Create new file objects to add to our sample files
            const newFiles = uploadingFiles.map((file, index) => ({
              id: sampleFiles.length + index + 1,
              name: file.name,
              type: getFileType(file.name),
              size: formatFileSize(file.size),
              uploadedAt: new Date().toISOString().split('T')[0],
              tags: ["Newly Uploaded", "User Content"],
              description: `User uploaded file: ${file.name}`
            }));
            
            // Add files to the knowledge base (in a real app, this would be done via API)
            sampleFiles.push(...newFiles);
            
            // Clear uploaded files and close dialog
            setUploadingFiles([]);
            setUploadOpen(false);
            
            toast({
              title: "Files Uploaded Successfully",
              description: `${uploadingFiles.length} files have been added to the knowledge base.`,
            });
          }, 500);
          return 100;
        }
        return prev + (Math.random() * 15);
      });
    }, 300);
  };
  
  // Helper function to determine file type based on extension
  const getFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    if (['pdf'].includes(ext)) return 'PDF';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'Document';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext)) return 'Image';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'Archive';
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'Audio';
    if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) return 'Video';
    
    return 'Other';
  };
  
  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  // Function to handle file downloads
  const handleFileDownload = (file: File) => {
    toast({
      title: "Download Started",
      description: `Preparing "${file.name}" (${file.size})`,
    });
    
    // Create a dummy content blob for the download
    // In a real app, this would be the actual file content from the server
    const dummyContent = `This is a placeholder file for ${file.name}.\n\n` +
      `Description: ${file.description}\n` +
      `Type: ${file.type}\n` +
      `Size: ${file.size}\n` +
      `Upload Date: ${file.uploadedAt}\n` +
      `Tags: ${file.tags.join(', ')}\n\n` +
      `This file is part of the Antoinette Brown Blackwell Collection.`;
    
    // Create a blob from the content
    const blob = new Blob([dummyContent], { type: 'text/plain' });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create an anchor element for download
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    
    // Trigger the download
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Complete",
        description: `"${file.name}" has been downloaded successfully.`,
      });
    }, 500);
  };
  
  // Function to handle bulk downloads
  const handleBulkDownload = () => {
    toast({
      title: "Bulk Download Started",
      description: "Preparing all files for download. This may take a moment.",
    });
    
    // Create content for our zip manifest file
    const manifestContent = "Antoinette Brown Blackwell Collection\n\n" +
      "Files included in this package:\n" +
      files.map(file => `- ${file.name} (${file.size}): ${file.description}`).join('\n') + 
      "\n\nDownloaded on: " + new Date().toLocaleString();
    
    // Create a manifest text file
    const manifestBlob = new Blob([manifestContent], { type: 'text/plain' });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    
    // Create an anchor element for download
    const a = document.createElement('a');
    a.href = manifestUrl;
    a.download = "Antoinette_Brown_Blackwell_Collection_Manifest.txt";
    document.body.appendChild(a);
    
    // Trigger the download
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(manifestUrl);
      
      toast({
        title: "Download Complete",
        description: "The collection manifest has been downloaded. In a real application, this would be a complete ZIP archive.",
      });
    }, 500);
  };
  
  // Fetch knowledge base details based on ID
  const { data: knowledgeBase, isLoading, error } = useQuery({
    queryKey: [`/api/knowledge-bases/${id}`],
    enabled: !!id,
  });

  // Transform the fetched knowledge base data to match UI expectations
  const displayKnowledgeBase = knowledgeBase ? {
    id: knowledgeBase.id,
    title: knowledgeBase.title,
    description: knowledgeBase.description,
    subjectArea: knowledgeBase.subject,
    gradeLevel: knowledgeBase.difficulty ? [knowledgeBase.difficulty] : ["All Levels"],
    status: knowledgeBase.isPublic ? "Published" : "Draft",
    visibility: knowledgeBase.isPublic ? "Public" : "Private",
    fileCount: knowledgeBase.files ? knowledgeBase.files.length : 0,
    size: "N/A", 
    createdAt: knowledgeBase.createdAt ? new Date(knowledgeBase.createdAt).toLocaleDateString() : 'N/A',
    updatedAt: knowledgeBase.updatedAt ? new Date(knowledgeBase.updatedAt).toLocaleDateString() : 'N/A',
    tags: knowledgeBase.metadata?.tags || [],
    creator: "Admin",
    rating: 4.5,
    usageCount: knowledgeBase.downloadCount || 0,
    files: knowledgeBase.files || []
  } : null;

  // Use files from the knowledge base data
  const files = displayKnowledgeBase?.files || [];

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

  if (error || !displayKnowledgeBase) {
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
      {/* Hidden file input for uploads */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileSelect}
      />
      
      {/* File upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Add files to the {knowledgeBase.title} knowledge base.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {uploadingFiles.length === 0 ? (
              <div 
                className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={handleUploadClick}
              >
                <FileUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Click to select files</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  or drag and drop files here
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Images, and other document formats accepted
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">
                    {uploadingFiles.length} {uploadingFiles.length === 1 ? 'file' : 'files'} selected
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleUploadClick}>
                    Add More
                  </Button>
                </div>
                
                <ScrollArea className="h-[200px] rounded-md border p-2">
                  <div className="space-y-2">
                    {uploadingFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {file.name.endsWith('.pdf') ? (
                            <FileText className="h-8 w-8 text-red-500" />
                          ) : file.name.match(/\.(doc|docx|txt|rtf)$/i) ? (
                            <FileText className="h-8 w-8 text-blue-500" />
                          ) : file.name.match(/\.(jpg|jpeg|png|gif|bmp|svg)$/i) ? (
                            <FileText className="h-8 w-8 text-green-500" />
                          ) : (
                            <FileText className="h-8 w-8 text-gray-500" />
                          )}
                          <div className="truncate">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeFile(index)}
                          disabled={isUploading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                
                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setUploadOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={uploadFiles}
              disabled={uploadingFiles.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {uploadingFiles.length} {uploadingFiles.length === 1 ? 'file' : 'files'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                <DropdownMenuItem onClick={handleBulkDownload}>
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
                        <Button variant="outline" className="w-full justify-start" onClick={() => setUploadOpen(true)}>
                          <FilePlus className="mr-2 h-4 w-4" />
                          Add Files
                        </Button>
                        <Button variant="outline" className="w-full justify-start">
                          <Share className="mr-2 h-4 w-4" />
                          Share
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={handleBulkDownload}>
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
                    <Button size="sm" onClick={() => setUploadOpen(true)}>
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
                      <Button onClick={() => setUploadOpen(true)}>
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
                                <DropdownMenuItem onClick={() => handleFileDownload(file)}>
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
                                <DropdownMenuItem onClick={() => handleFileDownload(file)}>
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