import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import {
  BUILT_IN_OPTIONS,
  BUILT_IN_SYMPTOM_DEFINITIONS,
  SYMPTOM_OPTION_KINDS,
  type CreateSymptomDefinitionBody,
  type SymptomOptionKind,
  buildSymptomChoices,
  type SymptomChoice,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCreateCustomSymptomMutation,
  useCreateSymptomOptionMutation,
  useCustomSymptoms,
  useDeleteCustomSymptomMutation,
  useDeleteSymptomOptionMutation,
  useSymptomOptions,
  useUpdateCustomSymptomMutation,
} from '@/hooks/useSymptoms';
import SymptomDefinitionEditor from './SymptomDefinitionEditor';

const BUILT_IN_NAMES = new Set(BUILT_IN_SYMPTOM_DEFINITIONS.map((d) => d.name));

/** A full definition body for a symptom, for saving a built-in the first time. */
const choiceBody = (
  c: SymptomChoice,
  extra: Partial<CreateSymptomDefinitionBody>
): CreateSymptomDefinitionBody => ({
  name: c.name,
  display_name: c.displayName,
  template: c.template,
  category: c.category,
  scale_type: c.scaleType,
  is_episodic: c.isEpisodic,
  is_glp1_flagged: c.isGlp1,
  custom_field_defs: c.customFieldDefs,
  ...extra,
});

function OptionsManager({ kind }: { kind: SymptomOptionKind }) {
  const { t } = useTranslation();
  const { data: stored = [] } = useSymptomOptions(kind);
  const create = useCreateSymptomOptionMutation();
  const remove = useDeleteSymptomOptionMutation();
  const [draft, setDraft] = useState('');

  const hidden = new Set(stored.filter((o) => o.is_hidden).map((o) => o.name));
  const builtIn = new Set<string>(BUILT_IN_OPTIONS[kind]);
  const custom = stored.filter((o) => !o.is_hidden && !builtIn.has(o.name));

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    create.mutate({ kind, name }, { onSuccess: () => setDraft('') });
  };

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        {t(`symptoms.optionKinds.${kind}`, kind.replace(/_/g, ' '))}
      </h4>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {BUILT_IN_OPTIONS[kind].map((label) => (
          <li
            key={label}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span
              className={
                hidden.has(label) ? 'text-muted-foreground line-through' : ''
              }
            >
              {label}
            </span>
            <Switch
              aria-label={t('symptoms.manage.show', 'Show {{name}}', {
                name: label,
              })}
              checked={!hidden.has(label)}
              onCheckedChange={(visible) =>
                create.mutate({ kind, name: label, is_hidden: !visible })
              }
            />
          </li>
        ))}
        {custom.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span>{o.name}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t('symptoms.chips.remove', 'Remove {{name}}', {
                name: o.name,
              })}
              onClick={() => remove.mutate(o.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={80}
          className="h-8 max-w-xs text-sm"
          placeholder={t('symptoms.manage.addOption', 'Add your own')}
          aria-label={t('symptoms.manage.addOption', 'Add your own')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="sm" onClick={add} disabled={!draft.trim()}>
          {t('symptoms.chips.add', 'Add')}
        </Button>
      </div>
    </section>
  );
}

interface ManageSymptomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Editing = { choice?: SymptomChoice } | null;

/** Your symptoms and pick-lists: pin, hide, edit, add, and manage the chip lists. */
export default function ManageSymptomsDialog({
  open,
  onOpenChange,
}: ManageSymptomsDialogProps) {
  const { t } = useTranslation();
  const { data: definitions = [] } = useCustomSymptoms();
  const createDefinition = useCreateCustomSymptomMutation();
  const updateDefinition = useUpdateCustomSymptomMutation();
  const deleteDefinition = useDeleteCustomSymptomMutation();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const choices = buildSymptomChoices(definitions).sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) ||
      a.displayName.localeCompare(b.displayName)
  );
  const hiddenDefinitions = definitions.filter((d) => d.is_archived);

  /** Applies a change to a symptom, saving a built-in as a definition if needed. */
  const change = (
    c: SymptomChoice,
    extra: Partial<CreateSymptomDefinitionBody>
  ) =>
    c.definitionId
      ? updateDefinition.mutate({ id: c.definitionId, body: extra })
      : createDefinition.mutate(choiceBody(c, extra));

  const save = (body: CreateSymptomDefinitionBody) => {
    const existing = editing?.choice;
    const done = { onSuccess: () => setEditing(null) };
    if (existing?.definitionId) {
      updateDefinition.mutate({ id: existing.definitionId, body }, done);
    } else {
      createDefinition.mutate(body, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('symptoms.manage.title', 'Manage symptoms')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'symptoms.manage.description',
              'Choose what you track, what you are asked, and the choices you see.'
            )}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <SymptomDefinitionEditor
            choice={editing.choice}
            saving={createDefinition.isPending || updateDefinition.isPending}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Tabs defaultValue="symptoms">
            <TabsList>
              <TabsTrigger value="symptoms">
                {t('symptoms.manage.tabSymptoms', 'Symptoms')}
              </TabsTrigger>
              <TabsTrigger value="lists">
                {t('symptoms.manage.tabLists', 'Choices')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="symptoms" className="flex flex-col gap-3">
              <Button
                type="button"
                size="sm"
                className="self-start"
                onClick={() => setEditing({})}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('symptoms.manage.new', 'New symptom')}
              </Button>
              <ul className="flex flex-col divide-y rounded-lg border">
                {choices.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between gap-2 p-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{c.displayName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t(`symptoms.templates.${c.template}`, c.template)}
                        {c.isEpisodic && (
                          <span>{` · ${t('symptoms.manage.episodeTag', 'episodes')}`}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={
                          c.isPinned
                            ? t('symptoms.manage.unpin', 'Unpin {{name}}', {
                                name: c.displayName,
                              })
                            : t('symptoms.manage.pin', 'Pin {{name}}', {
                                name: c.displayName,
                              })
                        }
                        onClick={() => change(c, { is_pinned: !c.isPinned })}
                      >
                        {c.isPinned ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={t('symptoms.manage.edit', 'Edit {{name}}', {
                          name: c.displayName,
                        })}
                        onClick={() => setEditing({ choice: c })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={t('symptoms.manage.hide', 'Hide {{name}}', {
                          name: c.displayName,
                        })}
                        onClick={() => change(c, { is_archived: true })}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                      {c.definitionId &&
                        !BUILT_IN_NAMES.has(c.name) &&
                        (confirmDelete === c.definitionId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              deleteDefinition.mutate(c.definitionId as string);
                              setConfirmDelete(null);
                            }}
                          >
                            {t('symptoms.detail.delete', 'Delete')}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            aria-label={t(
                              'symptoms.manage.delete',
                              'Delete {{name}}',
                              { name: c.displayName }
                            )}
                            onClick={() => setConfirmDelete(c.definitionId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
              {hiddenDefinitions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">
                    {t('symptoms.manage.hidden', 'Hidden')}
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {hiddenDefinitions.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between p-2.5 text-sm text-muted-foreground"
                      >
                        <span>{d.display_name || d.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateDefinition.mutate({
                              id: d.id,
                              body: { is_archived: false },
                            })
                          }
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          {t('symptoms.manage.restore', 'Show again')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  'symptoms.manage.keepHistory',
                  'Hiding or deleting a symptom never removes your past logs.'
                )}
              </p>
            </TabsContent>

            <TabsContent value="lists" className="flex flex-col gap-6">
              {SYMPTOM_OPTION_KINDS.map((kind) => (
                <OptionsManager key={kind} kind={kind} />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
