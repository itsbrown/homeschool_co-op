import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  BookOpen,
  Play,
  FileText,
  Sparkles
} from 'lucide-react';
import { useInteractiveTutorial } from './tutorials/InteractiveTutorial';
import { getTutorialById } from './tutorials/tutorialDefinitions';
import SmartTutorialAssistant from './tutorials/SmartTutorialAssistant';

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
  hasInteractiveMode: boolean;
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
    hasInteractiveMode: true,
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
    hasInteractiveMode: true,
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
    hasInteractiveMode: true,
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
    hasInteractiveMode: true,
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

type ViewMode = 'list' | 'select-mode' | 'read-guide';

export default function HelpTutorials({ isOpen, onClose }: HelpTutorialsProps) {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showSmartGuide, setShowSmartGuide] = useState(false);
  
  const { startTutorial } = useInteractiveTutorial();

  const handleOpenSmartGuide = () => {
    setShowSmartGuide(true);
    onClose();
  };

  if (showSmartGuide) {
    return (
      <SmartTutorialAssistant 
        isOpen={true} 
        onClose={() => setShowSmartGuide(false)} 
      />
    );
  }

  if (!isOpen) return null;

  const handleBack = () => {
    if (viewMode === 'read-guide') {
      setViewMode('select-mode');
      setCurrentStep(0);
    } else if (viewMode === 'select-mode') {
      setViewMode('list');
      setSelectedTutorial(null);
    } else {
      onClose();
    }
  };

  const handleSelectTutorial = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setViewMode('select-mode');
    setCurrentStep(0);
  };

  const handleStartInteractive = () => {
    if (!selectedTutorial) return;
    
    const interactiveTutorial = getTutorialById(selectedTutorial.id);
    if (interactiveTutorial) {
      onClose();
      startTutorial(interactiveTutorial);
    }
  };

  const handleReadGuide = () => {
    setViewMode('read-guide');
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

  const renderTutorialList = () => (
    <ScrollArea className="h-full px-6 pb-6">
      <div className="space-y-3">
        <button
          onClick={handleOpenSmartGuide}
          className="w-full p-4 text-left bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 border-2 border-blue-500/30 rounded-lg transition-all flex items-center gap-4"
          data-testid="btn-smart-guide"
        >
          <div className="p-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Smart Guide</h3>
              <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-medium rounded-full">
                AI
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ask me anything - I'll guide you step by step
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-500" />
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white dark:bg-gray-900 px-3 text-xs text-gray-500 dark:text-gray-400">
              Or choose a topic
            </span>
          </div>
        </div>

        {tutorials.map((tutorial) => {
          const IconComponent = tutorial.icon;
          return (
            <button
              key={tutorial.id}
              onClick={() => handleSelectTutorial(tutorial)}
              className="w-full p-4 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-4"
              data-testid={`tutorial-card-${tutorial.id}`}
            >
              <div className={`p-3 rounded-full bg-white dark:bg-gray-900 shadow-sm ${tutorial.iconColor}`}>
                <IconComponent className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{tutorial.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{tutorial.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );

  const renderModeSelection = () => (
    <div className="px-6 pb-6">
      <div className="text-center mb-6">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${selectedTutorial?.iconColor} bg-gray-100 dark:bg-gray-800`}>
          {selectedTutorial && <selectedTutorial.icon className="h-8 w-8" />}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {selectedTutorial?.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {selectedTutorial?.description}
        </p>
      </div>

      <div className="space-y-3">
        {selectedTutorial?.hasInteractiveMode && (
          <button
            onClick={handleStartInteractive}
            className="w-full p-4 text-left bg-primary/10 hover:bg-primary/20 border-2 border-primary rounded-lg transition-colors flex items-center gap-4"
            data-testid="btn-start-interactive-tutorial"
          >
            <div className="p-3 rounded-full bg-primary text-primary-foreground">
              <Play className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Interactive Guide</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click through each step with highlighted buttons
              </p>
            </div>
            <div className="px-2 py-1 bg-primary text-primary-foreground text-xs font-medium rounded">
              Recommended
            </div>
          </button>
        )}

        <button
          onClick={handleReadGuide}
          className="w-full p-4 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border rounded-lg transition-colors flex items-center gap-4"
          data-testid="btn-read-guide"
        >
          <div className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Read Guide</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Read step-by-step instructions at your own pace
            </p>
          </div>
        </button>
      </div>
    </div>
  );

  const renderReadGuide = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 mb-4">
        <div className="flex gap-1">
          {selectedTutorial?.steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index <= currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
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
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-2">
                {selectedTutorial?.steps[currentStep].title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {selectedTutorial?.steps[currentStep].content}
              </p>
            </div>
          </div>

          {selectedTutorial?.steps[currentStep].tip && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Tip</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {selectedTutorial?.steps[currentStep].tip}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 px-6 pb-6 pt-4 border-t bg-white dark:bg-gray-950">
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
          {selectedTutorial && currentStep < selectedTutorial.steps.length - 1 ? (
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
                setViewMode('list');
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
  );

  const getTitle = () => {
    if (viewMode === 'read-guide' && selectedTutorial) {
      return selectedTutorial.title;
    }
    if (viewMode === 'select-mode' && selectedTutorial) {
      return 'Choose How to Learn';
    }
    return 'Tutorials & Guides';
  };

  const getDescription = () => {
    if (viewMode === 'read-guide' && selectedTutorial) {
      return `Step ${currentStep + 1} of ${selectedTutorial.steps.length}`;
    }
    if (viewMode === 'select-mode') {
      return 'Pick your preferred learning style';
    }
    return 'Learn how to use the platform';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] flex flex-col" data-testid="help-tutorials-modal">
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {viewMode !== 'list' && (
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
                  {getTitle()}
                </CardTitle>
                <CardDescription>
                  {getDescription()}
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
          {viewMode === 'list' && renderTutorialList()}
          {viewMode === 'select-mode' && renderModeSelection()}
          {viewMode === 'read-guide' && renderReadGuide()}
        </CardContent>
      </Card>
    </div>
  );
}
