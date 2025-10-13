import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "@/contexts/CartContext";
import { formatCurrency, formatDollars } from "@/utils/currency";

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
  variants?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    days: string[];
    price: number;
  }[];
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
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { addItem, openCart } = useCart();

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

    // Check if variants exist and one is selected
    const hasVariants = program.variants && program.variants.length > 1;
    if (hasVariants && !selectedVariant) {
      toast({
        title: "Error",
        description: "Please select a time option",
        variant: "destructive",
      });
      return;
    }

    // Find the selected child info
    const child = children.find(c => c.id === parseInt(selectedChild));
    if (!child) {
      toast({
        title: "Error",
        description: "Selected child not found",
        variant: "destructive",
      });
      return;
    }

    // Get the selected variant or default to first variant
    const variant = hasVariants ? 
      program.variants?.find(v => v.id === selectedVariant) : 
      program.variants?.[0];
    
    const finalPrice = variant ? variant.price : program.price;

    setIsEnrolling(true);
    try {
      const response = await apiRequest("POST", "/api/program-enrollments", {
        programId: program.id,
        childId: parseInt(selectedChild),
        variantId: selectedVariant,
        status: "pending",
        paymentStatus: "pending"
      });

      toast({
        title: "Success",
        description: "Enrollment request submitted successfully",
      });

      // Add the enrollment to the cart
      await addItem({
        classId: program.id,
        className: program.title,
        childId: child.id,
        childName: `${child.firstName} ${child.lastName}`,
        price: finalPrice,
        description: program.description,
        startDate: program.startDate,
        endDate: program.endDate,
        status: "pending_payment",
        statusText: "Payment Required",
        variantId: selectedVariant,
        variantName: variant?.name
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/program-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      
      // Close dialog and open cart
      setIsEnrollDialogOpen(false);
      
      // Open cart after a short delay to show the added item
      setTimeout(() => {
        openCart();
      }, 500);
      
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
              {program.variants && program.variants.length > 1 ? (
                `${formatCurrency(Math.min(...program.variants.map(v => v.price)))} - ${formatCurrency(Math.max(...program.variants.map(v => v.price)))}`
              ) : (
                `$${(program.price / 100).toFixed(2)}`
              )}
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
                    Select which child you would like to enroll in "{program.title}".
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-4">
                  <div>
                    <Label htmlFor="child">Select Child</Label>
                    <div className="text-sm text-muted-foreground mb-2">
                      Debug: Children: {children.length} | Auth: Yes | Loading: No | User: {children.length > 0 ? 'kpdinvestors@gmail.com' : 'unknown'}
                    </div>
                    <Select 
                      value={selectedChild} 
                      onValueChange={setSelectedChild}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a child" />
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

                  {/* Show variant selection if multiple variants exist */}
                  {program.variants && program.variants.length > 1 && (
                    <div>
                      <Label htmlFor="variant">Time Option</Label>
                      <Select 
                        value={selectedVariant} 
                        onValueChange={setSelectedVariant}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a time option" />
                        </SelectTrigger>
                        <SelectContent>
                          {program.variants.map((variant) => (
                            <SelectItem 
                              key={variant.id} 
                              value={variant.id}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{variant.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {variant.days.join(', ')} • {variant.startTime} - {variant.endTime} • ${(variant.price / 100).toFixed(2)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEnrollDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleEnrollment} 
                    disabled={isEnrolling || !selectedChild || (program.variants && program.variants.length > 1 && !selectedVariant)}
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