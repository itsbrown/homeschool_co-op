import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth0";
import { useSupabase } from "@/components/SupabaseProvider";
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
  const { session } = useSupabase();
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
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: "smooth",
          block: "end",
          inline: "nearest"
        });
      }
    };
    
    // Multiple attempts to ensure scrolling works
    const timeoutId1 = setTimeout(scrollToBottom, 50);
    const timeoutId2 = setTimeout(scrollToBottom, 200);
    const timeoutId3 = setTimeout(scrollToBottom, 500);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
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
      // In development, allow requests without session for testing
      if (session?.access_token) {
        localStorage.setItem('supabase_token', session.access_token);
      }

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
        content: data.response || data.message || "I'm sorry, I couldn't generate a response.",
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
  
  const handleQuickResponse = async (response: string) => {
    // Create user message for the quick response
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: response,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      // Send the quick response through the same flow
      if (session?.access_token) {
        localStorage.setItem('supabase_token', session.access_token);
      }

      const response_data = await apiRequest("POST", "/api/ai/enrollment-assistant", {
        message: response,
        childrenIds: Array.isArray(children) ? children.map((child: any) => child.id) : [],
        history: [...messages, userMessage].map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });
      
      const data = await response_data.json();
      
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response || data.message || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.action) {
        handleAssistantAction(data.action);
      }
      
    } catch (error) {
      console.error("Error sending quick response:", error);
      toast({
        title: "Error",
        description: "Failed to process your response.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
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
  
  // Show conversation view if there are messages
  if (messages.length > 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Conversation Header */}
        <div className="text-center border-b pb-4 px-4 pt-4 bg-gray-50">
          <h2 className="text-xl font-semibold">AI Enrollment Assistant</h2>
          <p className="text-muted-foreground text-sm">Get personalized help with finding and enrolling in programs</p>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" id="messages-container">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-70 block mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </span>
                
                {/* Quick action buttons for assistant messages */}
                {message.role === "assistant" && message.content.toLowerCase().includes("should i") && (
                  <div className="flex gap-2 mt-3">
                    <Button 
                      size="sm" 
                      onClick={() => handleQuickResponse("yes")}
                      disabled={isLoading}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      yes
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleQuickResponse("no")}
                      disabled={isLoading}
                    >
                      no
                    </Button>
                  </div>
                )}
              </div>
              
              {message.role === "user" && (
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="bg-primary/10">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input Area */}
        <div className="border-t bg-white p-4 flex-shrink-0">
          <div className="relative">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="pr-12 py-3"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSendMessage} 
              size="icon" 
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8" 
              disabled={isLoading || !inputMessage.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show initial interface when no messages
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center border-b pb-4 px-4 pt-4 bg-gray-50">
        <h2 className="text-xl font-semibold">AI Enrollment Assistant</h2>
        <p className="text-muted-foreground text-sm">Get personalized help with finding and enrolling in programs</p>
      </div>
      
      {/* Welcome Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
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
      
        {/* Sample Prompts */}
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
      </div>
    </div>
  );
}