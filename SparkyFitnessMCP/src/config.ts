/**
 * Shared configuration for Sparky MCP Tools
 */
export const MOCK_USER_ID = process.env.SPARKY_USER_ID || '627d90cc-16f4-4d45-bbf0-a26e4c424f2e';
export const SPARKY_FITNESS_SERVER_URL = process.env.SPARKY_FITNESS_SERVER_URL || 'http://localhost:3001'; // Default URL for SparkyFitnessServer
export const USDA_PROVIDER_ID = process.env.USDA_PROVIDER_ID || 'uuid-of-your-usda-provider'; // Replace with actual USDA provider ID

if (!process.env.SPARKY_USER_ID) {
  console.warn('[Config] SPARKY_USER_ID not set in environment. Using default mock user ID.');
} else {
  console.log(`[Config] Using User ID from environment: ${MOCK_USER_ID}`);
}
