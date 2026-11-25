import fs from 'fs';

// Only the server's own variables are read from files. Other tools set *_FILE
// variables too (NIX_SSL_CERT_FILE, COMPOSE_FILE, ...); loading those would
// copy unrelated files into the environment, and one larger than the kernel's
// 128 KB limit per variable makes every child process fail with E2BIG.
const SERVER_VARIABLE_PREFIXES = ['SPARKY_FITNESS_', 'BETTER_AUTH_'];
const SERVER_VARIABLES = new Set([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'GARMIN_MICROSERVICE_URL',
]);

function isServerVariable(name: string): boolean {
  return (
    SERVER_VARIABLES.has(name) ||
    SERVER_VARIABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Iterates through the server's environment variables ending in _FILE,
 * reads the content of the file, and sets the corresponding
 * environment variable (without _FILE) if it's not already set.
 *
 * This is primarily used for Docker Swarm / Kubernetes secrets where
 * secrets are mounted as files.
 */
function loadSecrets() {
  // We use console.log here to avoid dependency on the logging module
  // which might rely on env vars we haven't loaded yet.
  console.log('[Secrets] Checking for secret files to load...');
  const envVars = Object.keys(process.env);
  let loadedCount = 0;
  envVars.forEach((key) => {
    if (key.endsWith('_FILE')) {
      const targetVar = key.slice(0, -5); // Remove '_FILE' suffix
      if (!isServerVariable(targetVar)) {
        return;
      }
      const filePath = process.env[key];
      // If the target variable is already set with a non-empty value, skip (allow override via explicit env var)
      if (process.env[targetVar] && process.env[targetVar].trim() !== '') {
        // console.debug(`[Secrets] Ignoring ${key} because ${targetVar} is already set.`);
        return;
      }
      if (!filePath) {
        return;
      }
      try {
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8').trim();
          process.env[targetVar] = fileContent;
          console.log(
            `[Secrets] Loaded secret for ${targetVar} from file defined in ${key}`
          );
          loadedCount++;
        } else {
          console.warn(
            `[Secrets] WARNING: File specified in ${key} (${filePath}) not found.`
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Secrets] ERROR: Error reading file for ${key} (${filePath}): ${errorMsg}`
        );
      }
    }
  });
  if (loadedCount > 0) {
    console.log(
      `[Secrets] Successfully loaded ${loadedCount} secrets from files.`
    );
  } else {
    console.log('[Secrets] No secrets loaded from files.');
  }
}
export { loadSecrets };
export default {
  loadSecrets,
};
