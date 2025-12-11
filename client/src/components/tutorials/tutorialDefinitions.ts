import { InteractiveTutorialDefinition } from "./InteractiveTutorial";

export const registerChildTutorial: InteractiveTutorialDefinition = {
  id: "register-child",
  title: "Register Your Child",
  description: "Learn how to add your children to your account",
  steps: [
    {
      target: "body",
      title: "Let's Register Your Child!",
      content: "This tutorial will guide you through adding your children to your account. Once registered, you can enroll them in classes.",
      placement: "center",
    },
    {
      target: "[data-tutorial='my-children-link'], [data-tour='my-children-btn']",
      title: "Go to My Children",
      content: "First, let's navigate to the My Children page where you can manage all your registered children.",
      placement: "bottom",
      route: "/parent",
      actionText: "Click 'My Children' to continue",
    },
    {
      target: "[data-tutorial='add-child-btn']",
      title: "Click Add Child",
      content: "Now click the 'Add Child' button to open the registration form.",
      placement: "bottom",
      route: "/parent/children",
      actionText: "Click 'Add Child' to continue",
    },
    {
      target: "[data-tutorial='child-form'], [data-testid='add-child-form']",
      title: "Fill in Child Information",
      content: "Enter your child's first name, last name, birthdate, and grade level. You can also add optional details like allergies, medical info, and emergency contacts.",
      placement: "left",
      route: "/parent/children",
    },
    {
      target: "[data-tutorial='save-child-btn'], [data-testid='btn-save-child']",
      title: "Save the Child Profile",
      content: "Once you've filled in the information, click 'Save' to complete the registration. Your child will now be available for class enrollment!",
      placement: "top",
      route: "/parent/children",
      actionText: "Click 'Save' to complete registration",
    },
    {
      target: "body",
      title: "Child Registration Complete!",
      content: "Excellent! Your child is now registered and ready to be enrolled in classes. You can add more children anytime by repeating these steps.",
      placement: "center",
    },
  ],
};

export const enrollChildTutorial: InteractiveTutorialDefinition = {
  id: "enroll-child",
  title: "Enroll in Classes",
  description: "Step-by-step guide to enrolling your child in classes",
  steps: [
    {
      target: "body",
      title: "Let's Enroll in a Class!",
      content: "This tutorial will walk you through finding and enrolling your child in classes. Make sure you have at least one child registered first.",
      placement: "center",
    },
    {
      target: "[data-tutorial='browse-classes-link'], [data-tour='browse-classes-btn']",
      title: "Browse Available Classes",
      content: "Click 'Browse Classes' to see all available classes at your school.",
      placement: "bottom",
      route: "/parent",
      actionText: "Click 'Browse Classes' to continue",
    },
    {
      target: "[data-tutorial='class-card'], [data-testid^='class-card-']",
      title: "Select a Class",
      content: "Browse through the available classes. Click on any class card to view its details, schedule, pricing, and available spots.",
      placement: "bottom",
      route: "/parent/classes",
      actionText: "Click on a class to view details",
    },
    {
      target: "[data-tutorial='child-select'], [data-testid='select-child']",
      title: "Choose Your Child",
      content: "Select which of your registered children you want to enroll in this class.",
      placement: "bottom",
      actionText: "Select a child from the dropdown",
    },
    {
      target: "[data-tutorial='variant-select'], [data-testid='select-variant']",
      title: "Select Class Options",
      content: "Some classes offer different options like 'Full Day' or 'Half Day' with different prices. Choose the option that works best for your family.",
      placement: "bottom",
      actionText: "Select your preferred option",
    },
    {
      target: "[data-tutorial='add-to-cart-btn'], [data-testid='btn-add-to-cart']",
      title: "Add to Cart",
      content: "Click 'Add to Cart' to add this enrollment to your shopping cart. You can add more classes before checking out.",
      placement: "top",
      actionText: "Click 'Add to Cart' to continue",
    },
    {
      target: "[data-tutorial='cart-icon'], [data-testid='cart-button']",
      title: "View Your Cart",
      content: "Click the cart icon to view your cart and proceed to checkout when you're ready.",
      placement: "bottom",
      actionText: "Click the cart icon to continue",
    },
    {
      target: "body",
      title: "Ready for Checkout!",
      content: "Great! Your class is in the cart. When you're ready, proceed to checkout to complete your enrollment. Remember: enrollment is only confirmed after payment.",
      placement: "center",
    },
  ],
};

