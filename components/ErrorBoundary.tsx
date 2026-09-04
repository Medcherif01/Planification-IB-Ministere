import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught rendering error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] p-6 m-4 bg-red-50 border border-red-200 rounded-2xl shadow-sm text-center flex flex-col items-center justify-center space-y-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full">
            <AlertTriangle size={32} />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-bold text-red-900">
              {this.props.fallbackTitle || "Une erreur d'affichage est survenue"}
            </h3>
            <p className="text-xs text-red-700 mt-1">
              L'unité ou le formulaire n'a pas pu s'afficher correctement. Vos données sont préservées.
            </p>
            {this.state.error && (
              <pre className="mt-3 p-3 bg-red-100/70 border border-red-200 rounded-lg text-left text-[11px] text-red-800 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Home size={14} /> Revenir à l'accueil
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw size={14} /> Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
