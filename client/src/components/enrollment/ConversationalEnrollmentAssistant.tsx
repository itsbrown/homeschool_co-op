import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface ConversationalEnrollmentAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConversationalEnrollmentAssistant({ isOpen, onClose }: ConversationalEnrollmentAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [registrationData, setRegistrationData] = useState<any>({});
  const queryClient = useQueryClient();

  const registerChildMutation = useMutation({
    mutationFn: async (childData: any) => {
      const response = await apiRequest('POST', '/api/children', childData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/children'] });
    }
  });

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        content: "Hi! I'm your AI enrollment assistant. I can help you register children, find programs, answer questions about schedules and costs, or anything else you need. What would you like to do today?",
        sender: "assistant",
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  const processUserMessage = async (userInput: string): Promise<string> => {
    const input = userInput.toLowerCase();
    
    // Child registration flow
    if (input.includes('register') || input.includes('child') || input.includes('daughter') || input.includes('son')) {
      if (!registrationData.firstName) {
        return "Great! I'll help you register your child. What's their first and last name?";
      }
      if (!registrationData.age) {
        return `Perfect! How old is ${registrationData.firstName}?`;
      }
      if (!registrationData.gradeLevel) {
        return `What grade level is ${registrationData.firstName} in?`;
      }
      if (!registrationData.parentPhone) {
        return "I'll need your phone number for contact purposes. What's the best number to reach you?";
      }
      if (!registrationData.homeAddress) {
        return "What's your home address? I'll use this to find nearby schools and programs.";
      }
      if (!registrationData.schoolName) {
        // Extract zip code and show schools
        const zipMatch = registrationData.homeAddress?.match(/\\b\\d{5}(-\\d{4})?\\b/);
        const zipCode = zipMatch ? zipMatch[0] : '';
        
        if (zipCode) {
          return `Perfect! I found your zip code ${zipCode}. Which school are you registering for? We have American Seekers Academy, Liberty Learning Co-op, Heritage Homeschool Group, and Wisdom Academy in your area.`;
        } else {
          return "What's your zip code so I can find nearby schools?";
        }
      }
      
      // Complete registration
      try {
        await registerChildMutation.mutateAsync({
          firstName: registrationData.firstName,
          lastName: registrationData.lastName || '',
          age: registrationData.age,
          gradeLevel: registrationData.gradeLevel,
          parentPhone: registrationData.parentPhone,
          homeAddress: registrationData.homeAddress,
          schoolName: registrationData.schoolName,
          interests: '',
          medicalInfo: '',
          emergencyContact: '',
          specialNeeds: ''
        });
        
        setRegistrationData({});
        return `🎉 Registration complete! ${registrationData.firstName} has been successfully registered. You can now browse programs and schedule classes through your dashboard. Would you like me to help you find suitable programs for them?`;
      } catch (error) {
        return `I'm sorry, there was an issue completing the registration. Please try again or use the regular registration form.`;
      }
    }
    
    // Program finding
    if (input.includes('program') || input.includes('class') || input.includes('activity')) {
      return "I can help you find perfect programs! Our platform offers STEM programs, Arts & Crafts, Language Arts, Physical Education, and Music & Performing Arts. What age group and interests are you looking for?";
    }
    
    // Schedule coordination
    if (input.includes('schedule') || input.includes('time') || input.includes('when')) {
      return "I can help coordinate schedules! Most programs offer morning (9AM-12PM), afternoon (1PM-4PM), and evening (5PM-7PM) sessions, plus weekend options. Are you trying to coordinate multiple children or looking for specific times?";
    }
    
    // Cost/pricing questions
    if (input.includes('cost') || input.includes('price') || input.includes('budget') || input.includes('money')) {
      return "Our programs have various pricing options: Community programs (often free), Standard classes ($50-150/month), and Specialty programs for advanced courses. Family discounts are available for multiple children. What's your budget range?";
    }
    
    // Extract information from user input
    const nameMatch = userInput.match(/(?:my|their|his|her)\\s+(?:name|child)\\s+is\\s+([A-Za-z\\s]+)/i) || 
                     userInput.match(/^([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)$/);
    if (nameMatch && !registrationData.firstName) {
      const fullName = nameMatch[1].trim();
      const nameParts = fullName.split(' ');
      setRegistrationData({
        ...registrationData,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ')
      });
      return `Nice to meet ${nameParts[0]}! How old are they?`;
    }
    
    const ageMatch = userInput.match(/\\b(\\d{1,2})\\b/);
    if (ageMatch && !registrationData.age && registrationData.firstName) {
      setRegistrationData({
        ...registrationData,
        age: parseInt(ageMatch[1])
      });
      return `Got it, ${registrationData.firstName} is ${ageMatch[1]} years old. What grade level are they in?`;
    }
    
    const phoneMatch = userInput.match(/\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b/);
    if (phoneMatch && !registrationData.parentPhone) {
      setRegistrationData({
        ...registrationData,
        parentPhone: phoneMatch[0]
      });
      return "Perfect! Now I need your home address to find nearby schools and programs.";
    }
    
    // Address detection
    if ((userInput.includes('address') || /\\d+.*\\w+.*\\w+/i.test(userInput)) && !registrationData.homeAddress) {
      setRegistrationData({
        ...registrationData,
        homeAddress: userInput
      });
      
      const zipMatch = userInput.match(/\\b\\d{5}(-\\d{4})?\\b/);
      if (zipMatch) {
        return `Excellent! I found your zip code ${zipMatch[0]}. Here are schools in your area: American Seekers Academy, Liberty Learning Co-op, Heritage Homeschool Group, and Wisdom Academy. Which one are you registering for?`;
      } else {
        return "What's your zip code so I can find nearby schools?";
      }
    }
    
    // School selection
    if ((input.includes('american seekers') || input.includes('academy')) && !registrationData.schoolName) {
      setRegistrationData({
        ...registrationData,
        schoolName: 'American Seekers Academy'
      });
      return `Perfect choice! American Seekers Academy is an excellent school. Let me complete ${registrationData.firstName}'s registration now...`;
    }
    
    return "I'd be happy to help with that! I can assist with registering children, finding programs, scheduling, costs, or any other questions you have. What specifically would you like to know or do?";
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      sender: "user",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage("");
    setIsTyping(true);

    try {
      const responseContent = await processUserMessage(newUserMessage.content);
      
      setTimeout(() => {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          content: responseContent,
          sender: "assistant",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
        
        // Auto-scroll to bottom
        setTimeout(() => {
          const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollArea) {
            scrollArea.scrollTop = scrollArea.scrollHeight;
          }
        }, 100);
      }, 800);
    } catch (error) {
      setIsTyping(false);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "I'm sorry, I encountered an error. Please try again.",
        sender: "assistant",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const samplePrompts = [
    "Help me register my child",
    "Find programs for a 8-year-old interested in science",
    "What are your program costs and schedules?"
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-blue-600" />
            AI Enrollment Assistant
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Chat Interface */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1 p-4 border rounded-lg">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.sender === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.sender === "user"
                          ? "bg-blue-600 text-white ml-12"
                          : "bg-gray-100 text-gray-900 mr-12"
                      }`}
                    >
                      {message.sender === "assistant" && (
                        <Bot className="h-4 w-4 mb-2 text-blue-600" />
                      )}
                      <div className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="bg-gray-100 rounded-lg p-3 mr-12">
                      <Bot className="h-4 w-4 mb-2 text-blue-600" />
                      <div className="flex items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-gray-600">Typing...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* Input Area */}
            <div className="flex gap-2 mt-4">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message here..."
                className="flex-1"
                disabled={isTyping}
              />
              <Button onClick={handleSendMessage} disabled={isTyping || !inputMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sample Prompts Sidebar */}
          <div className="w-80 space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Try asking me:</h3>
              <div className="space-y-2">
                {samplePrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setInputMessage(prompt)}
                    className="w-full text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">I can help with:</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  Child registration
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                  Finding programs
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
                  Schedule coordination
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-600 rounded-full"></span>
                  Pricing questions
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}