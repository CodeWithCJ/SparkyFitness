// UI-facing types for the pregnancy pages, kept out of the API layer so page
// components can import them without tripping the no-direct-API-import rule.

export interface ChecklistItem {
  id: string | null;
  template_key: string | null;
  title: string;
  week: number;
  completed: boolean;
  dismissed: boolean;
}
