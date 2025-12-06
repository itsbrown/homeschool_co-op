import { useEffect, useRef } from 'react';
import { trackFormSubmission } from '@/lib/analytics';

export function FormTracker() {
  // Track recently submitted forms to prevent duplicates
  const recentSubmissions = useRef<Map<string, number>>(new Map());
  const DEBOUNCE_MS = 2000; // 2 second debounce window
  
  useEffect(() => {
    const handleFormSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement;
      if (form.tagName !== 'FORM') return;
      
      const formName = form.getAttribute('data-form-name') || 
                       form.getAttribute('name') || 
                       form.getAttribute('id') || 
                       form.getAttribute('aria-label') ||
                       'Unknown Form';
      
      const formId = form.getAttribute('id') || '';
      const formKey = `${formName}-${formId}`;
      
      // Check for duplicate submission within debounce window
      const now = Date.now();
      const lastSubmission = recentSubmissions.current.get(formKey);
      if (lastSubmission && (now - lastSubmission) < DEBOUNCE_MS) {
        console.log('📊 Form submission debounced:', formName);
        return;
      }
      
      // Record this submission
      recentSubmissions.current.set(formKey, now);
      
      // Clean up old entries (older than 10 seconds)
      recentSubmissions.current.forEach((timestamp, key) => {
        if (now - timestamp > 10000) {
          recentSubmissions.current.delete(key);
        }
      });
      
      const submitButton = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement;
      const submitText = submitButton?.textContent || submitButton?.getAttribute('value') || 'Submit';
      
      trackFormSubmission({
        form_name: formName,
        form_id: formId,
        form_destination: form.action || window.location.pathname,
        form_submit_text: submitText.trim(),
      });
    };

    document.addEventListener('submit', handleFormSubmit, true);
    
    return () => {
      document.removeEventListener('submit', handleFormSubmit, true);
    };
  }, []);

  return null;
}
