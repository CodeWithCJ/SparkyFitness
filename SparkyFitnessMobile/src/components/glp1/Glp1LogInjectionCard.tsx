import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { INJECTION_SITES, type Medication } from '@workspace/shared';
import BottomSheetPicker from '../BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import DateSelectRow from '../DateSelectRow';
import FormInput from '../FormInput';
import Button from '../ui/Button';
import InjectionBodyMap from './InjectionBodyMap';
import {
  useLogInjection,
  useMedicationPens,
  useSiteSuggestion,
} from '../../hooks/useGlp1';
import { getTodayDate } from '../../utils/dateUtils';
import { resolveMapSites, usablePens, penDosesLeft } from '../../utils/glp1';
import { injectionSiteLabel } from '../../utils/medicationLocalization';
import { addLog } from '../../services/LogService';

interface Glp1LogInjectionCardProps {
  med: Medication;
}

const NO_PEN = 'none';

/**
 * Log an injection: pick a site on the body map (the server's rotation
 * suggestion is preselected), dose, day, and optionally the pen/vial to draw
 * from. Leaving the dose blank lets the server resolve it from the active
 * titration step or the medication default.
 */
const Glp1LogInjectionCard: React.FC<Glp1LogInjectionCardProps> = ({ med }) => {
  const { t } = useTranslation();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const siteQuery = useSiteSuggestion(med.id);
  const pensQuery = useMedicationPens(med.id);
  const logInjection = useLogInjection();

  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [doseText, setDoseText] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getTodayDate);
  const [penChoice, setPenChoice] = useState<string | null>(null);

  const mapSites = useMemo(
    () => resolveMapSites(siteQuery.data?.activeSiteIds),
    [siteQuery.data?.activeSiteIds]
  );
  const pens = useMemo(
    () => usablePens(pensQuery.data ?? []),
    [pensQuery.data]
  );

  const suggestedSite = siteQuery.data?.suggestedSiteId ?? null;
  const site = selectedSite ?? suggestedSite;
  // Default to the pen the server would pick, so drawing from inventory is the
  // path of least effort; "Don't deduct" stays one tap away.
  const penId = penChoice ?? pens[0]?.id ?? NO_PEN;

  const siteOptions = useMemo(
    () =>
      mapSites.map((s) => ({
        label: injectionSiteLabel(s.id, t),
        value: s.id,
      })),
    [mapSites, t]
  );
  const penOptions = useMemo(
    () => [
      {
        label: t('medications.glp1.log.dontDeduct', {
          defaultValue: "Don't deduct",
        }),
        value: NO_PEN,
      },
      ...pens.map((p) => {
        const left = penDosesLeft(p);
        return {
          label: [
            p.label ||
              (p.kind === 'vial'
                ? t('medications.glp1.inventory.vial', {
                    defaultValue: 'Vial',
                  })
                : t('medications.glp1.inventory.pen', {
                    defaultValue: 'Pen',
                  })),
            p.dose_mg != null ? `${p.dose_mg} mg` : null,
            left != null
              ? t('medications.glp1.inventory.left', {
                  defaultValue: '{{count}} left',
                  count: left,
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
          value: p.id,
        };
      }),
    ],
    [pens, t]
  );

  const handleLog = () => {
    if (!site || logInjection.isPending) return;
    const dose = doseText.trim() === '' ? null : Number(doseText);
    if (dose !== null && (!Number.isFinite(dose) || dose <= 0)) {
      Toast.show({
        type: 'error',
        text1: t('medications.glp1.log.invalidDose', {
          defaultValue: 'Enter a valid dose',
        }),
      });
      return;
    }
    const deduct = penId !== NO_PEN;
    // Today logs the real moment; a past day has no time to speak of, so it is
    // pinned to noon local time, which keeps it on that day in any timezone.
    const injectedAt =
      date === getTodayDate() ? new Date() : new Date(`${date}T12:00:00`);
    logInjection.mutate(
      {
        medication_id: med.id,
        site,
        dose_mg: dose,
        injected_at: injectedAt.toISOString(),
        entry_date: date,
        pen_id: deduct ? penId : null,
        deduct_pen: deduct,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setSelectedSite(null);
          setDoseText('');
          setNotes('');
          setPenChoice(null);
          Toast.show({
            type: 'success',
            text1: t('medications.glp1.log.logged', {
              defaultValue: 'Injection logged',
            }),
          });
        },
        onError: (error) => {
          addLog(`Failed to log injection: ${error.message}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: t('medications.glp1.log.failed', {
              defaultValue: 'Failed to log injection',
            }),
          });
        },
      }
    );
  };

  const siteLabel =
    site && INJECTION_SITES.some((s) => s.id === site)
      ? injectionSiteLabel(site, t)
      : null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">
        {t('medications.glp1.log.title', { defaultValue: 'Log injection' })}
      </Text>
      <Text className="text-xs text-text-muted mt-0.5 mb-3">
        {t('medications.glp1.log.legend', {
          defaultValue:
            'Green is the suggested site. Amber was used in the last {{days}} days.',
          days: siteQuery.data?.restDays ?? 7,
        })}
      </Text>

      <InjectionBodyMap
        sites={mapSites}
        selectedSiteId={site}
        suggestedSiteId={suggestedSite}
        restingSiteIds={siteQuery.data?.restingSiteIds}
        onSelect={setSelectedSite}
      />
      {/* The map is touch-only; the picker is the accessible way to choose a site. */}
      <View className="mt-3">
        <BottomSheetPicker
          value={site ?? ''}
          options={siteOptions}
          onSelect={setSelectedSite}
          placeholder={t('medications.glp1.log.chooseSite', {
            defaultValue: 'Choose a site',
          })}
          title={t('medications.glp1.log.siteTitle', {
            defaultValue: 'Injection site',
          })}
        />
      </View>

      <View className="flex-row gap-4 mt-4">
        <View className="flex-1 gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.log.dose', { defaultValue: 'Dose (mg)' })}
          </Text>
          <FormInput
            value={doseText}
            onChangeText={setDoseText}
            keyboardType="decimal-pad"
            placeholder={
              med.dose_amount != null
                ? String(med.dose_amount)
                : t('medications.glp1.log.dosePlaceholder', {
                    defaultValue: 'Auto',
                  })
            }
          />
        </View>
        <View className="flex-1 gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.log.pen', { defaultValue: 'From pen / vial' })}
          </Text>
          <BottomSheetPicker
            value={penId}
            options={penOptions}
            onSelect={setPenChoice}
            title={t('medications.glp1.log.penTitle', {
              defaultValue: 'Deduct from',
            })}
          />
        </View>
      </View>

      <View className="mt-4">
        <DateSelectRow
          date={date}
          onPress={() => calendarRef.current?.present()}
        />
      </View>

      <View className="gap-1.5 mt-4">
        <Text className="text-text-secondary text-sm font-medium">
          {t('medications.glp1.log.notes', { defaultValue: 'Notes' })}
        </Text>
        <FormInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('medications.glp1.log.notesPlaceholder', {
            defaultValue: 'e.g. Mild stinging',
          })}
        />
      </View>

      <Button
        variant="primary"
        className="mt-4"
        onPress={handleLog}
        disabled={!site}
        loading={logInjection.isPending}
      >
        {siteLabel
          ? t('medications.glp1.log.logAt', {
              defaultValue: 'Log injection: {{site}}',
              site: siteLabel,
            })
          : t('medications.glp1.log.title', { defaultValue: 'Log injection' })}
      </Button>

      <CalendarSheet
        ref={calendarRef}
        selectedDate={date}
        onSelectDate={(d) => {
          setDate(d);
          calendarRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default Glp1LogInjectionCard;
