import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, School, ArrowRight, LogOut } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";

interface RoleSelectionProps {
  onRoleSelect: (role: string) => void;
  userEmail: string;
}

export default function RoleSelection({ onRoleSelect, userEmail }: RoleSelectionProps) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const { signOut } = useAuth();

  const roles = [
    {
      id: 'parent',
      title: 'Parent Portal',
      description: 'Access your children\'s information, view their progress, and manage enrollments',
      icon: User,
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      id: 'school_admin',
      title: 'School Administrator',
      description: 'Manage school operations, staff, students, classes, and curriculum',
      icon: School,
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      iconColor: 'text-purple-600'
    }
  ];

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
  };

  const handleContinue = () => {
    if (selectedRole) {
      onRoleSelect(selectedRole);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout by clearing everything and redirecting
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full">
        <div className="absolute top-4 right-4">
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to ASA Platform
          </h1>
          <p className="text-gray-600 mb-2">
            Logged in as: <span className="font-medium">{userEmail}</span>
          </p>
          <p className="text-gray-500">
            Please select which profile you'd like to access
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {roles.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            
            return (
              <Card 
                key={role.id}
                className={`cursor-pointer transition-all duration-200 ${role.color} ${
                  isSelected ? 'ring-2 ring-blue-500 shadow-lg scale-105' : 'hover:shadow-md'
                }`}
                onClick={() => handleRoleSelect(role.id)}
              >
                <CardHeader className="text-center pb-4">
                  <div className={`w-16 h-16 mx-auto rounded-full bg-white flex items-center justify-center mb-4 ${
                    isSelected ? 'ring-2 ring-blue-500' : ''
                  }`}>
                    <Icon className={`h-8 w-8 ${role.iconColor}`} />
                  </div>
                  <CardTitle className="text-xl text-gray-900">
                    {role.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-gray-600 leading-relaxed">
                    {role.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button 
            onClick={handleContinue}
            disabled={!selectedRole}
            size="lg"
            className="px-8 py-3 text-lg"
          >
            Continue to Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}