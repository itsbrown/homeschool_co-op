import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Bot,
  User,
  CreditCard,
  DollarSign,
  Users,
  BookOpen,
  Calendar,
  AlertTriangle,
  Info,
  Sparkles,
  LayoutDashboard,
  Megaphone,
  Clock,
  Loader2,
  ChevronRight,
  MessageSquare,
  ShoppingCart,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";

interface SuggestedAction {
  label: string;
  path: string;
  icon: 'billing' | 'classes' | 'cart' | 'enrollments' | 'credits' | 'children' | 'info';
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  suggestedActions?: SuggestedAction[];
}

interface QuickAction {
  label: string;
  action: string;
}

interface ContextData {
  parentName: string;
  schoolName: string;
  timeGreeting: string;
  children: Array<{
    id: number;
    name: string;
    age: number | null;
    gradeLevel: string;
    enrollmentCount: number;
    waitlistCount: number;
  }>;
  membershipStatus: string;
  membershipExpired: boolean;
  payments: {
    totalDue: number;
    overdueCount: number;
    upcoming: Array<{
      amount: number;
      dueDate: string;
      className: string;
      childName: string;
      isOverdue: boolean;
    }>;
  };
  credits: {
    totalAvailable: number;
    breakdown: Array<{ type: string; amount: number; title: string }>;
  };
  enrollments: {
    activeCount: number;
    waitlistCount: number;
  };
  announcements: Array<{ subject: string; content: string; date: string }>;
  alerts: {
    urgent: string[];
    important: string[];
    info: string[];
  };
  quickActions: QuickAction[];
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ContextSidebar({ context, isLoading }: { context: ContextData | null; isLoading: boolean }) {
  const { openCart } = useCart();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!context) return null;

