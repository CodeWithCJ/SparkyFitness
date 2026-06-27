import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Plus, X, Info, MapPin } from 'lucide-react';
import { BUILT_IN_SYMPTOMS } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCustomSymptoms,
  useCustomLocations,
  useCreateCustomLocationMutation,
  useDeleteCustomLocationMutation,
  useCreateCustomSymptomMutation,
  useDeleteCustomSymptomMutation,
  useCreateSymptomEntryMutation,
} from '@/hooks/useSymptoms';
import type { MedicationDetail } from '@/types/medications';
import {
  symptomIcon,
  symptomChip,
  LOCATION_ICONS,
  LOCATION_COLORS,
} from './medicationUtils';

interface SymptomLogFormProps {
  selectedDate: string;
  today: string;
  meds: MedicationDetail[];
}

const BRISTOL_TYPES = [
  {
    type: 1,
    label: 'Type 1',
    desc: 'Separate hard lumps, like nuts (constipation)',
    color: 'border-red-300 bg-red-50/20',
  },
  {
    type: 2,
    label: 'Type 2',
    desc: 'Sausage-shaped but lumpy (mild constipation)',
    color: 'border-orange-300 bg-orange-50/20',
  },
  {
    type: 3,
    label: 'Type 3',
    desc: 'Like a sausage but with cracks on surface (normal)',
    color: 'border-green-300 bg-green-50/10',
  },
  {
    type: 4,
    label: 'Type 4',
    desc: 'Like a sausage or snake, smooth and soft (optimal)',
    color: 'border-emerald-300 bg-emerald-50/20',
  },
  {
    type: 5,
    label: 'Type 5',
    desc: 'Soft blobs with clear-cut edges (lacks fiber)',
    color: 'border-blue-200 bg-blue-50/10',
  },
  {
    type: 6,
    label: 'Type 6',
    desc: 'Fluffy pieces with ragged edges, mushy (mild diarrhea)',
    color: 'border-yellow-300 bg-yellow-50/20',
  },
  {
    type: 7,
    label: 'Type 7',
    desc: 'Watery, no solid pieces, entirely liquid (diarrhea)',
    color: 'border-red-400 bg-red-100/10',
  },
];

const SYMPTOM_LOCATIONS = [
  'general',
  'head',
  'abdomen',
  'chest',
  'back',
  'muscles',
  'joints',
];

const SYMPTOM_LOCATION_MAP: Record<string, string[]> = {
  nausea: ['abdomen', 'general'],
  vomiting: ['abdomen', 'chest'],
  constipation: ['abdomen'],
  diarrhea: ['abdomen'],
  acid_reflux: ['chest', 'abdomen'],
  stomach_pain: ['abdomen'],
  headache: ['head'],
  dizziness: ['head'],
  fatigue: ['general'],
};

const locationLabel = (loc: string) =>
  loc.charAt(0).toUpperCase() + loc.slice(1);

