import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Slicer.io Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">Ops! Algo deu errado.</h1>
            <p className="text-neutral-400 text-sm">
              O Slicer.io detectou um erro inesperado. 
              Por segurança, a aplicação foi reiniciada.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all"
            >
              Recarregar Site
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
