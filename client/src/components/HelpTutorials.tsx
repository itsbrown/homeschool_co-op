import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  X, 
  ArrowLeft,
  ChevronRight,
  UserPlus,
  GraduationCap,
  CreditCard,
  HelpCircle,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

interface HelpTutorialsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Tutorial {
  id: string;
  title: string;
  description: string;
  icon: typeof UserPlus;
  iconColor: string;
  steps: TutorialStep[];
}

interface TutorialStep {
  title: string;
  content: string;
  tip?: string;
}

const tutorials: Tutorial[] = [
  {
    id: 'register-child',
    title: 'Register Your Child',
    description: 'Learn how to add your children to your account',
    icon: UserPlus,
    iconColor: 'text-blue-600',
    steps: [
      {
        title: 'Go to My Children',
        content: 'From your dashboard, click on "My Children" in the navigation menu or look for the "Manage Your Children" card.',
        tip: 'You can also access this from the sidebar menu on the left side of the screen.'
      },
      {
        title: 'Click "Add Child"',
        content: 'Click the "Add Child" button to open the registration form. You\'ll need to provide information about your child.',
      },
      {
        title: 'Fill in Child Information',
        content: 'Enter your child\'s first name, last name, birthdate, and grade level. You can also add optional information like allergies, medical info, and emergency contacts.',
        tip: 'Make sure the birthdate and grade level are accurate as some classes may have age or grade requirements.'
      },
      {
        title: 'Save the Child Profile',
        content: 'Click "Save" or "Add Child" to complete the registration. Your child will now appear in your children list and be available for class enrollment.',
      }
    ]
  },
  {
    id: 'enroll-child',
    title: 'Enroll in Classes',
    description: 'Step-by-step guide to enrolling your child in classes',
    icon: GraduationCap,
    iconColor: 'text-green-600',
    steps: [
      {
        title: 'Browse Available Classes',
        content: 'From your dashboard, click on "Browse Classes" or "Enroll Now" to see all available classes at your school.',
      },
      {
        title: 'Select a Class',
        content: 'Click on a class to view its details, including the schedule, pricing, description, and available spots.',
        tip: 'Look for the class capacity indicator to make sure there are spots available.'
      },
      {
        title: 'Choose Your Child',
        content: 'Select which of your registered children you want to enroll in this class. If you haven\'t added your child yet, you\'ll need to do that first.',
      },
      {
        title: 'Select Class Options',
        content: 'Some classes offer different options like "Full Day" or "Half Day" with different prices. Choose the option that works best for your family.',
      },
      {
        title: 'Add to Cart',
        content: 'Click "Add to Cart" to add the enrollment to your shopping cart. You can continue browsing and add more classes before checking out.',
        tip: 'Your cart is saved, so you can come back later to complete your enrollment.'
      },
      {
        title: 'Complete Enrollment',
        content: 'Once you\'ve added all desired classes to your cart, proceed to checkout to complete the enrollment process.',
      }
    ]
  },
  {
    id: 'payment-checkout',
    title: 'Payment & Checkout',
    description: 'Complete your enrollment with payment',
    icon: CreditCard,
    iconColor: 'text-purple-600',
    steps: [
      {
        title: 'Review Your Cart',
        content: 'Click the cart icon to view all items in your cart. Review the classes, children, and prices before proceeding.',
        tip: 'Make sure all the information is correct before checkout. You can remove items if needed.'
      },
      {
        title: 'Proceed to Checkout',
        content: 'Click "Checkout" or "Proceed to Payment" when you\'re ready to complete your enrollment.',
      },
      {
        title: 'Enter Payment Information',
        content: 'Enter your payment details securely. We accept major credit and debit cards. Your payment information is encrypted and secure.',
      },
      {
        title: 'Complete Payment',
        content: 'Click "Pay Now" or "Complete Payment" to process your payment. You\'ll receive a confirmation once the payment is successful.',
        tip: 'Your enrollment is only confirmed after payment is complete. Pending enrollments may not guarantee a spot in the class.'
      },
      {
        title: 'Confirmation',
        content: 'After successful payment, you\'ll see a confirmation page and receive an email with your enrollment details. Your child is now enrolled!',
      },
      {
        title: 'Important Note',
        content: 'Your child\'s enrollment is fully confirmed once payment is received. Until then, the enrollment status will show as "Pending Payment" and the spot is not guaranteed.',
        tip: 'Complete payment as soon as possible to secure your child\'s spot in the class.'
      }
    ]
  },
  {
    id: 'get-help',
    title: 'Getting Help',
    description: 'How to reach out when you need assistance',
    icon: HelpCircle,
    iconColor: 'text-orange-600',
    steps: [
      {
        title: 'Use the Help Button',
        content: 'Click the "Need Help?" button in the bottom-right corner of any page. This gives you quick access to support options.',
      },
      {
        title: 'AI Technical Support',
        content: 'If you\'re experiencing technical issues with the platform (errors, pages not loading, etc.), choose "AI Technical Support" to report the problem. Our system will analyze the issue and provide immediate guidance.',
        tip: 'Include as many details as possible about what you were trying to do when the problem occurred.'
      },
      {
        title: 'Contact Your School',
        content: 'For questions about classes, schedules, payments, or school policies, choose "Contact My School". This sends a message directly to your school administrator.',
        tip: 'School admins typically respond within 1-2 business days.'
      },
      {
        title: 'View These Tutorials',
        content: 'You can always come back to these tutorials by clicking "Need Help?" and selecting "Tutorials & Guides" for step-by-step instructions.',
      }
    ]
  }
];

