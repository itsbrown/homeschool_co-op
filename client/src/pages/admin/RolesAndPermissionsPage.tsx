import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  User, Shield, BookOpen, School, CalendarDays, FileText, Database, 
  Users, UserCheck, UserPlus, FileUp, Settings, CheckCircle, XCircle
} from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";

// Role definitions
const roles = [
  {
    id: "superAdmin",
    name: "Super Administrator",
    description: "Complete access to all platform features and configuration",
    icon: <Shield className="h-5 w-5 text-red-500" />,
    badges: ["System Level", "Full Access"],
  },
  {
    id: "admin",
    name: "Administrator",
    description: "Administrative access to manage users, content, and school operations",
    icon: <User className="h-5 w-5 text-blue-500" />,
    badges: ["Platform Level"],
  },
  {
    id: "schoolAdmin",
    name: "School Administrator",
    description: "Manages a specific school's staff, classes, and resources",
    icon: <School className="h-5 w-5 text-green-500" />,
    badges: ["School Level"],
  },
  {
    id: "teacher",
    name: "Teacher",
    description: "Creates and delivers educational content to students",
    icon: <BookOpen className="h-5 w-5 text-purple-500" />,
    badges: ["Class Level"],
  },
  {
    id: "parent",
    name: "Parent",
    description: "Manages child accounts and enrollments",
    icon: <Users className="h-5 w-5 text-amber-500" />,
    badges: ["Family Level"],
  },
  {
    id: "student",
    name: "Student",
    description: "Accesses educational content and participates in learning activities",
    icon: <User className="h-5 w-5 text-cyan-500" />,
    badges: ["Individual"],
  },
];

// Feature categories
const featureCategories = [
  {
    id: "content",
    name: "Content Management",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: "school",
    name: "School Administration",
    icon: <School className="h-5 w-5" />,
  },
  {
    id: "class",
    name: "Class Management",
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    id: "kb",
    name: "Knowledge Base",
    icon: <Database className="h-5 w-5" />,
  },
  {
    id: "user",
    name: "User Management",
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: "ai",
    name: "AI Tools",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "system",
    name: "System Configuration",
    icon: <Settings className="h-5 w-5" />,
  },
];

// Features with permissions
const features = [
  // Content Management
  {
    id: "createLesson",
    name: "Create Lessons",
    category: "content",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "full",
      teacher: "full",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "createCurriculum",
    name: "Create Curriculum",
    category: "content",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "full",
      teacher: "limited",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "editContent",
    name: "Edit Content",
    category: "content",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "viewContent",
    name: "View Content",
    category: "content",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "school",
      parent: "child",
      student: "assigned",
    },
  },
  
  // School Administration
  {
    id: "createSchool",
    name: "Create Schools",
    category: "school",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "none",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "manageSchool",
    name: "Manage School Details",
    category: "school",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "own",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "manageStaff",
    name: "Manage Staff",
    category: "school",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "own",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  
  // Class Management
  {
    id: "createClass",
    name: "Create Classes",
    category: "class",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "enrollStudents",
    name: "Enroll Students",
    category: "class",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "child",
      student: "none",
    },
  },
  {
    id: "manageClasses",
    name: "Manage Classes",
    category: "class",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "viewClassProgress",
    name: "View Class Progress",
    category: "class",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "child",
      student: "own",
    },
  },
  
  // Knowledge Base
  {
    id: "createKB",
    name: "Create Knowledge Base",
    category: "kb",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "limited",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "manageKB",
    name: "Manage Knowledge Base",
    category: "kb",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "own",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "viewKB",
    name: "View Knowledge Base",
    category: "kb",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "school",
      parent: "public",
      student: "public",
    },
  },
  
  // User Management
  {
    id: "createUsers",
    name: "Create Users",
    category: "user",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "none",
      parent: "child",
      student: "none",
    },
  },
  {
    id: "manageUserRoles",
    name: "Manage User Roles",
    category: "user",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "manageParents",
    name: "Manage Parent Accounts",
    category: "user",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "none",
      parent: "own",
      student: "none",
    },
  },
  {
    id: "manageStudents",
    name: "Manage Student Accounts",
    category: "user",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "class",
      parent: "child",
      student: "none",
    },
  },
  
  // AI Tools
  {
    id: "generateLessons",
    name: "AI Lesson Generation",
    category: "ai",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "full",
      teacher: "limited",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "generateWorksheets",
    name: "AI Worksheet Generation",
    category: "ai",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "full",
      teacher: "limited",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "useOCR",
    name: "OCR Document Processing",
    category: "ai",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "limited",
      teacher: "limited",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "useEnrollmentAssistant",
    name: "AI Enrollment Assistant",
    category: "ai",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "view",
      teacher: "none",
      parent: "use",
      student: "none",
    },
  },
  
  // System Configuration
  {
    id: "systemSettings",
    name: "System Settings",
    category: "system",
    permissions: {
      superAdmin: "full",
      admin: "limited",
      schoolAdmin: "none",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "manageIntegrations",
    name: "Manage Integrations",
    category: "system",
    permissions: {
      superAdmin: "full",
      admin: "view",
      schoolAdmin: "none",
      teacher: "none",
      parent: "none",
      student: "none",
    },
  },
  {
    id: "viewAnalytics",
    name: "View Analytics",
    category: "system",
    permissions: {
      superAdmin: "full",
      admin: "full",
      schoolAdmin: "school",
      teacher: "class",
      parent: "child",
      student: "own",
    },
  },
];

