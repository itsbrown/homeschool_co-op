
import React from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Home, Mail, Clock, Users } from "lucide-react";

export default function SchoolApplicationSuccessPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="text-center">
          <CardHeader className="pb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-800">
              Application Submitted Successfully!
            </CardTitle>
            <CardDescription className="text-lg">
              Thank you for your interest in joining the ASA Platform
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">What happens next?</h3>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">Email Confirmation</p>
                    <p className="text-sm text-blue-700">You'll receive a confirmation email with your application ID within a few minutes.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">Application Review</p>
                    <p className="text-sm text-blue-700">Our team will review your application within 3-5 business days.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">Reference Verification</p>
                    <p className="text-sm text-blue-700">We may contact your references to verify the information provided.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium mt-0.5">
                    4
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">Decision Notification</p>
                    <p className="text-sm text-blue-700">You'll receive an email with our decision and next steps.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <Clock className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Review Time</h4>
                <p className="text-sm text-gray-600">3-5 business days</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <Mail className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Stay Updated</h4>
                <p className="text-sm text-gray-600">Check your email regularly</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <Users className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Support</h4>
                <p className="text-sm text-gray-600">We're here to help</p>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-3">Important Information</h3>
              <div className="text-sm text-gray-600 space-y-2 text-left">
                <p>• Please ensure your email address is correct to receive all communications</p>
                <p>• Your references may be contacted during the review process</p>
                <p>• If approved, you'll receive detailed onboarding instructions</p>
                <p>• For questions, contact us at <strong>support@americanseekersacademy.com</strong></p>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <Button onClick={() => setLocation("/")} className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Return to Home
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/school-application-status")}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Check Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
