import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class EducatorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EducatorDashboard] Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-red-100 rounded-full w-fit">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-xl text-red-800">
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                We encountered an error loading this section of the dashboard. 
                This has been logged for review.
              </p>
              {this.state.error && (
                <div className="bg-muted p-3 rounded text-left text-sm font-mono text-muted-foreground overflow-auto max-h-32">
                  {this.state.error.message}
                </div>
              )}
              <Button 
                onClick={this.handleRetry}
                className="gap-2"
                data-testid="button-retry-error"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export function EducatorLoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4" data-testid="educator-loading-state">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export function EducatorEmptyState({ 
  title, 
  description, 
  action 
}: { 
  title: string; 
  description: string; 
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6" data-testid="educator-empty-state">
      <div className="mb-4 p-4 bg-muted rounded-full">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-md">{description}</p>
      {action}
    </div>
  );
}

export function EducatorErrorState({ 
  title = 'Unable to load data',
  message,
  onRetry 
}: { 
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6" data-testid="educator-error-state">
      <div className="mb-4 p-4 bg-red-100 rounded-full">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-red-800 mb-2">{title}</h3>
      {message && <p className="text-muted-foreground mb-4 max-w-md">{message}</p>}
      {onRetry && (
        <Button 
          onClick={onRetry} 
          variant="outline" 
          className="gap-2"
          data-testid="button-retry"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}
