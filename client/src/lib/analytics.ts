declare global {
  interface Window {
    dataLayer: any[];
  }
}

interface EcommerceItem {
  item_id: string;
  item_name: string;
  price: number; // Price in cents - will be converted to dollars for GA4
  quantity?: number;
  item_category?: string;
  item_variant?: string;
}

interface FormSubmissionData {
  form_name: string;
  form_id?: string;
  form_destination?: string;
  form_submit_text?: string;
}

// Convert cents to dollars for GA4 (GA4 expects dollar amounts)
const centsToDollars = (cents: number): number => {
  return Math.round(cents) / 100;
};

export function gtag(...args: any[]) {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(args);
  }
}

export const pushToDataLayer = (data: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(data);
  }
};

export const trackFormSubmission = (data: FormSubmissionData) => {
  pushToDataLayer({
    event: 'form_submission',
    form_name: data.form_name,
    form_id: data.form_id || '',
    form_destination: data.form_destination || '',
    form_submit_text: data.form_submit_text || 'Submit',
    submission_time: new Date().toISOString(),
  });
  console.log('📊 Form submission tracked:', data.form_name);
};

export const trackAddToCart = (item: EcommerceItem) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'add_to_cart',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(item.price),
      items: [{
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: item.quantity || 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }]
    }
  });
  console.log('📊 Add to cart tracked:', item.item_name, centsToDollars(item.price), 'USD');
};

export const trackRemoveFromCart = (item: EcommerceItem) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'remove_from_cart',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(item.price),
      items: [{
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: item.quantity || 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }]
    }
  });
  console.log('📊 Remove from cart tracked:', item.item_name);
};

export const trackViewCart = (items: EcommerceItem[], totalValue: number) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'view_cart',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(totalValue),
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: item.quantity || 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }))
    }
  });
  console.log('📊 View cart tracked:', items.length, 'items');
};

export const trackBeginCheckout = (items: EcommerceItem[], totalValue: number) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'begin_checkout',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(totalValue),
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: item.quantity || 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }))
    }
  });
  console.log('📊 Begin checkout tracked:', centsToDollars(totalValue), 'USD');
};

export const trackAddPaymentInfo = (paymentType: string, totalValue: number) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'add_payment_info',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(totalValue),
      payment_type: paymentType,
    }
  });
  console.log('📊 Add payment info tracked:', paymentType);
};

export const trackPurchase = (
  transactionId: string,
  items: EcommerceItem[],
  totalValue: number,
  tax?: number,
  shipping?: number
) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      currency: 'USD',
      value: centsToDollars(totalValue),
      tax: centsToDollars(tax || 0),
      shipping: centsToDollars(shipping || 0),
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: item.quantity || 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }))
    }
  });
  console.log('📊 Purchase tracked:', transactionId, centsToDollars(totalValue), 'USD');
};

export const trackViewItem = (item: EcommerceItem) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'view_item',
    ecommerce: {
      currency: 'USD',
      value: centsToDollars(item.price),
      items: [{
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }]
    }
  });
  console.log('📊 View item tracked:', item.item_name);
};

export const trackViewItemList = (listName: string, items: EcommerceItem[]) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'view_item_list',
    ecommerce: {
      item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
      item_list_name: listName,
      items: items.map((item, index) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
        index: index,
      }))
    }
  });
  console.log('📊 View item list tracked:', listName, items.length, 'items');
};

export const trackSelectItem = (listName: string, item: EcommerceItem) => {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: 'select_item',
    ecommerce: {
      item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
      item_list_name: listName,
      items: [{
        item_id: item.item_id,
        item_name: item.item_name,
        price: centsToDollars(item.price),
        quantity: 1,
        item_category: item.item_category || 'Class',
        item_variant: item.item_variant || '',
      }]
    }
  });
  console.log('📊 Select item tracked:', item.item_name);
};

export const trackSignUp = (method: string, schoolId?: number) => {
  pushToDataLayer({
    event: 'sign_up',
    method: method,
    school_id: schoolId || undefined,
    signup_time: new Date().toISOString(),
  });
  console.log('📊 Sign up tracked:', method);
};

export const trackLogin = (method: string) => {
  pushToDataLayer({
    event: 'login',
    method: method,
    login_time: new Date().toISOString(),
  });
  console.log('📊 Login tracked:', method);
};

export const trackEnrollmentSubmit = (
  classId: number,
  className: string,
  childId: number,
  childName: string,
  variantName?: string
) => {
  pushToDataLayer({
    event: 'enrollment_submit',
    class_id: classId,
    class_name: className,
    child_id: childId,
    child_name: childName,
    variant_name: variantName || '',
    submission_time: new Date().toISOString(),
  });
  console.log('📊 Enrollment submit tracked:', className, childName);
};

export const trackPageView = (pagePath: string, pageTitle?: string) => {
  pushToDataLayer({
    event: 'page_view',
    page_path: pagePath,
    page_title: pageTitle || document.title,
  });
  console.log('📊 Page view tracked:', pagePath);
};

export const trackCustomEvent = (eventName: string, eventParams: Record<string, any> = {}) => {
  pushToDataLayer({
    event: eventName,
    ...eventParams,
    event_time: new Date().toISOString(),
  });
  console.log('📊 Custom event tracked:', eventName);
};
