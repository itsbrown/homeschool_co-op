import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

async function reportErrorToServer(error: Error, errorInfo: ErrorInfo | null) {
  try {
    await fetch('/api/telemetry/errors/frontend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stackTrace: error.stack,
        url: window.location.href,
        route: window.location.pathname,
        severity: 'high',
        metadata: {
          componentStack: errorInfo?.componentStack,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch (e) {
    console.error('Failed to report error to server:', e);
  }
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    reportErrorToServer(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              We're sorry, but something unexpected happened. Our team has been notified and is working to fix the issue.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-left overflow-auto max-h-48">
                <p className="text-sm font-mono text-red-600 dark:text-red-400 break-words">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-xs font-mono text-red-500 dark:text-red-300 mt-2 whitespace-pre-wrap break-words">
                    {this.state.error.stack.substring(0, 500)}
                  </pre>
                )}
              </div>
            )}
            
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={this.handleReload}
                variant="outline"
                className="flex items-center gap-2"
                data-testid="button-reload"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </Button>
              <Button 
                onClick={this.handleGoHome}
                className="flex items-center gap-2"
                data-testid="button-go-home"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    reportErrorToServer(error, null);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    reportErrorToServer(error, null);
  });
}

export default ErrorBoundary;
