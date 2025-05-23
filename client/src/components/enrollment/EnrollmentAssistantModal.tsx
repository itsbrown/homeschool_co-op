import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Sparkles, User, CheckCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  actions?: Action[];
}

interface Action {
  type: 'button' | 'input';
  label: string;
  value?: string;
  placeholder?: string;
}

interface EnrollmentAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const samplePrompts = [
  "I want to register my 8-year-old daughter who loves building things",
  "Help me register a new child and find programs for them",
  "Can you register my child and coordinate classes for siblings?",
  "I need to register two children and find budget-friendly programs",
  "Register my child and find art and science programs",
  "Help me register and enroll my 10-year-old in popular programs"
];

export default function EnrollmentAssistantModal({ isOpen, onClose }: EnrollmentAssistantModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationState, setConversationState] = useState<string>('welcome');
  const [registrationData, setRegistrationData] = useState<any>({});
  
  const queryClient = useQueryClient();
  
  // Child registration mutation
  const registerChildMutation = useMutation({
    mutationFn: (childData: any) => apiRequest("POST", "/api/children", childData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
    },
  });

  const processUserMessage = async (userInput: string) => {
    setIsTyping(true);
    
    const lowerInput = userInput.toLowerCase();
    
    // Check for registration intent
    const isRegistrationIntent = lowerInput.includes('register') ||
                                lowerInput.includes('add') ||
                                lowerInput.includes('new child') ||
                                lowerInput.includes('sign up');
    
    let response = "";

    if (isRegistrationIntent || registrationData) {
      // We're in registration mode
      if (!registrationData) {
        // Start new registration - extract initial info
        const newRegData = extractChildInfo(userInput);
        setRegistrationData(newRegData);
        response = buildRegistrationResponse(newRegData);
      } else {
        // Continue registration with additional info
        response = await handleRegistrationStep(userInput, registrationData);
      }
    } else {
      // General enrollment assistance
      response = await handleGeneralInquiry(userInput);
    }

    setTimeout(() => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        content: response,
        sender: "assistant",
        timestamp: new Date(),
        registrationData: registrationData
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const extractChildInfo = (input: string) => {
    const data: any = {};
    
    // Extract name - look for various patterns
    const namePatterns = [
      /(?:her name is|his name is|name is|called|named)\s+([A-Za-z\s]+?)(?:\s+(?:she's|he's|and|,))/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+(?:she's|he's|is))/,
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)/  // Names at start of message
    ];
    
    for (const pattern of namePatterns) {
      const match = input.match(pattern);
      if (match) {
        const fullName = match[1].trim();
        const nameParts = fullName.split(' ');
        data.firstName = nameParts[0];
        if (nameParts.length > 1) {
          data.lastName = nameParts.slice(1).join(' ');
        }
        break;
      }
    }
    
    // Extract age
    const ageMatch = input.match(/(?:she's|he's|is|age)\s*(\d+)|(\d+)\s*(?:years?\s*old|and)/i);
    if (ageMatch) {
      data.age = parseInt(ageMatch[1] || ageMatch[2]);
    }
    
    // Extract grade
    const gradeMatch = input.match(/(?:grade|starting|in)\s*(?:the\s*)?(\d+)(?:st|nd|rd|th)?\s*grade/i);
    if (gradeMatch) {
      data.gradeLevel = gradeMatch[1];
    }
    
    // Detect gender from pronouns and context
    if (input.match(/\b(?:she|her|daughter|girl)\b/i)) {
      data.gender = 'Female';
    } else if (input.match(/\b(?:he|his|him|son|boy)\b/i)) {
      data.gender = 'Male';
    }
    
    return data;
  };

  const buildRegistrationResponse = (regData: any) => {
    let response = "Great! I'd love to help you register ";
    
    if (regData.firstName) {
      response += `${regData.firstName}`;
    } else {
      response += "your child";
    }
    
    response += ". Let me gather some information:\n\n";
    
    const needed = [];
    if (!regData.firstName) needed.push("• **Child's full name**");
    if (!regData.age) needed.push("• **Age**");
    if (!regData.gender) needed.push("• **Gender** (Male/Female)");
    if (!regData.gradeLevel) needed.push("• **Current grade level**");
    if (!regData.interests) needed.push("• **Interests or learning preferences**");
    
    if (needed.length > 0) {
      response += "I still need:\n" + needed.join("\n");
      response += "\n\nYou can tell me everything at once or one piece at a time. For example: 'Her name is Emma, she's 8 years old, in 3rd grade, and loves art and science.'";
    } else {
      response += "I have all the basic information! Would you like me to register them now, or do you want to add any special notes about learning preferences or interests?";
    }
    
    return response;
  };

  const handleRegistrationStep = async (input: string, currentData: any) => {
    // Merge current data with any new info from this message
    const updatedData = { ...currentData, ...extractChildInfo(input) };
    setRegistrationData(updatedData);
    
    // Check if we have enough info to register
    const hasRequiredInfo = updatedData.firstName && updatedData.age;
    
    if (hasRequiredInfo && (input.toLowerCase().includes('register') || input.toLowerCase().includes('yes') || input.toLowerCase().includes('submit'))) {
      // Attempt registration
      try {
        await registerChildMutation.mutateAsync({
          firstName: updatedData.firstName,
          lastName: updatedData.lastName || '',
          age: updatedData.age,
          gender: updatedData.gender || '',
          gradeLevel: updatedData.gradeLevel || '',
          interests: updatedData.interests || '',
          medicalInfo: '',
          emergencyContact: '',
          specialNeeds: ''
        });
        
        setRegistrationData(null);
        return `🎉 **Registration Complete!** \n\n${updatedData.firstName} has been successfully registered! You can now:\n\n• Browse programs that match their interests\n• Schedule classes and activities\n• Manage their profile in your dashboard\n\nWould you like me to help you find suitable programs for ${updatedData.firstName}?`;
      } catch (error) {
        return `I'm sorry, there was an issue completing the registration. Please try again or use the regular registration form. The error was: ${error}`;
      }
    } else if (hasRequiredInfo) {
      // We have basic info, ask if they want to register
      return `Perfect! I have the information I need for ${updatedData.firstName}:\n\n• **Name:** ${updatedData.firstName} ${updatedData.lastName || ''}\n• **Age:** ${updatedData.age}\n• **Grade:** ${updatedData.gradeLevel || 'Not specified'}\n• **Gender:** ${updatedData.gender || 'Not specified'}\n\nWould you like me to register ${updatedData.firstName} now? Just say "yes" or "register" and I'll complete the registration!`;
    } else {
      return buildRegistrationResponse(updatedData);
    }
  };

  const handleGeneralInquiry = async (input: string) => {
    // Simple pattern matching for common inquiries
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('program') || lowerInput.includes('class')) {
      return "I can help you find the perfect programs! Our platform offers a wide variety of classes including:\n\n• **STEM Programs** - Science, technology, engineering, and math\n• **Arts & Crafts** - Creative expression and hands-on projects\n• **Language Arts** - Reading, writing, and communication skills\n• **Physical Education** - Sports and movement activities\n• **Music & Performing Arts** - Musical instruments and drama\n\nWhat age group and interests are you looking for? I can also help register a child if you haven't already!";
    }
    
    if (lowerInput.includes('schedule') || lowerInput.includes('time')) {
      return "I can help coordinate schedules for multiple children! Most of our programs offer flexible timing:\n\n• **Morning Sessions** - 9:00 AM - 12:00 PM\n• **Afternoon Sessions** - 1:00 PM - 4:00 PM\n• **Evening Sessions** - 5:00 PM - 7:00 PM\n• **Weekend Options** - Saturday and Sunday availability\n\nTell me about your children's ages and interests, and I can suggest programs that work well together timing-wise!";
    }
    
    if (lowerInput.includes('cost') || lowerInput.includes('price') || lowerInput.includes('budget')) {
      return "I'd be happy to help you find programs that fit your budget! Our programs have various pricing options:\n\n• **Community Programs** - Often free or low-cost\n• **Standard Classes** - Typically $50-150 per month\n• **Specialty Programs** - Advanced or specialized courses\n• **Family Discounts** - Available for multiple children\n\nWhat's your monthly budget range? I can recommend programs that fit your needs and help you register your children!";
    }
    
    return "I'm here to help with all your enrollment needs! I can:\n\n• **Register new children** - Just tell me about them\n• **Find suitable programs** - Based on age and interests\n• **Coordinate schedules** - For multiple children\n• **Answer questions** - About programs, costs, and logistics\n\nWhat would you like to do first? Feel free to ask me anything or tell me about a child you'd like to register!";
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
    
    await processUserMessage(newUserMessage.content);
  };

  const handlePromptClick = (prompt: string) => {
    setInputMessage(prompt);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
                      className={`flex gap-3 max-w-[80%] ${
                        message.sender === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.sender === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {message.sender === "user" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`p-3 rounded-lg ${
                          message.sender === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        {message.registrationData && (
                          <div className="mt-2 p-2 border rounded bg-white/10">
                            <div className="text-sm font-medium">Registration Progress:</div>
                            <div className="text-xs">
                              {message.registrationData.firstName && `✓ Name: ${message.registrationData.firstName}`}
                              {message.registrationData.age && ` ✓ Age: ${message.registrationData.age}`}
                              {message.registrationData.gender && ` ✓ Gender: ${message.registrationData.gender}`}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="flex gap-2 mt-4">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about registration, programs, or enrollment..."
                className="flex-1"
              />
              <Button onClick={handleSendMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Sample Prompts Sidebar */}
          <div className="w-80 border-l pl-4">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold">Try asking me:</h3>
            </div>
            <div className="space-y-2">
              {samplePrompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="w-full text-left justify-start h-auto p-3 whitespace-normal"
                  onClick={() => handlePromptClick(prompt)}
                >
                  <div className="text-sm">{prompt}</div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}