// Permission level explanations
const permissionLevels = {
  full: "Complete access with no restrictions",
  limited: "Access with some restrictions",
  school: "Access limited to their school",
  own: "Access limited to their own created content",
  class: "Access limited to their assigned classes",
  child: "Access limited to their children",
  assigned: "Access limited to assigned content",
  public: "Access to public resources only",
  view: "View-only access",
  use: "Can use but not configure",
  none: "No access"
};

// Helper function to get permission badge
const getPermissionBadge = (permission: string) => {
  switch(permission) {
    case "full":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Full Access</Badge>;
    case "limited":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Limited</Badge>;
    case "school":
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200">School Only</Badge>;
    case "own":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Own Content</Badge>;
    case "class":
      return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Class Only</Badge>;
    case "child":
      return <Badge className="bg-pink-100 text-pink-800 border-pink-200">Child Only</Badge>;
    case "assigned":
      return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200">Assigned Only</Badge>;
    case "public":
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Public Only</Badge>;
    case "view":
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">View Only</Badge>;
    case "use":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Use Only</Badge>;
    case "none":
      return <Badge className="bg-red-100 text-red-800 border-red-200">No Access</Badge>;
    default:
      return <Badge>Unknown</Badge>;
  }
};

// Helper function for simple yes/no permission indicator
const getPermissionIndicator = (permission: string) => {
  if (permission === "none") {
    return <XCircle className="h-5 w-5 text-red-500" />;
  } else {
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  }
};

export default function RolesAndPermissionsPage() {
  return (
    <AdminLayout pageTitle="Roles & Permissions">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">Roles & Permissions Overview</h1>
        <p className="text-muted-foreground mb-8">
          Comprehensive guide to user roles and feature permissions in the ASA Platform
        </p>
        
        <Tabs defaultValue="roles">
          <TabsList className="mb-6">
            <TabsTrigger value="roles">User Roles</TabsTrigger>
            <TabsTrigger value="features">Feature Access</TabsTrigger>
            <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
          </TabsList>
          
          {/* User Roles Tab */}
          <TabsContent value="roles">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role) => (
                <Card key={role.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      {role.icon}
                      <CardTitle>{role.name}</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {role.badges.map((badge, i) => (
                        <Badge key={i} variant="outline">{badge}</Badge>
                      ))}
                    </div>
                    <CardDescription>{role.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <h4 className="font-medium text-sm mb-2">Key Capabilities:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {features
                        .filter(feature => 
                          feature.permissions[role.id as keyof typeof feature.permissions] !== "none")
                        .slice(0, 5)
                        .map(feature => (
                          <li key={feature.id}>{feature.name}</li>
                        ))
                      }
                      {features.filter(feature => 
                        feature.permissions[role.id as keyof typeof feature.permissions] !== "none").length > 5 && (
                        <li className="text-muted-foreground">And more...</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          {/* Feature Access Tab */}
          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle>Feature Access By Role</CardTitle>
                <CardDescription>
                  Detailed breakdown of which roles can access each feature
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Feature</TableHead>
                        <TableHead className="text-center">Super Admin</TableHead>
                        <TableHead className="text-center">Admin</TableHead>
                        <TableHead className="text-center">School Admin</TableHead>
                        <TableHead className="text-center">Teacher</TableHead>
                        <TableHead className="text-center">Parent</TableHead>
                        <TableHead className="text-center">Student</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {features.map((feature) => (
                        <TableRow key={feature.id}>
                          <TableCell className="font-medium">{feature.name}</TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.superAdmin)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.admin)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.schoolAdmin)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.teacher)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.parent)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPermissionIndicator(feature.permissions.student)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Permission Matrix Tab */}
          <TabsContent value="matrix">
            <Card>
              <CardHeader>
                <CardTitle>Permission Matrix</CardTitle>
                <CardDescription>
                  Detailed view of permission levels for each feature by role
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Feature</TableHead>
                        <TableHead>Super Admin</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>School Admin</TableHead>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Student</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {features.map((feature) => (
                        <TableRow key={feature.id}>
                          <TableCell className="font-medium">{feature.name}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.superAdmin)}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.admin)}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.schoolAdmin)}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.teacher)}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.parent)}</TableCell>
                          <TableCell>{getPermissionBadge(feature.permissions.student)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* By Category Tab */}
          <TabsContent value="categories">
            <div className="space-y-8">
              {featureCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {category.icon}
                      <CardTitle>{category.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[240px]">Feature</TableHead>
                          <TableHead>Super Admin</TableHead>
                          <TableHead>Admin</TableHead>
                          <TableHead>School Admin</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead>Parent</TableHead>
                          <TableHead>Student</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {features
                          .filter(feature => feature.category === category.id)
                          .map((feature) => (
                            <TableRow key={feature.id}>
                              <TableCell className="font-medium">{feature.name}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.superAdmin)}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.admin)}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.schoolAdmin)}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.teacher)}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.parent)}</TableCell>
                              <TableCell>{getPermissionBadge(feature.permissions.student)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
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