import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Global error handler to capture "Script error" events with more details
// This helps debug cross-origin and mobile Safari issues
window.onerror = function(message, source, lineno, colno, error) {
  const errorDetails = {
    message: String(message),
    source: source || 'unknown',
    line: lineno || 0,
    column: colno || 0,
    stack: error?.stack || 'no stack',
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
  
  // Log to console for debugging
  console.error('[GlobalErrorHandler]', errorDetails);
  
  // Report to server for monitoring
  try {
    fetch('/api/telemetry/errors/frontend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: errorDetails.message === 'Script error.' 
          ? `Script error at ${errorDetails.source}:${errorDetails.line}:${errorDetails.column}` 
          : errorDetails.message,
        stackTrace: errorDetails.stack,
        url: errorDetails.url,
        route: window.location.pathname,
        severity: 'high',
        metadata: {
          source: errorDetails.source,
          line: errorDetails.line,
          column: errorDetails.column,
          userAgent: errorDetails.userAgent,
          timestamp: errorDetails.timestamp,
          isScriptError: errorDetails.message === 'Script error.',
        },
      }),
    }).catch(() => {
      // Silently fail if telemetry fails
    });
  } catch (e) {
    // Ignore telemetry errors
  }
  
  return false; // Let the error propagate
};

// Handle unhandled promise rejections
window.onunhandledrejection = function(event) {
  const errorDetails = {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack || 'no stack',
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
  
  console.error('[UnhandledRejection]', errorDetails);
  
  try {
    fetch('/api/telemetry/errors/frontend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Unhandled Promise Rejection: ${errorDetails.message}`,
        stackTrace: errorDetails.stack,
        url: errorDetails.url,
        route: window.location.pathname,
        severity: 'medium',
        metadata: {
          userAgent: errorDetails.userAgent,
          timestamp: errorDetails.timestamp,
          type: 'unhandledrejection',
        },
      }),
    }).catch(() => {
      // Silently fail if telemetry fails
    });
  } catch (e) {
    // Ignore telemetry errors
  }
};

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
