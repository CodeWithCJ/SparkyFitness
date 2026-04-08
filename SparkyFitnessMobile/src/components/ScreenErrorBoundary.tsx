import React from 'react';
import { View, Text } from 'react-native';
import Icon from './Icon';
import Button from './ui/Button';
import { addLog } from '../services/LogService';
import { queryClient } from '../hooks/queryClient';

interface ScreenErrorBoundaryProps {
  screenName: string;
  onGoBack?: () => void;
  children: React.ReactNode;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  retryKey: number;
}

class ScreenErrorBoundary extends React.Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<ScreenErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    addLog(
      `[${this.props.screenName}] Screen crashed`,
      'ERROR',
      [error.message, error.stack ?? '', info.componentStack ?? ''],
    );
  }

  handleRetry = () => {
    queryClient.resetQueries();
    this.setState((prev) => ({ hasError: false, retryKey: prev.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={64} color="#EF4444" />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Something went wrong
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
            An unexpected error occurred. Your server may need to be updated.
          </Text>
          <Button variant="primary" onPress={this.handleRetry} className="mt-4 px-6">
            Try Again
          </Button>
          {this.props.onGoBack && (
            <Button variant="ghost" onPress={this.props.onGoBack} className="mt-2 px-6">
              Go Back
            </Button>
          )}
        </View>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

interface SectionErrorBoundaryProps {
  sectionName: string;
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  retryKey: number;
}

export class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { hasError: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<SectionErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    addLog(
      `[${this.props.sectionName}] Section crashed`,
      'ERROR',
      [error.message, error.stack ?? '', info.componentStack ?? ''],
    );
  }

  handleRetry = () => {
    queryClient.resetQueries();
    this.setState((prev) => ({ hasError: false, retryKey: prev.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="items-center py-6 px-4">
          <Icon name="alert-circle" size={32} color="#EF4444" />
          <Text className="text-text-secondary text-sm mt-2 text-center">
            This section failed to load.
          </Text>
          <Button variant="ghost" onPress={this.handleRetry} className="mt-2 px-4">
            Try Again
          </Button>
        </View>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

interface ErrorBoundaryOptions {
  canGoBack?: boolean;
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  screenName: string,
  options?: ErrorBoundaryOptions,
) {
  const Wrapped = (props: P) => {
    const onGoBack = options?.canGoBack
      ? () => (props as Record<string, any>).navigation?.goBack()
      : undefined;

    return (
      <ScreenErrorBoundary screenName={screenName} onGoBack={onGoBack}>
        <Component {...props} />
      </ScreenErrorBoundary>
    );
  };

  Wrapped.displayName = `withErrorBoundary(${screenName})`;
  return Wrapped;
}

export default ScreenErrorBoundary;
