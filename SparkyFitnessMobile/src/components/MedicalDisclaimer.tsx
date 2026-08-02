import React from 'react';
import { Text } from 'react-native';

/**
 * Footer note for health features (cycle, pregnancy, medications) clarifying
 * the app is a tracker, not a source of medical advice.
 */
const MedicalDisclaimer: React.FC = () => (
  <Text className="text-text-secondary text-xs text-left leading-normal">
    For tracking and general information only, not medical advice. Talk with your healthcare provider about medical concerns.
  </Text>
);

export default MedicalDisclaimer;
