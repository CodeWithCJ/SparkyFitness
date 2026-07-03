// GET /api/v2/muscle/
export interface WgerMuscle {
  id: number;
  name: string;
  name_en: string;
  is_front: boolean;
  image_url_main: string;
  image_url_secondary: string;
}

// GET /api/v2/equipment/
export interface WgerEquipment {
  id: number;
  name: string;
}

// GET /api/v2/exerciseinfo/ and /api/v2/exerciseinfo/{id}/
export interface WgerExerciseInfo {
  id: number;
  uuid: string;
  created: string;
  last_update: string;
  last_update_global: string;
  category: { id: number; name: string };
  muscles: WgerMuscle[];
  muscles_secondary: WgerMuscle[];
  equipment: WgerEquipment[];
  license_author: string | null;
  images: WgerExerciseImage[];
  translations: WgerExerciseTranslation[];
  videos: WgerExerciseVideo[];
  force: { name: string } | null;
  mechanic: { name: string } | null;
}

export interface WgerExerciseTranslation {
  id: number;
  uuid: string;
  name: string;
  exercise: number;
  description: string;
  language: number; // maps to WGER_LANGUAGE_MAP: de=1, en=2, es=4, fr=10, it=13
}

export interface WgerExerciseImage {
  id: number;
  uuid: string;
  image: string; // URL — this is what you use in your .map(img => img.image)
  is_main: boolean;
  style: string;
}

export interface WgerExerciseVideo {
  id: number;
  uuid: string;
  video: string;
  is_main: boolean;
}

// Paginated wrapper — shape of data returned by callWgerApi('/exerciseinfo', ...)
export interface WgerPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
