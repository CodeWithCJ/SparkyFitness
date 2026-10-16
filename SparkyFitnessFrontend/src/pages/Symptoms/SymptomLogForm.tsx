import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateSymptomChoice } from './symptomLabels';
import { Plus, X } from 'lucide-react';
import {
  BUILT_IN_PHASE_OPTIONS,
  SYMPTOM_IMPACT_LEVELS,
  SYMPTOM_PHASES,
  TEMPLATE_LOCATION_KIND,
  type SymptomEntryResponse,
  type SymptomImpact,
  type SymptomOptionKind,
  buildSymptomChoices,
  minutesAgo,
  resolveOptionItems,
  resolveTriggerGroups,
  slugifySymptomName,
  TIME_OFFSET_CHIPS,
  type SymptomChoice,
  draftsFromEntry,
  type TreatmentDraft,
  buildEntryBody,
} from '@workspace/shared';
import type { MedicationDetail } from '@/types/medications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateCustomSymptomMutation,
  useCreateSymptomEntryMutation,
  useCreateSymptomOptionMutation,
  useCustomSymptoms,
  useDeleteSymptomOptionMutation,
  useDeleteSymptomPhotoMutation,
  useSymptomOptions,
  useUpdateSymptomEntryMutation,
  useUploadSymptomPhotoMutation,
} from '@/hooks/useSymptoms';
import { cn } from '@/lib/utils';
import ChipPicker from './ChipPicker';
import SeverityControl from './SeverityControl';
import SymptomLocationMap from './SymptomLocationMap';
import SymptomSection from './SymptomSection';
import TreatmentsEditor from './TreatmentsEditor';
import {
  fromDatetimeLocal,
  symptomPhotoUrl,
  toDatetimeLocal,
} from './symptomHelpers';

type EntryMode = 'quick' | 'episode';

interface SymptomLogFormProps {
  selectedDate: string;
  today: string;
  /** Medications the user can link or record as treatment. */
  meds: MedicationDetail[];
  /** Symptom to start on (a recent-symptom chip). */
  initialSymptomName?: string;
  /** Entry being edited; omit to log a new one. */
  editing?: SymptomEntryResponse;
  /** Called after a successful save. */
  onDone?: () => void;
  /** 'card' wraps the form in a card with a title; 'plain' is for dialogs. */
  variant?: 'card' | 'plain';
}

const NOT_SURE = 'Not sure';

const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7];

/** A choice for a symptom name with no saved definition (older or cycle entries). */
function fallbackChoice(name: string, displayName: string): SymptomChoice {
  return {
    name,
    displayName,
    template: 'generic',
    category: 'general',
    scaleType: '1-10',
    isEpisodic: false,
    isGlp1: false,
    isPinned: false,
    definitionId: null,
    sections: {
      timing: true,
      severity: true,
      locations: false,
      phases: false,
      qualities: false,
      associated: false,
      triggers: true,
      treatments: true,
      impact: false,
      notes: true,
      medication: true,
      bristol: false,
      photos: false,
      custom_fields: true,
    },
    customFieldDefs: [],
  };
}

