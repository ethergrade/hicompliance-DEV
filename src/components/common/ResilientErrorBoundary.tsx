import React from 'react';

type ResilientErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
  resetKeys?: unknown[];
  onError?: (error: Error, info: React.ErrorInfo) => void;
};

type ResilientErrorBoundaryState = {
  hasError: boolean;
};

function shallowArrayEqual(a: unknown[] = [], b: unknown[] = []): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export class ResilientErrorBoundary extends React.Component<
  ResilientErrorBoundaryProps,
  ResilientErrorBoundaryState
> {
  state: ResilientErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ResilientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ResilientErrorBoundary] captured render crash', error, info);
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }

  componentDidUpdate(prevProps: ResilientErrorBoundaryProps) {
    if (this.state.hasError) {
      const prevKeys = prevProps.resetKeys || [];
      const nextKeys = this.props.resetKeys || [];
      if (!shallowArrayEqual(prevKeys, nextKeys)) {
        this.setState({ hasError: false });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default ResilientErrorBoundary;
