import {
  BUILT_IN_OPTIONS,
  BUILT_IN_SYMPTOM_DEFINITIONS,
  BUILT_IN_TRIGGER_GROUPS,
} from './builtIns.ts';
import { resolveSections } from './templates.ts';
import type {
  SymptomCustomFieldDef,
  SymptomDefinitionCategory,
  SymptomOptionKind,
  SymptomScaleType,
  SymptomSection,
  SymptomTemplate,
} from './constants.ts';
import type {
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomOptionResponse,
} from '../schemas/api/Symptoms.api.zod.ts';

/** A symptom the user can log: a built-in, or their own definition. */
export interface SymptomChoice {
  /** Stable key: the definition name (lower-case, snake_case). */
  name: string;
  displayName: string;
  template: SymptomTemplate;
  category: SymptomDefinitionCategory;
  scaleType: SymptomScaleType;
  isEpisodic: boolean;
  isGlp1: boolean;
  isPinned: boolean;
  /** Present once the user has a saved definition for this symptom. */
  definitionId: string | null;
  sections: Record<SymptomSection, boolean>;
  customFieldDefs: SymptomCustomFieldDef[];
}

/**
 * Built-ins plus the user's definitions, one entry per name. A saved definition
 * wins over the built-in of the same name, and archived definitions are hidden.
 */
export function buildSymptomChoices(
  definitions: SymptomDefinitionResponse[]
): SymptomChoice[] {
  const byName = new Map<string, SymptomChoice>();

  for (const b of BUILT_IN_SYMPTOM_DEFINITIONS) {
    byName.set(b.name, {
      name: b.name,
      displayName: b.displayName,
      template: b.template,
      category: b.category,
      scaleType: b.scaleType,
      isEpisodic: b.isEpisodic,
      isGlp1: b.isGlp1,
      isPinned: false,
      definitionId: null,
      sections: resolveSections(b.template),
      customFieldDefs: b.customFieldDefs ?? [],
    });
  }

  for (const d of definitions) {
    if (d.is_archived) {
      byName.delete(d.name);
      continue;
    }
    const builtIn = byName.get(d.name);
    byName.set(d.name, {
      name: d.name,
      displayName: d.display_name || builtIn?.displayName || d.name,
      template: d.template,
      category: d.category,
      scaleType: d.scale_type,
      isEpisodic: d.is_episodic,
      isGlp1: d.is_glp1_flagged || (builtIn?.isGlp1 ?? false),
      isPinned: d.is_pinned,
      definitionId: d.id,
      sections: resolveSections(d.template, d.sections),
      customFieldDefs: d.custom_field_defs,
    });
  }

  return [...byName.values()];
}

/** The largest value on a symptom's severity scale (`text` has none). */
export function scaleMax(scale: SymptomScaleType): number {
  switch (scale) {
    case '1-5':
      return 5;
    case 'none-severe':
      return 3;
    case 'count':
      return 100;
    case 'text':
      return 0;
    default:
      return 10;
  }
}

export type SeverityBand = 'low' | 'mid' | 'high';

/** Which band a value falls in, relative to its own scale. */
export function severityBand(
  value: number,
  scale: SymptomScaleType
): SeverityBand {
  const max = scaleMax(scale);
  if (max <= 0) return 'low';
  const ratio = value / max;
  if (ratio <= 0.34) return 'low';
  if (ratio <= 0.67) return 'mid';
  return 'high';
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(from: string | Date, to: string | Date): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : 0;
}

/** "2 h 15 m", "45 m", "1 d 3 h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return mins > 0 ? `${hours} h ${mins} m` : `${hours} h`;
}

/** Chips offered for back-dating an episode's start or end. */
export const TIME_OFFSET_CHIPS: Array<{ id: string; minutes: number }> = [
  { id: 'now', minutes: 0 },
  { id: 'm15', minutes: 15 },
  { id: 'h1', minutes: 60 },
  { id: 'h3', minutes: 180 },
];

export function minutesAgo(minutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - minutes * 60000);
}

export interface OptionItem {
  label: string;
  /** True for the user's own additions. */
  isCustom: boolean;
  /** Id of the stored option row, present for custom options only. */
  optionId?: string;
}

/**
 * The list to show for one kind of pick-list: the built-ins the user has not
 * hidden, then their own additions. Hidden built-ins are rows with `is_hidden`
 * whose name matches a built-in.
 */
export function resolveOptionItems(
  kind: SymptomOptionKind,
  stored: SymptomOptionResponse[]
): OptionItem[] {
  const mine = stored.filter((o) => o.kind === kind);
  const builtIn = new Set(BUILT_IN_OPTIONS[kind]);
  const hidden = new Set(mine.filter((o) => o.is_hidden).map((o) => o.name));

  const items: OptionItem[] = BUILT_IN_OPTIONS[kind]
    .filter((label) => !hidden.has(label))
    .map((label) => ({ label, isCustom: false }));

  for (const o of [...mine].sort((a, b) => a.sort_order - b.sort_order)) {
    if (o.is_hidden || builtIn.has(o.name)) continue;
    items.push({ label: o.name, isCustom: true, optionId: o.id });
  }
  return items;
}

export interface TriggerGroup {
  group: string;
  items: OptionItem[];
}

/** Built-in trigger groups, with the user's own triggers in a group of their own. */
export function resolveTriggerGroups(
  stored: SymptomOptionResponse[]
): TriggerGroup[] {
  const mine = stored.filter((o) => o.kind === 'trigger');
  const hidden = new Set(mine.filter((o) => o.is_hidden).map((o) => o.name));
  const builtInLabels = new Set(BUILT_IN_OPTIONS.trigger);

  const groups: TriggerGroup[] = BUILT_IN_TRIGGER_GROUPS.map((g) => ({
    group: g.group,
    items: g.items
      .filter((label) => !hidden.has(label))
      .map((label) => ({ label, isCustom: false })),
  })).filter((g) => g.items.length > 0);

  const custom = mine
    .filter((o) => !o.is_hidden && !builtInLabels.has(o.name))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({ label: o.name, isCustom: true, optionId: o.id }));
  if (custom.length > 0) groups.push({ group: 'Mine', items: custom });
  return groups;
}

/** Symptom names ordered by how recently they were last logged, newest first. */
export function recentSymptomNames(
  entries: SymptomEntryResponse[],
  limit = 6
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(b.started_at ?? b.logged_at).getTime() -
      new Date(a.started_at ?? a.logged_at).getTime()
  );
  for (const e of sorted) {
    const key = e.symptom_name_snapshot
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

export const slugifySymptomName = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+/g, '_');
