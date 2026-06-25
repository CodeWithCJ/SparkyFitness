import { useState } from 'react';
import { Pill, Syringe, Plus, Trash2 } from 'lucide-react';
import { GLP1_DRUG_PROFILES } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  useMedications,
  useCreateMedicationMutation,
  useDeleteMedicationMutation,
} from '@/hooks/useMedications';
import type { Medication } from '@/types/medications';
import Glp1Coach from './Glp1Coach';

const MED_TYPES = [
  'pill',
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'patch',
  'inhaler',
  'drops',
  'cream',
  'other',
];

function AddMedicationDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('injection');
  const [isGlp1, setIsGlp1] = useState(true);
  const [glp1Drug, setGlp1Drug] = useState('semaglutide');
  const [strength, setStrength] = useState('');
  const [strengthUnit, setStrengthUnit] = useState('mg');

  const mutation = useCreateMedicationMutation();

  const handleSave = () => {
    const body: Partial<Medication> & { name: string } = {
      name: name.trim(),
      type_id: typeId,
      is_glp1: isGlp1,
      strength_value: strength ? Number(strength) : null,
      strength_unit: strengthUnit || null,
      dose_amount: strength ? Number(strength) : null,
      dose_unit: strengthUnit || null,
      custom_fields: isGlp1 ? { glp1_drug: glp1Drug } : {},
    };
    mutation.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setName('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add medication
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add medication</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="med-name">Name</Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wegovy"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MED_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Strength</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  placeholder="1.0"
                />
                <Input
                  className="w-20"
                  value={strengthUnit}
                  onChange={(e) => setStrengthUnit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm font-medium">GLP-1 medication</Label>
              <p className="text-xs text-muted-foreground">
                Unlocks the injection coach, PK curve & site rotation.
              </p>
            </div>
            <Switch checked={isGlp1} onCheckedChange={setIsGlp1} />
          </div>
          {isGlp1 && (
            <div className="space-y-2">
              <Label>GLP-1 drug (for the PK model)</Label>
              <Select value={glp1Drug} onValueChange={setGlp1Drug}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(GLP1_DRUG_PROFILES).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName} ({p.brands.join(', ')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Medications() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: meds = [], isLoading } = useMedications({ activeOnly: false });
  const removeMutation = useDeleteMedicationMutation();

  const handleDelete = (id: string) =>
    removeMutation.mutate(id, { onSuccess: () => setSelectedId(null) });

  const selected = meds.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Medications</h1>
        </div>
        <AddMedicationDialog />
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && meds.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No medications yet. Add your first one to get started.
              </CardContent>
            </Card>
          )}
          {meds.map((med) => (
            <Card
              key={med.id}
              onClick={() => setSelectedId(med.id)}
              className={`cursor-pointer transition ${
                selectedId === med.id
                  ? 'border-primary ring-1 ring-primary'
                  : ''
              }`}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {med.is_glp1 ? (
                    <Syringe className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Pill className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">
                      {med.display_name || med.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {med.strength_value
                        ? `${med.strength_value} ${med.strength_unit ?? ''}`
                        : med.type_id}
                    </p>
                  </div>
                </div>
                {med.is_glp1 && <Badge variant="secondary">GLP-1</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          {!selected && (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Select a medication to view details.
              </CardContent>
            </Card>
          )}
          {selected && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>
                    {selected.display_name || selected.name}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(selected.id)}
                    aria-label="Delete medication"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {selected.strength_value
                    ? `${selected.strength_value} ${selected.strength_unit ?? ''}`
                    : selected.type_id}
                  {selected.reason_text ? ` · ${selected.reason_text}` : ''}
                </CardContent>
              </Card>

              {selected.is_glp1 ? (
                <Glp1Coach med={selected} />
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Scheduling, adherence and reminders for non-GLP-1 meds are
                    coming in a later phase.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
