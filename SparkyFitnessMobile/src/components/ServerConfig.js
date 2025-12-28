import React from 'react';
import { View, TextInput, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Clipboard from '@react-native-clipboard/clipboard';
import styles from '../screens/SettingsScreenStyles';
import { useTheme } from '../contexts/ThemeContext';

const ServerConfig = ({ url, setUrl, apiKey, setApiKey, handleSaveConfig, serverConfigs, activeConfigId, handleSetActiveConfig, handleDeleteConfig, handleEditConfig, handleAddNewConfig, isConnected, checkServerConnection }) => {
  const { colors } = useTheme();

  const showConfigMenu = (item) => {
    const isActive = item.id === activeConfigId;
    Alert.alert(
      item.url,
      isActive ? 'Active configuration' : 'Select an action', // Alert text, not a button
      [
        ...(!isActive ? [{ text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) }] : []),
        { text: 'Edit', onPress: () => handleEditConfig(item) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteConfig(item.id) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <View>
      {/* Server Configuration */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Server Configuration</Text>
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Server URL</Text>
          <View style={[styles.inputWithIcon, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { flex: 1, borderWidth: 0, color: colors.text }]}
              placeholder="https://your-server-url.com"
              placeholderTextColor={colors.textMuted}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Clipboard.setString(url)}
              accessibilityLabel="Copy URL to clipboard"
              accessibilityRole="button"
            >
              <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={async () => setUrl(await Clipboard.getString())}
              accessibilityLabel="Paste URL from clipboard"
              accessibilityRole="button"
            >
              <Ionicons name="clipboard-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>API Key</Text>
          <View style={[styles.inputWithIcon, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { flex: 1, borderWidth: 0, color: colors.text }]}
              placeholder="Enter your API key"
              placeholderTextColor={colors.textMuted}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
            />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Clipboard.setString(apiKey)}
              accessibilityLabel="Copy API key to clipboard"
              accessibilityRole="button"
            >
              <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={async () => setApiKey(await Clipboard.getString())}
              accessibilityLabel="Paste API key from clipboard"
              accessibilityRole="button"
            >
              <Ionicons name="clipboard-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.addConfigButton} onPress={handleSaveConfig}>
          <Text style={styles.addConfigButtonText}>Save Current Config</Text>
        </TouchableOpacity>

        {/* Connection status indicator */}
        {activeConfigId && (
          <TouchableOpacity
            style={[styles.statusRow]}
            onPress={checkServerConnection}
            accessibilityLabel={isConnected ? 'Connected to server. Tap to refresh.' : 'Connection failed. Tap to retry.'}
            accessibilityRole="button"
          >
            <View style={[styles.dot, { backgroundColor: isConnected ? colors.success : colors.danger }]} />
            <Text style={[styles.statusText, { color: isConnected ? colors.success : colors.danger }]}>
              {isConnected ? 'Connected to server' : 'Connection failed'}
            </Text>
          </TouchableOpacity>
        )}
        {!activeConfigId && (
          <View style={[styles.statusRow, { backgroundColor: colors.warningBackground }]}>
            <View style={[styles.dot, { backgroundColor: colors.warning }]} />
            <Text style={[styles.statusText, { color: colors.warningText }]}>Configuration required</Text>
          </View>
        )}
      </View>

      {/* Display existing configurations */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Configurations</Text>
        {serverConfigs.map((item) => (
          <View key={item.id} style={[styles.serverConfigItem, { borderBottomColor: colors.border }]}>
            <View style={styles.serverConfigInfo}>
              <Text
                style={[styles.serverConfigText, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {item.url}
              </Text>
              {item.id === activeConfigId && (
                <View style={[styles.activeBadge, { backgroundColor: colors.successBackground }]}>
                  <Text style={[styles.activeBadgeText, { color: colors.success }]}>✓</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => showConfigMenu(item)}
              accessibilityLabel={`Options for ${item.url}`}
              accessibilityRole="button"
            >
              <Text style={[styles.menuIcon, { color: colors.textSecondary }]}>⋮</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addConfigButton} onPress={handleAddNewConfig}>
          <Text style={styles.addConfigButtonText}>Add New Configuration</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

export default ServerConfig;