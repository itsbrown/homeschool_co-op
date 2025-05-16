import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, SendIcon, Bot, User } from "lucide-react";

// Types for messages
type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

interface EnrollmentAction {
  type: "view_programs" | "enroll" | "view_children" | "recommend";
  programId?: number;
  childId?: number;
  interestArea?: string;
  ageRange?: string;
}

export default function EnrollmentAssistant() {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch user's children
  const { data: children } = useQuery({
    queryKey: ["/api/children"],
    enabled: isAuthenticated && user?.role === "parent",
  });
  
  // Fetch available programs
  const { data: programs } = useQuery({
    queryKey: ["/api/programs"],
    select: (data: any) => data.filter((program: any) => program.isPublished),
  });
  
  // Initial welcome message from assistant
  useEffect(() => {
    if (messages.length === 0) {
      const initialMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Hi there! I'm your enrollment assistant. I can help you find and enroll in the perfect programs for your child. How can I assist you today?`,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
    }
  }, [messages]);
  
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
        childrenIds: children?.map((child: any) => child.id) || [],
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
  
  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Enrollment Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please log in to use the enrollment assistant.</p>
        </CardContent>
        <CardFooter>
          <Button onClick={() => window.location.href = "/login"}>
            Login
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Enrollment Assistant
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="h-[400px] overflow-y-auto p-4 border rounded-md mb-4">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex gap-3 mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role !== 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">AI</AvatarFallback>
                </Avatar>
              )}
              
              <div className={`px-4 py-2 rounded-lg max-w-[80%] ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : message.role === 'system'
                    ? 'bg-muted' 
                    : 'bg-muted/50'
              }`}>
                <p className="whitespace-pre-wrap">{message.content}</p>
                <div className="text-xs opacity-50 mt-1">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              {message.role === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-secondary">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="flex gap-2">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about programs or enrollment..."
            className="min-h-[60px]"
            disabled={isLoading}
          />
          <Button 
            onClick={handleSendMessage} 
            size="icon" 
            className="h-[60px] w-[60px]" 
            disabled={isLoading || !inputMessage.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <SendIcon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}