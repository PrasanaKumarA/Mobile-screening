import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.hash = '#/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 rounded-2xl bg-surface-900 border border-red-500/30 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {this.props.fallbackTitle || 'A View Rendering Error Occurred'}
              </h2>
              <p className="text-xs text-surface-400 mt-0.5">
                The application encountered an unexpected issue while rendering this section.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-950/80 border border-surface-800 text-xs font-mono text-red-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
            {this.state.error?.message || 'Unknown error'}
            {this.state.errorInfo?.componentStack && (
              <span className="text-surface-500 block mt-2 text-[11px]">
                {this.state.errorInfo.componentStack}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn-primary text-xs flex items-center gap-2 py-2 px-4"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
            <button
              onClick={this.handleReset}
              className="btn-secondary text-xs flex items-center gap-2 py-2 px-4"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

