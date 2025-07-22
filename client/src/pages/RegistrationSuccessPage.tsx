
import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Mail, Phone } from "lucide-react";

interface School {
  id: number;
  name: string;
  email?: string;
  phoneNumber?: string;
  registrationCode: string;
}

export default function RegistrationSuccessPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const [school, setSchool] = useState<School | null>(null);

  useEffect(() => {
    if (code) {
      const fetchSchool = async () => {
        try {
          const response = await apiRequest("GET", `/api/schools/by-code/${code}`);
          if (response.ok) {
            const schoolData = await response.json();
            setSchool(schoolData);
          }
        } catch (err) {
          console.error("Error fetching school:", err);
        }
      };
      fetchSchool();
    }
  }, [code]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl text-green-700">Registration Successful!</CardTitle>
          <CardDescription className="text-lg">
            {school ? `Welcome to ${school.name}!` : "Your registration has been completed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium mb-2">
              🎉 Your child has been successfully registered!
            </p>
            <p className="text-green-700 text-sm">
              You will receive a confirmation email shortly with next steps and important information.
            </p>
          </div>

          {school && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• You'll receive a welcome email within 24 hours</li>
                <li>• School staff will contact you to schedule an orientation</li>
                <li>• You'll receive enrollment materials and forms</li>
                <li>• Payment and scheduling information will be provided</li>
              </ul>
            </div>
          )}

          {school && (school.email || school.phoneNumber) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Questions? Contact Us:</h4>
              <div className="space-y-2 text-sm">
                {school.email && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${school.email}`} className="hover:text-primary">
                      {school.email}
                    </a>
                  </div>
                )}
                {school.phoneNumber && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${school.phoneNumber}`} className="hover:text-primary">
                      {school.phoneNumber}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button 
              onClick={() => setLocation("/")}
              variant="outline"
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Button>
            {school && (
              <Button 
                onClick={() => setLocation(`/school/${school.registrationCode}`)}
                className="flex-1"
              >
                Back to School Info
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
