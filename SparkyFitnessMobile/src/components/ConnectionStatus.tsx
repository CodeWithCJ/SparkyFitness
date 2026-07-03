import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';

type ConnectionState = 'connected' | 'disconnected' | 'unconfigured';

interface ConnectionStatusProps {
  /** Whether connected to the server */
  isConnected: boolean;
  /** Whether a server configuration exists (only relevant for inline variant) */
  hasConfig?: boolean;
  /** Display variant: 'header' shows only when connected with pill style, 'inline' shows all states */
  variant?: 'header' | 'inline';
  /** Optional callback when status is tapped (only for inline variant) */
  onRefresh?: () => void;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  hasConfig = true,
  variant = 'inline',
  onRefresh,
}) => {
  const [success, successBackground, danger, warning, warningText] = useCSSVariable([
    '--color-text-success',
    '--color-bg-success',
    '--color-bg-danger',
    '--color-bg-warning',
    '--color-bg-warning',
  ]) as [string, string, string, string, string];

  const getConnectionState = (): ConnectionState => {
    if (!hasConfig) return 'unconfigured';
    return isConnected ? 'connected' : 'disconnected';
  };

  const state = getConnectionState();

  // Header variant: only show when connected
  if (variant === 'header') {
    if (!isConnected) return null;

    return (
      <View
        className="flex-row items-center px-2.5 py-1 rounded-xl"
        style={{ backgroundColor: successBackground }}
      >
        <View
          className="w-2 h-2 rounded-full mr-1.5"
          style={{ backgroundColor: success }}
        />
        <Text className="text-sm font-semibold" style={{ color: success }}>
          Server Connected
        </Text>
      </View>
    );
  }

  // Inline variant: show all states
  const getStatusColor = () => {
    switch (state) {
      case 'connected':
        return success;
      case 'disconnected':
        return danger;
      case 'unconfigured':
        return warning;
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Connection failed';
      case 'unconfigured':
        return 'Config required';
    }
  };

  const getTextColor = () => {
    if (state === 'unconfigured') return warningText;
    return getStatusColor();
  };

  const getAccessibilityLabel = () => {
    switch (state) {
      case 'connected':
        return 'Connected to server. Tap to refresh.';
      case 'disconnected':
        return 'Connection failed. Tap to retry.';
      case 'unconfigured':
        return 'Server configuration required.';
    }
  };

  // Connected state uses pill style (matching header variant)
  if (state === 'connected') {
    const connectedContent = (
      <View
        className="flex-row items-center px-2.5 py-1 rounded-xl"
        style={{ backgroundColor: successBackground }}
      >
        <View
          className="w-2 h-2 rounded-full mr-1.5"
          style={{ backgroundColor: success }}
        />
        <Text className="text-sm font-semibold" style={{ color: success }}>
          Connected
        </Text>
      </View>
    );

    if (!onRefresh) {
      return connectedContent;
    }

    return (
      <TouchableOpacity
        onPress={onRefresh}
        accessibilityLabel={getAccessibilityLabel()}
        accessibilityRole="button"
      >
        {connectedContent}
      </TouchableOpacity>
    );
  }

  const content = (
    <>
      <View
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: getStatusColor() }}
      />
      <Text className="ml-2 font-semibold text-sm" style={{ color: getTextColor() }}>
        {getStatusText()}
      </Text>
    </>
  );

  // Unconfigured state is not clickable
  if (state === 'unconfigured' || !onRefresh) {
    return <View className="flex-row items-center">{content}</View>;
  }

  return (
    <TouchableOpacity
      className="flex-row items-center"
      onPress={onRefresh}
      accessibilityLabel={getAccessibilityLabel()}
      accessibilityRole="button"
    >
      {content}
    </TouchableOpacity>
  );
};

export default ConnectionStatus;
