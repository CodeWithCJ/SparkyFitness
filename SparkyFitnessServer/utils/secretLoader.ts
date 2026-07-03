import fs from 'fs';
/**
 * Iterates through environment variables ending in _FILE,
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
      const filePath = process.env[key];
      // If the target variable is already set, skip (allow override via explicit env var)
      if (process.env[targetVar]) {
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
        console.error(
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          `[Secrets] ERROR: Error reading file for ${key} (${filePath}): ${err.message}`
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
