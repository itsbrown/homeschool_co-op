import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, MapPin, Phone, Mail, Globe, School as SchoolIcon, Calendar, Users, BookOpen, ChevronLeft, Menu } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// School data interface
interface SchoolData {
  id: number;
  name: string;
  type: string;
  address?: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  logo?: string | null;
  description?: string;
  foundedYear?: number;
  accreditation?: string | null;
  enrollmentSize?: number;
  adminId: number;
  status: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string | Date;
}

// Simple Dashboard Layout Component
const SimpleDashboard = ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  
  // School admin navigation
  const schoolNavItems = [
    {
      title: 'My School',
      href: '/schools/my-school',
      icon: <SchoolIcon className="h-5 w-5" />,
    },
    {
      title: 'Classes',
      href: '/schools/classes',
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      title: 'Staff',
      href: '/schools/staff',
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: 'Students',
      href: '/schools/students',
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: 'Knowledge Base',
      href: '/schools/knowledge-base',
      icon: <BookOpen className="h-5 w-5" />,
    },
  ];

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        {/* Sidebar header */}
        <div className="p-4 flex items-center justify-between border-b">
          {sidebarOpen && (
            <h2 className="text-xl font-bold">School Admin</h2>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="ml-auto"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-2">
            {schoolNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center px-2 py-3 rounded-lg transition-colors",
                  location === item.href
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100",
                  !sidebarOpen && "justify-center"
                )}
              >
                {item.icon}
                {sidebarOpen && <span className="ml-3">{item.title}</span>}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 py-3 flex items-center">
            <h1 className="text-2xl font-semibold text-gray-800">{pageTitle}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};

// Main school page component
export default function MySchoolPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  
  // Fetch the school information for the logged-in school admin
  const { data: school, isLoading, error, refetch } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user,
    staleTime: 60000, // 1 minute stale time
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Error fetching school data",
        description: "There was an error loading your school information.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  if (isLoading) {
    return (
      <SimpleDashboard pageTitle="My School">
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading school information...</span>
        </div>
      </SimpleDashboard>
    );
  }

  if (!school) {
    return (
      <SimpleDashboard pageTitle="My School">
        <div className="max-w-3xl mx-auto my-8">
          <Card>
            <CardHeader>
              <CardTitle>No School Found</CardTitle>
              <CardDescription>
                You don't have any schools associated with your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Please register a school or contact an administrator for assistance.
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild>
                <Link href="/schools/register">Register a School</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SimpleDashboard>
    );
  }

  return (
    <SimpleDashboard pageTitle={school.name}>
      <div className="max-w-6xl mx-auto my-8">
        {/* School Overview Card */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                {school.logo ? (
                  <AvatarImage src={school.logo} alt={school.name} />
                ) : (
                  <AvatarFallback className="text-lg">
                    {school.name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{school.name}</CardTitle>
                <div className="flex items-center mt-1 space-x-2">
                  <Badge variant="secondary">{school.type}</Badge>
                  <Badge variant={school.status === "active" ? "success" : "default"}>
                    {school.status.charAt(0).toUpperCase() + school.status.slice(1)}
                  </Badge>
                  {school.isVerified && <Badge variant="outline">Verified</Badge>}
                </div>
              </div>
            </div>
            <CardDescription className="pt-4">
              {school.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contact Information */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">Contact Information</h3>
                    
                    {school.address && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p>{school.address}</p>
                          <p>{school.city}, {school.state} {school.zipCode}</p>
                        </div>
                      </div>
                    )}
                    
                    {school.phoneNumber && (
                      <div className="flex items-center space-x-2">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <span>{school.phoneNumber}</span>
                      </div>
                    )}
                    
                    {school.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <span>{school.email}</span>
                      </div>
                    )}
                    
                    {school.website && (
                      <div className="flex items-center space-x-2">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                        <a 
                          href={school.website.startsWith("http") ? school.website : `https://${school.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {school.website}
                        </a>
                      </div>
                    )}
                  </div>
                  
                  {/* School Details */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">School Details</h3>
                    
                    {school.foundedYear && (
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <span>Founded in {school.foundedYear}</span>
                      </div>
                    )}
                    
                    {school.accreditation && (
                      <div className="flex items-start space-x-2">
                        <Badge variant="outline">{school.accreditation}</Badge>
                      </div>
                    )}
                    
                    {school.enrollmentSize && (
                      <div className="flex items-center space-x-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <span>{school.enrollmentSize} enrolled students</span>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="details">
                <div className="prose max-w-none">
                  <h3>About {school.name}</h3>
                  <p>{school.description || "No detailed description available."}</p>
                </div>
              </TabsContent>
              
              <TabsContent value="stats">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Classes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">12</p>
                      <p className="text-sm text-muted-foreground">Active classes</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Students</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{school.enrollmentSize || "0"}</p>
                      <p className="text-sm text-muted-foreground">Total enrollment</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Staff</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">5</p>
                      <p className="text-sm text-muted-foreground">Active staff members</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="border-t pt-4 flex justify-between">
            <Button variant="outline" onClick={() => refetch()}>
              Refresh Data
            </Button>
            <Button>
              Edit School Information
            </Button>
          </CardFooter>
        </Card>
      </div>
    </SimpleDashboard>
  );
}