export default function HelpTutorials({ isOpen, onClose }: HelpTutorialsProps) {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const handleBack = () => {
    if (selectedTutorial) {
      setSelectedTutorial(null);
      setCurrentStep(0);
    } else {
      onClose();
    }
  };

  const handleSelectTutorial = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setCurrentStep(0);
  };

  const handleNextStep = () => {
    if (selectedTutorial && currentStep < selectedTutorial.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] flex flex-col" data-testid="help-tutorials-modal">
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(selectedTutorial) && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleBack}
                  className="h-8 w-8"
                  data-testid="tutorial-back-button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {selectedTutorial ? selectedTutorial.title : 'Tutorials & Guides'}
                </CardTitle>
                <CardDescription>
                  {selectedTutorial 
                    ? `Step ${currentStep + 1} of ${selectedTutorial.steps.length}`
                    : 'Learn how to use the platform'
                  }
                </CardDescription>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              data-testid="tutorial-close-button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          {!selectedTutorial ? (
            <ScrollArea className="h-full px-6 pb-6">
              <div className="space-y-3">
                {tutorials.map((tutorial) => {
                  const IconComponent = tutorial.icon;
                  return (
                    <button
                      key={tutorial.id}
                      onClick={() => handleSelectTutorial(tutorial)}
                      className="w-full p-4 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-4"
                      data-testid={`tutorial-card-${tutorial.id}`}
                    >
                      <div className={`p-3 rounded-full bg-white shadow-sm ${tutorial.iconColor}`}>
                        <IconComponent className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{tutorial.title}</h3>
                        <p className="text-sm text-gray-500">{tutorial.description}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-6 mb-4">
                <div className="flex gap-1">
                  {selectedTutorial.steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        index <= currentStep ? 'bg-primary' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <ScrollArea className="flex-1 px-6">
                <div className="space-y-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {currentStep + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-900 mb-2">
                        {selectedTutorial.steps[currentStep].title}
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        {selectedTutorial.steps[currentStep].content}
                      </p>
                    </div>
                  </div>

                  {selectedTutorial.steps[currentStep].tip && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Tip</p>
                        <p className="text-sm text-blue-700">
                          {selectedTutorial.steps[currentStep].tip}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex-shrink-0 px-6 pb-6 pt-4 border-t bg-white">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                    className="flex-1"
                    data-testid="tutorial-prev-button"
                  >
                    Previous
                  </Button>
                  {currentStep < selectedTutorial.steps.length - 1 ? (
                    <Button
                      onClick={handleNextStep}
                      className="flex-1"
                      data-testid="tutorial-next-button"
                    >
                      Next Step
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setSelectedTutorial(null);
                        setCurrentStep(0);
                      }}
                      className="flex-1"
                      data-testid="tutorial-done-button"
                    >
                      Done
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
