import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface CartItem {
  id: string;
  enrollmentId?: number;
  classId: number;
  className: string;
  childId: number;
  childName: string;
  price: number;
  description?: string;
  startDate?: string;
  endDate?: string;
  schedule?: string;
  status?: string;
  statusText?: string; // Display-friendly payment status
  depositRequired?: number;
  amountPaid?: number;
  remainingBalance?: number;
  totalCost?: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discounts: {
    siblingDiscount: number;
    freeAfterThree: number;
  };
  total: number;
}

interface CartState {
  cart: Cart;
  isOpen: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<CartItem> } }
  | { type: 'CLEAR_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'LOAD_CART'; payload: Cart };

const calculateCartTotals = (items: CartItem[]): { subtotal: number; discounts: any; total: number } => {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Group items by child to calculate sibling discount
  const childrenWithClasses = items.reduce((acc, item) => {
    acc[item.childId] = (acc[item.childId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const uniqueChildren = Object.keys(childrenWithClasses).length;

  // Apply 10% sibling discount if more than one child
  const siblingDiscountRate = uniqueChildren > 1 ? 0.10 : 0;
  const siblingDiscount = subtotal * siblingDiscountRate;

  // Apply "Free After Three" - 4th child and beyond are free
  let freeAfterThreeDiscount = 0;
  if (uniqueChildren >= 4) {
    const freeChildren = uniqueChildren - 3;
    const averagePricePerChild = subtotal / uniqueChildren;
    freeAfterThreeDiscount = averagePricePerChild * freeChildren;
  }

  const total = Math.max(0, subtotal - siblingDiscount - freeAfterThreeDiscount);

  return {
    subtotal,
    discounts: {
      siblingDiscount,
      freeAfterThree: freeAfterThreeDiscount,
    },
    total,
  };
};

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD_ITEM': {
      // Check if item already exists (same class + child combination)
      const existingItemIndex = state.cart.items.findIndex(
        item => item.classId === action.payload.classId && item.childId === action.payload.childId
      );

      console.log('🛒 ADD_ITEM reducer - current state:', {
        currentItems: state.cart.items.length,
        addingItem: action.payload.className,
        existingItemIndex
      });

      if (existingItemIndex >= 0) {
        // Item already exists, don't add duplicate
        console.log('🛒 ADD_ITEM reducer - item already exists, not adding');
        return state;
      }

      const newItems = [...state.cart.items, action.payload];
      const totals = calculateCartTotals(newItems);

      const newState = {
        ...state,
        cart: {
          items: newItems,
          ...totals,
        },
      };

      console.log('🛒 ADD_ITEM reducer - state updated:', {
        oldCount: state.cart.items.length,
        newCount: newItems.length,
        newTotal: totals.total
      });

      return newState;
    }

    case 'REMOVE_ITEM': {
      const newItems = state.cart.items.filter(item => item.id !== action.payload);
      const totals = calculateCartTotals(newItems);

      return {
        ...state,
        cart: {
          items: newItems,
          ...totals,
        },
      };
    }

    case 'UPDATE_ITEM': {
      const newItems = state.cart.items.map(item =>
        item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
      );
      const totals = calculateCartTotals(newItems);

      return {
        ...state,
        cart: {
          items: newItems,
          ...totals,
        },
      };
    }

    case 'CLEAR_CART':
      return {
        ...state,
        cart: {
          items: [],
          subtotal: 0,
          discounts: { siblingDiscount: 0, freeAfterThree: 0 },
          total: 0,
        },
      };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    case 'LOAD_CART':
      return {
        ...state,
        cart: action.payload,
      };

    default:
      return state;
  }
};

const initialState: CartState = {
  cart: {
    items: [],
    subtotal: 0,
    discounts: { siblingDiscount: 0, freeAfterThree: 0 },
    total: 0,
  },
  isOpen: false,
};

interface CartContextType {
  cart: Cart;
  isOpen: boolean;
  addItem: (item: Omit<CartItem, 'id'>, skipValidation?: boolean) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CartItem>) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getItemCount: () => number;
  hasItem: (classId: number, childId: number) => boolean;
  loadUnpaidEnrollments: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { toast } = useToast();

  const loadUnpaidEnrollments = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) {
        console.log('No authentication token found for cart loading');
        return;
      }

      // Check if cart was recently cleared (within 30 seconds) to prevent refilling after payment
      const clearedTimestamp = localStorage.getItem('asa_cart_cleared');
      if (clearedTimestamp) {
        const timeSinceCleared = Date.now() - parseInt(clearedTimestamp);
        if (timeSinceCleared < 30000) { // 30 seconds
          console.log('🛒 Cart was recently cleared, skipping reload to prevent refilling');
          return;
        } else {
          // Clear the flag after 30 seconds
          localStorage.removeItem('asa_cart_cleared');
        }
      }

      const response = await fetch('/api/enrollments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const enrollments = await response.json();
        console.log('🔍 Fetched enrollments for cart validation:', enrollments.length, 'total enrollments');
        console.log('🔍 First few enrollments:', enrollments.slice(0, 3));
        
        // Group enrollments by class+child combination to find the latest status
        const enrollmentGroups = enrollments.reduce((acc: any, enrollment: any) => {
          const key = `${enrollment.classId}-${enrollment.childId}`;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(enrollment);
          return acc;
        }, {});

        // Filter for enrollments with remaining balance that aren't superseded by successful enrollments
        const unpaidEnrollments = [];
        
        for (const [key, groupEnrollments] of Object.entries(enrollmentGroups)) {
          const enrollmentList = groupEnrollments as any[];
          
          // Sort by enrollment date (newest first)
          const sortedEnrollments = enrollmentList.sort((a, b) => 
            new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime()
          );
          
          // Check if there's any successful enrollment for this class+child combination
          const hasSuccessfulEnrollment = sortedEnrollments.some(e => 
            e.status === 'enrolled' && e.remainingBalance === 0
          );
          
          console.log(`🔍 Group ${key}: hasSuccessfulEnrollment=${hasSuccessfulEnrollment}`);
          
          // Only add to cart if there's no successful enrollment and there's a balance due
          if (!hasSuccessfulEnrollment) {
            const latestEnrollment = sortedEnrollments[0];
            const hasBalance = latestEnrollment.remainingBalance > 0 || 
                              (latestEnrollment.status === 'pending_payment' && latestEnrollment.amount === 0);
            
            console.log(`🔍 Latest enrollment ${latestEnrollment.id}: status=${latestEnrollment.status}, remainingBalance=${latestEnrollment.remainingBalance}, hasBalance=${hasBalance}`);
            
            if (hasBalance) {
              unpaidEnrollments.push(latestEnrollment);
            }
          } else {
            console.log(`🔍 Skipping group ${key} - already has successful enrollment`);
          }
        }
        
        // Convert enrollments to cart items with enhanced status display
        const cartItems: CartItem[] = unpaidEnrollments.map((enrollment: any) => {
          const remainingBalance = enrollment.remainingBalance || enrollment.totalCost || 0;
          const amountPaid = enrollment.amountPaid || 0;
          
          let displayStatus = enrollment.status;
          let statusText = 'Payment Required';
          
          // Determine appropriate status text based on payment state
          if (enrollment.status === 'partially_paid') {
            statusText = 'Partially Paid';
          } else if (enrollment.status === 'payment_plan_active') {
            statusText = 'Payment Plan Active';
          } else if (enrollment.status === 'enrolled' && remainingBalance > 0) {
            statusText = 'Balance Due';
          } else if (enrollment.status === 'pending_payment') {
            statusText = 'Payment Required';
          }
          
          return {
            id: `enrollment-${enrollment.id}`,
            enrollmentId: enrollment.id,
            classId: enrollment.classId,
            className: enrollment.className,
            childId: enrollment.childId,
            childName: enrollment.childName,
            price: remainingBalance,
            status: displayStatus,
            statusText: statusText,
            depositRequired: enrollment.depositRequired,
            amountPaid: amountPaid,
            remainingBalance: remainingBalance,
            totalCost: enrollment.totalCost || 0,
          };
        });
        
        const totals = calculateCartTotals(cartItems);
        
        console.log('🛒 About to dispatch LOAD_CART with items:', cartItems.length);
        dispatch({
          type: 'LOAD_CART',
          payload: {
            items: cartItems,
            ...totals,
          },
        });
        console.log('🛒 LOAD_CART dispatched successfully');
        
        console.log(`🛒 Cart loaded with ${cartItems.length} unpaid enrollments`);
        console.log('🛒 Final cart items:', cartItems);
        console.log(`🛒 Cart items:`, cartItems);
        console.log(`🛒 Cart totals:`, totals);
      } else {
        console.error('Failed to load enrollments:', response.status);
      }
    } catch (error) {
      console.error('Error loading unpaid enrollments:', error);
    }
  };

  // Load cart from localStorage on mount and fetch unpaid enrollments
  useEffect(() => {
    const savedCart = localStorage.getItem('asa_cart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        console.log('🛒 Loading cart from localStorage:', parsedCart);
        dispatch({ type: 'LOAD_CART', payload: parsedCart });
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem('asa_cart');
      }
    }
    
    // Load unpaid enrollments after a brief delay to ensure auth is ready
    const timer = setTimeout(() => {
      console.log('🛒 Attempting to load unpaid enrollments after delay...');
      loadUnpaidEnrollments();
    }, 2000); // Increase delay to 2 seconds
    
    return () => clearTimeout(timer);
  }, []);

  // Also trigger loading when authentication status changes
  useEffect(() => {
    const token = localStorage.getItem('supabase_access_token');
    if (token) {
      console.log('🛒 Authentication token detected, loading unpaid enrollments...');
      const timer = setTimeout(() => {
        loadUnpaidEnrollments();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    console.log('🛒 Cart state changed - saving to localStorage:', state.cart);
    localStorage.setItem('asa_cart', JSON.stringify(state.cart));
  }, [state.cart]);

  const addItem = async (item: Omit<CartItem, 'id'>, skipValidation = false) => {
    const newItem: CartItem = {
      ...item,
      id: `${item.classId}-${item.childId}-${Date.now()}`,
    };

    console.log('🛒 addItem called with:', { 
      item: newItem, 
      skipValidation, 
      currentCartSize: state.cart.items.length 
    });

    if (!skipValidation) {
      // Check if item already exists in cart
      const existsInCart = state.cart.items.some(
        cartItem => cartItem.classId === item.classId && cartItem.childId === item.childId
      );

      if (existsInCart) {
        console.log('🛒 Item already exists in cart, not adding');
        toast({
          title: "Already in Cart",
          description: `${item.className} for ${item.childName} is already in your cart`,
          variant: "destructive",
        });
        return;
      }

      // Check if user is already enrolled in this class with a completed payment
      try {
        const response = await apiRequest('GET', '/api/enrollments');
        if (response.ok) {
          const enrollments = await response.json();
          
          // Check for any successful enrollment (enrolled status with no remaining balance)
          const hasSuccessfulEnrollment = enrollments.some((enrollment: any) => 
            enrollment.classId === item.classId && 
            enrollment.childId === item.childId &&
            enrollment.status === 'enrolled' &&
            enrollment.remainingBalance === 0
          );

          if (hasSuccessfulEnrollment) {
            console.log('🛒 User already successfully enrolled, not adding to cart');
            toast({
              title: "Already Enrolled",
              description: `${item.childName} is already enrolled in ${item.className}`,
              variant: "destructive",
            });
            return;
          }
        }
      } catch (error) {
        console.log('Could not check enrollment status, proceeding with cart add');
      }
    }

    console.log('🛒 Dispatching ADD_ITEM action:', newItem);
    dispatch({ type: 'ADD_ITEM', payload: newItem });
    
    // Force a small delay to ensure state is updated before logging
    setTimeout(() => {
      console.log('🛒 Cart updated - new item count should be:', state.cart.items.length + 1);
    }, 10);
    
    // Only show toast if not skipping validation (to avoid duplicate toasts)
    if (!skipValidation) {
      toast({
        title: "Added to Cart",
        description: `${item.className} for ${item.childName} added to cart`,
      });
    }
  };

  const removeItem = (id: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: id });
    toast({
      title: "Removed from Cart",
      description: "Item removed from cart",
    });
  };

  const updateItem = (id: string, updates: Partial<CartItem>) => {
    dispatch({ type: 'UPDATE_ITEM', payload: { id, updates } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
    localStorage.removeItem('asa_cart');
    // Set a flag to prevent immediate reload after payment
    localStorage.setItem('asa_cart_cleared', Date.now().toString());
    console.log('🛒 Cart cleared - localStorage removed');
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const openCart = () => dispatch({ type: 'OPEN_CART' });
  const closeCart = () => dispatch({ type: 'CLOSE_CART' });

  const getItemCount = () => {
    console.log('🛒 getItemCount called - current items:', state.cart.items.length);
    return state.cart.items.length;
  };

  const hasItem = (classId: number, childId: number) => {
    return state.cart.items.some(
      item => item.classId === classId && item.childId === childId
    );
  };

  const contextValue: CartContextType = {
    cart: state.cart,
    isOpen: state.isOpen,
    addItem,
    removeItem,
    updateItem,
    clearCart,
    openCart,
    closeCart,
    getItemCount,
    hasItem,
    loadUnpaidEnrollments,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};