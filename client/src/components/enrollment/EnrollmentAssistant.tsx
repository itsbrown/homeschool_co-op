import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth0";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, SendIcon, Bot, User, Sparkles, Search, Brain, ArrowUp } from "lucide-react";

// Types for messages
type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface EnrollmentAction {
  type: "view_programs" | "enroll" | "view_children" | "recommend" | "register_child";
  programId?: number;
  childId?: number;
  interestArea?: string;
  ageRange?: string;
  // Fields for child registration
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  gradeLevel?: string;
  interests?: string[];
  learningStyle?: string;
  specialNeeds?: string;
  success?: boolean;
  error?: string;
}

export default function EnrollmentAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch user profile for personalized greeting
  const { data: profileData } = useQuery({
    queryKey: ['/api/users/profile'],
    enabled: isAuthenticated,
  }) as { data?: { firstName?: string; lastName?: string; name?: string } };

  // Fetch user's children
  const { data: children = [] } = useQuery({
    queryKey: ["/api/children"],
    enabled: isAuthenticated && user?.role === "parent",
  });
  
  // Fetch available programs
  const { data: programs = [] } = useQuery({
    queryKey: ["/api/programs"],
    select: (data: any[]) => data.filter((program: any) => program.isPublished),
  });
  
  // Initial welcome message from assistant
  useEffect(() => {
    if (messages.length === 0 && profileData) {
      const userName = profileData.firstName || user?.name || "parent";
      const initialMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Good afternoon, ${userName}.\nHow can I help you today?`,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
    }
  }, [messages, profileData, user]);
  
  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    
    try {
      // Send message to AI assistant
      const response = await apiRequest("POST", "/api/ai/enrollment-assistant", {
        message: inputMessage,
        childrenIds: Array.isArray(children) ? children.map((child: any) => child.id) : [],
        history: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });
      
      const data = await response.json();
      
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.message,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // If the AI suggested an action, handle it
      if (data.action) {
        handleAssistantAction(data.action);
      }
      
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to communicate with the enrollment assistant.",
        variant: "destructive"
      });
      
      // Add error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "I'm sorry, I encountered an error. Please try again later.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAssistantAction = async (action: EnrollmentAction) => {
    switch (action.type) {
      case "register_child":
        // The child was already registered on the server side
        if (action.success) {
          const successMessage: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `✅ Successfully registered ${action.firstName} ${action.lastName} in the system with ID: ${action.childId}!`,
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, successMessage]);
          
          // Refresh the children list
          queryClient.invalidateQueries({ queryKey: ["/api/children"] });
        } else {
          const errorMessage: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `❌ There was an error registering the child: ${action.error || 'Unknown error'}`,
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, errorMessage]);
        }
        break;
        
      case "enroll":
        if (action.programId && action.childId) {
          try {
            await apiRequest("POST", "/api/enrollments", {
              programId: action.programId,
              childId: action.childId,
              status: "pending",
              paymentStatus: "pending"
            });
            
            queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
            
            const successMessage: Message = {
              id: Date.now().toString(),
              role: "system",
              content: "✅ Enrollment request submitted successfully!",
              timestamp: new Date()
            };
            
            setMessages(prev => [...prev, successMessage]);
            
          } catch (error) {
            console.error("Enrollment error:", error);
            const errorMessage: Message = {
              id: Date.now().toString(),
              role: "system",
              content: "❌ There was an error processing the enrollment.",
              timestamp: new Date()
            };
            
            setMessages(prev => [...prev, errorMessage]);
          }
        }
        break;
        
      case "view_programs":
      case "recommend":
      case "view_children":
        // These actions would be handled by the AI response itself
        // We could potentially add UI elements here if needed
        break;
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Sample prompts
  const samplePrompts = [
    "Register my child for summer camp",
    "Find program recommendations for my 8-year-old who loves science",
    "What enrichment classes do you have for a 10-year-old?",
    "Help me find affordable art classes",
    "Register my child Sophia for music lessons"
  ];

  if (!isAuthenticated) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Bot className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Enrollment Assistant</h2>
        <p className="text-center mb-8 text-muted-foreground">Please log in to use the enrollment assistant.</p>
        <Button onClick={() => window.location.href = "/login"} size="lg">
          Login
        </Button>
      </div>
    );
  }
  
  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[70vh] p-4 bg-background/95">
      {/* Messages Area - Only show when conversation has started and no messages have been exchanged yet */}
      {messages.length === 1 && (
        <div className="w-full max-w-2xl mx-auto text-center mb-8">
          <div className="text-2xl font-medium mb-2">{messages[0].content.split('\n')[0]}</div>
          {messages[0].content.split('\n').length > 1 && (
            <div className="text-xl text-muted-foreground">
              {messages[0].content.split('\n').slice(1).join('\n')}
            </div>
          )}
        </div>
      )}
      
      {/* If conversation has more messages, show just the latest response at the top */}
      {messages.length > 1 && messages[messages.length - 1]?.content && (
        <div className="w-full max-w-2xl mx-auto text-center mb-8">
          <div className="text-2xl font-medium mb-2">{messages[messages.length - 1].content.split('\n')[0]}</div>
          {messages[messages.length - 1].content.split('\n').length > 1 && (
            <div className="text-xl text-muted-foreground">
              {messages[messages.length - 1].content.split('\n').slice(1).join('\n')}
            </div>
          )}
        </div>
      )}
      
      {/* Input Area */}
      <div className="w-full max-w-2xl mx-auto">
        <div className="relative">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to know?"
            className="pr-12 py-6 text-base rounded-full border-muted-foreground/20"
            disabled={isLoading}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full bg-muted/50 hover:bg-muted"
              disabled={isLoading}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full bg-muted/50 hover:bg-muted"
              disabled={isLoading}
            >
              <Brain className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleSendMessage} 
              variant="ghost"
              size="icon" 
              className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary" 
              disabled={isLoading || !inputMessage.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Sample Prompts - Show only at the beginning */}
      {messages.length <= 1 && (
        <div className="w-full max-w-2xl mx-auto mt-8 flex flex-wrap justify-center gap-2">
          {samplePrompts.map((prompt, index) => (
            <Button 
              key={index}
              variant="outline" 
              size="sm"
              className="text-xs bg-background hover:bg-muted/30 border border-muted-foreground/20"
              onClick={() => {
                setInputMessage(prompt);
                setTimeout(() => handleSendMessage(), 100);
              }}
            >
              {prompt}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}