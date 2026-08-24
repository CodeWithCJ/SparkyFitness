import React, { useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { eddFromLmp, eddFromConception, compareDays } from '@workspace/shared';
import type { PregnancyDueDateBasis, SharedPregnancy } from '@workspace/shared';
import { getTodayDate, formatDate, addDays } from '../../../utils/dateUtils';
import BottomSheetPicker from '../../BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../../CalendarSheet';
import SettingsRow, { SettingsRowGroup } from '../../SettingsRow';

const BASIS_OPTIONS: { value: PregnancyDueDateBasis; label: string }[] = [
  // i18n-audit-ignore-next-line hardcoded-ui-text -- internal translation selector key, not visible text.
  { value: 'manual', label: 'dueDate' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- internal translation selector key, not visible text.
  { value: 'scan', label: 'ultrasoundScan' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- internal translation selector key, not visible text.
  { value: 'lmp', label: 'lastPeriod' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- internal translation selector key, not visible text.
  { value: 'conception', label: 'conceptionDate' },
];

const DATE_FIELD_LABEL: Record<PregnancyDueDateBasis, string> = {
  lmp: 'firstDayLastPeriod',
  conception: 'conceptionDate',
  manual: 'estimatedDueDate',
  scan: 'estimatedDueDateFromScan',
};

// A pregnancy runs ~280 days; term is capped at 42 weeks (294 days). Allow a
// little slack for overdue (past) and very-early (future) due dates.
const MAX_DUE_DAYS_AHEAD = 300;
const MAX_OVERDUE_DAYS = 21;

export interface PregnancyDueDateFormState {
  basis: PregnancyDueDateBasis;
  setBasis: (basis: PregnancyDueDateBasis) => void;
  date: string;
  setDate: (date: string) => void;
  computedDueDate: string;
  /** Returns an error message if the entered dates are implausible, else null. */
  validate: () => string | null;
  /** Date fields of the pregnancy payload, derived from the selected basis. */
  dates: Pick<SharedPregnancy, 'due_date' | 'due_date_basis' | 'lmp_date' | 'conception_date'>;
}

export function usePregnancyDueDateForm(
  existing?: SharedPregnancy | null,
): PregnancyDueDateFormState {
  const { t } = useTranslation();
  // Prefill from the existing record when editing. For lmp/conception the date
  // field holds that basis date; for manual/scan it holds the due date itself.
  // New pregnancies default to a plain due date, the value most people know —
  // seeded a full term out so an untouched form doesn't save a due date of today.
  const initialBasis = existing?.due_date_basis ?? 'manual';
  const initialDate =
    initialBasis === 'lmp'
      ? existing?.lmp_date ?? getTodayDate()
      : initialBasis === 'conception'
        ? existing?.conception_date ?? getTodayDate()
        : existing?.due_date ?? addDays(getTodayDate(), 280);

  const [basis, setBasis] = useState<PregnancyDueDateBasis>(initialBasis);
  const [date, setDate] = useState<string>(initialDate);

  const computedDueDate = useMemo(() => {
    if (basis === 'lmp') return eddFromLmp(date);
    if (basis === 'conception') return eddFromConception(date);
    return date; // manual / scan: the entered date is already the due date
  }, [basis, date]);

  const validate = (): string | null => {
    const today = getTodayDate();
    if (basis === 'lmp' && compareDays(date, today) > 0) {
      return t('pregnancyDueDate.errors.lmpFuture', { defaultValue: 'Your last period can’t be in the future.' });
    }
    if (basis === 'conception' && compareDays(date, today) > 0) {
      return t('pregnancyDueDate.errors.conceptionFuture', { defaultValue: 'The conception date can’t be in the future.' });
    }
    if (compareDays(computedDueDate, addDays(today, -MAX_OVERDUE_DAYS)) < 0) {
      return t('pregnancyDueDate.errors.past', { defaultValue: 'That due date is in the past. Please check the date.' });
    }
    if (compareDays(computedDueDate, addDays(today, MAX_DUE_DAYS_AHEAD)) > 0) {
      return t('pregnancyDueDate.errors.tooFar', { defaultValue: 'That due date is too far away — a pregnancy is about 40 weeks.' });
    }
    return null;
  };

  return {
    basis,
    setBasis,
    date,
    setDate,
    computedDueDate,
    validate,
    dates: {
      due_date: computedDueDate,
      due_date_basis: basis,
      lmp_date: basis === 'lmp' ? date : null,
      conception_date: basis === 'conception' ? date : null,
    },
  };
}

interface PregnancyDueDateFormProps {
  form: PregnancyDueDateFormState;
  /** Extra rows appended inside the settings group (e.g. fetus count). */
  children?: React.ReactNode;
}

/**
 * Basis picker + date field + estimated-due-date preview for creating or
 * editing a pregnancy. Owns its calendar sheet; screens hold the state via
 * `usePregnancyDueDateForm` so they can validate and build the save payload.
 */
const PregnancyDueDateForm: React.FC<PregnancyDueDateFormProps> = ({ form, children }) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const calendarRef = useRef<CalendarSheetRef>(null);

  return (
    <View>
      <SettingsRowGroup>
        <SettingsRow
          title={t('pregnancyDueDate.basedOn', { defaultValue: 'Based on' })}
          rightAccessory={
            <BottomSheetPicker
              value={form.basis}
              options={BASIS_OPTIONS.map((option) => ({ ...option, label: ({ dueDate: t('pregnancyDueDate.options.dueDate', { defaultValue: 'Due date' }), ultrasoundScan: t('pregnancyDueDate.options.ultrasoundScan', { defaultValue: 'Ultrasound scan' }), lastPeriod: t('pregnancyDueDate.options.lastPeriod', { defaultValue: 'Last period (LMP)' }), conceptionDate: t('pregnancyDueDate.options.conceptionDate', { defaultValue: 'Conception date' }) } as Record<string, string>)[option.label] }))}
              onSelect={form.setBasis}
              title={t('pregnancyDueDate.estimateBy', { defaultValue: 'Estimate due date by' })}
              containerStyle={{ flex: 1, maxWidth: 210 }}
            />
          }
        />
        <SettingsRow
          title={({ firstDayLastPeriod: t('pregnancyDueDate.fields.firstDayLastPeriod', { defaultValue: 'First day of last period' }), conceptionDate: t('pregnancyDueDate.fields.conceptionDate', { defaultValue: 'Conception date' }), estimatedDueDate: t('pregnancyDueDate.fields.estimatedDueDate', { defaultValue: 'Estimated due date' }), estimatedDueDateFromScan: t('pregnancyDueDate.fields.estimatedDueDateFromScan', { defaultValue: 'Estimated due date (from scan)' }) } as Record<string, string>)[DATE_FIELD_LABEL[form.basis]]}
          rightAccessory={
            <TouchableOpacity onPress={() => calendarRef.current?.present()}>
              <Text className="text-accent-primary text-base font-semibold">
                {formatDate(form.date, dateLocale)}
              </Text>
            </TouchableOpacity>
          }
        />
        {children}
      </SettingsRowGroup>

      <View className="bg-surface rounded-2xl p-4 mt-4 border border-border-subtle shadow-sm">
        <Text className="text-text-secondary text-xs">{t('pregnancyDueDate.estimated', { defaultValue: 'Estimated due date' })}</Text>
        <Text className="text-text-primary text-lg font-bold">
          {formatDate(form.computedDueDate, dateLocale)}
        </Text>
      </View>

      <CalendarSheet ref={calendarRef} selectedDate={form.date} onSelectDate={form.setDate} />
    </View>
  );
};

export default PregnancyDueDateForm;
