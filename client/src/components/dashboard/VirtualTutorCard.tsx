import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, BookOpen } from "lucide-react";
import { askTutor, getTutorResources } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'tutor';
  timestamp: Date;
}

export default function VirtualTutorCard() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>([{
    id: "welcome",
    text: "Hi! How can I help with your lessons today? I can assist with generating practice problems, creating assessment materials, developing student activities, or adapting lessons for different learning styles.",
    sender: 'tutor',
    timestamp: new Date()
  }]);
  
  // Ask tutor mutation
  const askTutorMutation = useMutation({
    mutationFn: (content: string) => askTutor(content),
    onSuccess: (response) => {
      // Add tutor response to chat history
      setChatHistory(prev => [...prev, {
        id: `tutor-${Date.now()}`,
        text: response,
        sender: 'tutor',
        timestamp: new Date()
      }]);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to get a response from the tutor. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || askTutorMutation.isPending) return;
    
    // Add user message to chat history
    const userMessage = {
      id: `user-${Date.now()}`,
      text: message,
      sender: 'user' as const,
      timestamp: new Date()
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    
    // Call AI tutor API
    askTutorMutation.mutate(message);
    
    // Clear input
    setMessage("");
  };

  return (
    <Card>
      <CardHeader className="bg-muted/50 border-b">
        <CardTitle>AI Virtual Tutor</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <img 
            src="https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&h=100&q=80" 
            alt="AI Assistant avatar" 
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="ml-3">
            <p className="text-sm font-medium">Edison</p>
            <p className="text-xs text-muted-foreground">AI Learning Assistant</p>
          </div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <p className="text-sm">Hi! How can I help with your lessons today? I can assist with:</p>
          <ul className="mt-2 text-sm space-y-1 pl-5 list-disc">
            <li>Generating practice problems</li>
            <li>Creating assessment materials</li>
            <li>Developing student activities</li>
            <li>Adapting lessons for different learning styles</li>
          </ul>
          
          {isTyping && (
            <div className="mt-3 flex items-center">
              <div className="flex space-x-1.5">
                <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
              <span className="ml-2 text-xs text-muted-foreground">Edison is typing...</span>
            </div>
          )}
        </div>
        
        <form onSubmit={handleSendMessage} className="relative">
          <Input
            placeholder="Ask anything..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="pr-10"
          />
          <Button 
            size="icon" 
            className="absolute right-1 top-1 h-8 w-8 text-primary"
            type="submit"
            disabled={!message.trim() || isTyping}
          >
            <ArrowUp className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
