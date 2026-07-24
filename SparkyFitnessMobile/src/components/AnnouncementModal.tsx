import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from './Icon';
import MarkdownMessage from './chat/MarkdownMessage';
import { apiFetch } from '../services/api/apiClient';

const DISMISSED_ANNOUNCEMENT_KEY = 'dismissed_announcement_id';

interface AnnouncementPayload {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
}

export const AnnouncementModal: React.FC = () => {
  const [announcement, setAnnouncement] = useState<AnnouncementPayload | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchAnnouncement = async () => {
      try {
        const data = await apiFetch<AnnouncementPayload>({
          endpoint: '/api/announcement/current',
          serviceName: 'Announcement',
          operation: 'getCurrent',
        });

        if (!active || !data || !data.active || !data.id) return;

        const dismissedId = await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY);
        if (dismissedId !== data.id) {
          setAnnouncement(data);
          setVisible(true);
        }
      } catch {
        // Silently ignore network errors when offline
      }
    };

    void fetchAnnouncement();
    return () => {
      active = false;
    };
  }, []);

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
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Icon name="sparkles" size={20} color="#3b82f6" />
              <Text style={styles.titleText}>{announcement.title || 'Announcement'}</Text>
            </View>
            <Pressable onPress={handleDismiss} style={styles.closeButton}>
              <Icon name="close" size={18} color="#94a3b8" />
            </Pressable>
          </View>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
            <MarkdownMessage text={announcement.message} />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={handleDismiss} style={styles.dismissButton}>
              <Text style={styles.dismissButtonText}>Got it, don&apos;t show again</Text>
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#f8fafc',
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
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'flex-end',
  },
  dismissButton: {
    backgroundColor: '#3b82f6',
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
