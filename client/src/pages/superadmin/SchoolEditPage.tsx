import React, { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowLeft, Sparkles, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

const schoolFormSchema = z.object({
  name: z.string().min(1, "School name is required"),
  type: z.string().min(1, "School type is required"),
  description: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  email: z.string().email("Valid email is required"),
  website: z.string().optional(),
  foundedYear: z.number().optional(),
  accreditation: z.string().optional(),
  enrollmentSize: z.number().optional(),
});

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
}

export default function SchoolEditPage() {
  const { id: schoolId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: school, isLoading } = useQuery<School>({
    queryKey: [`/api/superadmin/schools/${schoolId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/superadmin/schools/${schoolId}`);
      return await response.json();
    },
    enabled: !!schoolId,
  });

  const { data: featuresData, isLoading: featuresLoading } = useQuery<{ features: Record<string, boolean> }>({
    queryKey: [`/api/superadmin/schools/${schoolId}/features`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/superadmin/schools/${schoolId}/features`);
      return await response.json();
    },
    enabled: !!schoolId,
  });

  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({});
  const [featuresInitialized, setFeaturesInitialized] = useState(false);

  useEffect(() => {
    if (featuresData?.features && !featuresInitialized) {
      setLocalFeatures(featuresData.features);
      setFeaturesInitialized(true);
    }
  }, [featuresData, featuresInitialized]);

  const updateFeaturesMutation = useMutation({
    mutationFn: (features: Record<string, boolean>) => {
      return apiRequest("PUT", `/superadmin/schools/${schoolId}/features`, { features });
    },
    onSuccess: () => {
      toast({
        title: "Features updated",
        description: "The school's premium features have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/superadmin/schools/${schoolId}/features`] });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "There was an error updating the features. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFeatureToggle = (featureName: string, enabled: boolean) => {
    const newFeatures = { ...localFeatures, [featureName]: enabled };
    setLocalFeatures(newFeatures);
    updateFeaturesMutation.mutate(newFeatures);
  };

  const form = useForm<z.infer<typeof schoolFormSchema>>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: "",
      type: "",
      description: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      phoneNumber: "",
      email: "",
      website: "",
      foundedYear: undefined,
      accreditation: "",
      enrollmentSize: undefined,
    },
  });

  // Track which school has been initialized to prevent re-initialization on refetch
  const initializedSchoolIdRef = useRef<number | null>(null);

  // Update form when school data loads (only once per school)
  React.useEffect(() => {
    // Only initialize once per schoolId to prevent wiping user edits on refetch
    if (school && school.id !== initializedSchoolIdRef.current) {
      console.log("Initializing superadmin school form for school ID:", school.id);
      form.reset({
        name: school.name || "",
        type: school.type || "",
        description: school.description || "",
        address: school.address || "",
        city: school.city || "",
        state: school.state || "",
        zipCode: school.zipCode || "",
        phoneNumber: school.phoneNumber || "",
        email: school.email || "",
        website: school.website || "",
        foundedYear: school.foundedYear,
        accreditation: school.accreditation || "",
        enrollmentSize: school.enrollmentSize,
      });
      
      // Mark this school as initialized
      initializedSchoolIdRef.current = school.id;
    }
  }, [school, form]);

  const updateSchoolMutation = useMutation({
    mutationFn: (data: z.infer<typeof schoolFormSchema>) => {
      return apiRequest("PATCH", `/superadmin/schools/${schoolId}`, data);
    },
    onSuccess: () => {
      toast({
        title: "School updated",
        description: "The school information has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/superadmin/schools/${schoolId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/schools'] });
      setLocation(`/superadmin/schools/${schoolId}`);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "There was an error updating the school information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof schoolFormSchema>) => {
    updateSchoolMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg">Loading school information...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => setLocation(`/superadmin/schools/${schoolId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to School Details
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Edit School Information</CardTitle>
            <CardDescription>
              Update the school's profile information below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Name*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Type*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number*</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email*</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="foundedYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Founded Year</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enrollmentSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Size</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accreditation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accreditation</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Premium Features Section */}
                <div className="mt-8 pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <h3 className="text-lg font-semibold">Premium Features</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Enable or disable premium features for this school. Changes take effect immediately.
                  </p>
                  
                  {featuresLoading ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading features...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Shield className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium">CFO Financial Reports</p>
                            <p className="text-sm text-muted-foreground">
                              AI-powered financial analytics, revenue trends, and CFO-grade insights
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={localFeatures.financialReports || false}
                          onCheckedChange={(checked) => handleFeatureToggle('financialReports', checked)}
                          disabled={updateFeaturesMutation.isPending}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-4 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation(`/superadmin/schools/${schoolId}`)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateSchoolMutation.isPending}
                  >
                    {updateSchoolMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