export default function SymptomLogForm({
  selectedDate,
  today,
  meds,
  initialSymptomName,
  editing,
  onDone,
  variant = 'card',
}: SymptomLogFormProps) {
  const { t } = useTranslation();
  const { data: definitions = [] } = useCustomSymptoms();
  const { data: storedOptions = [] } = useSymptomOptions();

  const createDefinition = useCreateCustomSymptomMutation();
  const createOption = useCreateSymptomOptionMutation();
  const deleteOption = useDeleteSymptomOptionMutation();
  const createEntry = useCreateSymptomEntryMutation();
  const updateEntry = useUpdateSymptomEntryMutation();
  const uploadPhoto = useUploadSymptomPhotoMutation();
  const deletePhoto = useDeleteSymptomPhotoMutation();

  const choices = useMemo(() => {
    const list = buildSymptomChoices(definitions);
    return list.sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        a.displayName.localeCompare(b.displayName)
    );
  }, [definitions]);

  // --- Form state ---------------------------------------------------------
  const editedChoice = editing?.symptom_id
    ? choices.find((c) => c.definitionId === editing.symptom_id)
    : undefined;
  const startName = editing
    ? (editedChoice?.name ?? slugifySymptomName(editing.symptom_name_snapshot))
    : (initialSymptomName ?? 'headache');
  const [symptomName, setSymptomName] = useState(startName);

  const choice: SymptomChoice =
    choices.find((c) => c.name === symptomName) ??
    fallbackChoice(
      symptomName,
      editing?.symptom_name_snapshot ?? symptomName.replace(/_/g, ' ')
    );

  const [mode, setMode] = useState<EntryMode>(
    editing
      ? editing.started_at
        ? 'episode'
        : 'quick'
      : choice.isEpisodic
        ? 'episode'
        : 'quick'
  );
  const defaultStart =
    selectedDate === today
      ? new Date().toISOString()
      : new Date(`${selectedDate}T12:00:00`).toISOString();
  const [startedAt, setStartedAt] = useState<string>(
    editing?.started_at ?? defaultStart
  );
  const [showPicker, setShowPicker] = useState(Boolean(editing?.started_at));
  const [ongoing, setOngoing] = useState(editing ? !editing.ended_at : true);
  const [endedAt, setEndedAt] = useState<string>(
    editing?.ended_at ?? new Date().toISOString()
  );
  const [severity, setSeverity] = useState<number | null>(
    editing?.severity ?? null
  );
  const [locations, setLocations] = useState<string[]>(
    editing?.body_locations ?? []
  );
  const [phases, setPhases] = useState<Record<string, string[]>>(
    editing?.phases ?? {}
  );
  const [qualities, setQualities] = useState<string[]>(
    editing?.qualities ?? []
  );
  const [associated, setAssociated] = useState<string[]>(
    editing?.associated_symptoms ?? []
  );
  const [triggers, setTriggers] = useState<string[]>(editing?.triggers ?? []);
  const [impact, setImpact] = useState<SymptomImpact | null>(
    editing?.impact ?? null
  );
  const [bristol, setBristol] = useState<number | null>(
    editing?.bristol_type ?? null
  );
  const [medId, setMedId] = useState<string | null>(
    editing?.medication_id ?? null
  );
  const [notes, setNotes] = useState(editing?.context_text ?? '');
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(
    editing?.custom_fields ?? {}
  );
  const [treatments, setTreatments] = useState<TreatmentDraft[]>(
    editing ? draftsFromEntry(editing) : []
  );
  const [files, setFiles] = useState<File[]>([]);
  const [newSymptom, setNewSymptom] = useState('');
  const [addingSymptom, setAddingSymptom] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const isEdit = Boolean(editing);
  const saving =
    createEntry.isPending ||
    updateEntry.isPending ||
    createDefinition.isPending ||
    uploadPhoto.isPending;

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    label: string
  ) =>
    setList(
      list.includes(label) ? list.filter((v) => v !== label) : [...list, label]
    );

  const addOption = (
    kind: SymptomOptionKind,
    label: string,
    select: (label: string) => void
  ) =>
    createOption.mutate(
      { kind, name: label },
      { onSuccess: () => select(label) }
    );

  const removeOption = (optionId: string, clear: () => void) =>
    deleteOption.mutate(optionId, { onSuccess: clear });

  const locationKind = TEMPLATE_LOCATION_KIND[choice.template];
  const mapKind =
    choice.template === 'headache'
      ? 'head'
      : choice.template === 'pain' || choice.template === 'skin'
        ? 'body'
        : null;

  const handleSymptomChange = (name: string) => {
    setSymptomName(name);
    if (!isEdit) {
      const next = choices.find((c) => c.name === name);
      if (next) setMode(next.isEpisodic ? 'episode' : 'quick');
    }
  };

  const createSymptom = () => {
    const label = newSymptom.trim();
    if (!label) return;
    createDefinition.mutate(
      {
        name: slugifySymptomName(label),
        display_name: label,
        template: 'generic',
        scale_type: '1-10',
      },
      {
        onSuccess: (def) => {
          setSymptomName(def.name);
          setNewSymptom('');
          setAddingSymptom(false);
        },
      }
    );
  };

  // --- Submit -------------------------------------------------------------
  const buildBody = (symptomId: string | null) =>
    buildEntryBody({
      state: {
        mode,
        startedAt,
        ongoing,
        endedAt,
        severity,
        locations,
        phases,
        qualities,
        associated,
        triggers,
        impact,
        bristol,
        medicationId: medId,
        notes,
        customFields: customValues,
        treatments,
      },
      choice,
      symptomId,
      selectedDate,
      today,
      isEdit,
    });

  const handleSave = async () => {
    // A built-in symptom becomes a saved definition the first time it is logged,
    // so the entry can point at it and its custom fields can be validated.
    let symptomId = choice.definitionId;
    if (!symptomId && !isEdit) {
      try {
        const def = await createDefinition.mutateAsync({
          name: choice.name,
          display_name: choice.displayName,
          template: choice.template,
          category: choice.category,
          scale_type: choice.scaleType,
          is_episodic: choice.isEpisodic,
          is_glp1_flagged: choice.isGlp1,
          custom_field_defs: choice.customFieldDefs,
        });
        symptomId = def.id;
      } catch {
        return;
      }
    }
    if (isEdit) symptomId = editing?.symptom_id ?? symptomId;

    const body = buildBody(symptomId);
    try {
      const saved = editing
        ? await updateEntry.mutateAsync({ id: editing.id, body })
        : savedId
          ? await updateEntry.mutateAsync({ id: savedId, body })
          : await createEntry.mutateAsync(body);
      if (!editing && !savedId) setSavedId(saved.id);
      for (const file of files) {
        await uploadPhoto.mutateAsync({ entryId: saved.id, file });
        setFiles((cur) => cur.filter((f) => f !== file));
      }
      setSavedId(null);
      if (!isEdit) {
        setNotes('');
        setTriggers([]);
        setLocations([]);
        setQualities([]);
        setAssociated([]);
        setPhases({});
        setTreatments([]);
        setFiles([]);
        setImpact(null);
        setBristol(null);
        setMedId(null);
        setCustomValues({});
      }
      onDone?.();
    } catch {
      // The mutation's meta already toasts the failure.
    }
  };

  const locationItems = resolveOptionItems(locationKind, storedOptions);

  // --- Render -------------------------------------------------------------
  const startChips = (
    <div className="flex flex-col gap-2">
      <Label>{t('symptoms.form.started', 'Started')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {TIME_OFFSET_CHIPS.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => {
              setStartedAt(minutesAgo(chip.minutes).toISOString());
              setShowPicker(false);
            }}
          >
            {chip.minutes === 0
              ? t('symptoms.form.now', 'Now')
              : chip.minutes < 60
                ? t('symptoms.form.minutesAgo', '−{{n}} min', {
                    n: chip.minutes,
                  })
                : t('symptoms.form.hoursAgo', '−{{n}} h', {
                    n: chip.minutes / 60,
                  })}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full border-dashed px-3 text-xs text-primary"
          onClick={() => setShowPicker((s) => !s)}
        >
          {t('symptoms.form.pick', 'Pick…')}
        </Button>
      </div>
      {showPicker && (
        <Input
          type="datetime-local"
          aria-label={t('symptoms.form.startedAt', 'Start date and time')}
          value={toDatetimeLocal(startedAt)}
          onChange={(e) => {
            const iso = fromDatetimeLocal(e.target.value);
            if (iso) setStartedAt(iso);
          }}
          className="w-full max-w-xs"
        />
      )}
      <p className="text-xs text-muted-foreground">
        {new Date(startedAt).toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <Switch
          id="symptom-ongoing"
          checked={ongoing}
          onCheckedChange={setOngoing}
        />
        <Label htmlFor="symptom-ongoing" className="text-sm font-normal">
          {t('symptoms.form.ongoing', 'Still ongoing')}
        </Label>
      </div>
      {!ongoing && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="symptom-ended">
            {t('symptoms.form.ended', 'Ended')}
          </Label>
          <Input
            id="symptom-ended"
            type="datetime-local"
            value={toDatetimeLocal(endedAt)}
            onChange={(e) => {
              const iso = fromDatetimeLocal(e.target.value);
              if (iso) setEndedAt(iso);
            }}
            className="w-full max-w-xs"
          />
        </div>
      )}
    </div>
  );

  const form = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="symptom-name">
              {t('symptoms.form.symptom', 'Symptom')}
            </Label>
            {!isEdit && (
              <button
                type="button"
                onClick={() => setAddingSymptom((s) => !s)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                {t('symptoms.form.newSymptom', 'New symptom')}
              </button>
            )}
          </div>
          <Select
            value={symptomName}
            onValueChange={handleSymptomChange}
            disabled={isEdit}
          >
            <SelectTrigger id="symptom-name">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {translateSymptomChoice(t, c)}
                </SelectItem>
              ))}
              {!choices.some((c) => c.name === symptomName) && (
                <SelectItem value={symptomName}>
                  {translateSymptomChoice(t, choice)}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {choice.sections.timing && (
          <div
            className="inline-flex rounded-lg bg-muted p-0.5"
            role="group"
            aria-label={t('symptoms.form.kind', 'Kind of entry')}
          >
            {(['quick', 'episode'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mode === m
                    ? 'bg-background font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m === 'quick'
                  ? t('symptoms.form.quick', 'Quick log')
                  : t('symptoms.form.episode', 'Episode')}
              </button>
            ))}
          </div>
        )}
      </div>

      {addingSymptom && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newSymptom}
            maxLength={80}
            placeholder={t(
              'symptoms.form.newSymptomPlaceholder',
              'e.g. Lower back pain'
            )}
            aria-label={t('symptoms.form.newSymptomName', 'New symptom name')}
            onChange={(e) => setNewSymptom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                createSymptom();
              }
            }}
          />
          <Button
            type="button"
            onClick={createSymptom}
            disabled={!newSymptom.trim() || createDefinition.isPending}
          >
            {t('symptoms.chips.save', 'Save')}
          </Button>
        </div>
      )}

      {choice.sections.timing && mode === 'episode' && startChips}

      {choice.sections.severity && (
        <SeverityControl
          scale={choice.scaleType}
          value={severity}
          onChange={setSeverity}
        />
      )}

      <div>
        {choice.sections.locations && (
          <SymptomSection
            title={t('symptoms.sections.where', 'Where')}
            defaultOpen
            summary={
              locations.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {locations.length}
                </span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              {mapKind && (
                <SymptomLocationMap
                  kind={mapKind}
                  selected={locations}
                  onToggle={(label) => toggle(locations, setLocations, label)}
                />
              )}
              <div className="min-w-0 flex-1">
                <ChipPicker
                  items={locationItems}
                  selected={locations}
                  showOrphans
                  onToggle={(label) => toggle(locations, setLocations, label)}
                  onAddCustom={(label) =>
                    addOption(locationKind, label, (l) =>
                      setLocations((cur) => [...cur, l])
                    )
                  }
                  onRemoveCustom={(id, label) =>
                    removeOption(id, () =>
                      setLocations((cur) => cur.filter((v) => v !== label))
                    )
                  }
                />
              </div>
            </div>
          </SymptomSection>
        )}

        {choice.sections.phases && (
          <SymptomSection
            title={t('symptoms.sections.phases', 'Phases')}
            summary={t('symptoms.sections.optional', 'optional')}
          >
            {SYMPTOM_PHASES.map((phase) => (
              <div key={phase} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`symptoms.phases.${phase}`, phase)}
                </span>
                <ChipPicker
                  items={BUILT_IN_PHASE_OPTIONS[phase].map((label) => ({
                    label,
                    isCustom: false,
                  }))}
                  selected={phases[phase] ?? []}
                  onToggle={(label) =>
                    setPhases((cur) => {
                      const list = cur[phase] ?? [];
                      return {
                        ...cur,
                        [phase]: list.includes(label)
                          ? list.filter((v) => v !== label)
                          : [...list, label],
                      };
                    })
                  }
                />
              </div>
            ))}
          </SymptomSection>
        )}

        {choice.sections.qualities && (
          <SymptomSection
            title={t('symptoms.sections.qualities', 'What it feels like')}
            summary={
              qualities.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {qualities.length}
                </span>
              ) : undefined
            }
          >
            <ChipPicker
              items={resolveOptionItems('quality', storedOptions)}
              selected={qualities}
              showOrphans
              onToggle={(label) => toggle(qualities, setQualities, label)}
              onAddCustom={(label) =>
                addOption('quality', label, (l) =>
                  setQualities((cur) => [...cur, l])
                )
              }
              onRemoveCustom={(id, label) =>
                removeOption(id, () =>
                  setQualities((cur) => cur.filter((v) => v !== label))
                )
              }
            />
          </SymptomSection>
        )}

        {choice.sections.associated && (
          <SymptomSection
            title={t('symptoms.sections.associated', 'Other symptoms')}
            summary={
              associated.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {associated.length}
                </span>
              ) : undefined
            }
          >
            <ChipPicker
              items={resolveOptionItems('associated', storedOptions)}
              selected={associated}
              showOrphans
              onToggle={(label) => toggle(associated, setAssociated, label)}
              onAddCustom={(label) =>
                addOption('associated', label, (l) =>
                  setAssociated((cur) => [...cur, l])
                )
              }
              onRemoveCustom={(id, label) =>
                removeOption(id, () =>
                  setAssociated((cur) => cur.filter((v) => v !== label))
                )
              }
            />
          </SymptomSection>
        )}

        {choice.sections.triggers && (
          <SymptomSection
            title={t('symptoms.sections.triggers', 'Possible triggers')}
            summary={
              triggers.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {triggers.length}
                </span>
              ) : undefined
            }
          >
            {resolveTriggerGroups(storedOptions).map((group) => (
              <div key={group.group} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(
                    `symptoms.triggerGroups.${group.group.toLowerCase().replace(/[^a-z]+/g, '_')}`,
                    group.group
                  )}
                </span>
                <ChipPicker
                  items={group.items}
                  selected={triggers}
                  showOrphans={false}
                  onToggle={(label) => toggle(triggers, setTriggers, label)}
                  onRemoveCustom={(id, label) =>
                    removeOption(id, () =>
                      setTriggers((cur) => cur.filter((v) => v !== label))
                    )
                  }
                />
              </div>
            ))}
            <ChipPicker
              items={[{ label: NOT_SURE, isCustom: false }]}
              selected={triggers}
              showOrphans={false}
              onToggle={(label) => toggle(triggers, setTriggers, label)}
              onAddCustom={(label) =>
                addOption('trigger', label, (l) =>
                  setTriggers((cur) => [...cur, l])
                )
              }
            />
          </SymptomSection>
        )}

        {choice.sections.treatments && (
          <SymptomSection
            title={t('symptoms.sections.treatments', 'Treatments')}
            summary={
              treatments.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {treatments.length}
                </span>
              ) : (
                t('symptoms.sections.noneYet', 'none yet')
              )
            }
          >
            <TreatmentsEditor
              value={treatments}
              onChange={setTreatments}
              meds={meds}
            />
          </SymptomSection>
        )}

        {choice.sections.impact && (
          <SymptomSection
            title={t('symptoms.sections.impact', 'Effect on your day')}
            summary={
              impact ? t(`symptoms.impact.${impact}`, impact) : undefined
            }
          >
            <div
              className="inline-flex rounded-lg bg-muted p-0.5"
              role="group"
              aria-label={t('symptoms.sections.impact', 'Effect on your day')}
            >
              {SYMPTOM_IMPACT_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={impact === level}
                  onClick={() => setImpact(impact === level ? null : level)}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    impact === level
                      ? 'bg-background font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`symptoms.impact.${level}`, level)}
                </button>
              ))}
            </div>
          </SymptomSection>
        )}

        {choice.sections.bristol && (
          <SymptomSection
            title={t('symptoms.sections.bristol', 'Bowel log (Bristol scale)')}
            summary={bristol ? `T${bristol}` : undefined}
          >
            <div className="grid grid-cols-7 gap-1">
              {BRISTOL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={bristol === type}
                  onClick={() => setBristol(bristol === type ? null : type)}
                  className={cn(
                    'h-9 rounded border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    bristol === type
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  T{type}
                </button>
              ))}
            </div>
          </SymptomSection>
        )}

        {choice.sections.medication && meds.length > 0 && (
          <SymptomSection
            title={t('symptoms.sections.medication', 'Possible side effect of')}
            summary={
              medId
                ? (meds.find((m) => m.id === medId)?.display_name ?? undefined)
                : t('symptoms.sections.optional', 'optional')
            }
          >
            <Select
              value={medId ?? 'none'}
              onValueChange={(v) => setMedId(v === 'none' ? null : v)}
            >
              <SelectTrigger
                aria-label={t(
                  'symptoms.sections.medication',
                  'Possible side effect of'
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t('symptoms.form.noMedication', 'No medication linked')}
                </SelectItem>
                {meds.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name || m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SymptomSection>
        )}

        {choice.sections.custom_fields && choice.customFieldDefs.length > 0 && (
          <SymptomSection
            title={t('symptoms.sections.details', 'More details')}
            defaultOpen
          >
            {choice.customFieldDefs.map((def) => {
              const value = customValues[def.key];
              const set = (v: unknown) =>
                setCustomValues((cur) => ({ ...cur, [def.key]: v }));
              return (
                <div key={def.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`cf-${def.key}`}>
                    {def.label}
                    {def.unit ? ` (${def.unit})` : ''}
                  </Label>
                  {def.type === 'number' && (
                    <Input
                      id={`cf-${def.key}`}
                      type="number"
                      inputMode="decimal"
                      className="w-32"
                      value={typeof value === 'number' ? value : ''}
                      onChange={(e) =>
                        set(
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                    />
                  )}
                  {def.type === 'text' && (
                    <Input
                      id={`cf-${def.key}`}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                  {def.type === 'boolean' && (
                    <Switch
                      id={`cf-${def.key}`}
                      checked={value === true}
                      onCheckedChange={set}
                    />
                  )}
                  {def.type === 'select' && (
                    <Select
                      value={typeof value === 'string' ? value : ''}
                      onValueChange={set}
                    >
                      <SelectTrigger id={`cf-${def.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(def.options ?? []).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {def.type === 'multiselect' && (
                    <ChipPicker
                      items={(def.options ?? []).map((o) => ({
                        label: o,
                        isCustom: false,
                      }))}
                      selected={Array.isArray(value) ? (value as string[]) : []}
                      onToggle={(label) => {
                        const cur = Array.isArray(value)
                          ? (value as string[])
                          : [];
                        set(
                          cur.includes(label)
                            ? cur.filter((v) => v !== label)
                            : [...cur, label]
                        );
                      }}
                    />
                  )}
                </div>
              );
            })}
          </SymptomSection>
        )}

        {choice.sections.notes && (
          <SymptomSection
            title={t('symptoms.sections.notes', 'Notes')}
            summary={
              notes ? undefined : t('symptoms.sections.optional', 'optional')
            }
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label={t('symptoms.sections.notes', 'Notes')}
              placeholder={t(
                'symptoms.form.notesPlaceholder',
                'Anything else worth remembering'
              )}
              className="h-20 resize-none text-sm"
            />
          </SymptomSection>
        )}

        {choice.sections.photos && (
          <SymptomSection
            title={t('symptoms.sections.photos', 'Photos')}
            summary={
              files.length + (editing?.photo_ids.length ?? 0) > 0
                ? String(files.length + (editing?.photo_ids.length ?? 0))
                : t('symptoms.sections.optional', 'optional')
            }
          >
            <div className="flex flex-wrap gap-2">
              {(editing?.photo_ids ?? []).map((id) => (
                <div key={id} className="relative">
                  <img
                    src={symptomPhotoUrl(id)}
                    alt={t('symptoms.photos.saved', 'Saved photo')}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t('symptoms.photos.remove', 'Remove photo')}
                    className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                    onClick={() => deletePhoto.mutate(id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  {file.name}
                  <button
                    type="button"
                    aria-label={t('symptoms.photos.remove', 'Remove photo')}
                    onClick={() =>
                      setFiles((cur) => cur.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              aria-label={t('symptoms.photos.add', 'Add photos')}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setFiles((cur) => [...cur, ...picked].slice(0, 10));
                e.target.value = '';
              }}
            />
          </SymptomSection>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            {t('symptoms.form.cancel', 'Cancel')}
          </Button>
        )}
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving
            ? t('symptoms.form.saving', 'Saving…')
            : isEdit
              ? t('symptoms.form.update', 'Update')
              : mode === 'episode'
                ? t('symptoms.form.saveEpisode', 'Save episode')
                : t('symptoms.form.save', 'Save')}
        </Button>
      </div>
    </div>
  );

  if (variant === 'plain') return form;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('symptoms.form.title', 'Log a symptom')}
        </CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
