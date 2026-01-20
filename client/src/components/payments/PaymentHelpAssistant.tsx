import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  HelpCircle,
  X, 
  Send, 
  Loader2,
  ChevronRight,
  Bot,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/components/SupabaseProvider';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PaymentContext {
  membershipStatus?: string;
  membershipExpired?: boolean;
  membershipAmount?: number;
  outstandingBalance?: number;
  upcomingPayments?: Array<{
    amount: number;
    dueDate: string;
    className: string;
  }>;
  hasPaymentPlan?: boolean;
}

const PAYMENT_PAGES = [
  '/parent/cart',
  '/parent/checkout',
  '/parent/billing',
  '/parent/payment-plans',
  '/cart',
  '/checkout',
  '/billing',
  '/payment-plans',
  '/parent/payments'
];

export default function PaymentHelpAssistant() {
  const [location] = useLocation();
  const { user, session } = useSupabase();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPaymentPage = PAYMENT_PAGES.some(page => location.startsWith(page));

  useEffect(() => {
    if (isOpen && user) {
      fetchPaymentContext();
      fetchSuggestions();
      inputRef.current?.focus();
      
      if (messages.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: "Hi! I'm here to help with any payment questions. Ask me about your balance, payment plans, membership fees, or why your checkout might not be working. I have access to your account details and can give you personalized answers!",
          timestamp: new Date()
        }]);
      }
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchPaymentContext = async () => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch('/api/payment-help/context', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPaymentContext(data);
      }
    } catch (error) {
      console.error('Failed to fetch payment context:', error);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await fetch(`/api/payment-help/suggestions?path=${encodeURIComponent(location)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

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

    try {
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/payment-help/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          message: content,
          conversationHistory,
          pageContext: {
            currentPath: location
          }
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response || data.fallbackResponse || "I'm sorry, I couldn't process that. Please try again.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

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

  if (!isPaymentPage || !user) return null;

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-[9999] h-14 w-14 rounded-full shadow-lg bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
          data-testid="payment-help-button"
        >
          <div className="relative">
            <HelpCircle className="h-6 w-6 text-white" />
            <DollarSign className="h-3 w-3 text-white absolute -top-1 -right-1" />
          </div>
        </Button>
      )}

      {isOpen && (
        <Card 
          className="fixed bottom-4 right-4 w-[400px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[75vh] z-[10001] shadow-2xl flex flex-col border-green-200"
          data-testid="payment-help-panel"
        >
          <CardHeader className="pb-2 border-b bg-gradient-to-r from-green-50 to-emerald-50 flex-shrink-0 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                  <CreditCard className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">Payment Help</CardTitle>
                  <p className="text-xs text-muted-foreground">AI-powered assistance</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsOpen(false)}
                data-testid="payment-help-close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          {paymentContext && (paymentContext.membershipExpired || paymentContext.outstandingBalance) && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <DollarSign className="h-3 w-3" />
                <span>
                  {paymentContext.membershipExpired && 'Membership renewal required. '}
                  {paymentContext.outstandingBalance && paymentContext.outstandingBalance > 0 && 
                    `Outstanding balance: $${(paymentContext.outstandingBalance / 100).toFixed(2)}`
                  }
                </span>
              </div>
            </div>
          )}

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
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      message.role === 'user'
                        ? 'bg-green-600 text-white'
                        : 'bg-muted'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
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
              <p className="text-xs text-muted-foreground mb-2">Common questions:</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.slice(0, 4).map((suggestion, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="cursor-pointer hover:bg-green-100 hover:text-green-700 hover:border-green-300 transition-colors text-xs"
                    onClick={() => handleSuggestionClick(suggestion)}
                    data-testid={`payment-suggestion-${index}`}
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
                placeholder="Ask about payments..."
                disabled={isLoading}
                className="flex-1"
                data-testid="payment-help-input"
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={isLoading || !inputValue.trim()}
                className="bg-green-600 hover:bg-green-700"
                data-testid="payment-help-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
