import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Modal,
  Linking,
} from 'react-native';
import Button from './ui/Button';
import { addLog } from '../services/LogService';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

const PRIVACY_POLICY_URL = 'https://codewithcj.github.io/SparkyFitness/privacy_policy';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  visible,
  onClose,
}) => {
  const primary = useCSSVariable('--color-accent-primary') as string;
  const { t } = useTranslation();

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (error) {
      addLog(`Failed to open privacy policy URL: ${error}`, 'ERROR');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 justify-center items-center p-6"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      >
        <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm">
          {/* Header */}
          <View className="items-center mb-5">
            <Icon name="shield-checkmark" size={48} color={primary} />
            <Text className="text-[22px] font-bold mt-3 text-center text-text-primary">
              {t('privacyPolicy.title', { defaultValue: 'Privacy Policy' })}
            </Text>
          </View>

          {/* Content */}
          <View className="mb-6">
            <Text className="text-base leading-6 text-center mb-4 text-text-primary">
              {t('privacyPolicy.noData', { defaultValue: 'This app does not collect, store, or sell your personal data.' })}
            </Text>

            <Text className="text-base leading-6 text-center mb-4 text-text-primary">
              {t('privacyPolicy.healthData', { defaultValue: 'All HealthKit data stays on your device and is transmitted only to your own server.' })}
            </Text>

            <Button
              variant="ghost"
              onPress={handleOpenPrivacyPolicy}
              className="py-0 px-0"
              textClassName="text-base leading-6 text-center underline"
            >
              {t('privacyPolicy.learnMore', { defaultValue: 'Learn more in our Privacy Policy.' })}
            </Button>
          </View>

          {/* Close Button */}
          <Button
            variant="primary"
            onPress={onClose}
            textClassName="text-[17px]"
          >
            {t('common.close', { defaultValue: 'Close' })}
          </Button>
        </View>
      </View>
    </Modal>
  );
};

export default PrivacyPolicyModal;
