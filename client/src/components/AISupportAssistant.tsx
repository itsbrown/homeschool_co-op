import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageCircle, 
  X, 
  Send, 
  Bot, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { useToast } from '@/hooks/use-toast';

interface SupportAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  initialIssue?: string;
}

interface TechnicalIssue {
  id: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  title: string;
  description: string;
  timestamp: Date;
  resolution?: string;
  recommendedActions: string[];
}

export default function AISupportAssistant({ isOpen, onClose, initialIssue }: SupportAssistantProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [issue, setIssue] = useState(initialIssue || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<TechnicalIssue | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [severity, setSeverity] = useState<string>('');
  const [recommendedActions, setRecommendedActions] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';
    
    if (ua.includes('Chrome')) {
      browser = 'Chrome';
      version = ua.match(/Chrome\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Firefox')) {
      browser = 'Firefox';
      version = ua.match(/Firefox\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browser = 'Safari';
      version = ua.match(/Safari\/([0-9.]+)/)?.[1] || 'Unknown';
    }

    return {
      browser,
      version,
      platform: navigator.platform || 'Unknown',
      userAgent: ua
    };
  };

  const handleSubmitIssue = async () => {
    if (!issue.trim() || !user?.email) return;

    setIsSubmitting(true);
    try {
      const browserInfo = getBrowserInfo();
      
      const response = await apiRequest('POST', '/api/technical-support/report', {
        description: issue,
        userEmail: user.email,
        userRole: 'parent', // Get from context if available
        currentUrl: window.location.href,
        userAgent: browserInfo.userAgent,
        browserInfo,
        attemptedActions: ['Clicked on payments page', 'Tried refreshing page'] // Could be collected from user
      });

      const result = await response.json();

      if (result.success) {
        setCurrentIssue({
          id: result.issueId,
          status: 'open',
          title: `Technical Issue #${result.issueId.slice(-6)}`,
          description: issue,
          timestamp: new Date(),
          recommendedActions: result.recommendedActions
        });
        
        setUserResponse(result.userResponse);
        setSeverity(result.severity);
        setRecommendedActions(result.recommendedActions);
        setShowSuccess(true);

        toast({
          title: "Issue Reported Successfully",
          description: `Your issue has been logged as ${result.issueId.slice(-6)}. Our team has been notified.`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to submit issue:', error);
      toast({
        title: "Submission Failed",
        description: "We couldn't submit your issue. Please try again or contact support directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkIssueStatus = async () => {
    if (!currentIssue) return;

    try {
      const response = await apiRequest('GET', `/api/technical-support/issue/${currentIssue.id}`);
      const result = await response.json();

      if (result.success) {
        setCurrentIssue(result.issue);
        
        if (result.issue.status === 'resolved' && result.issue.resolution) {
          toast({
            title: "Issue Resolved!",
            description: result.issue.resolution,
          });
        }
      }
    } catch (error) {
      console.error('Failed to check issue status:', error);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'investigating': return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'closed': return <CheckCircle className="h-4 w-4 text-gray-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <Card className="w-full sm:max-w-lg sm:max-h-[80vh] max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">AI Support Assistant</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {!showSuccess ? (
            <>
              <CardDescription>
                Describe the technical issue you're experiencing. Our AI will analyze it and provide immediate assistance while notifying our technical team.
              </CardDescription>

              <div className="space-y-4">
                <Textarea
                  placeholder="For example: I can't access the payments page - every time I click on it, I get redirected to the dashboard instead..."
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  className="min-h-[100px]"
                  disabled={isSubmitting}
                />

                <Button 
                  onClick={handleSubmitIssue}
                  disabled={!issue.trim() || isSubmitting || !user?.email}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {isSubmitting ? 'Analyzing Issue...' : 'Get AI Assistance'}
                </Button>

                {!user?.email && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Please log in to submit technical support requests.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Issue Analysis Complete</h3>
                {currentIssue && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className={getSeverityColor(severity)}>
                      {severity} priority
                    </Badge>
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(currentIssue.status)}
                      <span className="text-sm capitalize">{currentIssue.status}</span>
                    </div>
                  </div>
                )}
              </div>

              {userResponse && (
                <Alert>
                  <Bot className="h-4 w-4" />
                  <AlertDescription className="whitespace-pre-line">
                    {userResponse}
                  </AlertDescription>
                </Alert>
              )}

              {recommendedActions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Recommended Actions:</h4>
                  <ul className="space-y-1">
                    {recommendedActions.map((action, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {currentIssue && (
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Issue ID: {currentIssue.id.slice(-6)}</span>
                    <Button variant="outline" size="sm" onClick={checkIssueStatus}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check Status
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Our technical team has been notified and will investigate this issue. 
                    You'll be updated when it's resolved.
                  </p>
                  {currentIssue.resolution && (
                    <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                      <p className="text-sm text-green-800">
                        <strong>Resolution:</strong> {currentIssue.resolution}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowSuccess(false);
                    setIssue('');
                    setCurrentIssue(null);
                    setUserResponse('');
                  }}
                  className="flex-1"
                >
                  Report Another Issue
                </Button>
                <Button onClick={onClose} className="flex-1">
                  Close
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Global support assistant trigger component
export function SupportAssistantTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        size="lg"
      >
        <MessageCircle className="h-5 w-5 md:mr-2" />
        <span className="hidden md:inline">Need Help?</span>
      </Button>

      <AISupportAssistant 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}