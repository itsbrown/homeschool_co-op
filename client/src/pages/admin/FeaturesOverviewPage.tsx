import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  BookOpen, School, Users, Calendar, Database, FileText, FilePlus, Brain, 
  Layers, KeyRound, UserPlus, Workflow, Zap, PenTool, BarChart, FileSpreadsheet
} from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";

// Core Platform Features
const platformFeatures = [
  {
    id: "user-management",
    title: "User Management",
    description: "Comprehensive registration and role-based access",
    icon: <Users className="h-6 w-6 text-blue-500" />,
    badges: ["Core", "Identity"],
    details: [
      "Role-based access control (Super Admin, Admin, School Admin, Teacher, Parent, Student)",
      "User registration and profile management",
      "Parent-child account association",
      "School staff management and invitations",
      "Staff position customization",
      "Bulk user import capabilities"
    ]
  },
  {
    id: "school-management",
    title: "School Management",
    description: "Complete school administration system",
    icon: <School className="h-6 w-6 text-green-500" />,
    badges: ["Core", "Admin"],
    details: [
      "School registration and profile management",
      "Campus and location management",
      "School branding and customization",
      "Department and organizational structure",
      "Multi-school support for districts and co-ops",
      "School policies and documentation"
    ]
  },
  {
    id: "curriculum-management",
    title: "Curriculum Management",
    description: "Educational content organization and delivery",
    icon: <BookOpen className="h-6 w-6 text-purple-500" />,
    badges: ["Core", "Education"],
    details: [
      "Curriculum creation and customization",
      "Standards alignment and tracking",
      "Unit and lesson sequencing",
      "Content tagging and organization",
      "Curriculum sharing across schools",
      "Curriculum versioning and history"
    ]
  },
  {
    id: "class-management",
    title: "Class Management",
    description: "Class creation, scheduling, and enrollment",
    icon: <Calendar className="h-6 w-6 text-amber-500" />,
    badges: ["Core", "Operation"],
    details: [
      "Class creation and management",
      "Scheduling and calendar integration", 
      "Enrollment management and tracking",
      "Class-specific resources and materials",
      "Attendance tracking",
      "Pricing and payment management"
    ]
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base",
    description: "Educational resource repository and management",
    icon: <Database className="h-6 w-6 text-indigo-500" />,
    badges: ["Core", "Content"],
    details: [
      "Content repository for educational resources",
      "Document and file management",
      "Metadata tagging and organization",
      "Access control (private, school, public)",
      "Resource versioning and updates",
      "Resource marketplace"
    ]
  },
];

// AI-powered Features
const aiFeatures = [
  {
    id: "lesson-generator",
    title: "AI Lesson Generator",
    description: "Create comprehensive lessons with AI assistance",
    icon: <FilePlus className="h-6 w-6 text-cyan-500" />,
    badges: ["AI", "Education"],
    details: [
      "Customizable lesson plan generation",
      "Content adaptation for different grade levels",
      "Standards-aligned content creation",
      "Multiple learning modality support",
      "Integrated with Knowledge Base content",
      "Editable AI-generated content"
    ]
  },
  {
    id: "worksheet-generator",
    title: "AI Worksheet Generator",
    description: "Create educational worksheets and activities",
    icon: <FileText className="h-6 w-6 text-red-500" />,
    badges: ["AI", "Content"],
    details: [
      "Generates coloring books with educational themes",
      "Creates crossword puzzles from educational content",
      "Produces spot-the-difference visual activities",
      "Word search and vocabulary exercises",
      "Math worksheets with custom difficulty levels",
      "Automatic PDF generation and downloading"
    ]
  },
  {
    id: "enrollment-assistant",
    title: "AI Enrollment Assistant",
    description: "Helps parents find suitable programs",
    icon: <Brain className="h-6 w-6 text-emerald-500" />,
    badges: ["AI", "Parent"],
    details: [
      "Conversational interface for program recommendations",
      "Personalized class suggestions based on student profile",
      "Answers questions about curriculum and classes",
      "Helps with registration process",
      "Available immediately after parent login",
      "Grok-inspired interface with sample prompts"
    ]
  },
  {
    id: "ocr-processing",
    title: "Document AI OCR",
    description: "Extract content from educational documents",
    icon: <Layers className="h-6 w-6 text-orange-500" />,
    badges: ["AI", "Integration"],
    details: [
      "Extract text from scanned documents",
      "Process educational materials into digital format",
      "Feed extracted content into Knowledge Base",
      "Support for various document formats",
      "Integrated with Google Cloud Document AI",
      "Batch processing capabilities"
    ]
  },
];

