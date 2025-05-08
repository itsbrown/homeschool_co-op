import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, BookOpen } from "lucide-react";
import { askTutor, getTutorResources } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="bg-muted/50 border-b px-4 py-3">
        <div className="flex items-center">
          <img 
            src="https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&h=100&q=80" 
            alt="AI Assistant avatar" 
            className="w-8 h-8 rounded-full object-cover mr-3"
          />
          <div>
            <CardTitle className="text-base">Edison</CardTitle>
            <p className="text-xs text-muted-foreground">AI Learning Assistant</p>
          </div>
        </div>
      </CardHeader>
      
      <ScrollArea className="flex-grow px-4 py-4">
        <div className="space-y-4">
          {chatHistory.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.sender === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                <p className="text-xs opacity-70 mt-1">
                  {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
          ))}
          
          {askTutorMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <div className="flex space-x-1.5">
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t">
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
            disabled={!message.trim() || askTutorMutation.isPending}
          >
            <ArrowUp className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </Card>
  );
}
