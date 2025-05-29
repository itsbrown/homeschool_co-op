import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from @/hooks/useAuth00";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Users, BookOpen, Building } from "lucide-react";

export default function RoleSelection() {
  const [selectedRole, setSelectedRole] = useState("");
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth0();
  const { toast } = useToast();

  const roles = [
    {
      value: "parent",
      label: "Parent",
      description: "Manage your children's education, enroll in programs, and track progress",
      icon: <Users className="h-6 w-6" />
    },
    {
      value: "instructor",
      label: "Instructor",
      description: "Teach classes, create lessons, and manage student progress",
      icon: <GraduationCap className="h-6 w-6" />
    },
    {
      value: "schoolAdmin",
      label: "School Administrator",
      description: "Manage school operations, staff, classes, and student enrollment",
      icon: <Building className="h-6 w-6" />
    },
    {
      value: "admin",
      label: "Platform Administrator",
      description: "Full platform access for system management and oversight",
      icon: <BookOpen className="h-6 w-6" />
    }
  ];

  const handleRoleSelection = async () => {
    if (!selectedRole) {
      toast({
        title: "Please select a role",
        description: "You need to choose your role to continue",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update user role via API
      const response = await fetch('/api/auth/update-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (response.ok) {
        toast({
          title: "Role updated successfully",
          description: "Your account has been configured with the selected role",
        });
        
        // Redirect based on role
        switch (selectedRole) {
          case 'parent':
            setLocation('/dashboard');
            break;
          case 'instructor':
            setLocation('/instructor/dashboard');
            break;
          case 'schoolAdmin':
            setLocation('/school-admin/dashboard');
            break;
          case 'admin':
            setLocation('/admin/dashboard');
            break;
          default:
            setLocation('/dashboard');
        }
      } else {
        throw new Error('Failed to update role');
      }
    } catch (error) {
      toast({
        title: "Error updating role",
        description: "Please try again or contact support",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to LearnSphere!</CardTitle>
          <CardDescription>
            Please select your role to customize your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={selectedRole} onValueChange={setSelectedRole}>
            <div className="grid gap-4">
              {roles.map((role) => (
                <div key={role.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={role.value} id={role.value} />
                  <Label 
                    htmlFor={role.value} 
                    className="flex items-start space-x-3 cursor-pointer flex-1 p-4 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex-shrink-0 mt-1">
                      {role.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{role.label}</div>
                      <div className="text-sm text-muted-foreground">{role.description}</div>
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
          
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={() => setLocation('/login')}
              className="flex-1"
            >
              Back to Login
            </Button>
            <Button 
              onClick={handleRoleSelection}
              disabled={!selectedRole}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}