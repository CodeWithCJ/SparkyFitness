// The external provider that backs route generation and "Follow roads": a
// Valhalla routing service. It is a provider like Mealie or Tandoor: an
// `external_data_providers` row of this type (base URL plus an optional API
// key) that is active and visible to the user makes
// `GET /api/v2/routes/generate/capabilities` report `available`.
export const ROUTING_PROVIDER_TYPE = 'valhalla';

// There is deliberately no default server URL. The public Valhalla demo server
// run by FOSSGIS is for light personal testing: its maintainers say it is not
// meant for production use by third parties. Each person (or the admin) adds
// the server they run or have the right to use.
