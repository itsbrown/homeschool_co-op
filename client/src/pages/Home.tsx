import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BookOpen, CreditCard, Users, Calendar, Shield, GraduationCap, CheckCircle, ClipboardCheck } from "lucide-react";

export default function Home() {
  useEffect(() => {
    document.title = "American Seekers Academy - Adaptive Learning Platform";
  }, []);

  const features = [
    {
      icon: BookOpen,
      title: "Class Enrollment",
      description: "Browse and enroll in personalized learning programs with flexible scheduling options.",
    },
    {
      icon: CreditCard,
      title: "Flexible Payment Plans",
      description: "Pay in full or choose bi-weekly payment plans that fit your family's budget.",
    },
    {
      icon: Users,
      title: "Family Management",
      description: "Manage multiple children, track enrollments, and view progress all in one place.",
    },
    {
      icon: Calendar,
      title: "Attendance Tracking",
      description: "QR code check-in with geolocation verification for accurate attendance records.",
    },
    {
      icon: GraduationCap,
      title: "AI-Powered Learning",
      description: "Adaptive lessons and assessments powered by AI to personalize each student's journey.",
    },
    {
      icon: ClipboardCheck,
      title: "Reading Assessments",
      description: "Track reading progress with grade-level scoring and Lexile score conversion.",
    },
  ];

  const benefits = [
    "Easy online enrollment and registration",
    "Secure payment processing with Stripe",
    "Real-time attendance and progress tracking",
    "Multi-guardian family access",
    "Automated payment reminders",
    "Comprehensive educator dashboard",
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="text-xl font-bold text-primary">American Seekers Academy</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Benefits</a>
            <Link href="/login">
              <Button variant="outline" size="sm">Log in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
          <div className="md:hidden flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm">Log in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Sign up</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6 text-foreground">
            Empowering Families Through{" "}
            <span className="text-primary">Adaptive Learning</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            American Seekers Academy provides personalized educational programs for children
            with easy enrollment, flexible payments, and real-time progress tracking.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto text-base px-8">
                Enroll Your Child <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8">
                Parent Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="bg-muted/50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-foreground">Everything Your Family Needs</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete platform designed for parents and educators to manage learning experiences seamlessly.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="benefits" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-foreground">Built for Modern Families</h2>
              <p className="text-muted-foreground mb-8">
                We handle the complexity so you can focus on what matters most — your child's education.
                From enrollment to payment tracking, everything is streamlined in one platform.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-primary/5 to-primary/15 rounded-2xl p-8 md:p-12">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Multi-Child Support</p>
                    <p className="text-sm text-muted-foreground">Manage all your children in one account</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Consolidated Billing</p>
                    <p className="text-sm text-muted-foreground">Pay multiple enrollments in one transaction</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Secure & Private</p>
                    <p className="text-sm text-muted-foreground">Enterprise-grade security for your family data</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 max-w-2xl mx-auto mb-8">
            Join American Seekers Academy and give your child a personalized learning experience.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="text-base px-8">
              Create Your Account <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-bold text-primary">American Seekers Academy</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Empowering families with adaptive learning tools and personalized education programs.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <h4 className="font-semibold mb-3 text-foreground">Platform</h4>
                <ul className="space-y-2">
                  <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                  <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Parent Portal</Link></li>
                  <li><Link href="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Register</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3 text-foreground">Support</h4>
                <ul className="space-y-2">
                  <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Help Center</Link></li>
                  <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact Us</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t mt-8 pt-8">
            <p className="text-sm text-muted-foreground text-center">
              &copy; {new Date().getFullYear()} American Seekers Academy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
