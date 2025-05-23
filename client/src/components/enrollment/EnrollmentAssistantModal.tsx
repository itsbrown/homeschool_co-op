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

  // Initialize conversation when modal opens
  React.useEffect(() => {
    if (isOpen && messages.length === 0) {
      initializeConversation();
    }
  }, [isOpen]);
  
  // Child registration mutation
  const registerChildMutation = useMutation({
    mutationFn: (childData: any) => apiRequest("POST", "/api/children", childData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
    },
  });

  // Initialize welcome message when modal opens
  const initializeConversation = () => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: "welcome",
        content: "Hi! I'm your Enrollment Assistant. I can help you with:",
        sender: "assistant",
        timestamp: new Date(),
        actions: [
          { type: 'button', label: '👶 Register a New Child', value: 'register_child' },
          { type: 'button', label: '🔍 Find Programs', value: 'find_programs' },
          { type: 'button', label: '📅 Schedule Classes', value: 'schedule_classes' },
          { type: 'button', label: '💰 Payment Help', value: 'payment_help' }
        ]
      };
      setMessages([welcomeMessage]);
    }
  };

  const handleAction = async (actionValue: string, userInput?: string) => {
    setIsTyping(true);

    let response: Message;

    switch (conversationState) {
      case 'welcome':
        response = await handleWelcomeAction(actionValue);
        break;
      case 'register_child_name':
        response = await handleChildNameInput(userInput!);
        break;
      case 'register_child_age':
        response = await handleChildAgeInput(userInput!);
        break;
      case 'register_child_gender':
        response = await handleChildGenderSelection(actionValue);
        break;
      case 'register_child_grade':
        response = await handleChildGradeInput(userInput!);
        break;
      case 'register_parent_contact':
        response = await handleParentContactInput(userInput!);
        break;
      case 'register_home_address':
        response = await handleHomeAddressInput(userInput!);
        break;
      case 'register_school_selection':
        response = await handleSchoolSelectionInput(userInput!);
        break;
      case 'register_choose_school':
        response = await handleSchoolChoiceSelection(userInput || actionValue);
        break;
      case 'register_emergency_contact1':
        response = await handleEmergencyContact1Input(userInput!);
        break;
      case 'register_emergency_contact2':
        response = await handleEmergencyContact2Input(userInput!);
        break;
      case 'register_medical_info':
        response = await handleMedicalInfoInput(userInput || actionValue);
        break;
      case 'register_caregiver_info':
        response = await handleCaregiverInfoInput(userInput || actionValue);
        break;
      case 'register_child_confirm':
        response = await handleRegistrationConfirmation(actionValue);
        break;
      default:
        response = await handleDefaultAction(actionValue, userInput);
    }

    setTimeout(() => {
      setMessages(prev => {
        const newMessages = [...prev, response];
        // Auto-scroll to bottom after state update
        setTimeout(() => {
          const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollArea) {
            scrollArea.scrollTo({
              top: scrollArea.scrollHeight,
              behavior: 'smooth'
            });
          }
        }, 50);
        return newMessages;
      });
      setIsTyping(false);
    }, 800);
  };

  // Conversation flow handlers
  const handleWelcomeAction = async (actionValue: string): Promise<Message> => {
    switch (actionValue) {
      case 'register_child':
        setConversationState('register_child_name');
        return {
          id: Date.now().toString(),
          content: "Great! Let's register your child. What's their first and last name?",
          sender: "assistant",
          timestamp: new Date(),
          actions: [{ type: 'input', label: 'Child\'s Name', placeholder: 'Enter first and last name' }]
        };
      case 'find_programs':
        return {
          id: Date.now().toString(),
          content: "I can help you find programs! What age group or interests are you looking for?",
          sender: "assistant",
          timestamp: new Date(),
          actions: [
            { type: 'button', label: 'Ages 5-8', value: 'programs_5_8' },
            { type: 'button', label: 'Ages 9-12', value: 'programs_9_12' },
            { type: 'button', label: 'Ages 13+', value: 'programs_13_plus' }
          ]
        };
      default:
        return {
          id: Date.now().toString(),
          content: "I'd be happy to help with that! This feature is coming soon. For now, I can help you register a child or find programs.",
          sender: "assistant",
          timestamp: new Date(),
          actions: [
            { type: 'button', label: '🔙 Back to Main Menu', value: 'back_to_main' }
          ]
        };
    }
  };

  const handleChildNameInput = async (name: string): Promise<Message> => {
    const nameParts = name.trim().split(' ');
    setRegistrationData({
      ...registrationData,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || ''
    });
    
    setConversationState('register_child_age');
    return {
      id: Date.now().toString(),
      content: `Perfect! How old is ${nameParts[0]}?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Age', placeholder: 'Enter age (e.g., 9)' }]
    };
  };

  const handleChildAgeInput = async (age: string): Promise<Message> => {
    const ageNum = parseInt(age);
    setRegistrationData({
      ...registrationData,
      age: ageNum
    });
    
    setConversationState('register_child_gender');
    return {
      id: Date.now().toString(),
      content: `Got it! What's ${registrationData.firstName}'s gender?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [
        { type: 'button', label: 'Female', value: 'Female' },
        { type: 'button', label: 'Male', value: 'Male' }
      ]
    };
  };

  const handleChildGenderSelection = async (gender: string): Promise<Message> => {
    setRegistrationData({
      ...registrationData,
      gender
    });
    
    setConversationState('register_child_grade');
    return {
      id: Date.now().toString(),
      content: `What grade level is ${registrationData.firstName} in?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Grade Level', placeholder: 'Enter grade (e.g., 4th grade, K, PreK)' }]
    };
  };

  const handleChildGradeInput = async (grade: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      gradeLevel: grade
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_parent_contact');
    return {
      id: Date.now().toString(),
      content: `Great! Now I need some contact information. What's the best phone number to reach you?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Parent Phone Number', placeholder: 'Enter your phone number' }]
    };
  };

  const handleParentContactInput = async (phone: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      parentPhone: phone
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_home_address');
    return {
      id: Date.now().toString(),
      content: `Perfect! What's your home address?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Home Address', placeholder: 'Enter your full home address' }]
    };
  };

  const handleHomeAddressInput = async (address: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      homeAddress: address
    };
    setRegistrationData(updatedData);
    
    // Extract zip code from address for school matching
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    const zipCode = zipMatch ? zipMatch[0] : '';
    
    if (zipCode) {
      // Automatically use extracted zip code and show schools
      const updatedData = {
        ...registrationData,
        zipCode: zipCode
      };
      setRegistrationData(updatedData);
      
      setConversationState('register_choose_school');
      return {
        id: Date.now().toString(),
        content: `Perfect! I found your zip code **${zipCode}** from your address. Here are the schools in your area. Which school are you registering for?`,
        sender: "assistant",
        timestamp: new Date(),
        actions: [
          { type: 'button', label: '🏫 American Seekers Academy', value: 'school_1' },
          { type: 'button', label: '🏛️ Liberty Learning Co-op', value: 'school_2' },
          { type: 'button', label: '📚 Heritage Homeschool Group', value: 'school_3' },
          { type: 'button', label: '🎓 Wisdom Academy', value: 'school_4' },
          { type: 'input', label: 'Other School', placeholder: 'Enter school name if not listed' }
        ]
      };
    } else {
      setConversationState('register_school_selection');
      return {
        id: Date.now().toString(),
        content: `Perfect! Now I need to know which school you're registering for. What's your zip code so I can find nearby schools?`,
        sender: "assistant",
        timestamp: new Date(),
        actions: [{ type: 'input', label: 'Zip Code', placeholder: 'Enter your zip code (e.g., 12345)' }]
      };
    }
  };

  const handleSchoolSelectionInput = async (zipCode: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      zipCode: zipCode
    };
    setRegistrationData(updatedData);
    
    // In a real implementation, you would fetch schools by zip code
    // For now, showing sample schools
    setConversationState('register_choose_school');
    return {
      id: Date.now().toString(),
      content: `Great! Here are the schools in your area (${zipCode}). Which school are you registering for?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [
        { type: 'button', label: '🏫 American Seekers Academy', value: 'school_1' },
        { type: 'button', label: '🏛️ Liberty Learning Co-op', value: 'school_2' },
        { type: 'button', label: '📚 Heritage Homeschool Group', value: 'school_3' },
        { type: 'button', label: '🎓 Wisdom Academy', value: 'school_4' },
        { type: 'input', label: 'Other School', placeholder: 'Enter school name if not listed' }
      ]
    };
  };

  const handleSchoolChoiceSelection = async (schoolChoice: string): Promise<Message> => {
    let schoolName = '';
    let schoolId = null;
    
    switch (schoolChoice) {
      case 'school_1':
        schoolName = 'American Seekers Academy';
        schoolId = 1;
        break;
      case 'school_2':
        schoolName = 'Liberty Learning Co-op';
        schoolId = 2;
        break;
      case 'school_3':
        schoolName = 'Heritage Homeschool Group';
        schoolId = 3;
        break;
      case 'school_4':
        schoolName = 'Wisdom Academy';
        schoolId = 4;
        break;
      default:
        schoolName = schoolChoice; // Custom school name entered
        schoolId = null;
    }
    
    const updatedData = {
      ...registrationData,
      selectedSchool: schoolName,
      selectedSchoolId: schoolId
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_emergency_contact1');
    return {
      id: Date.now().toString(),
      content: `Excellent! You've selected **${schoolName}**. Now I need emergency contact information. Who should we contact first in case of an emergency?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Emergency Contact 1 (Name & Phone)', placeholder: 'e.g., Grandma Sarah - (555) 123-4567' }]
    };
  };

  const handleEmergencyContact1Input = async (contact1: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      emergencyContact1: contact1
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_emergency_contact2');
    return {
      id: Date.now().toString(),
      content: `And who should we contact as a second emergency contact?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [{ type: 'input', label: 'Emergency Contact 2 (Name & Phone)', placeholder: 'e.g., Uncle Mike - (555) 987-6543' }]
    };
  };

  const handleEmergencyContact2Input = async (contact2: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      emergencyContact2: contact2
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_medical_info');
    return {
      id: Date.now().toString(),
      content: `Does ${registrationData.firstName} have any allergies, medical conditions, or special needs we should know about?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [
        { type: 'button', label: 'No special needs', value: 'no_special_needs' },
        { type: 'input', label: 'Medical/Special Needs Info', placeholder: 'Describe any allergies, conditions, or special needs' }
      ]
    };
  };

  const handleMedicalInfoInput = async (medicalInfo: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      medicalInfo: medicalInfo === 'no_special_needs' ? 'None' : medicalInfo
    };
    setRegistrationData(updatedData);
    
    if (medicalInfo !== 'no_special_needs' && medicalInfo.toLowerCase().includes('special need')) {
      setConversationState('register_caregiver_info');
      return {
        id: Date.now().toString(),
        content: `Will there be a special needs caregiver accompanying ${registrationData.firstName}? If so, what's their name and when will they be present?`,
        sender: "assistant",
        timestamp: new Date(),
        actions: [
          { type: 'button', label: 'No caregiver needed', value: 'no_caregiver' },
          { type: 'input', label: 'Caregiver Info', placeholder: 'Name and schedule (e.g., Jane Doe - Mondays & Wednesdays)' }
        ]
      };
    } else {
      setConversationState('register_child_confirm');
      return await showRegistrationConfirmation();
    }
  };

  const handleCaregiverInfoInput = async (caregiverInfo: string): Promise<Message> => {
    const updatedData = {
      ...registrationData,
      caregiverInfo: caregiverInfo === 'no_caregiver' ? 'None' : caregiverInfo
    };
    setRegistrationData(updatedData);
    
    setConversationState('register_child_confirm');
    return await showRegistrationConfirmation();
  };

  const showRegistrationConfirmation = async (): Promise<Message> => {
    return {
      id: Date.now().toString(),
      content: `Perfect! Let me confirm all the details:\n\n**Child Information:**\n• **Name:** ${registrationData.firstName} ${registrationData.lastName}\n• **Age:** ${registrationData.age}\n• **Gender:** ${registrationData.gender}\n• **Grade:** ${registrationData.gradeLevel}\n\n**School Selection:**\n• **School:** ${registrationData.selectedSchool}\n• **Zip Code:** ${registrationData.zipCode}\n\n**Contact Information:**\n• **Parent Phone:** ${registrationData.parentPhone}\n• **Home Address:** ${registrationData.homeAddress}\n• **Emergency Contact 1:** ${registrationData.emergencyContact1}\n• **Emergency Contact 2:** ${registrationData.emergencyContact2}\n\n**Medical/Special Needs:**\n• **Medical Info:** ${registrationData.medicalInfo || 'None'}\n• **Caregiver:** ${registrationData.caregiverInfo || 'None'}\n\nShould I register ${registrationData.firstName} at ${registrationData.selectedSchool} with this information?`,
      sender: "assistant",
      timestamp: new Date(),
      actions: [
        { type: 'button', label: '✅ Yes, Register', value: 'confirm_register' },
        { type: 'button', label: '📝 Edit Details', value: 'edit_details' }
      ]
    };
  };

  const handleRegistrationConfirmation = async (action: string): Promise<Message> => {
    if (action === 'confirm_register') {
      try {
        await registerChildMutation.mutateAsync({
          firstName: registrationData.firstName,
          lastName: registrationData.lastName || '',
          age: registrationData.age,
          gender: registrationData.gender,
          gradeLevel: registrationData.gradeLevel || '',
          interests: '',
          medicalInfo: registrationData.medicalInfo || '',
          emergencyContact: `${registrationData.emergencyContact1 || ''} | ${registrationData.emergencyContact2 || ''}`,
          specialNeeds: registrationData.caregiverInfo || '',
          parentPhone: registrationData.parentPhone || '',
          homeAddress: registrationData.homeAddress || ''
        });
        
        setRegistrationData({});
        setConversationState('welcome');
        
        return {
          id: Date.now().toString(),
          content: `🎉 **Registration Complete!**\n\n${registrationData.firstName} has been successfully registered! You can now:\n\n• Browse programs in your dashboard\n• Schedule classes and activities\n• Manage their profile\n\nWould you like to find programs for ${registrationData.firstName}?`,
          sender: "assistant",
          timestamp: new Date(),
          actions: [
            { type: 'button', label: '🔍 Find Programs', value: 'find_programs' },
            { type: 'button', label: '👶 Register Another Child', value: 'register_child' },
            { type: 'button', label: '🏠 Back to Main Menu', value: 'back_to_main' }
          ]
        };
      } catch (error) {
        return {
          id: Date.now().toString(),
          content: `I'm sorry, there was an issue completing the registration. Please try again or use the regular registration form.`,
          sender: "assistant",
          timestamp: new Date(),
          actions: [
            { type: 'button', label: '🔄 Try Again', value: 'register_child' },
            { type: 'button', label: '🏠 Back to Main Menu', value: 'back_to_main' }
          ]
        };
      }
    } else {
      setConversationState('register_child_name');
      return {
        id: Date.now().toString(),
        content: "No problem! Let's start over. What's your child's first and last name?",
        sender: "assistant",
        timestamp: new Date(),
        actions: [{ type: 'input', label: 'Child\'s Name', placeholder: 'Enter first and last name' }]
      };
    }
  };

  const handleDefaultAction = async (actionValue: string, userInput?: string): Promise<Message> => {
    if (actionValue === 'back_to_main') {
      setConversationState('welcome');
      return {
        id: "welcome-return",
        content: "How can I help you today?",
        sender: "assistant",
        timestamp: new Date(),
        actions: [
          { type: 'button', label: '👶 Register a New Child', value: 'register_child' },
          { type: 'button', label: '🔍 Find Programs', value: 'find_programs' },
          { type: 'button', label: '📅 Schedule Classes', value: 'schedule_classes' },
          { type: 'button', label: '💰 Payment Help', value: 'payment_help' }
        ]
      };
    }
    
    return {
      id: Date.now().toString(),
      content: "I'm here to help! Please choose an option from the menu.",
      sender: "assistant",
      timestamp: new Date(),
      actions: [
        { type: 'button', label: '🏠 Back to Main Menu', value: 'back_to_main' }
      ]
    };
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

  const extractChildInfo = (input: string) => {
    // Simple extraction logic for child information
    const info: any = {};
    
    // Extract name patterns
    const nameMatch = input.match(/(?:name is|called|named)\s+([A-Za-z\s]+)/i);
    if (nameMatch) {
      const fullName = nameMatch[1].trim();
      const nameParts = fullName.split(' ');
      info.firstName = nameParts[0];
      if (nameParts.length > 1) info.lastName = nameParts.slice(1).join(' ');
    }
    
    // Extract age
    const ageMatch = input.match(/(\d+)\s*(?:years?\s*old|yrs?\s*old)/i);
    if (ageMatch) info.age = parseInt(ageMatch[1]);
    
    // Extract grade
    const gradeMatch = input.match(/(?:grade|year)\s*(\d+|kindergarten|k)/i);
    if (gradeMatch) info.gradeLevel = gradeMatch[1];
    
    return info;
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
    
    // Check if this is registration-related and route properly
    const input = newUserMessage.content.toLowerCase();
    if (input.includes('register') || input.includes('child') || input.includes('daughter') || input.includes('son')) {
      handleAction('register_child');
    } else {
      handleAction('text_input', newUserMessage.content);
    }
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