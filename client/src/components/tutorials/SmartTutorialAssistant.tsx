import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  X, 
  Send, 
  Sparkles,
  Loader2,
  ChevronRight,
  Lightbulb,
  Bot,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  highlight?: string | null;
  timestamp: Date;
}

interface SmartTutorialAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

const HIGHLIGHT_MAP: Record<string, string> = {
  'my-children-btn': "[data-tutorial='my-children-link'], [data-tour='my-children-btn']",
  'browse-classes-btn': "[data-tutorial='browse-classes-link'], [data-tour='browse-classes-btn']",
  'add-child-btn': "[data-tutorial='add-child-btn'], [data-testid='btn-add-child']",
  'cart-btn': "[data-tutorial='cart-btn'], [data-testid='cart-button']",
  'enroll-btn': "[data-tutorial='enroll-btn'], [data-testid='btn-enroll']",
  'checkout-btn': "[data-tutorial='checkout-btn'], [data-testid='btn-checkout']",
  'help-btn': "[data-testid='help-button']"
};

export default function SmartTutorialAssistant({ isOpen, onClose }: SmartTutorialAssistantProps) {
  const [location] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
      inputRef.current?.focus();
      
      if (messages.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: "Hi! I'm your smart guide. Ask me anything about using this platform, like \"How do I register my child?\" or \"Help me enroll in a class.\" I'll walk you through it step by step!",
          timestamp: new Date()
        }]);
      }
    }
    
    return () => {
      clearHighlight();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [location, isOpen]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchSuggestions = async () => {
    try {
      const response = await fetch(`/api/smart-tutorial/suggestions?path=${encodeURIComponent(location)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

  const clearHighlight = useCallback(() => {
    if (highlightedElement) {
      highlightedElement.classList.remove('smart-tutorial-highlight');
      setHighlightedElement(null);
    }
    document.querySelectorAll('.smart-tutorial-highlight').forEach(el => {
      el.classList.remove('smart-tutorial-highlight');
    });
    const overlay = document.getElementById('smart-tutorial-overlay');
    if (overlay) overlay.remove();
  }, [highlightedElement]);

  const highlightElement = useCallback((targetKey: string) => {
    clearHighlight();
    
    const selector = HIGHLIGHT_MAP[targetKey];
    if (!selector) return;

    const element = document.querySelector(selector);
    if (element) {
      element.classList.add('smart-tutorial-highlight');
      setHighlightedElement(element);
      
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const overlay = document.createElement('div');
      overlay.id = 'smart-tutorial-overlay';
      overlay.className = 'fixed inset-0 bg-black/30 z-[9998] pointer-events-none';
      document.body.appendChild(overlay);
    }
  }, [clearHighlight]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    clearHighlight();

    try {
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/smart-tutorial/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationHistory,
          pageContext: {
            currentPath: location,
            userRole: 'parent',
            availableActions: []
          }
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response || data.fallbackResponse || "I'm sorry, I couldn't process that. Please try again.",
        highlight: data.highlight,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.highlight) {
        setTimeout(() => highlightElement(data.highlight), 300);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleNextStep = () => {
    sendMessage("Done! What's next?");
  };

  const isLastAssistantMessage = (messageId: string) => {
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.id !== 'welcome');
    return assistantMessages.length > 0 && assistantMessages[assistantMessages.length - 1].id === messageId;
  };

  const shouldShowNextStepButton = (message: Message) => {
    if (message.role !== 'assistant' || message.id === 'welcome') return false;
    if (!isLastAssistantMessage(message.id)) return false;
    if (isLoading) return false;
    
    const content = message.content.toLowerCase();
    return content.includes('let me know') || 
           content.includes('ready for') || 
           content.includes('next step') ||
           content.includes('when you') ||
           content.includes('once you') ||
           content.includes('step 1') ||
           content.includes('step 2') ||
           content.includes('step 3');
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .smart-tutorial-highlight {
          position: relative;
          z-index: 9999 !important;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3) !important;
          border-radius: 8px;
          animation: smart-tutorial-pulse 2s ease-in-out infinite;
        }
        
        @keyframes smart-tutorial-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.3), 0 0 30px rgba(59, 130, 246, 0.4); }
        }
      `}</style>

      <Card 
        className="fixed bottom-20 right-4 w-[400px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[70vh] z-[10001] shadow-2xl flex flex-col"
        data-testid="smart-tutorial-panel"
      >
        <CardHeader className="pb-2 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Smart Guide</CardTitle>
                <p className="text-xs text-muted-foreground">AI-powered help</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                clearHighlight();
                onClose();
              }}
              data-testid="smart-tutorial-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.highlight && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => highlightElement(message.highlight!)}
                      >
                        <Lightbulb className="h-3 w-3 mr-1" />
                        Show me where
                      </Button>
                    )}
                  </div>
                </div>
                {shouldShowNextStepButton(message) && (
                  <div className="flex-shrink-0 self-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNextStep}
                      className="h-7 text-xs bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 hover:from-blue-500/20 hover:to-purple-500/20"
                      data-testid="btn-next-step"
                    >
                      Next Step
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {suggestions.length > 0 && messages.length <= 1 && (
          <div className="px-4 pb-2 flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((suggestion, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                  onClick={() => handleSuggestionClick(suggestion)}
                  data-testid={`suggestion-${index}`}
                >
                  {suggestion}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        <CardContent className="p-3 border-t flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask me anything..."
              disabled={isLoading}
              className="flex-1"
              data-testid="smart-tutorial-input"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={isLoading || !inputValue.trim()}
              data-testid="smart-tutorial-send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
