import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, MapPin, Clock, Users, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// Schema for parent registration
const parentRegistrationSchema = z.object({
  parentFirstName: z.string().min(1, "First name is required"),
  parentLastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone number is required"),
  location: z.string().min(1, "Location selection is required"),
  childFirstName: z.string().min(1, "Child's first name is required"),
  childLastName: z.string().min(1, "Child's last name is required"),
  childAge: z.string().min(1, "Child's age is required"),
  preferredClass: z.string().min(1, "Class selection is required"),
  sessionTime: z.string().min(1, "Session time is required"),
});

type ParentRegistrationForm = z.infer<typeof parentRegistrationSchema>;

export default function RegistrationLandingPage() {
  const [, setLocation] = useLocation();
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const { toast } = useToast();

  const form = useForm<ParentRegistrationForm>({
    resolver: zodResolver(parentRegistrationSchema),
    defaultValues: {
      location: "Brighton",
      sessionTime: "9am-12pm"
    }
  });

  // Fetch available classes
  const { data: classes = [] } = useQuery<any[]>({
    queryKey: ["/api/classes/published"],
  });

  const handleClassSelection = (classId: string) => {
    const selectedClassData = classes.find(c => c.id.toString() === classId);
    if (selectedClassData) {
      setSelectedClass(selectedClassData);
      setDepositAmount(Math.round(selectedClassData.price * 0.1)); // 10% deposit
      form.setValue("preferredClass", classId);
    }
  };

  const onSubmit = (data: ParentRegistrationForm) => {
    // Store registration data and proceed to payment
    sessionStorage.setItem('registrationData', JSON.stringify({
      ...data,
      selectedClass,
      depositAmount,
      totalAmount: selectedClass?.price || 0
    }));
    
    setLocation('/registration/payment');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Fall 2025 Registration
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            American Seekers Academy - Brighton Location
          </p>
          <p className="text-lg text-gray-500">
            Register your child for our classical education program
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Available Classes - Fall 2025</CardTitle>
            <CardDescription>
              Choose from our age-appropriate classical education programs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {classes.filter(c => c.location === "Brighton").map((classItem) => (
                <Card key={classItem.id} className="border-2 hover:border-primary transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{classItem.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">{classItem.ageRange}</p>
                      </div>
                      <Badge variant="secondary">${classItem.price}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{classItem.schedule}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{classItem.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{classItem.capacity - classItem.enrollmentCount} spots available</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
                      {classItem.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registration Form</CardTitle>
            <CardDescription>
              Enter your information to register your child
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="parentFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="parentLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane.doe@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Brighton">Brighton</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Child Information</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="childFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Child's First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Emma" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="childLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Child's Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <FormField
                      control={form.control}
                      name="childAge"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Child's Age</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select age" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[...Array(10)].map((_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>
                                  {i + 1} years old
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferredClass"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Class</FormLabel>
                          <Select onValueChange={handleClassSelection} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select class" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {classes.filter(c => c.location === "Brighton").map((classItem) => (
                                <SelectItem key={classItem.id} value={classItem.id.toString()}>
                                  {classItem.title} - {classItem.ageRange}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {selectedClass && (
                  <Card className="bg-green-50 border-green-200">
                    <CardHeader>
                      <CardTitle className="text-green-900">Selected Class</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="font-semibold">{selectedClass.title}</p>
                        <p className="text-sm text-green-700">{selectedClass.schedule}</p>
                        <div className="flex justify-between items-center pt-2 border-t border-green-200">
                          <span>Total Cost:</span>
                          <span className="font-semibold">${selectedClass.price}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Deposit (10%):</span>
                          <span className="font-semibold text-green-700">${depositAmount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Remaining Balance:</span>
                          <span className="text-sm text-green-600">${selectedClass.price - depositAmount}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={!selectedClass}
                >
                  {selectedClass ? `Pay Deposit - $${depositAmount}` : "Select a Class to Continue"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}