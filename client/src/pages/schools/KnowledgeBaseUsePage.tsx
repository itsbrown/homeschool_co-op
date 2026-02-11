import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  Loader2,
  ArrowLeft,
  FileText,
  BookOpen,
  Sparkles,
  Clock,
  Tag,
  Eye,
  Star,
  Copy,
  CheckCircle,
  GraduationCap,
  Lightbulb,
  Brain,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";

interface KnowledgeBaseData {
  id: number;
  title: string;
  description: string;
  subjectArea: string;
  gradeLevel: string[];
  status: string;
  isPublic: boolean;
  fileCount: number;
  size: string;
  tags: string[];
  creator: string;
  rating: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  files?: Array<{
    id: number;
    name: string;
    type: string;
    size: string;
    uploadedAt: string;
    tags: string[];
    description: string;
  }>;
}

export default function KnowledgeBaseUsePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: knowledgeBase, isLoading, error } = useQuery<KnowledgeBaseData>({
    queryKey: ["/api/knowledge-bases", id],
    enabled: !!id,
  });

  const handleCopyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName);
      toast({
        title: "Copied",
        description: `${fieldName} copied to clipboard.`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const handleGenerateLesson = () => {
    const params = new URLSearchParams();
    if (knowledgeBase) {
      params.set("knowledgeBaseId", String(knowledgeBase.id));
      if (knowledgeBase.subjectArea) {
        params.set("subject", knowledgeBase.subjectArea);
      }
      if (knowledgeBase.gradeLevel?.length > 0) {
        params.set("gradeLevel", knowledgeBase.gradeLevel[0]);
      }
    }
    setLocation(`/lessons/ai-generator?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Use in Lesson">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !knowledgeBase) {
    return (
      <SchoolAdminLayout pageTitle="Use in Lesson">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/schools/knowledge-base">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Knowledge Bases
            </Link>
          </Button>
          <Card>
            <CardContent className="flex flex-col items-center justify-center min-h-[300px] text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Knowledge Base Not Found</h3>
              <p className="text-muted-foreground mt-2">
                The knowledge base you're looking for doesn't exist or you don't have access to it.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/schools/knowledge-base">Browse Knowledge Bases</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  const files = knowledgeBase.files || [];

  return (
    <SchoolAdminLayout pageTitle="Use in Lesson">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/schools/knowledge-base/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Knowledge Base
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{knowledgeBase.title}</CardTitle>
                    <CardDescription>{knowledgeBase.description}</CardDescription>
                  </div>
                  <Badge variant={knowledgeBase.isPublic ? "default" : "secondary"}>
                    {knowledgeBase.isPublic ? "Published" : "Draft"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {knowledgeBase.subjectArea && (
                    <Badge variant="outline">{knowledgeBase.subjectArea}</Badge>
                  )}
                  {knowledgeBase.gradeLevel?.map((grade: string) => (
                    <Badge key={grade} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {grade}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{knowledgeBase.fileCount || files.length} files</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span>{knowledgeBase.usageCount || 0} uses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{knowledgeBase.updatedAt ? new Date(knowledgeBase.updatedAt).toLocaleDateString() : "N/A"}</span>
                  </div>
                  {knowledgeBase.rating > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>{knowledgeBase.rating}</span>
                    </div>
                  )}
                </div>

                {knowledgeBase.tags && knowledgeBase.tags.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {knowledgeBase.tags.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Available Content</CardTitle>
                  <CardDescription>
                    Files and resources in this knowledge base that can be used for lesson planning
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            {file.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {file.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{file.type}</span>
                              <span className="text-xs text-muted-foreground">{file.size}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            handleCopyToClipboard(
                              `${file.name}: ${file.description || ""}`,
                              file.name
                            )
                          }
                        >
                          {copiedField === file.name ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Use in Lesson
                </CardTitle>
                <CardDescription>
                  Choose how you'd like to use this knowledge base in your teaching
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" onClick={handleGenerateLesson}>
                  <Brain className="h-4 w-4 mr-2" />
                  Generate AI Lesson Plan
                </Button>
                <p className="text-xs text-muted-foreground px-1">
                  Create a complete lesson plan using AI, pre-filled with this knowledge base's subject and grade level.
                </p>

                <Separator />

                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/lessons">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Browse Existing Lessons
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground px-1">
                  Find existing lessons to attach this knowledge base's content to.
                </p>

                <Separator />

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleCopyToClipboard(
                      `Title: ${knowledgeBase.title}\nSubject: ${knowledgeBase.subjectArea}\nGrade: ${knowledgeBase.gradeLevel?.join(", ")}\nDescription: ${knowledgeBase.description}\nTags: ${knowledgeBase.tags?.join(", ")}`,
                      "Knowledge Base Summary"
                    )
                  }
                >
                  {copiedField === "Knowledge Base Summary" ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  Copy Summary for Lesson Notes
                </Button>
                <p className="text-xs text-muted-foreground px-1">
                  Copy this knowledge base's details to paste into your lesson notes.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  Quick Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <GraduationCap className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Use the AI generator to quickly create lesson plans aligned with this knowledge base's content.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Copy file descriptions to reference specific materials in your lesson activities.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Tag className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Tags can help you find related knowledge bases for cross-curricular lessons.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}
