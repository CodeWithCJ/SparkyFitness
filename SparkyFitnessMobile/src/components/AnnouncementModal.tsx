import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View, StyleSheet, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import MarkdownMessage from './chat/MarkdownMessage';
import { apiFetch } from '../services/api/apiClient';

export const DISMISSED_ANNOUNCEMENT_KEY = 'dismissed_announcement_id';

export async function resetAnnouncementModal(): Promise<void> {
  await AsyncStorage.removeItem(DISMISSED_ANNOUNCEMENT_KEY);
  DeviceEventEmitter.emit('RESET_ANNOUNCEMENT');
}

interface AnnouncementPayload {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
}

export const AnnouncementModal: React.FC = () => {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState<AnnouncementPayload | null>(null);
  const [visible, setVisible] = useState(false);

  const [surfaceBg, textPrimary, textSecondary, borderSubtle, accentPrimary, textMuted] =
    useCSSVariable([
      '--color-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border-subtle',
      '--color-accent-primary',
      '--color-text-muted',
    ]) as [string, string, string, string, string, string];

  useEffect(() => {
    let active = true;
    let requestGen = 0;

    const fetchAnnouncement = async () => {
      const currentGen = ++requestGen;
      try {
        const data = await apiFetch<AnnouncementPayload>({
          endpoint: '/api/announcement/current',
          serviceName: 'Announcement',
          operation: 'getCurrent',
        });

        if (!active || currentGen !== requestGen || !data || !data.active || !data.id) return;

        const dismissedId = await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY);
        if (active && currentGen === requestGen && dismissedId !== data.id) {
          setAnnouncement(data);
          setVisible(true);
        }
      } catch {
        // Silently ignore network errors when offline
      }
    };

    void fetchAnnouncement();

    const sub = DeviceEventEmitter.addListener('RESET_ANNOUNCEMENT', () => {
      void fetchAnnouncement();
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
  };

  const handleDismiss = async () => {
    if (announcement?.id) {
      await AsyncStorage.setItem(DISMISSED_ANNOUNCEMENT_KEY, announcement.id);
    }
    setVisible(false);
  };

  if (!visible || !announcement) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: surfaceBg || '#1e293b', borderColor: borderSubtle || 'rgba(255, 255, 255, 0.12)' }]}>
          <View style={[styles.header, { borderBottomColor: borderSubtle || 'rgba(255, 255, 255, 0.1)' }]}>
            <View style={styles.titleRow}>
              <Icon name="sparkles" size={20} color={accentPrimary || '#3b82f6'} />
              <Text style={[styles.titleText, { color: textPrimary || '#f8fafc' }]}>{announcement.title || t('announcementModal.title', { defaultValue: 'Announcement' })}</Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('announcementModal.close', { defaultValue: 'Close announcement' })}>
              <Icon name="close" size={18} color={textMuted || '#94a3b8'} />
            </Pressable>
          </View>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
            <MarkdownMessage text={announcement.message} color={textSecondary || '#cbd5e1'} streaming={false} />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: borderSubtle || 'rgba(255, 255, 255, 0.1)' }]}>
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('announcementModal.dismiss', { defaultValue: "Got it, don't show again" })}
              style={[styles.dismissButton, { backgroundColor: accentPrimary || '#3b82f6' }]}
            >
              <Text style={styles.dismissButtonText}>{t('announcementModal.dismiss', { defaultValue: "Got it, don't show again" })}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
  },
  bodyScroll: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  bodyContent: {
    paddingBottom: 10,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  dismissButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
