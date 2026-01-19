import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

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
  const { colors } = useTheme();

  const getConnectionState = (): ConnectionState => {
    if (!hasConfig) return 'unconfigured';
    return isConnected ? 'connected' : 'disconnected';
  };

  const state = getConnectionState();

  // Header variant: only show when connected
  if (variant === 'header') {
    if (!isConnected) return null;

    return (
      <View style={[styles.headerContainer, { backgroundColor: colors.successBackground }]}>
        <View style={[styles.headerDot, { backgroundColor: colors.success }]} />
        <Text style={[styles.headerText, { color: colors.success } ]}>Connected</Text>
      </View>
    );
  }

  // Inline variant: show all states
  const getStatusColor = () => {
    switch (state) {
      case 'connected':
        return colors.success;
      case 'disconnected':
        return colors.danger;
      case 'unconfigured':
        return colors.warning;
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Connection failed';
      case 'unconfigured':
        return 'Configuration required';
    }
  };

  const getTextColor = () => {
    if (state === 'unconfigured') return colors.warningText;
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

  const content = (
    <>
      <View style={[styles.inlineDot, { backgroundColor: getStatusColor() }]} />
      <Text style={[styles.inlineText, { color: getTextColor() }]}>
        {getStatusText()}
      </Text>
    </>
  );

  // Unconfigured state is not clickable
  if (state === 'unconfigured' || !onRefresh) {
    return <View style={styles.inlineContainer}>{content}</View>;
  }

  return (
    <TouchableOpacity
      style={styles.inlineContainer}
      onPress={onRefresh}
      accessibilityLabel={getAccessibilityLabel()}
      accessibilityRole="button"
    >
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Header variant styles
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: '#e6ffe6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // backgroundColor: '#28a745',
    marginRight: 6,
  },
  headerText: {
    // color: '#28a745',
    fontSize: 14,
    fontWeight: '600',
  },
  // Inline variant styles
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inlineText: {
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
  },
});

export default ConnectionStatus;
