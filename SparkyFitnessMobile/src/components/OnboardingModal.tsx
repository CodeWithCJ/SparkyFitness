import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

// Module-level flag - resets when app is fully killed and relaunched
let hasShownThisSession = false;

export const shouldShowOnboardingModal = (): boolean => {
  return !hasShownThisSession;
};

export const markOnboardingShown = (): void => {
  hasShownThisSession = true;
};

// Useful for testing
export const resetOnboardingModal = (): void => {
  hasShownThisSession = false;
};

interface OnboardingModalProps {
  visible: boolean;
  onGoToSettings: () => void;
  onDismiss: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  visible,
  onGoToSettings,
  onDismiss,
}) => {
  const { colors } = useTheme();

  const handleGoToSettings = () => {
    markOnboardingShown();
    onGoToSettings();
  };

  const handleDismiss = () => {
    markOnboardingShown();
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.title, { color: colors.text }]}>
              Welcome to SparkyFitness
            </Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              To get started, configure your server connection. This tells the app where to sync your health data.
            </Text>

            {/* Privacy Section */}
            <View style={[styles.privacySection, { backgroundColor: colors.background }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} style={styles.privacyIcon} />
              <View style={styles.privacyTextContainer}>
                <Text style={[styles.privacyTitle, { color: colors.text }]}>
                  Your Privacy Matters
                </Text>
                <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
                  We do not collect or store any of your data. All health information is sent directly to your own server.
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={handleGoToSettings}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.primaryButtonText}>Go to Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleDismiss}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
                Later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 64,
    height: 64,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  privacySection: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
  },
  privacyIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  privacyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 16,
  },
});

export default OnboardingModal;
