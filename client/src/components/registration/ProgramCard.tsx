import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  CalendarIcon, 
  Clock, 
  DollarSign, 
  BookOpen, 
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Define interface for program data
interface Program {
  id: number;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  price: number;
  gradeLevels: string[];
  capacity: number;
  enrollmentCount: number;
  location: string;
  instructorName: string;
  imageUrl?: string;
  isPublished: boolean;
}

// Define interface for child data (simplified for selection)
interface Child {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
}

interface ProgramCardProps {
  program: Program;
  children?: Child[];  // Children of the current parent user
  isAdmin?: boolean;
}

export function ProgramCard({ program, children = [], isAdmin = false }: ProgramCardProps) {
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleEnrollment = async () => {
    if (!selectedChild) {
      toast({
        title: "Error",
        description: "Please select a child to enroll",
        variant: "destructive",
      });
      return;
    }

    setIsEnrolling(true);
    try {
      await apiRequest("POST", "/api/program-enrollments", {
        programId: program.id,
        childId: parseInt(selectedChild),
        status: "pending",
        paymentStatus: "pending"
      });

      toast({
        title: "Success",
        description: "Enrollment request submitted successfully",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      
      // Close dialog
      setIsEnrollDialogOpen(false);
    } catch (error) {
      console.error("Failed to enroll:", error);
      toast({
        title: "Error",
        description: "Failed to submit enrollment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEnrolling(false);
    }
  };

  const isSpacesAvailable = program.enrollmentCount < program.capacity;
  const spacesRemaining = program.capacity - program.enrollmentCount;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl">{program.title}</CardTitle>
          <Badge variant={program.category === 'academic' ? 'default' : 'secondary'}>
            {program.category.charAt(0).toUpperCase() + program.category.slice(1)}
          </Badge>
        </div>
        <CardDescription>{program.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 opacity-70" />
            <span className="text-sm">
              {formatDate(program.startDate)} - {formatDate(program.endDate)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 opacity-70" />
            <span className="text-sm">
              ${program.price.toFixed(2)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 opacity-70" />
            <span className="text-sm">
              Grades: {program.gradeLevels.join(", ")}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 opacity-70" />
            <span className="text-sm">
              {spacesRemaining} spaces remaining
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t p-4 bg-muted/50">
        <div className="w-full flex items-center justify-between">
          <span className="text-sm">Instructor: {program.instructorName}</span>
          {isAdmin ? (
            <Button size="sm" variant="outline" onClick={() => setLocation(`/admin/programs/${program.id}`)}>
              Manage
            </Button>
          ) : (
            <Dialog open={isEnrollDialogOpen} onOpenChange={setIsEnrollDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  disabled={!isSpacesAvailable || children.length === 0}
                >
                  {isSpacesAvailable ? "Enroll" : "Full"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enroll in {program.title}</DialogTitle>
                  <DialogDescription>
                    Select which child you would like to enroll in this program.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                  <Label htmlFor="child">Child</Label>
                  <Select 
                    value={selectedChild} 
                    onValueChange={setSelectedChild}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a child" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map((child) => (
                        <SelectItem 
                          key={child.id} 
                          value={child.id.toString()}
                        >
                          {child.firstName} {child.lastName} ({child.gradeLevel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <DialogFooter>
                  <Button 
                    onClick={handleEnrollment} 
                    disabled={isEnrolling || !selectedChild}
                  >
                    {isEnrolling ? "Processing..." : "Enroll"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}