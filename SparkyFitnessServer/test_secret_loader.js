const fs = require("fs");
const path = require("path");
const { loadSecrets } = require("./utils/secretLoader");

// Mock environment variables
process.env.TEST_SECRET_FILE = path.resolve(__dirname, "test_secret.txt");
process.env.EXISTING_VAR = "original_value";
process.env.EXISTING_VAR_FILE = path.resolve(__dirname, "test_secret.txt");

// Create a dummy secret file
fs.writeFileSync(process.env.TEST_SECRET_FILE, "secret_value_from_file");

console.log("--- Before Loading Secrets ---");
console.log(`TEST_SECRET: ${process.env.TEST_SECRET}`);
console.log(`EXISTING_VAR: ${process.env.EXISTING_VAR}`);

// Run the loader
loadSecrets();

console.log("\n--- After Loading Secrets ---");
console.log(`TEST_SECRET: ${process.env.TEST_SECRET}`);
console.log(`EXISTING_VAR: ${process.env.EXISTING_VAR}`);

// Cleanup
fs.unlinkSync(process.env.TEST_SECRET_FILE);

// Verification
if (
  process.env.TEST_SECRET === "secret_value_from_file" &&
  process.env.EXISTING_VAR === "original_value"
) {
  console.log(
    "\nSUCCESS: Secrets loaded correctly and existing variables preserved.",
  );
} else {
  console.error("\nFAILURE: Secrets not loaded as expected.");
  process.exit(1);
}
