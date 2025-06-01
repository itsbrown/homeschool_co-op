import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth0";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, MapPin, Phone, Mail, Globe, Calendar, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UnifiedSchoolAdminSidebar from '@/components/layout/UnifiedSchoolAdminSidebar';

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
  status?: string;
}

export default function MySchoolPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Fetch school data
  const { data: school, isLoading, error, refetch } = useQuery<SchoolData>({
    queryKey: ["/api/school-admin/my-school"],
    enabled: isAuthenticated,
  });

  // Setup school mutation
  const setupSchoolMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/school-admin/setup-school"),
    onSuccess: () => {
      toast({
        title: "School created successfully",
        description: "Your school has been set up. You can now edit the details.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error creating school",
        description: "There was a problem setting up your school. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Show error toast if there's an error (but not for 404 which means no school setup)
  useEffect(() => {
    if (error && !error.message.includes('404')) {
      toast({
        title: "Error loading school data",
        description: "There was a problem loading your school information. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <UnifiedSchoolAdminSidebar />
        <div className="flex-1 overflow-auto">
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading school information...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="flex h-screen bg-gray-100">
        <UnifiedSchoolAdminSidebar />
        <div className="flex-1 overflow-auto">
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
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <UnifiedSchoolAdminSidebar />
      <div className="flex-1 overflow-auto">
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
                    <Badge variant={school.status === "active" ? "outline" : "default"}>
                      {school.status || "Active"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="stats">Statistics</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview">
                  <div className="space-y-4 mt-6">
                    {(school.address || school.city) && (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                          <div>
                            {school.address && <p>{school.address}</p>}
                            <p>{school.city}, {school.state} {school.zipCode}</p>
                          </div>
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
                    
                    <div className="flex flex-wrap gap-2 mt-4">
                      {school.foundedYear && (
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                          <span>Founded {school.foundedYear}</span>
                        </div>
                      )}
                      
                      {school.accreditation && (
                        <div className="flex items-center space-x-2">
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
                        <CardTitle className="text-lg">Staff</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">8</p>
                        <p className="text-sm text-muted-foreground">Teaching staff</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Students</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{school.enrollmentSize || "N/A"}</p>
                        <p className="text-sm text-muted-foreground">Total enrollment</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => {
                  refetch();
                  toast({
                    title: "Refreshing data",
                    description: "The school information is being refreshed.",
                  });
                }}
              >
                Refresh Data
              </Button>
              <Button asChild>
                <Link href="/schools/my-school/edit">Edit School Information</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}