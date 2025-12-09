import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FaGoogle } from "react-icons/fa";
import { User, BookOpen, Users, Eye, EyeOff } from "lucide-react";
import EmbeddedLogin from '../components/auth/EmbeddedLogin';

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { signIn, signInWithGoogle, isLoading, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationRequired, setRegistrationRequired] = useState<{message: string, email: string} | null>(null);
  const setLocation = navigate; // Alias for clarity in the change

  // Check for registration required error from URL and sessionStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') === 'registration_required') {
      const message = sessionStorage.getItem('registration_required_message') || 
        'You need to register with your school before you can log in. Please contact your school administrator for a registration link.';
      const email = sessionStorage.getItem('registration_required_email') || '';
      
      setRegistrationRequired({ message, email });
      
      // Clear the URL parameter and sessionStorage
      window.history.replaceState({}, document.title, window.location.pathname);
      sessionStorage.removeItem('registration_required_message');
      sessionStorage.removeItem('registration_required_email');
    }
  }, []);

  // If user is already logged in, redirect to dashboard
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleLogin = async (email: string, password: string) => {
    try {
      console.log('🔐 Starting login attempt for:', email);
      const result = await signIn(email, password);
      console.log('🔐 SignIn result:', { hasError: !!result.error, hasData: !!result.data });
      
      if (result.error) {
        console.error('🔐 Login error:', result.error.message);
        setError(result.error.message);
      } else if (result.data?.session) {
        console.log('🔐 Login successful, session established');
        setError(null);
        // Navigation will happen via useEffect when user state updates
      } else {
        console.warn('🔐 No error but no session either');
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('🔐 Login exception:', err);
      setError('Login failed. Please try again.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error.message);
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Google login failed",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: LoginFormValues) => {
    setError(null);
    await handleLogin(data.email, data.password);
  };

  // Test accounts for easy access
  const testAccounts = [
    { role: "Parent", email: "parent@test.com", icon: User },
    { role: "Educator", email: "educator@test.com", icon: BookOpen },
    { role: "School Admin", email: "schooladmin@test.com", icon: Users },
  ];

  const handleTestLogin = (email: string) => {
    form.setValue("email", email);
    form.setValue("password", "password");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">
              Welcome Back
            </CardTitle>
            <CardDescription>
              Sign in to your American Seekers Academy account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Registration Required Message */}
            {registrationRequired && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg" data-testid="registration-required-banner">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800">Registration Required</h3>
                    <p className="text-sm text-amber-700 mt-1">{registrationRequired.message}</p>
                    {registrationRequired.email && (
                      <p className="text-xs text-amber-600 mt-2">
                        Email: {registrationRequired.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Google Login Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              <FaGoogle className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          {...field}
                          disabled={isLoading}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            {...field}
                            disabled={isLoading}
                            data-testid="input-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-signin"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>

            {/* Test Accounts */}
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Quick access for testing:
              </p>
              <div className="grid gap-2">
                {testAccounts.map((account) => {
                  const Icon = account.icon;
                  return (
                    <Button
                      key={account.role}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleTestLogin(account.email)}
                      disabled={isLoading}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {account.role} Account
                    </Button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="text-center">
            <div className="w-full">
              <p className="text-sm text-gray-600">
                <Button variant="link" className="p-0 h-auto" onClick={() => setLocation('/forgot-password')}>
                  Forgot your password?
                </Button>
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}