  return (
    <div className="space-y-3 p-4">
      {context.payments.totalDue > 0 && (
        <Card className={cn(
          "border-l-4",
          context.payments.overdueCount > 0 ? "border-l-red-500 bg-red-50/50" : "border-l-amber-500 bg-amber-50/50"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payments Due</span>
            </div>
            <div className="text-xl font-bold">{formatCurrency(context.payments.totalDue)}</div>
            {context.payments.overdueCount > 0 && (
              <Badge variant="destructive" className="mt-1 text-xs">
                {context.payments.overdueCount} overdue
              </Badge>
            )}
            {context.payments.upcoming.length > 0 && (
              <div className="mt-2 space-y-1">
                {context.payments.upcoming.map((p, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex justify-between">
                    <span className="truncate mr-2">{p.className}</span>
                    <span className={cn("whitespace-nowrap", p.isOverdue && "text-red-600 font-medium")}>
                      {formatCurrency(p.amount)} · {p.dueDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button
              size="sm"
              className="mt-3 w-full"
              onClick={openCart}
            >
              Pay Now
            </Button>
          </CardContent>
        </Card>
      )}

      {context.credits.totalAvailable > 0 && (
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available Credits</span>
            </div>
            <div className="text-xl font-bold text-emerald-700">{formatCurrency(context.credits.totalAvailable)}</div>
            {context.credits.breakdown.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {context.credits.breakdown.map((c, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {c.type}: {formatCurrency(c.amount)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {context.children.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">My Children</span>
            </div>
            <div className="space-y-2">
              {context.children.map(child => (
                <div key={child.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{child.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {child.age ? `Age ${child.age}` : ''}{child.gradeLevel ? ` · ${child.gradeLevel}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {child.enrollmentCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{child.enrollmentCount} class{child.enrollmentCount !== 1 ? 'es' : ''}</Badge>
                    )}
                    {child.waitlistCount > 0 && (
                      <Badge variant="outline" className="text-xs">{child.waitlistCount} waitlist</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {context.enrollments.activeCount > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enrollments</span>
            </div>
            <div className="text-sm">
              <span className="font-medium">{context.enrollments.activeCount}</span> active
              {context.enrollments.waitlistCount > 0 && (
                <span className="text-muted-foreground"> · {context.enrollments.waitlistCount} waitlisted</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {context.announcements.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Announcements</span>
            </div>
            <div className="space-y-2">
              {context.announcements.map((a, i) => (
                <div key={i}>
                  <div className="text-sm font-medium">{a.subject}</div>
                  <div className="text-xs text-muted-foreground">{a.content}</div>
                  {a.date && <div className="text-xs text-muted-foreground/60 mt-0.5">{a.date}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="pt-2">
        <Link href="/parent/home">
          <Button variant="outline" size="sm" className="w-full gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Browse on your own
          </Button>
        </Link>
      </div>
    </div>
  );
}

function MobileSidebarCards({ context, isLoading }: { context: ContextData | null; isLoading: boolean }) {
  const { openCart } = useCart();

  if (isLoading || !context) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 min-w-[140px] rounded-lg" />
        ))}
      </div>
    );
  }

  const cards: Array<{ icon: any; label: string; value: string; color: string; onClick?: () => void }> = [];

  if (context.payments.totalDue > 0) {
    cards.push({
      icon: DollarSign,
      label: context.payments.overdueCount > 0 ? 'Overdue' : 'Due',
      value: formatCurrency(context.payments.totalDue),
      color: context.payments.overdueCount > 0 ? 'text-red-600' : 'text-amber-600',
      onClick: openCart,
    });
  }

  if (context.credits.totalAvailable > 0) {
    cards.push({
      icon: CreditCard,
      label: 'Credits',
      value: formatCurrency(context.credits.totalAvailable),
      color: 'text-emerald-600',
    });
  }

  if (context.children.length > 0) {
    cards.push({
      icon: Users,
      label: 'Children',
      value: `${context.children.length}`,
      color: 'text-blue-600',
    });
  }

  if (context.enrollments.activeCount > 0) {
    cards.push({
      icon: BookOpen,
      label: 'Enrolled',
      value: `${context.enrollments.activeCount}`,
      color: 'text-indigo-600',
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide border-b bg-muted/30">
      {cards.map((card, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-2 min-w-fit bg-background rounded-lg px-3 py-2 border",
            card.onClick && "cursor-pointer hover:bg-muted/50"
          )}
          onClick={card.onClick}
        >
          <card.icon className={cn("h-4 w-4", card.color)} />
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">{card.label}</div>
            <div className={cn("text-sm font-semibold", card.color)}>{card.value}</div>
          </div>
        </div>
      ))}
      <Link href="/parent/home">
        <div className="flex items-center gap-2 min-w-fit bg-background rounded-lg px-3 py-2 border cursor-pointer hover:bg-muted/50">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          <div className="text-xs font-medium">Dashboard</div>
        </div>
      </Link>
    </div>
  );
}

function SafeMessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.trim() === '') return <br key={i} />;
        const parts: Array<string | JSX.Element> = [];
        let remaining = line;
        let partKey = 0;
        const boldRegex = /\*\*(.*?)\*\*/g;
        let lastIndex = 0;
        let match;
        while ((match = boldRegex.exec(remaining)) !== null) {
          if (match.index > lastIndex) {
            parts.push(remaining.substring(lastIndex, match.index));
          }
          parts.push(<strong key={`b-${i}-${partKey++}`}>{match[1]}</strong>);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < remaining.length) {
          parts.push(remaining.substring(lastIndex));
        }

        const isBullet = line.trimStart().startsWith('• ') || line.trimStart().startsWith('- ');

        return (
          <div key={i} className={isBullet ? "ml-3" : ""}>
            {parts.length > 0 ? parts : line}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted rounded-tl-sm"
      )}>
        <SafeMessageContent content={message.content} />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function QuickActionChips({ actions, onAction }: { actions: QuickAction[]; onAction: (action: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onAction(action.action)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
        >
          <ChevronRight className="h-3 w-3" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

const ACTION_ICONS: Record<string, typeof DollarSign> = {
  billing: DollarSign,
  classes: BookOpen,
  cart: ShoppingCart,
  enrollments: BookOpen,
  credits: CreditCard,
  children: Users,
  info: FileText,
};

function SuggestedActionButtons({ actions }: { actions: SuggestedAction[] }) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2 ml-11">
      {actions.map((action, i) => {
        const Icon = ACTION_ICONS[action.icon] || ExternalLink;
        return (
          <Link key={i} href={action.path}>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20">
              <Icon className="h-3.5 w-3.5" />
              {action.label}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </button>
          </Link>
        );
      })}
    </div>
  );
}

export default function ParentConciergePage() {
  const { session } = useAuth();
  const { addItem } = useCart();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: context, isLoading: contextLoading } = useQuery<ContextData>({
    queryKey: ["/api/parent-concierge/context"],
    enabled: !!session?.access_token,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (context && messages.length === 0) {
      const greeting = buildGreeting(context);
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [context]);

  function buildGreeting(ctx: ContextData): string {
    let greeting = `${ctx.timeGreeting}, ${ctx.parentName}! 👋`;

    if (ctx.schoolName) {
      greeting += ` Welcome to **${ctx.schoolName}**.`;
    }

    greeting += "\n\nI'm your ASA Assistant — I can help you with enrollments, payments, class info, and more.";

    if (ctx.alerts.urgent.length > 0) {
      greeting += "\n\n⚠️ **Needs your attention:**\n";
      greeting += ctx.alerts.urgent.map(a => `• ${a}`).join("\n");
    }

    if (ctx.alerts.important.length > 0) {
      greeting += "\n\n📌 **Coming up:**\n";
      greeting += ctx.alerts.important.map(a => `• ${a}`).join("\n");
    }

    if (ctx.alerts.info.length > 0) {
      greeting += "\n\n" + ctx.alerts.info.map(a => `💡 ${a}`).join("\n");
    }

    greeting += "\n\nHow can I help you today?";

    return greeting;
  }

  async function sendMessage(messageText?: string) {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setInput("");
    setShowQuickActions(false);

    const userMessage: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await apiRequest("POST", "/api/parent-concierge/chat", {
        message: text,
        conversationHistory,
      });

      const data = await response.json();

      if (data.error && data.fallbackResponse) {
        setMessages(prev => [...prev, { role: "assistant", content: data.fallbackResponse }]);
      } else {
        if (data.cartActions && Array.isArray(data.cartActions)) {
          for (const action of data.cartActions) {
            addItem({
              classId: action.classId,
              childId: action.childId,
              childName: action.childName,
              className: action.className,
              price: action.price,
              description: action.description,
              startDate: action.startDate,
              endDate: action.endDate,
              schedule: action.schedule,
            });
          }
        }

        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.response,
          toolsUsed: data.toolsUsed,
          suggestedActions: data.suggestedActions,
        }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I'm sorry, I had trouble processing that. Please try again or use the **Browse on your own** link to navigate the platform directly.",
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full w-full">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-[320px] xl:w-[360px] border-r bg-muted/20 overflow-y-auto">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold">ASA Assistant</h2>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium tracking-wide">BETA</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Your school concierge</p>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <ContextSidebar context={context || null} isLoading={contextLoading} />
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">ASA Assistant</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium tracking-wide">BETA</Badge>
            </div>
          </div>
          <Link href="/parent/home">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Button>
          </Link>
        </div>

        {/* Mobile Summary Cards */}
        <div className="lg:hidden">
          <MobileSidebarCards context={context || null} isLoading={contextLoading} />
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-4 pt-4">
          <div className="max-w-2xl mx-auto pb-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <MessageBubble message={msg} />
                {msg.role === "assistant" && msg.suggestedActions && (
                  <SuggestedActionButtons actions={msg.suggestedActions} />
                )}
              </div>
            ))}

            {showQuickActions && context?.quickActions && messages.length <= 1 && (
              <QuickActionChips
                actions={context.quickActions}
                onAction={(action) => sendMessage(action)}
              />
            )}

            {isLoading && <TypingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area — Fixed at Bottom */}
        <div className="border-t bg-background p-3 sm:p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  className="w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-h-[44px] max-h-[120px]"
                  rows={1}
                  style={{ fontSize: '16px' }}
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
              AI assistant may make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