export const paymentCheckoutTutorial: InteractiveTutorialDefinition = {
  id: "payment-checkout",
  title: "Payment & Checkout",
  description: "Complete your enrollment with payment",
  steps: [
    {
      target: "body",
      title: "Let's Complete Your Payment!",
      content: "This tutorial will guide you through the checkout process. Make sure you have items in your cart first.",
      placement: "center",
    },
    {
      target: "[data-tutorial='cart-icon'], [data-testid='cart-button']",
      title: "Open Your Cart",
      content: "Click the cart icon to view all items in your cart.",
      placement: "bottom",
      actionText: "Click the cart icon to continue",
    },
    {
      target: "[data-tutorial='cart-items'], [data-testid='cart-items']",
      title: "Review Your Cart",
      content: "Review the classes, children, and prices in your cart. You can remove items if needed before proceeding.",
      placement: "left",
    },
    {
      target: "[data-tutorial='checkout-btn'], [data-testid='btn-checkout']",
      title: "Proceed to Checkout",
      content: "Click 'Checkout' when you're ready to complete your enrollment.",
      placement: "top",
      actionText: "Click 'Checkout' to continue",
    },
    {
      target: "[data-tutorial='payment-form'], [data-testid='payment-form']",
      title: "Enter Payment Information",
      content: "Enter your payment details securely. We accept major credit and debit cards. Your payment information is encrypted.",
      placement: "left",
      route: "/parent/checkout",
    },
    {
      target: "[data-tutorial='pay-btn'], [data-testid='btn-pay']",
      title: "Complete Payment",
      content: "Click 'Pay Now' to process your payment. You'll receive a confirmation once successful.",
      placement: "top",
      actionText: "Click 'Pay Now' to complete",
    },
    {
      target: "body",
      title: "Payment Complete!",
      content: "Congratulations! Your enrollment is now confirmed. You'll receive an email with your enrollment details. Your child is officially enrolled!",
      placement: "center",
    },
  ],
};

export const getHelpTutorial: InteractiveTutorialDefinition = {
  id: "get-help",
  title: "Getting Help",
  description: "How to reach out when you need assistance",
  steps: [
    {
      target: "body",
      title: "Getting Help When You Need It",
      content: "This tutorial shows you how to get help and support. Let's explore the available options.",
      placement: "center",
    },
    {
      target: "[data-tutorial='help-button'], [data-testid='help-button']",
      title: "Find the Help Button",
      content: "Look for the 'Need Help?' button in the bottom-right corner of any page. This gives you quick access to all support options.",
      placement: "top",
      actionText: "Click 'Need Help?' to continue",
    },
    {
      target: "[data-tutorial='ai-support-btn'], [data-testid='btn-ai-support']",
      title: "AI Technical Support",
      content: "If you're experiencing technical issues (errors, pages not loading, etc.), choose 'AI Technical Support'. Our system will analyze the issue and provide immediate guidance.",
      placement: "left",
      actionText: "Click to try AI Support",
    },
    {
      target: "[data-tutorial='contact-school-btn'], [data-testid='btn-contact-school']",
      title: "Contact Your School",
      content: "For questions about classes, schedules, payments, or school policies, choose 'Contact My School'. This sends a message directly to your school administrator.",
      placement: "left",
      actionText: "Click to contact school",
    },
    {
      target: "[data-tutorial='tutorials-btn'], [data-testid='btn-tutorials']",
      title: "Tutorials & Guides",
      content: "You can always come back to these tutorials by clicking 'Tutorials & Guides' for step-by-step instructions.",
      placement: "left",
      actionText: "Click to view tutorials",
    },
    {
      target: "body",
      title: "Help is Always Available!",
      content: "Now you know how to get help whenever you need it. The help button is always available in the corner of your screen.",
      placement: "center",
    },
  ],
};

export const allTutorials: InteractiveTutorialDefinition[] = [
  registerChildTutorial,
  enrollChildTutorial,
  paymentCheckoutTutorial,
  getHelpTutorial,
];

export const getTutorialById = (id: string): InteractiveTutorialDefinition | undefined => {
  return allTutorials.find(t => t.id === id);
};