export default function SymptomLogForm({
  selectedDate,
  today,
  meds,
}: SymptomLogFormProps) {
  const { t } = useTranslation();

  // Queries
  const { data: customSymptoms = [] } = useCustomSymptoms();
  const { data: customLocations = [] } = useCustomLocations();

  // Mutations
  const createLocationMutation = useCreateCustomLocationMutation();
  const deleteLocationMutation = useDeleteCustomLocationMutation();
  const createCustomSymptomMutation = useCreateCustomSymptomMutation();
  const deleteCustomSymptomMutation = useDeleteCustomSymptomMutation();
  const createSymptomEntryMutation = useCreateSymptomEntryMutation();

  // Local Form & UI States
  const [symptomName, setSymptomName] = useState('nausea');
  const [customSymptomInput, setCustomSymptomInput] = useState('');
  const [customSymptomDisplayName, setCustomSymptomDisplayName] = useState('');
  const [symptomCustomOpen, setSymptomCustomOpen] = useState(false);
  const [severity, setSeverity] = useState([5]);
  const [bodyLocation, setBodyLocation] = useState('general');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [bristolType, setBristolType] = useState<number | null>(null);
  const [linkedMedId, setLinkedMedId] = useState<string | null>(null);
  const [contextText, setContextText] = useState('');

  const allSymptomOptions = useMemo(() => {
    const list = BUILT_IN_SYMPTOMS.map((s) => ({
      id: s.name,
      name: s.name,
      displayName: s.displayName,
      isGlp1: s.isGlp1,
      isCustom: false,
    }));
    customSymptoms.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name,
        displayName: s.display_name || s.name,
        isGlp1: s.is_glp1_flagged,
        isCustom: true,
      });
    });
    return list;
  }, [customSymptoms]);

  const addCustomLocation = () => {
    const v = newLocation.trim();
    if (!v) return;
    createLocationMutation.mutate(v, {
      onSuccess: () => {
        setBodyLocation(v);
        setNewLocation('');
        setShowAddLocation(false);
      },
    });
  };

  const removeCustomLocation = (loc: { id: string; name: string }) => {
    deleteLocationMutation.mutate(loc.id, {
      onSuccess: () => {
        if (bodyLocation === loc.name) setBodyLocation('general');
      },
    });
  };

  const handleCreateCustomSymptom = () => {
    if (!customSymptomInput.trim()) return;
    createCustomSymptomMutation.mutate(
      {
        name: customSymptomInput.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name:
          customSymptomDisplayName.trim() || customSymptomInput.trim(),
        scale_type: '1-10',
        is_glp1_flagged: false,
      },
      {
        onSuccess: () => {
          setSymptomCustomOpen(false);
          setSymptomName(
            customSymptomInput.trim().toLowerCase().replace(/\s+/g, '_')
          );
          setCustomSymptomInput('');
          setCustomSymptomDisplayName('');
        },
      }
    );
  };

  const handleLogSymptom = () => {
    const selectedOpt = allSymptomOptions.find((s) => s.name === symptomName);
    const snapName = selectedOpt ? selectedOpt.displayName : symptomName;

    let severityLabel = 'Moderate';
    const val = severity[0] ?? 5;
    if (val <= 3) severityLabel = 'Mild';
    else if (val >= 7) severityLabel = 'Severe';

    createSymptomEntryMutation.mutate(
      {
        medication_id: linkedMedId || null,
        symptom_id:
          selectedOpt && selectedOpt.id !== selectedOpt.name
            ? selectedOpt.id
            : null,
        symptom_name_snapshot: snapName,
        severity: val,
        severity_label: severityLabel,
        body_location: bodyLocation,
        context_text: contextText || null,
        bristol_type: ['constipation', 'diarrhea'].includes(symptomName)
          ? bristolType
          : null,
        entry_date: selectedDate,
        logged_at:
          selectedDate === today
            ? new Date().toISOString()
            : `${selectedDate}T12:00:00.000Z`,
      },
      {
        onSuccess: () => {
          setContextText('');
          setBristolType(null);
          setLinkedMedId(null);
          setBodyLocation('general');
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-red-500" />{' '}
          {t('medications.symptoms.logTitle', 'Log Symptom')}
        </CardTitle>
        <CardDescription>
          {t(
            'medications.symptoms.subtitle',
            'Log severity and physical context of your side effects'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Select Symptom */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>{t('medications.symptoms.symptom', 'Symptom')}</Label>
            <Dialog
              open={symptomCustomOpen}
              onOpenChange={setSymptomCustomOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" />{' '}
                  {t('medications.common.custom', 'Custom')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t('medications.symptoms.addCustom', 'Add Custom Symptom')}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom-sym-name">
                      {t(
                        'medications.symptoms.customName',
                        'Symptom Name (internal)'
                      )}
                    </Label>
                    <Input
                      id="custom-sym-name"
                      value={customSymptomInput}
                      onChange={(e) => setCustomSymptomInput(e.target.value)}
                      placeholder={t(
                        'medications.symptoms.customNamePlaceholder',
                        'e.g. skin_rash'
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-sym-disp">
                      {t('medications.symptoms.displayLabel', 'Display Label')}
                    </Label>
                    <Input
                      id="custom-sym-disp"
                      value={customSymptomDisplayName}
                      onChange={(e) =>
                        setCustomSymptomDisplayName(e.target.value)
                      }
                      placeholder={t(
                        'medications.symptoms.displayLabelPlaceholder',
                        'e.g. Skin Rash'
                      )}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateCustomSymptom}
                    disabled={createCustomSymptomMutation.isPending}
                  >
                    {t(
                      'medications.symptoms.saveCustom',
                      'Save Custom Symptom'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {allSymptomOptions.map((opt) => {
              const active = symptomName === opt.name;
              return (
                <div key={opt.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSymptomName(opt.name);
                      setBodyLocation(
                        SYMPTOM_LOCATION_MAP[opt.name]?.[0] ?? 'general'
                      );
                    }}
                    className={`flex w-full flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                      active
                        ? 'border-red-500 bg-red-50 dark:bg-red-950'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {(() => {
                      const Icon = symptomIcon(opt.name);
                      return (
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${symptomChip(
                            opt.name
                          )}`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                      );
                    })()}
                    <span className="text-[11px] font-medium leading-tight text-center">
                      {opt.isCustom
                        ? opt.displayName
                        : t(
                            'medications.symptomNames.' + opt.name,
                            opt.displayName
                          )}
                    </span>
                  </button>
                  {opt.isGlp1 && !opt.isCustom && (
                    <span
                      className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500"
                      title="Common on GLP-1"
                    />
                  )}
                  {opt.isCustom && (
                    <button
                      type="button"
                      onClick={() => deleteCustomSymptomMutation.mutate(opt.id)}
                      disabled={deleteCustomSymptomMutation.isPending}
                      aria-label={`Remove ${opt.displayName}`}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-60 transition hover:text-destructive hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Severity Slider */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>{t('medications.symptoms.severity', 'Severity')}</Label>
            <span className="text-sm font-semibold tabular-nums text-red-500">
              {severity[0]} / 10
            </span>
          </div>
          <Slider
            value={severity}
            onValueChange={setSeverity}
            min={1}
            max={10}
            step={1}
            className="py-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
            <span>{t('medications.symptoms.mild', 'Mild (1-3)')}</span>
            <span>{t('medications.symptoms.moderate', 'Moderate (4-6)')}</span>
            <span>{t('medications.symptoms.severe', 'Severe (7-10)')}</span>
          </div>
        </div>

        {/* Body Location Pin */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              {t('medications.symptoms.primaryLocation', 'Primary Location')}
            </Label>
            <button
              type="button"
              onClick={() => setShowAddLocation((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <Plus className="h-3 w-3" />{' '}
              {t('medications.common.custom', 'Custom')}
            </button>
          </div>
          {showAddLocation && (
            <div className="flex gap-2">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomLocation();
                  }
                }}
                placeholder={t(
                  'medications.symptoms.customLocationPlaceholder',
                  'e.g. Left shoulder, Jaw…'
                )}
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={addCustomLocation}
                disabled={!newLocation.trim()}
              >
                Add
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {SYMPTOM_LOCATIONS.map((loc) => {
              const applicable = SYMPTOM_LOCATION_MAP[symptomName];
              const isApplicable = !applicable || applicable.includes(loc);
              const selected = bodyLocation === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setBodyLocation(loc)}
                  title={
                    isApplicable
                      ? undefined
                      : 'Not typical for this symptom — select anyway if it applies to you'
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    selected
                      ? 'bg-red-500/10 text-red-600 border-red-500/30 font-medium'
                      : isApplicable
                        ? 'border-border bg-background text-foreground hover:bg-muted hover:border-muted-foreground/30'
                        : 'border-border/50 bg-background text-muted-foreground opacity-60 hover:bg-muted hover:opacity-80'
                  }`}
                >
                  <span className="mr-1 inline-flex items-center">
                    {(() => {
                      const Icon = LOCATION_ICONS[loc];
                      return Icon ? (
                        <Icon
                          className={`h-3 w-3 ${
                            selected ? '' : (LOCATION_COLORS[loc] ?? '')
                          }`}
                        />
                      ) : null;
                    })()}
                  </span>
                  {t('medications.locations.' + loc, locationLabel(loc))}
                </button>
              );
            })}
            {customLocations.map((loc) => {
              const selected = bodyLocation === loc.name;
              return (
                <span
                  key={loc.id}
                  className={`group inline-flex items-center rounded-full border py-1 pl-2.5 pr-1 text-xs transition ${
                    selected
                      ? 'bg-red-500/10 text-red-600 border-red-500/30 font-medium'
                      : 'border-border bg-background text-foreground hover:bg-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setBodyLocation(loc.name)}
                    className="flex items-center gap-1"
                  >
                    <MapPin
                      className={`h-3 w-3 ${selected ? '' : 'text-rose-400'}`}
                    />
                    {loc.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomLocation(loc)}
                    aria-label={`Remove ${loc.name}`}
                    className="ml-1 rounded-full p-0.5 opacity-50 transition hover:text-destructive hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {/* Bristol Stool Scale */}
        {['constipation', 'diarrhea'].includes(symptomName) && (
          <div className="space-y-2 border rounded-md p-3 bg-muted/20">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />{' '}
              {t(
                'medications.symptoms.bristol',
                'Bowel Log (Bristol Stool Scale)'
              )}
            </Label>
            <p className="text-[10px] text-muted-foreground mb-2">
              Select the stool type that best describes the event:
            </p>
            <div className="grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((type) => {
                const typeDef = BRISTOL_TYPES.find((b) => b.type === type);
                const isSelected = bristolType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBristolType(type)}
                    title={typeDef?.desc}
                    className={`h-9 border rounded flex flex-col items-center justify-center text-xs font-bold transition ${
                      isSelected
                        ? 'bg-red-500/20 text-red-700 border-red-500'
                        : 'bg-background hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    T{type}
                  </button>
                );
              })}
            </div>
            {bristolType && (
              <p className="text-[10px] mt-1.5 text-red-600 font-medium bg-red-50/50 p-1 border border-red-100 rounded text-center">
                {BRISTOL_TYPES.find((b) => b.type === bristolType)?.desc}
              </p>
            )}
          </div>
        )}

        {/* Optional Linked Medication */}
        <div className="space-y-2">
          <Label htmlFor="linked-med">
            {t('medications.symptoms.linkMed', 'Link to Medication (Optional)')}
          </Label>
          <Select
            value={linkedMedId || 'none'}
            onValueChange={(val) => setLinkedMedId(val === 'none' ? null : val)}
          >
            <SelectTrigger id="linked-med">
              <SelectValue
                placeholder={t(
                  'medications.symptoms.noMedLinked',
                  'No medication linked'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t('medications.symptoms.noMedLinked', 'No medication linked')}
              </SelectItem>
              {meds.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name || m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Context Text */}
        <div className="space-y-2">
          <Label htmlFor="symptom-notes">
            {t('medications.symptoms.context', 'Context / Notes')}
          </Label>
          <Textarea
            id="symptom-notes"
            placeholder={t(
              'medications.symptoms.contextPlaceholder',
              'e.g. Occurred 4 hours after taking my dinner dose.'
            )}
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            className="resize-none h-16 text-xs"
          />
        </div>

        <Button
          onClick={handleLogSymptom}
          disabled={createSymptomEntryMutation.isPending}
          className="w-full bg-red-600 hover:bg-red-700 text-white"
        >
          {createSymptomEntryMutation.isPending
            ? t('medications.common.logging', 'Logging…')
            : t('medications.symptoms.logTitle', 'Log Symptom')}
        </Button>
      </CardContent>
    </Card>
  );
}
