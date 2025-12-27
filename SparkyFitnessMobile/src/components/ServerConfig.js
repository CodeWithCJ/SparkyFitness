import React from 'react';
import { View, TextInput, Button, Text, TouchableOpacity, Image, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import styles from '../screens/SettingsScreenStyles';
import { useTheme } from '../contexts/ThemeContext';

const ServerConfig = ({ url, setUrl, apiKey, setApiKey, handleSaveConfig, serverConfigs, activeConfigId, handleSetActiveConfig, handleDeleteConfig, handleEditConfig, handleAddNewConfig, isConnected, checkServerConnection }) => {
  const { colors } = useTheme();

  return (
    <View style={{ marginBottom: 16 }}>
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
            <TouchableOpacity style={styles.iconButton} onPress={() => Clipboard.setString(url)}>
              <Image source={require('../../assets/icons/copy.png')} style={styles.icon} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={async () => setUrl(await Clipboard.getStringAsync())}>
              <Image source={require('../../assets/icons/paste.png')} style={styles.icon} />
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
            <TouchableOpacity style={styles.iconButton} onPress={() => Clipboard.setString(apiKey)}>
              <Image source={require('../../assets/icons/copy.png')} style={styles.icon} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={async () => setApiKey(await Clipboard.getStringAsync())}>
              <Image source={require('../../assets/icons/paste.png')} style={styles.icon} />
            </TouchableOpacity>
          </View>
        </View>
        <Button title="Save Current Config" onPress={handleSaveConfig} color={colors.primary} />
      </View>

      {/* Display existing configurations */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Configurations</Text>
        {serverConfigs.map((item) => (
          <View key={item.id} style={[styles.serverConfigItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.serverConfigText, { color: colors.text, flex: 1 }]}>
              {item.url} {item.id === activeConfigId ? '(Active)' : ''}
            </Text>
            <View style={styles.serverConfigActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#007bff' }]}
                onPress={() => handleSetActiveConfig(item.id)}
              >
                <Text style={styles.actionButtonText}>Set Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#ffc107' }]}
                onPress={() => handleEditConfig(item)}
              >
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#dc3545' }]}
                onPress={() => handleDeleteConfig(item.id)}
              >
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addConfigButton} onPress={handleAddNewConfig}>
          <Text style={styles.addConfigButtonText}>Add New Configuration</Text>
        </TouchableOpacity>
      </View>

      {/* Configuration required status */}
      {!activeConfigId && (
        <View style={styles.configRequiredContainer}>
          <View style={[styles.dot, { backgroundColor: '#ffc107' }]}></View>
          <Text style={styles.configRequiredText}>Configuration required</Text>
        </View>
      )}

      {/* Connected to server status */}
      {activeConfigId && (
        <TouchableOpacity style={styles.connectedStatusContainer} onPress={checkServerConnection}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#28a745' : '#dc3545' }]}></View>
          <Text style={[styles.connectedStatusText, { color: isConnected ? '#28a745' : '#dc3545' }]}>
            {isConnected ? 'Connected to server' : 'Connection failed'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default ServerConfig;