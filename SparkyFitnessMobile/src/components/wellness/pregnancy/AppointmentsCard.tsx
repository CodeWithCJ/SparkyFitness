import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { useHealthAppointments, useHealthAppointmentMutations } from '../../../hooks/useHealthAppointments';
import { getTodayDate, formatDate, toLocalDateString } from '../../../utils/dateUtils';
import CalendarSheet, { type CalendarSheetRef } from '../../CalendarSheet';
import FormInput from '../../FormInput';
import StepperInput from '../../StepperInput';
import Button from '../../ui/Button';
import Icon from '../../Icon';
import type { HealthAppointment } from '../../../types/womensHealth';

function combineDateAndTime(dateStr: string, hour: number, minute: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const localDateStr = toLocalDateString(d);
  return `${formatDate(localDateStr)} · ${time}`;
}

const AppointmentsCard: React.FC = () => {
  const { appointments, isLoading } = useHealthAppointments(true);
  const { createAsync, isCreating, deleteAsync } = useHealthAppointmentMutations();
  const [accentColor, dangerColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
    '--color-text-muted',
  ]) as [string, string, string];

  const calendarRef = useRef<CalendarSheetRef>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getTodayDate);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const resetForm = () => {
    setTitle('');
    setAppointmentType('');
    setLocation('');
    setNotes('');
    setDate(getTodayDate());
    setHour(9);
    setMinute(0);
  };

  const handleSave = async () => {
    try {
      await createAsync({
        scheduled_at: combineDateAndTime(date, hour, minute),
        appointment_type: appointmentType || undefined,
        title: title || undefined,
        location: location || undefined,
        notes: notes || undefined,
      });
      Toast.show({ type: 'success', text1: 'Appointment added' });
      resetForm();
      setShowForm(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save appointment' });
    }
  };

  const handleDelete = async (appt: HealthAppointment) => {
    try {
      await deleteAsync(appt.id);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not remove appointment' });
    }
  };

  const sorted = [...appointments].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-base font-bold">Appointments</Text>
        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          className="flex-row items-center gap-1 rounded-full bg-raised px-3 py-1.5"
        >
          <Icon name={showForm ? 'close' : 'add'} size={16} color={accentColor} />
          <Text className="text-xs font-semibold" style={{ color: accentColor }}>
            {showForm ? 'Cancel' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : sorted.length === 0 && !showForm ? (
        <Text className="text-text-secondary text-xs italic py-2">
          No upcoming appointments scheduled.
        </Text>
      ) : (
        <View className="gap-2">
          {sorted.map((appt) => (
            <View key={appt.id} className="flex-row items-start justify-between rounded-xl bg-raised p-3">
              <View className="flex-1 mr-2">
                <Text className="text-text-primary text-sm font-semibold">
                  {appt.title || appt.appointment_type || 'Appointment'}
                </Text>
                <Text className="text-text-secondary text-xs mt-0.5">
                  {formatScheduledAt(appt.scheduled_at)}
                </Text>
                {!!appt.location && (
                  <Text className="text-xs mt-0.5" style={{ color: textMuted }}>
                    {appt.location}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(appt)}
                hitSlop={8}
                testID={`delete-appointment-${appt.id}`}
              >
                <Icon name="trash" size={16} color={dangerColor} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {showForm && (
        <View className="gap-3 mt-1 pt-3 border-t border-border-subtle">
          <FormInput value={title} onChangeText={setTitle} placeholder="Title (e.g. Anatomy scan)" />
          <FormInput
            value={appointmentType}
            onChangeText={setAppointmentType}
            placeholder="Type (e.g. Ultrasound)"
          />
          <FormInput value={location} onChangeText={setLocation} placeholder="Location" />

          <TouchableOpacity
            onPress={() => calendarRef.current?.present()}
            className="flex-row items-center justify-between rounded-xl bg-raised p-3"
          >
            <Text className="text-text-primary text-sm">Date</Text>
            <Text className="text-sm font-semibold" style={{ color: accentColor }}>
              {formatDate(date)}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between rounded-xl bg-raised p-3">
            <Text className="text-text-primary text-sm">Time</Text>
            <View className="flex-row items-center gap-2">
              <StepperInput
                value={String(hour).padStart(2, '0')}
                onChangeText={(t) => setHour(Math.max(0, Math.min(23, parseInt(t, 10) || 0)))}
                onIncrement={() => setHour((h) => (h + 1) % 24)}
                onDecrement={() => setHour((h) => (h + 23) % 24)}
                keyboardType="number-pad"
                compact
              />
              <Text className="text-text-secondary">:</Text>
              <StepperInput
                value={String(minute).padStart(2, '0')}
                onChangeText={(t) => setMinute(Math.max(0, Math.min(59, parseInt(t, 10) || 0)))}
                onIncrement={() => setMinute((m) => (m + 15) % 60)}
                onDecrement={() => setMinute((m) => (m + 45) % 60)}
                keyboardType="number-pad"
                compact
              />
            </View>
          </View>

          <FormInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            multiline
            style={{ minHeight: 60, textAlignVertical: 'top' }}
          />

          <Button variant="primary" disabled={isCreating} onPress={handleSave}>
            {isCreating ? 'Saving…' : 'Save Appointment'}
          </Button>
        </View>
      )}

      <CalendarSheet ref={calendarRef} selectedDate={date} onSelectDate={setDate} />
    </View>
  );
};

export default AppointmentsCard;
