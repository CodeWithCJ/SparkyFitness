import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheetPicker from '../BottomSheetPicker';
import Button from '../ui/Button';
import { useSpeechVoiceChoices } from '../../hooks/useSpeechVoiceChoices';
import {
  beginRecordingCues,
  endRecordingCues,
  speakRecordingCue,
} from '../../services/recordingCues';

const PICKER_WIDTH = { width: 170 };

/**
 * The voice the recording's spoken cues use, with a way to hear it. The choice
 * is the one guided workouts use too: installed voices differ per phone, so it
 * is kept on the device.
 */
const RecordingVoiceCard: React.FC = () => {
  const { t } = useTranslation();
  const voice = useSpeechVoiceChoices();

  const title = t('speechVoice.title', { defaultValue: 'Voice' });

  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID="recording-voice">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-sm font-semibold">{title}</Text>
        <BottomSheetPicker
          value={voice.value}
          options={voice.options}
          onSelect={voice.onSelect}
          title={title}
          containerStyle={PICKER_WIDTH}
        />
      </View>
      {voice.hint ? (
        <Text className="text-text-secondary text-xs mt-2">{voice.hint}</Text>
      ) : null}
      <Button
        variant="ghost"
        className="mt-2 self-start"
        onPress={() => {
          beginRecordingCues();
          speakRecordingCue(
            t('speechVoice.sample', {
              defaultValue: 'This is how your recording cues will sound.',
            }),
            endRecordingCues
          );
        }}
      >
        {t('speechVoice.test', { defaultValue: 'Test voice' })}
      </Button>
    </View>
  );
};

export default RecordingVoiceCard;
