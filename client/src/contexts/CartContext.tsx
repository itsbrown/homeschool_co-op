import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

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
  depositRequired?: number;
  amountPaid?: number;
  remainingBalance?: number;
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

      if (existingItemIndex >= 0) {
        // Item already exists, don't add duplicate
        return state;
      }

      const newItems = [...state.cart.items, action.payload];
      const totals = calculateCartTotals(newItems);

      return {
        ...state,
        cart: {
          items: newItems,
          ...totals,
        },
      };
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
  addItem: (item: Omit<CartItem, 'id'>) => void;
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

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('asa_cart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        dispatch({ type: 'LOAD_CART', payload: parsedCart });
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem('asa_cart');
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('asa_cart', JSON.stringify(state.cart));
  }, [state.cart]);

  const addItem = (item: Omit<CartItem, 'id'>) => {
    const newItem: CartItem = {
      ...item,
      id: `${item.classId}-${item.childId}-${Date.now()}`,
    };

    // Check if item already exists
    const exists = state.cart.items.some(
      cartItem => cartItem.classId === item.classId && cartItem.childId === item.childId
    );

    if (exists) {
      toast({
        title: "Already in Cart",
        description: `${item.childName} is already enrolled in ${item.className}`,
        variant: "destructive",
      });
      return;
    }

    dispatch({ type: 'ADD_ITEM', payload: newItem });
    toast({
      title: "Added to Cart",
      description: `${item.className} for ${item.childName} added to cart`,
    });
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
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const openCart = () => dispatch({ type: 'OPEN_CART' });
  const closeCart = () => dispatch({ type: 'CLOSE_CART' });

  const getItemCount = () => state.cart.items.length;

  const hasItem = (classId: number, childId: number) => {
    return state.cart.items.some(
      item => item.classId === classId && item.childId === childId
    );
  };

  const loadUnpaidEnrollments = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        console.log('No authentication token found for cart loading');
        return;
      }

      const response = await fetch('/api/enrollments', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const enrollments = await response.json();
        
        // Filter unpaid enrollments (pending_payment status)
        const unpaidEnrollments = enrollments.filter((enrollment: any) => 
          enrollment.status === 'pending_payment'
        );
        
        // Convert enrollments to cart items
        const cartItems: CartItem[] = unpaidEnrollments.map((enrollment: any) => ({
          id: `enrollment-${enrollment.id}`,
          enrollmentId: enrollment.id,
          classId: enrollment.classId,
          className: enrollment.className,
          childId: enrollment.childId,
          childName: enrollment.childName,
          price: enrollment.remainingBalance || enrollment.totalCost || 0,
          status: enrollment.status,
          depositRequired: enrollment.depositRequired,
          amountPaid: enrollment.amountPaid || 0,
          remainingBalance: enrollment.remainingBalance,
        }));
        
        const totals = calculateCartTotals(cartItems);
        
        dispatch({
          type: 'LOAD_CART',
          payload: {
            items: cartItems,
            ...totals,
          },
        });
        
        console.log(`🛒 Cart loaded with ${cartItems.length} unpaid enrollments`);
      } else {
        console.error('Failed to load enrollments:', response.status);
      }
    } catch (error) {
      console.error('Error loading unpaid enrollments:', error);
    }
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