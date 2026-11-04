import { apiCall } from '@/api/api';
import type {
  CreateSymptomDefinitionBody,
  CreateSymptomEntryBody,
  CreateSymptomOptionBody,
  EndSymptomEpisodeBody,
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomEpisodeContext,
  SymptomFreeDayResponse,
  SymptomImpact,
  SymptomOptionKind,
  SymptomOptionResponse,
  SymptomPhotoResponse,
  UpdateSymptomDefinitionBody,
  UpdateSymptomEntryBody,
} from '@workspace/shared';

export interface SymptomEntryFilters {
  fromDate?: string;
  toDate?: string;
  symptomName?: string;
  symptomId?: string;
  medicationId?: string;
  source?: string;
  episodesOnly?: boolean;
  /**
   * Also return episodes that overlap the range without being logged in it,
   * such as one that started the month before. Older servers ignore it.
   */
  overlapping?: boolean;
}

// --- Definitions -------------------------------------------------------------

export const listSymptomDefinitions = (): Promise<
  SymptomDefinitionResponse[]
> => apiCall('/v2/symptoms/custom', { method: 'GET' });

export const createSymptomDefinition = (
  body: CreateSymptomDefinitionBody
): Promise<SymptomDefinitionResponse> =>
  apiCall('/v2/symptoms/custom', { method: 'POST', body });

export const updateSymptomDefinition = (
  id: string,
  body: UpdateSymptomDefinitionBody
): Promise<SymptomDefinitionResponse> =>
  apiCall(`/v2/symptoms/custom/${id}`, { method: 'PUT', body });

export const deleteSymptomDefinition = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/custom/${id}`, { method: 'DELETE' });

// --- Options (pick-list library) ---------------------------------------------

export const listSymptomOptions = (
  kind?: SymptomOptionKind
): Promise<SymptomOptionResponse[]> =>
  apiCall('/v2/symptoms/options', { method: 'GET', params: { kind } });

export const createSymptomOption = (
  body: CreateSymptomOptionBody
): Promise<SymptomOptionResponse> =>
  apiCall('/v2/symptoms/options', { method: 'POST', body });

export const deleteSymptomOption = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/options/${id}`, { method: 'DELETE' });

// --- Entries -----------------------------------------------------------------

export const listSymptomEntries = (
  filters?: SymptomEntryFilters
): Promise<SymptomEntryResponse[]> =>
  apiCall('/v2/symptoms/entries', { method: 'GET', params: filters });

export const listOngoingEpisodes = (): Promise<SymptomEntryResponse[]> =>
  apiCall('/v2/symptoms/entries/ongoing', { method: 'GET' });

export const createSymptomEntry = (
  body: CreateSymptomEntryBody
): Promise<SymptomEntryResponse> =>
  apiCall('/v2/symptoms/entries', { method: 'POST', body });

export const updateSymptomEntry = (
  id: string,
  body: UpdateSymptomEntryBody
): Promise<SymptomEntryResponse> =>
  apiCall(`/v2/symptoms/entries/${id}`, { method: 'PUT', body });

export const endSymptomEpisode = (
  id: string,
  body: EndSymptomEpisodeBody
): Promise<SymptomEntryResponse> =>
  apiCall(`/v2/symptoms/entries/${id}/end`, { method: 'POST', body });

export const addSymptomSeverity = (
  id: string,
  severity: number,
  impact?: SymptomImpact
): Promise<SymptomEntryResponse> =>
  apiCall(`/v2/symptoms/entries/${id}/severity`, {
    method: 'POST',
    // Impact goes along only when chosen, so the reading alone stays as before.
    body: impact ? { severity, impact } : { severity },
  });

export const deleteSymptomEntry = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/entries/${id}`, { method: 'DELETE' });

// --- Symptom-free days -------------------------------------------------------

export const listSymptomFreeDays = (range?: {
  fromDate?: string;
  toDate?: string;
}): Promise<SymptomFreeDayResponse[]> =>
  apiCall('/v2/symptoms/symptom-free', { method: 'GET', params: range });

export const markSymptomFree = (
  entryDate: string
): Promise<SymptomFreeDayResponse> =>
  apiCall('/v2/symptoms/symptom-free', {
    method: 'POST',
    body: { entry_date: entryDate },
  });

export const unmarkSymptomFree = (entryDate: string): Promise<void> =>
  apiCall(`/v2/symptoms/symptom-free/${entryDate}`, { method: 'DELETE' });

// --- Photos ------------------------------------------------------------------

export const uploadSymptomPhoto = (
  entryId: string,
  file: File
): Promise<SymptomPhotoResponse> => {
  const formData = new FormData();
  formData.append('photo', file);
  // isFormData keeps apiCall from forcing a JSON content type, so the browser
  // sets the multipart boundary itself.
  return apiCall(`/v2/symptoms/entries/${entryId}/photos`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
};

export const deleteSymptomPhoto = (photoId: string): Promise<void> =>
  apiCall(`/v2/symptoms/photos/${photoId}`, { method: 'DELETE' });

// --- Episode context ---------------------------------------------------------

export const getSymptomContext = (
  ids: string[]
): Promise<SymptomEpisodeContext[]> =>
  apiCall('/v2/symptoms/entries/context', {
    method: 'GET',
    params: { ids: ids.join(',') },
  });
