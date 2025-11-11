import { useState } from "react";
import { Link, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, ArrowRight } from "lucide-react";

const schoolCodeSchema = z.object({
  code: z.string()
    .min(1, "School code is required")
    .toUpperCase()
    .transform(val => val.trim()),
});

type SchoolCodeFormValues = z.infer<typeof schoolCodeSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SchoolCodeFormValues>({
    resolver: zodResolver(schoolCodeSchema),
    defaultValues: {
      code: "",
    },
  });

  async function onSubmit(data: SchoolCodeFormValues) {
    try {
      setIsValidating(true);
      setError(null);
      
      // Validate the school code exists
      const response = await fetch(`/api/schools/validate-code/${data.code}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || "Invalid school code. Please check with your school administrator.");
        toast({
          title: "Invalid Code",
          description: "The school code you entered was not found.",
          variant: "destructive",
        });
        return;
      }
      
      const school = await response.json();
      
      // Redirect to the school-specific registration page
      setLocation(`/register/${data.code}`);
    } catch (error: any) {
      const errorMessage = error?.message || "Unable to validate school code. Please try again.";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">
            American Seekers Academy
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to your account or create a new one
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">
              School Registration Code Required
            </h3>
            <p className="text-sm text-blue-800">
              To create an account, you'll need a registration code from your school administrator. 
              Enter it below to get started.
            </p>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Registration Code</FormLabel>
                    <FormControl>
                      <Input 
                        type="text"
                        placeholder="Enter your school code (e.g., ASA2024)"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        disabled={isValidating}
                        className="uppercase"
                        data-testid="input-school-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button
                type="submit"
                className="w-full"
                disabled={isValidating}
                data-testid="button-continue"
              >
                {isValidating ? (
                  "Validating..."
                ) : (
                  <>
                    Continue to Registration
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Need help?
              </span>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Don't have a school code?</strong>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Contact your school administrator to obtain your registration code. 
              Each school has a unique code for enrolling families.
            </p>
          </div>
        </CardContent>
        
        <CardFooter>
          <div className="text-sm text-center w-full text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login">
              <Button variant="link" className="p-0 h-auto" data-testid="link-signin">
                Sign in
              </Button>
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
