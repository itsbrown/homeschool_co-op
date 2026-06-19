import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  MessageCircle,
  X,
  Send,
  Bot,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Building2,
  BookOpen,
  Camera,
  Upload,
  ImageIcon,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { useToast } from '@/hooks/use-toast';
import { uploadFile } from '@/lib/uploadClient';
import { capturePageScreenshot, blobToPreviewUrl } from '@/lib/screenshotCapture';
import {
  SUPPORT_ASSISTANT_OPEN_EVENT,
  type OpenSupportAssistantDetail,
  type SupportIssueCategory,
} from '@/lib/supportAssistant';
import ContactSchoolDialog from './ContactSchoolDialog';
import HelpTutorials from './HelpTutorials';

interface SupportAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  initialIssue?: string;
  initialCategory?: SupportIssueCategory;
}

interface TechnicalIssue {
  id: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  title: string;
  description: string;
  timestamp: Date;
  resolution?: string;
  recommendedActions: string[];
  issueCategory?: SupportIssueCategory;
}

export default function AISupportAssistant({
  isOpen,
  onClose,
  initialIssue,
  initialCategory = 'platform',
}: SupportAssistantProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [issue, setIssue] = useState(initialIssue || '');
  const [issueCategory, setIssueCategory] = useState<SupportIssueCategory>(initialCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<TechnicalIssue | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [severity, setSeverity] = useState<string>('');
  const [recommendedActions, setRecommendedActions] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const [screenshotObjectPath, setScreenshotObjectPath] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIssue(initialIssue || '');
      setIssueCategory(initialCategory);
    }
  }, [isOpen, initialIssue, initialCategory]);

  const clearScreenshot = () => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    setScreenshotObjectPath(null);
  };

  const uploadScreenshotBlob = async (blob: Blob, filename: string) => {
    setIsUploadingScreenshot(true);
    try {
      const file = new File([blob], filename, { type: blob.type || 'image/png' });
      const result = await uploadFile(file, { category: 'supportScreenshots' });
      setScreenshotObjectPath(result.objectPath);
      setScreenshotPreview(blobToPreviewUrl(blob));
    } catch (error) {
      console.error('Screenshot upload failed:', error);
      toast({
        title: 'Screenshot upload failed',
        description: 'You can still submit without a screenshot.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  const handleCaptureScreenshot = async () => {
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.classList.add('opacity-0', 'pointer-events-none');
    }

    try {
      await new Promise((r) => setTimeout(r, 200));
      const blob = await capturePageScreenshot();
      await uploadScreenshotBlob(blob, `screenshot-${Date.now()}.png`);
      toast({ title: 'Screenshot attached', description: 'Review and submit your issue.' });
    } catch (error) {
      console.error('Capture failed:', error);
      toast({
        title: 'Could not capture page',
        description: 'Try uploading an image instead.',
        variant: 'destructive',
      });
    } finally {
      if (overlay) {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file.', variant: 'destructive' });
      return;
    }
    clearScreenshot();
    await uploadScreenshotBlob(file, file.name);
    e.target.value = '';
  };

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

    return { browser, version, platform: navigator.platform || 'Unknown', userAgent: ua };
  };

  const handleSubmitIssue = async () => {
    if (!issue.trim() || !user?.email) return;

    setIsSubmitting(true);
    try {
      const browserInfo = getBrowserInfo();

      const response = await apiRequest('POST', '/api/technical-support/report', {
        description: issue,
        userEmail: user.email,
        userRole: (user as { role?: string })?.role || 'parent',
        currentUrl: window.location.href,
        userAgent: browserInfo.userAgent,
        browserInfo,
        attemptedActions: [],
        issueCategory,
        screenshotObjectPath: screenshotObjectPath ?? undefined,
      });

      const result = await response.json();

      if (result.success) {
        setCurrentIssue({
          id: result.issueId,
          status: 'open',
          title: `Issue #${result.issueId.slice(-6)}`,
          description: issue,
          timestamp: new Date(),
          recommendedActions: result.recommendedActions,
          issueCategory: result.issueCategory,
        });

        setUserResponse(result.userResponse);
        setSeverity(result.severity);
        setRecommendedActions(result.recommendedActions);
        setShowSuccess(true);

        toast({
          title: 'Issue submitted',
          description: `Your report #${result.issueId.slice(-6)} was sent to our team.`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to submit issue:', error);
      toast({
        title: 'Submission failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
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
          toast({ title: 'Issue resolved!', description: result.issue.resolution });
        }
      }
    } catch (error) {
      console.error('Failed to check issue status:', error);
    }
  };

  const resetForm = () => {
    setShowSuccess(false);
    setIssue('');
    setCurrentIssue(null);
    setUserResponse('');
    clearScreenshot();
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
    <div ref={overlayRef} className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <Card className="w-full sm:max-w-lg sm:max-h-[85vh] max-h-[90vh] overflow-y-auto" data-testid="support-assistant-dialog">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Report an Issue</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {!showSuccess ? (
            <>
              <CardDescription>
                Describe your question or problem. Our AI will suggest immediate steps while your report is sent to the right team.
              </CardDescription>

              <div className="space-y-2">
                <Label>What kind of help do you need?</Label>
                <RadioGroup
                  value={issueCategory}
                  onValueChange={(v) => setIssueCategory(v as SupportIssueCategory)}
                  className="grid gap-2"
                >
                  <div className="flex items-start space-x-2 rounded-lg border p-3">
                    <RadioGroupItem value="platform" id="cat-platform" className="mt-1" />
                    <Label htmlFor="cat-platform" className="cursor-pointer font-normal">
                      <span className="font-medium">Platform / technical issue</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Errors, login, payments system, pages not working
                      </p>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2 rounded-lg border p-3">
                    <RadioGroupItem value="school_policy" id="cat-school" className="mt-1" />
                    <Label htmlFor="cat-school" className="cursor-pointer font-normal">
                      <span className="font-medium">School question / policy</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Classes, schedules, enrollment, school policies
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Textarea
                placeholder={
                  issueCategory === 'school_policy'
                    ? 'For example: I need to change my child\'s class schedule for next semester...'
                    : 'For example: I can\'t access the payments page — every time I click it, I get redirected...'
                }
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                className="min-h-[100px]"
                disabled={isSubmitting}
                data-testid="support-issue-description"
              />

              <div className="space-y-2">
                <Label>Screenshot (optional)</Label>
                {screenshotPreview ? (
                  <div className="relative rounded-lg border overflow-hidden">
                    <img src={screenshotPreview} alt="Attached screenshot" className="w-full max-h-40 object-contain bg-muted" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={clearScreenshot}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCaptureScreenshot}
                      disabled={isSubmitting || isUploadingScreenshot}
                      data-testid="support-capture-screenshot"
                    >
                      {isUploadingScreenshot ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4 mr-1" />
                      )}
                      Capture page
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting || isUploadingScreenshot}
                      data-testid="support-upload-screenshot"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload image
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Screenshots help us diagnose issues faster.
                </p>
              </div>

                <Button
                  type="button"
                  onClick={handleSubmitIssue}
                  disabled={!issue.trim() || isSubmitting || isUploadingScreenshot || !user?.email}
                  className="w-full"
                  data-testid="support-submit-issue"
                >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? 'Submitting...' : 'Submit & get help'}
              </Button>

              {!user?.email && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Please log in to submit support requests.</AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Report received</h3>
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
                  <AlertDescription className="whitespace-pre-line">{userResponse}</AlertDescription>
                </Alert>
              )}

              {recommendedActions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Try these steps while we review:</h4>
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
                      Check status
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600">
                    {currentIssue.issueCategory === 'school_policy'
                      ? 'Your school admin team has been notified and will follow up.'
                      : 'Our platform team has been notified and will investigate.'}
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
                <Button variant="outline" onClick={resetForm} className="flex-1">
                  Report another issue
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

export function SupportAssistantTrigger() {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isTutorialsOpen, setIsTutorialsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [supportInitialIssue, setSupportInitialIssue] = useState<string | undefined>();
  const [supportInitialCategory, setSupportInitialCategory] = useState<SupportIssueCategory>('platform');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenSupportAssistantDetail>).detail ?? {};
      setSupportInitialIssue(detail.initialIssue);
      setSupportInitialCategory(detail.issueCategory ?? 'platform');
      setIsSupportOpen(true);
      setIsMenuOpen(false);
    };
    window.addEventListener(SUPPORT_ASSISTANT_OPEN_EVENT, handler);
    return () => window.removeEventListener(SUPPORT_ASSISTANT_OPEN_EVENT, handler);
  }, []);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        {isMenuOpen && (
          <div className="absolute bottom-16 right-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => {
                setIsTutorialsOpen(true);
                setIsMenuOpen(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
              data-tutorial="tutorials-btn"
              data-testid="btn-tutorials"
            >
              <BookOpen className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium text-gray-900">Tutorials & Guides</p>
                <p className="text-xs text-gray-500">Step-by-step instructions</p>
              </div>
            </button>
            <button
              onClick={() => {
                setSupportInitialCategory('platform');
                setSupportInitialIssue(undefined);
                setIsSupportOpen(true);
                setIsMenuOpen(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-t transition-colors"
              data-tutorial="ai-support-btn"
              data-testid="btn-ai-support"
            >
              <Bot className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">Report an Issue</p>
                <p className="text-xs text-gray-500">Submit a question with optional screenshot</p>
              </div>
            </button>
            <button
              onClick={() => {
                setIsContactOpen(true);
                setIsMenuOpen(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-t transition-colors"
              data-tutorial="contact-school-btn"
              data-testid="btn-contact-school"
            >
              <Building2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Contact My School</p>
                <p className="text-xs text-gray-500">School phone, email & address</p>
              </div>
            </button>
          </div>
        )}

        <Button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="rounded-full shadow-lg hover:shadow-xl transition-shadow"
          size="lg"
          data-tutorial="help-button"
          data-testid="help-button"
        >
          <MessageCircle className="h-5 w-5 md:mr-2" />
          <span className="hidden md:inline">Need Help?</span>
        </Button>
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setIsMenuOpen(false)} />
      )}

      <HelpTutorials isOpen={isTutorialsOpen} onClose={() => setIsTutorialsOpen(false)} />

      <AISupportAssistant
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        initialIssue={supportInitialIssue}
        initialCategory={supportInitialCategory}
      />

      <ContactSchoolDialog isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
    </>
  );
}
