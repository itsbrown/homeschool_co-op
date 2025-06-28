import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Lock, Check, Mail } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Schema for payment information
const paymentSchema = z.object({
  cardNumber: z.string().min(16, "Card number must be 16 digits"),
  expiryDate: z.string().regex(/^\d{2}\/\d{2}$/, "Format: MM/YY"),
  cvv: z.string().min(3, "CVV must be 3-4 digits"),
  cardholderName: z.string().min(1, "Cardholder name is required"),
  billingZip: z.string().min(5, "ZIP code is required"),
});

type PaymentForm = z.infer<typeof paymentSchema>;

export default function RegistrationPaymentPage() {
  const [, setLocation] = useLocation();
  const [registrationData, setRegistrationData] = useState<any>(null);
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const { toast } = useToast();

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
  });

  useEffect(() => {
    const storedData = sessionStorage.getItem('registrationData');
    if (storedData) {
      setRegistrationData(JSON.parse(storedData));
    } else {
      setLocation('/registration');
    }
  }, [setLocation]);

  // Process registration mutation
  const registrationMutation = useMutation({
    mutationFn: async (paymentData: PaymentForm) => {
      // Create parent account
      const parentData = {
        firstName: registrationData.parentFirstName,
        lastName: registrationData.parentLastName,
        email: registrationData.email,
        phone: registrationData.phone,
        role: 'parent'
      };

      // Create child record
      const childData = {
        firstName: registrationData.childFirstName,
        lastName: registrationData.childLastName,
        age: parseInt(registrationData.childAge),
        gradeLevel: getGradeLevelFromAge(parseInt(registrationData.childAge)),
        birthdate: getBirthdateFromAge(parseInt(registrationData.childAge)),
        parentEmail: registrationData.email
      };

      // Create enrollment
      const enrollmentData = {
        classId: parseInt(registrationData.preferredClass),
        childId: null, // Will be set after child creation
        status: 'enrolled',
        depositPaid: registrationData.depositAmount,
        remainingBalance: registrationData.totalAmount - registrationData.depositAmount
      };

      // Simulate payment processing
      const paymentResult = await processPayment({
        amount: registrationData.depositAmount,
        cardDetails: paymentData,
        description: `Deposit for ${registrationData.selectedClass.title}`
      });

      if (!paymentResult.success) {
        throw new Error('Payment processing failed');
      }

      // Create the complete registration
      return apiRequest('POST', '/api/registration/complete', {
        parent: parentData,
        child: childData,
        enrollment: enrollmentData,
        payment: paymentResult
      });
    },
    onSuccess: () => {
      setPaymentProcessed(true);
      toast({
        title: "Registration Successful!",
        description: "Welcome to American Seekers Academy. Check your email for confirmation.",
      });
      
      // Send confirmation email
      sendConfirmationEmail();
      
      // Clear session data
      sessionStorage.removeItem('registrationData');
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "There was an error processing your registration.",
        variant: "destructive",
      });
    },
  });

  const processPayment = async (paymentInfo: any) => {
    // Simulate payment processing with a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In a real implementation, this would integrate with Stripe or another payment processor
    return {
      success: true,
      transactionId: `txn_${Date.now()}`,
      amount: paymentInfo.amount,
      timestamp: new Date().toISOString()
    };
  };

  const sendConfirmationEmail = async () => {
    try {
      await apiRequest('POST', '/api/email/registration-confirmation', {
        parentEmail: registrationData.email,
        parentName: `${registrationData.parentFirstName} ${registrationData.parentLastName}`,
        childName: `${registrationData.childFirstName} ${registrationData.childLastName}`,
        className: registrationData.selectedClass.title,
        depositAmount: registrationData.depositAmount,
        remainingBalance: registrationData.totalAmount - registrationData.depositAmount,
        classSchedule: registrationData.selectedClass.schedule
      });
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
    }
  };

  const getGradeLevelFromAge = (age: number): string => {
    if (age <= 3) return 'pre-k';
    if (age <= 5) return 'kindergarten';
    if (age <= 7) return 'elementary';
    return 'upper-elementary';
  };

  const getBirthdateFromAge = (age: number): string => {
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    return `${birthYear}-01-01`;
  };

  const onSubmit = (data: PaymentForm) => {
    registrationMutation.mutate(data);
  };

  if (!registrationData) {
    return <div>Loading...</div>;
  }

  if (paymentProcessed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <Card className="border-green-200">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-900">Registration Complete!</CardTitle>
              <CardDescription className="text-green-700">
                Welcome to American Seekers Academy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-lg">
                  <strong>{registrationData.childFirstName} {registrationData.childLastName}</strong> is now registered for:
                </p>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-lg">{registrationData.selectedClass.title}</h3>
                    <p className="text-green-700">{registrationData.selectedClass.schedule}</p>
                    <p className="text-sm text-green-600">Brighton Location</p>
                  </CardContent>
                </Card>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold mb-4">Payment Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Deposit Paid:</span>
                    <span className="font-semibold">${registrationData.depositAmount}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Remaining Balance:</span>
                    <span>${registrationData.totalAmount - registrationData.depositAmount}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <Mail className="h-4 w-4" />
                  <span className="font-medium">Confirmation Email Sent</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  A confirmation email with your receipt and next steps has been sent to {registrationData.email}
                </p>
              </div>

              <div className="flex gap-4 pt-6">
                <Button onClick={() => setLocation('/dashboard')} className="flex-1">
                  Go to Dashboard
                </Button>
                <Button variant="outline" onClick={() => setLocation('/programs')} className="flex-1">
                  Browse More Classes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Registration
          </h1>
          <p className="text-gray-600">
            Pay your deposit to secure your child's seat
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Registration Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Parent Information</h3>
                <p>{registrationData.parentFirstName} {registrationData.parentLastName}</p>
                <p className="text-sm text-muted-foreground">{registrationData.email}</p>
                <p className="text-sm text-muted-foreground">{registrationData.phone}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Child Information</h3>
                <p>{registrationData.childFirstName} {registrationData.childLastName}</p>
                <p className="text-sm text-muted-foreground">{registrationData.childAge} years old</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Selected Class</h3>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <h4 className="font-semibold">{registrationData.selectedClass.title}</h4>
                    <p className="text-sm text-blue-700">{registrationData.selectedClass.schedule}</p>
                    <p className="text-sm text-blue-600">Brighton Location</p>
                  </CardContent>
                </Card>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Cost:</span>
                    <span>${registrationData.totalAmount}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Deposit (10%):</span>
                    <span>${registrationData.depositAmount}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Balance Due Later:</span>
                    <span>${registrationData.totalAmount - registrationData.depositAmount}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Secure Payment
              </CardTitle>
              <CardDescription>
                Your payment information is encrypted and secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="cardholderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cardholder Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="1234 5678 9012 3456" 
                            maxLength={19}
                            {...field}
                            onChange={(e) => {
                              // Format card number with spaces
                              const value = e.target.value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
                              field.onChange(value.replace(/\s/g, ''));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry Date</FormLabel>
                          <FormControl>
                            <Input placeholder="MM/YY" maxLength={5} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cvv"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CVV</FormLabel>
                          <FormControl>
                            <Input placeholder="123" maxLength={4} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="billingZip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing ZIP Code</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg"
                    disabled={registrationMutation.isPending}
                  >
                    {registrationMutation.isPending ? (
                      "Processing Payment..."
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pay Deposit - ${registrationData.depositAmount}
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-4 text-xs text-muted-foreground text-center">
                <p>🔒 Your payment is secured with 256-bit SSL encryption</p>
                <p>You will receive an email confirmation after payment</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}