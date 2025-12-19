import { useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  trackPageView,
  trackViewItem,
  trackAddToCart,
  trackRemoveFromCart,
  trackBeginCheckout,
  trackPurchase,
  trackSignUp,
  trackLogin,
  trackEnrollmentSubmit,
  trackCustomEvent,
  trackFormSubmission,
  pushToDataLayer,
} from '@/lib/analytics';

interface EcommerceItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity?: number;
  item_category?: string;
  item_variant?: string;
}

export function useAnalytics() {
  const [location] = useLocation();

  useEffect(() => {
    trackPageView(location);
  }, [location]);

  const trackViewClass = useCallback((classId: number, className: string, price: number, category?: string) => {
    trackViewItem({
      item_id: String(classId),
      item_name: className,
      price,
      item_category: category || 'Class',
    });
  }, []);

  const trackAddClassToCart = useCallback((classId: number, className: string, price: number, variant?: string, childName?: string) => {
    trackAddToCart({
      item_id: String(classId),
      item_name: className,
      price,
      item_variant: variant,
      item_category: childName ? `Child: ${childName}` : 'Class',
    });
  }, []);

  const trackRemoveClassFromCart = useCallback((classId: number, className: string, price: number) => {
    trackRemoveFromCart({
      item_id: String(classId),
      item_name: className,
      price,
    });
  }, []);

  const trackCheckoutStart = useCallback((items: EcommerceItem[], total: number) => {
    trackBeginCheckout(items, total);
  }, []);

  const trackCompletePurchase = useCallback((transactionId: string, items: EcommerceItem[], total: number) => {
    trackPurchase(transactionId, items, total);
  }, []);

  const trackUserSignUp = useCallback((method: string, schoolId?: number) => {
    trackSignUp(method, schoolId);
  }, []);

  const trackUserLogin = useCallback((method: string) => {
    trackLogin(method);
  }, []);

  const trackEnrollment = useCallback((classId: number, className: string, childId: number, childName: string, variant?: string) => {
    trackEnrollmentSubmit(classId, className, childId, childName, variant);
  }, []);

  const trackForm = useCallback((formName: string, formId?: string) => {
    trackFormSubmission({
      form_name: formName,
      form_id: formId,
    });
  }, []);

  const trackEvent = useCallback((eventName: string, params?: Record<string, any>) => {
    trackCustomEvent(eventName, params);
  }, []);

  return {
    trackViewClass,
    trackAddClassToCart,
    trackRemoveClassFromCart,
    trackCheckoutStart,
    trackCompletePurchase,
    trackUserSignUp,
    trackUserLogin,
    trackEnrollment,
    trackForm,
    trackEvent,
    pushToDataLayer,
  };
}
