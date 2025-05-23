import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Sparkles, User } from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface EnrollmentAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const samplePrompts = [
  "I'm looking for STEM programs for my 8-year-old daughter who loves building things",
  "What's the difference between the morning and afternoon art classes?",
  "Can you help me coordinate classes for two children with different interests?",
  "What programs fit within my $200/month budget for both kids?",
  "Are there any programs that combine art and science for elementary students?",
  "What are the most popular programs for 10-year-olds?"
];

export default function EnrollmentAssistantModal({ isOpen, onClose }: EnrollmentAssistantModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hi! I'm your AI Enrollment Assistant. I'm here to help you find the perfect programs for your children. What can I help you with today?",
      sender: 'assistant',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'd be happy to help you find programs! Based on what you've shared, let me suggest some options. For an 8-year-old who loves building, I recommend checking out our:\n\n• **STEM Explorer Program** - Perfect for hands-on learners\n• **Young Engineers Workshop** - Focuses on construction and design\n• **Creative Building Academy** - Combines art with engineering\n\nWould you like more details about any of these programs, or do you have specific requirements like scheduling or budget I should consider?",
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handlePromptClick = (prompt: string) => {
    setInputMessage(prompt);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-6 w-6 text-blue-600" />
            AI Enrollment Assistant
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.sender === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        message.sender === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {message.sender === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-6 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask me about programs for your children..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={!inputMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Sample Prompts Sidebar */}
          <div className="w-80 border-l bg-gray-50 p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Sparkles className="h-4 w-4" />
                Sample Questions
              </div>
              <div className="space-y-2">
                {samplePrompts.map((prompt, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="w-full text-left h-auto p-3 whitespace-normal justify-start text-gray-600 hover:text-gray-900 hover:bg-white"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    "{prompt}"
                  </Button>
                ))}
              </div>
              
              <div className="pt-4 border-t">
                <h4 className="font-medium text-gray-900 mb-2">What I can help with:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Find age-appropriate programs</li>
                  <li>• Compare class options</li>
                  <li>• Schedule coordination</li>
                  <li>• Budget planning</li>
                  <li>• Program recommendations</li>
                  <li>• Enrollment assistance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}