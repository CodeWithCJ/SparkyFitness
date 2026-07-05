import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APPOINTMENT_TYPES } from '@workspace/shared';
import {
  useAppointments,
  useCreateAppointmentMutation,
  useDeleteAppointmentMutation,
} from '@/hooks/usePregnancy';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';

interface Appointment {
  id: string;
  scheduled_at: string;
  appointment_type: string;
  title: string | null;
  location: string | null;
}

export default function AppointmentsPanel() {
  const { t } = useTranslation();
  const { data } = useAppointments(false);
  const create = useCreateAppointmentMutation();
  const del = useDeleteAppointmentMutation();
  const [adding, setAdding] = useState(false);
  const [when, setWhen] = useState('');
  const [type, setType] = useState('checkup');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');

  const appointments = (data ?? []) as Appointment[];

  const submit = () => {
    if (!when) return;
    create.mutate(
      {
        scheduled_at: new Date(when).toISOString(),
        appointment_type: type,
        title: title || null,
        location: location || null,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setWhen('');
          setTitle('');
          setLocation('');
        },
      }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="h-4 w-4" />
          {t('cycle.care.appointments', 'Appointments')}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('cycle.care.add', 'Add')}
        </Button>
      </div>

      {adding ? (
        <Card>
          <CardContent className="space-y-2 py-3">
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value}>
                    {at.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t('cycle.care.apptTitle', 'Title (optional)')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder={t('cycle.care.apptLocation', 'Location (optional)')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!when || create.isPending}
              onClick={submit}
            >
              {t('cycle.care.save', 'Save appointment')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {appointments.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {t('cycle.care.noAppointments', 'No appointments yet.')}
        </p>
      ) : (
        appointments.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {a.title ||
                    APPOINTMENT_TYPES.find(
                      (x) => x.value === a.appointment_type
                    )?.displayName ||
                    t('cycle.care.appointment', 'Appointment')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.scheduled_at).toLocaleString()}
                  {a.location ? ` · ${a.location}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t('cycle.care.delete', 'Delete')}
                onClick={() => del.mutate(a.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
