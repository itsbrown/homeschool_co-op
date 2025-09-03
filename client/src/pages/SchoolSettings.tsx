import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Save, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/layout/AppShell';

interface SchoolData {
  id: number;
  name: string;
  type: string;
  city: string;
  state: string;
  registrationCode?: string;
  logo?: string;
  status?: string;
  membershipFeeAmount?: number;
  membershipRenewalMonth?: number;
  membershipRenewalDay?: number;
  membershipGracePeriodDays?: number;
}

export default function SchoolSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch user's school data
  const { data: schoolData, isLoading } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user?.email,
  });

  // Logo upload mutation  
  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      console.log('🔍 Full school data object:', schoolData);
      console.log('🔍 School ID type:', typeof schoolData?.id);
      console.log('🔍 School ID value:', schoolData?.id);
      console.log('🔍 All school data keys:', schoolData ? Object.keys(schoolData) : 'no data');
      
      if (!schoolData?.id) {
        console.error('❌ No school ID found in data:', schoolData);
        throw new Error('No school ID available - please refresh the page');
      }
      
      const schoolId = schoolData.id.toString();
      console.log('📤 Uploading for school ID (string):', schoolId);
      
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('schoolId', schoolId);
      
      // Log FormData contents
      console.log('📋 FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value);
        if (key === 'schoolId') {
          console.log(`  schoolId type: ${typeof value}, length: ${value.toString().length}`);
        }
      }
      
      // Verify FormData was built correctly
      console.log('📋 FormData verification:');
      console.log('  - Has logo file:', formData.has('logo'));
      console.log('  - Has schoolId:', formData.has('schoolId'));
      console.log('  - SchoolId value:', formData.get('schoolId'));
      
      console.log('🚀 Sending upload request with FormData...');
      const response = await apiRequest('POST', '/api/schools/upload-logo', formData);
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload logo');
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log('✅ Upload successful:', data);
      toast({
        title: "Success",
        description: "School logo uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      console.error('❌ Upload failed:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to upload logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    
    if (!schoolData?.id) {
      console.error('❌ School data not available. Current data:', schoolData);
      toast({
        title: "School data not available",
        description: "Unable to identify school. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('🚀 Starting upload for school:', schoolData.id, 'file:', selectedFile.name);
    logoUploadMutation.mutate(selectedFile);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">Loading school settings...</div>
      </div>
    );
  }

  if (!schoolData) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-red-600">
          No school association found. Please contact support.
        </div>
      </div>
    );
  }

  const school = schoolData;

  return (
    <AppShell>
      <div className="container mx-auto py-6">
        {/* School Header */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                {school.logo ? (
                  <AvatarImage src={school.logo} alt={school.name} />
                ) : (
                  <AvatarFallback className="text-lg">
                    {school.name.split(' ').map(word => word[0]).join('').toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <CardTitle className="text-2xl mb-1">{school.name}</CardTitle>
                <CardDescription className="flex items-center space-x-2">
                  <Badge variant="secondary">{school.type}</Badge>
                  <Badge variant={school.status === 'active' ? 'default' : 'secondary'}>
                    {school.status || 'active'}
                  </Badge>
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="settings" className="w-full">
              <TabsList>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-6">
        {/* School Information */}
        <Card>
          <CardHeader>
            <CardTitle>School Information</CardTitle>
            <CardDescription>
              Basic information about your school
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>School Name</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border">
                  {school.name}
                </div>
              </div>
              <div>
                <Label>School Type</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border">
                  {school.type}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border">
                  {school.city}, {school.state}
                </div>
              </div>
              <div>
                <Label>Registration Code</Label>
                <div className="mt-1 p-2 bg-gray-50 rounded border font-mono">
                  {school.registrationCode || 'Not set'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logo Management */}
        <Card>
          <CardHeader>
            <CardTitle>School Logo</CardTitle>
            <CardDescription>
              Upload and manage your school's logo for branding
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Logo Display */}
            <div>
              <Label>Current Logo</Label>
              <div className="mt-2 p-4 border rounded-lg">
                {school.logo ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={school.logo}
                      alt={`${school.name} Logo`}
                      className="h-16 w-16 object-contain border rounded"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder-logo.png';
                      }}
                    />
                    <div>
                      <p className="font-medium">Logo is set</p>
                      <p className="text-sm text-muted-foreground">
                        This logo appears on parent dashboards and registration pages
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <div className="h-16 w-16 border-2 border-dashed rounded flex items-center justify-center">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-medium">No logo uploaded</p>
                      <p className="text-sm">
                        Upload a logo to personalize your school's branding
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Logo Upload */}
            <div>
              <Label>Upload New Logo</Label>
              <div className="mt-2 space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || logoUploadMutation.isPending || !schoolData?.id}
                    className="flex items-center gap-2"
                  >
                    {logoUploadMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload Logo
                      </>
                    )}
                  </Button>
                </div>
                
                {selectedFile && (
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-sm text-blue-800">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  </div>
                )}
                
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Supported formats: PNG, JPG, JPEG, SVG</p>
                  <p>• Maximum file size: 5MB</p>
                  <p>• Recommended size: 200x200 pixels or larger</p>
                  <p>• Square logos work best for consistent display</p>
                </div>
              </div>
            </div>
          </CardContent>
                </Card>

                {/* Membership Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>Annual Membership Fees</CardTitle>
                    <CardDescription>
                      Configure annual membership fees for parent families. When enabled, families are automatically enrolled in annual memberships when they register for classes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Membership Fee Amount</Label>
                        <div className="mt-1 p-2 bg-gray-50 rounded border">
                          ${((schoolData?.membershipFeeAmount || 0) / 100).toFixed(2)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Current annual membership fee (in USD)
                        </p>
                      </div>
                      <div>
                        <Label>Renewal Date</Label>
                        <div className="mt-1 p-2 bg-gray-50 rounded border">
                          {schoolData?.membershipRenewalMonth ? 
                            new Date(0, (schoolData.membershipRenewalMonth - 1), schoolData.membershipRenewalDay || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                            : 'Not configured'
                          }
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Annual membership renewal date
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label>Grace Period</Label>
                      <div className="mt-1 p-2 bg-gray-50 rounded border">
                        {schoolData?.membershipGracePeriodDays || 30} days
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Grace period after expiration before membership becomes inactive
                      </p>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Membership Status</h4>
                          <p className="text-sm text-muted-foreground">
                            {schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 
                              ? `Membership fees are enabled at $${((schoolData.membershipFeeAmount) / 100).toFixed(2)} annually`
                              : 'Membership fees are not configured'
                            }
                          </p>
                        </div>
                        <Badge variant={schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 ? "default" : "secondary"}>
                          {schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h5 className="font-medium text-blue-900 mb-2">How Membership Fees Work</h5>
                        <ul className="text-sm text-blue-800 space-y-1">
                          <li>• Parents are automatically assigned annual membership when they enroll children in classes</li>
                          <li>• Membership fees are separate from class fees and tracked independently</li>
                          <li>• School administrators can mark membership payments as paid manually</li>
                          <li>• Expired memberships enter a grace period before becoming inactive</li>
                        </ul>
                      </div>

                      <div className="mt-4">
                        <Button variant="outline" className="w-full">
                          Configure Membership Settings
                          <span className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded">Coming Soon</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}