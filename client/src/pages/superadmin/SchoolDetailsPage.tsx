
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Users, GraduationCap, DollarSign, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface School {
  id: number;
  name: string;
  type: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
  email: string;
  website?: string;
  foundedYear?: number;
  accreditation?: string;
  enrollmentSize?: number;
  isActive: boolean;
  studentCount: number;
  classCount: number;
  staffCount: number;
  students?: any[];
  classes?: any[];
  enrollments?: any[];
  totalRevenue?: number;
  activeEnrollments?: number;
  pendingEnrollments?: number;
}

export default function SchoolDetailsPage() {
  const { schoolId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: school, isLoading, error } = useQuery<School>({
    queryKey: [`/api/superadmin/schools/${schoolId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/superadmin/schools/${schoolId}`);
      return await response.json();
    },
    enabled: !!schoolId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg">Loading school details...</span>
        </div>
      </div>
    );
  }

  if (error || !school) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Failed to load school details.</p>
            <Button onClick={() => setLocation("/superadmin/schools")}>
              Back to Schools
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/superadmin/schools")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to All Schools
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{school.name}</h1>
              <p className="text-gray-600 mt-1">{school.type}</p>
              <Badge variant={school.isActive ? "default" : "secondary"} className="mt-2">
                {school.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <Button onClick={() => setLocation(`/superadmin/schools/${schoolId}/edit`)}>
              Edit School
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{school.studentCount}</div>
              <p className="text-xs text-gray-500">Total enrolled</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <GraduationCap className="h-4 w-4 mr-2" />
                Classes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{school.classCount}</div>
              <p className="text-xs text-gray-500">Active classes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{school.staffCount}</div>
              <p className="text-xs text-gray-500">Staff members</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${school.totalRevenue?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-gray-500">Total revenue</p>
            </CardContent>
          </Card>
        </div>

        {/* School Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>School Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Description</label>
                <p className="text-gray-900">{school.description || 'No description available'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Address</label>
                <p className="text-gray-900">
                  {school.address}<br />
                  {school.city}, {school.state} {school.zipCode}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Phone</label>
                  <p className="text-gray-900">{school.phoneNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Email</label>
                  <p className="text-gray-900">{school.email}</p>
                </div>
              </div>

              {school.website && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Website</label>
                  <p className="text-gray-900">{school.website}</p>
                </div>
              )}

              {school.foundedYear && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Founded</label>
                  <p className="text-gray-900">{school.foundedYear}</p>
                </div>
              )}

              {school.accreditation && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Accreditation</label>
                  <p className="text-gray-900">{school.accreditation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enrollment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Active Enrollments</label>
                  <p className="text-2xl font-bold text-green-600">{school.activeEnrollments || 0}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Pending Enrollments</label>
                  <p className="text-2xl font-bold text-yellow-600">{school.pendingEnrollments || 0}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Enrollment Capacity</label>
                <p className="text-gray-900">{school.enrollmentSize || 'Not specified'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Students */}
        {school.students && school.students.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Students</CardTitle>
              <CardDescription>Latest student enrollments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {school.students.slice(0, 5).map((student: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{student.firstName} {student.lastName}</p>
                      <p className="text-sm text-gray-500">Grade {student.gradeLevel}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">
                        {student.parentEmail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
