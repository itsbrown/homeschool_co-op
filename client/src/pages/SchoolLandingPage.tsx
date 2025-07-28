import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Users, 
  Calendar,
  GraduationCap,
  ArrowRight
} from "lucide-react";

interface School {
  id: number;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  description?: string;
  accreditation?: string;
  enrollmentSize?: number;
  foundedYear?: number;
  registrationCode: string;
  status: string;
}

export default function SchoolLandingPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("No registration code provided");
      setLoading(false);
      return;
    }

    const fetchSchool = async () => {
      try {
        const response = await apiRequest("GET", `/api/schools/by-code/${code}`);

        if (response.ok) {
          const schoolData = await response.json();
          setSchool(schoolData);
        } else {
          const errorData = await response.json();
          setError(errorData.message || "School not found");
        }
      } catch (err) {
        console.error("Error fetching school:", err);
        setError("Failed to load school information");
      } finally {
        setLoading(false);
      }
    };

    fetchSchool();
  }, [code]);

  const handleRegister = () => {
    // Store school context in sessionStorage for the registration flow
    sessionStorage.setItem('schoolRegistrationContext', JSON.stringify(school));
    setLocation(`/register/${code}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading school information...</p>
        </div>
      </div>
    );
  }

  if (error || !school) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">School Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error || "The registration code provided is not valid."}
            </p>
            <Button 
              onClick={() => setLocation("/")} 
              variant="outline"
              className="w-full"
            >
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Welcome to {school.name}
            </h1>
            <p className="text-xl mb-6 opacity-90">
              {school.description || `Join our ${school.type} educational community`}
            </p>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Building className="h-4 w-4 mr-2" />
              {school.type.charAt(0).toUpperCase() + school.type.slice(1)} School
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* School Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  School Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Address</p>
                    <p className="text-sm text-muted-foreground">
                      {school.address}<br />
                      {school.city}, {school.state} {school.zipCode}
                    </p>
                  </div>
                </div>

                {school.phoneNumber && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Phone</p>
                      <p className="text-sm text-muted-foreground">{school.phoneNumber}</p>
                    </div>
                  </div>
                )}

                {school.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">{school.email}</p>
                    </div>
                  </div>
                )}

                {school.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Website</p>
                      <a 
                        href={school.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {school.website}
                      </a>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* School Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  School Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {school.foundedYear && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Founded</p>
                      <p className="text-sm text-muted-foreground">{school.foundedYear}</p>
                    </div>
                  </div>
                )}

                {school.enrollmentSize && (
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Enrollment Size</p>
                      <p className="text-sm text-muted-foreground">{school.enrollmentSize} students</p>
                    </div>
                  </div>
                )}

                {school.accreditation && (
                  <div>
                    <p className="font-medium mb-1">Accreditation</p>
                    <Badge variant="outline">{school.accreditation}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Registration Call to Action */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Ready to Join Our Community?</CardTitle>
              <CardDescription className="text-lg">
                Start your registration process with {school.name} today
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={handleRegister}
                size="lg"
                className="text-lg px-8 py-3"
              >
                Begin Registration
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                Registration Code: <span className="font-mono font-bold">{school.registrationCode}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}