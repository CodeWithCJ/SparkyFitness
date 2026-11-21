import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import FormScreenChrome from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import { useChallengeMutations } from '../hooks/useChallenges';
import { ApiError } from '../services/api/errors';
import {
  challengeDisplayNameSchema,
  parseChallengeInviteCode,
} from '@workspace/shared';
import type { RootStackScreenProps } from '../types/navigation';

/** The server's error code (`CHALLENGE_FULL`, ...) in a failed request's body. */
function joinErrorCode(err: ApiError): string | undefined {
  try {
    const body: unknown = err.body ? JSON.parse(err.body) : null;
    const code = (body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

type Props = RootStackScreenProps<'ChallengeJoin'>;

// The server's limit on the name other members see.
const MAX_DISPLAY_NAME = challengeDisplayNameSchema.maxLength ?? 40;
// A pasted link or message is read for its code; anything longer is not one.
const MAX_PASTED_CODE = 2048;

/** Join a challenge with an invite code and the name the other members see. */
const ChallengeJoinScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(route.params?.code ?? '');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { joinChallenge, isJoining } = useChallengeMutations();
  // Done and the Join button can both fire before a re-render shows the
  // join pending, so a ref stops the second one.
  const joiningRef = useRef(false);

  const joinErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.statusCode === 404) {
        return t('challenges.join.invalidCode', {
          defaultValue: 'That code is not valid or has expired.',
        });
      }
      if (err.statusCode === 429) {
        return t('challenges.join.tooMany', {
          defaultValue: 'Too many tries. Wait a few minutes and try again.',
        });
      }
      if (err.statusCode === 409) {
        // Full, ended or closed to late joiners: the server's code says which.
        switch (joinErrorCode(err)) {
          case 'CHALLENGE_FULL':
            return t('challenges.join.full', {
              defaultValue: 'This challenge is full.',
            });
          case 'CHALLENGE_ENDED':
            return t('challenges.join.ended', {
              defaultValue: 'This challenge has ended.',
            });
          case 'CHALLENGE_LATE_JOIN_CLOSED':
            return t('challenges.join.lateJoinClosed', {
              defaultValue:
                'This challenge has started and does not take late joiners.',
            });
          default:
            return t('challenges.join.closed', {
              defaultValue: 'This challenge cannot be joined right now.',
            });
        }
      }
    }
    return t('challenges.join.failed', {
      defaultValue: 'Could not join the challenge.',
    });
  };

  const handleJoin = () => {
    // The keyboard's Done can fire while a join is on its way.
    if (joiningRef.current) return;
    const parsed = parseChallengeInviteCode(code);
    if (!parsed) {
      setError(
        t('challenges.join.notACode', {
          defaultValue: 'Paste the invite code or link you were sent.',
        })
      );
      return;
    }
    const name = displayName.trim();
    if (!name) {
      setError(
        t('challenges.join.nameRequired', {
          defaultValue: 'Enter the name other members will see.',
        })
      );
      return;
    }
    setError(null);
    joiningRef.current = true;
    joinChallenge({ code: parsed, display_name: name })
      .then((challenge) => {
        Toast.show({
          type: 'success',
          text1: t('challenges.join.joined', {
            defaultValue: 'Joined {{name}}',
            name: challenge.name,
          }),
        });
        // The user can go back (system Back or swipe) while the join is
        // still on its way; only move on when this screen is still in front.
        if (navigation.isFocused()) {
          navigation.goBack();
          navigation.navigate('ChallengeDetail', {
            id: challenge.id,
            name: challenge.name,
          });
        }
      })
      .catch((err: unknown) => setError(joinErrorMessage(err)))
      .finally(() => {
        joiningRef.current = false;
      });
  };

  return (
    <FormScreenChrome
      title={t('challenges.join.title', { defaultValue: 'Join a challenge' })}
      saveLabel={t('challenges.join.submit', { defaultValue: 'Join' })}
      savingLabel={t('challenges.join.submitting', {
        defaultValue: 'Joining…',
      })}
      isSaving={isJoining}
      onSave={handleJoin}
      onCancel={() => navigation.goBack()}
    >
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-2">
        <Text className="text-sm font-semibold text-text-secondary">
          {t('challenges.join.codeLabel', { defaultValue: 'Invite code' })}
        </Text>
        <FormInput
          value={code}
          onChangeText={setCode}
          maxLength={MAX_PASTED_CODE}
          placeholder={t('challenges.join.codePlaceholder', {
            defaultValue: 'Paste the code or link',
          })}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={t('challenges.join.codeLabel', {
            defaultValue: 'Invite code',
          })}
        />
        <Text className="text-sm font-semibold text-text-secondary mt-2">
          {t('challenges.join.nameLabel', { defaultValue: 'Your name in it' })}
        </Text>
        <FormInput
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={MAX_DISPLAY_NAME}
          placeholder={t('challenges.join.namePlaceholder', {
            defaultValue: 'For example, your first name',
          })}
          accessibilityLabel={t('challenges.join.nameLabel', {
            defaultValue: 'Your name in it',
          })}
          returnKeyType="done"
          onSubmitEditing={handleJoin}
        />
        <Text className="text-xs text-text-muted">
          {t('challenges.join.privacy', {
            defaultValue:
              'Members see this name and your points, never your diary or your email. You can leave at any time.',
          })}
        </Text>
        {error ? (
          <Text
            className="text-sm text-icon-danger mt-1"
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
      </View>
    </FormScreenChrome>
  );
};

export default ChallengeJoinScreen;