// Learning Management Features
const lmsFeatures = [
  {
    id: "assignment-management",
    title: "Assignment Management",
    description: "Create, distribute, and track assignments",
    icon: <PenTool className="h-6 w-6 text-pink-500" />,
    badges: ["Education", "Tracking"],
    details: [
      "Assignment creation and distribution",
      "Due date management and reminders",
      "Assignment submission and tracking",
      "Grading and feedback tools",
      "Assignment templates and batch creation",
      "Integration with AI-generated content"
    ]
  },
  {
    id: "enrollment-management",
    title: "Enrollment Management",
    description: "Student registration and class enrollment",
    icon: <UserPlus className="h-6 w-6 text-blue-700" />,
    badges: ["Admin", "Operation"],
    details: [
      "Student registration in classes",
      "Waitlist management",
      "Prerequisites verification",
      "Enrollment reporting",
      "Parent-managed enrollment",
      "Early bird and discount management"
    ]
  },
  {
    id: "adaptive-learning",
    title: "Adaptive Learning Engine",
    description: "Personalized learning pathways",
    icon: <Workflow className="h-6 w-6 text-violet-500" />,
    badges: ["AI", "Education"],
    details: [
      "Personalized learning paths based on student performance",
      "Adaptive content difficulty",
      "Learning style detection and adaptation",
      "Progress tracking and adjustment",
      "Remediation recommendations",
      "Advanced concept introduction based on mastery"
    ]
  },
  {
    id: "learning-analytics",
    title: "Learning Analytics",
    description: "Track and analyze educational performance",
    icon: <BarChart className="h-6 w-6 text-teal-500" />,
    badges: ["Data", "Reporting"],
    details: [
      "Student performance tracking",
      "Class-level analytics",
      "School-wide performance dashboards",
      "Progress reporting for parents",
      "Learning gap identification",
      "Predictive analytics for student outcomes"
    ]
  },
];

// Administrative Features
const adminFeatures = [
  {
    id: "access-control",
    title: "Role-Based Access Control",
    description: "Granular permission management",
    icon: <KeyRound className="h-6 w-6 text-gray-700" />,
    badges: ["Security", "Admin"],
    details: [
      "Hierarchical role structure",
      "Granular permission assignment",
      "Custom role creation",
      "Feature-level access control",
      "Content-level permissions",
      "Audit logging of permission changes"
    ]
  },
  {
    id: "integrations",
    title: "Third-Party Integrations",
    description: "Connect with external educational tools",
    icon: <Zap className="h-6 w-6 text-amber-700" />,
    badges: ["Extension", "API"],
    details: [
      "Google Workspace integration",
      "Calendar systems integration",
      "Payment processor connections (Stripe)",
      "AI service providers (OpenAI, Anthropic, Google)",
      "Document processing services",
      "Video conferencing integration"
    ]
  },
  {
    id: "reporting",
    title: "Reporting System",
    description: "Comprehensive data reporting capabilities",
    icon: <FileSpreadsheet className="h-6 w-6 text-green-700" />,
    badges: ["Data", "Admin"],
    details: [
      "Customizable report templates",
      "Scheduled report generation",
      "Export in multiple formats (PDF, Excel, CSV)",
      "Visual data representation",
      "Custom filtering and parameters",
      "Shareable report links"
    ]
  },
];

export default function FeaturesOverviewPage() {
  return (
    <AdminLayout pageTitle="Platform Features">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">Platform Features</h1>
        <p className="text-muted-foreground mb-8">
          Comprehensive overview of all features in the ASA Platform
        </p>
        
        <Tabs defaultValue="core">
          <TabsList className="mb-6">
            <TabsTrigger value="core">Core Platform</TabsTrigger>
            <TabsTrigger value="ai">AI-Powered Features</TabsTrigger>
            <TabsTrigger value="lms">Learning Management</TabsTrigger>
            <TabsTrigger value="admin">Administrative</TabsTrigger>
          </TabsList>
          
          {/* Core Platform Features Tab */}
          <TabsContent value="core">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {platformFeatures.map((feature) => (
                <Card key={feature.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {feature.icon}
                        <CardTitle>{feature.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {feature.badges.map((badge, i) => (
                        <Badge key={i} variant="outline">{badge}</Badge>
                      ))}
                    </div>
                    <CardDescription className="mt-2">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="details">
                        <AccordionTrigger className="text-sm">Feature details</AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {feature.details.map((detail, index) => (
                              <li key={index}>{detail}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          {/* AI-Powered Features Tab */}
          <TabsContent value="ai">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {aiFeatures.map((feature) => (
                <Card key={feature.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {feature.icon}
                        <CardTitle>{feature.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {feature.badges.map((badge, i) => (
                        <Badge key={i} variant="outline">{badge}</Badge>
                      ))}
                    </div>
                    <CardDescription className="mt-2">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="details">
                        <AccordionTrigger className="text-sm">Feature details</AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {feature.details.map((detail, index) => (
                              <li key={index}>{detail}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          {/* Learning Management Features Tab */}
          <TabsContent value="lms">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {lmsFeatures.map((feature) => (
                <Card key={feature.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {feature.icon}
                        <CardTitle>{feature.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {feature.badges.map((badge, i) => (
                        <Badge key={i} variant="outline">{badge}</Badge>
                      ))}
                    </div>
                    <CardDescription className="mt-2">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="details">
                        <AccordionTrigger className="text-sm">Feature details</AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {feature.details.map((detail, index) => (
                              <li key={index}>{detail}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          {/* Administrative Features Tab */}
          <TabsContent value="admin">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {adminFeatures.map((feature) => (
                <Card key={feature.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {feature.icon}
                        <CardTitle>{feature.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {feature.badges.map((badge, i) => (
                        <Badge key={i} variant="outline">{badge}</Badge>
                      ))}
                    </div>
                    <CardDescription className="mt-2">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="details">
                        <AccordionTrigger className="text-sm">Feature details</AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {feature.details.map((detail, index) => (
                              <li key={index}>{detail}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}