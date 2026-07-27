import { useEffect, useRef } from 'react';
import { trackFormSubmitAttempt } from '@/lib/analytics';

/**
 * Global listener for native form submit attempts (not conversions).
 * Form Builder success conversions fire `form_submission` from DynamicFormPage onSuccess.
 */
export function FormTracker() {
  const recentSubmissions = useRef<Map<string, number>>(new Map());
  const DEBOUNCE_MS = 2000;

  useEffect(() => {
    const handleFormSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement;
      if (form.tagName !== 'FORM') return;

      // Success-only forms (e.g. public Form Builder) skip attempt events here
      if (form.getAttribute('data-ga-track-on') === 'success') return;

      const formName =
        form.getAttribute('data-form-name') ||
        form.getAttribute('name') ||
        form.getAttribute('id') ||
        form.getAttribute('aria-label') ||
        'Unknown Form';

      const formId = form.getAttribute('data-form-id') || form.getAttribute('id') || '';
      const formSlug = form.getAttribute('data-form-slug') || '';
      const formKey = `${formName}-${formId}-${formSlug}`;

      const now = Date.now();
      const lastSubmission = recentSubmissions.current.get(formKey);
      if (lastSubmission && now - lastSubmission < DEBOUNCE_MS) {
        return;
      }

      recentSubmissions.current.set(formKey, now);
      recentSubmissions.current.forEach((timestamp, key) => {
        if (now - timestamp > 10000) {
          recentSubmissions.current.delete(key);
        }
      });

      const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
      ) as HTMLElement;
      const submitText =
        submitButton?.textContent || submitButton?.getAttribute('value') || 'Submit';

      trackFormSubmitAttempt({
        form_name: formName,
        form_id: formId,
        form_slug: formSlug,
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
