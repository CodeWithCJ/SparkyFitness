// The external provider that backs the weather of GPS-recorded activities: an
// Open-Meteo compatible service. It is a provider like Mealie or Valhalla: an
// `external_data_providers` row of this type (base URL plus an optional API
// key) that is active and visible to the person. Without one, no weather is
// looked up and nothing is sent anywhere.
export const WEATHER_PROVIDER_TYPE = 'open_meteo';

// Shown as a placeholder only. It is never saved or used as a default: the
// person adds the provider on purpose. Open-Meteo's free tier is for
// non-commercial use; its commercial service uses `customer-api.open-meteo.com`
// and an API key.
export const OPEN_METEO_PUBLIC_URL = 'https://api.open-meteo.com';
