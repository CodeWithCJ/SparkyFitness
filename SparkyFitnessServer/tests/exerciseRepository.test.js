const fs = require("fs");
const path = require("path");

async function testRepository() {
  let output = "";
  const log = (msg) => {
    console.log(msg);
    output += msg + "\n";
  };

  log("Starting test script...");
  require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
  log("Dotenv loaded.");
  const { loadSecrets } = require("../utils/secretLoader");
  loadSecrets();
  log("Secrets loaded.");

  const exerciseRepository = require("../models/exerciseRepository");
  log("Repository imported.");
  const exerciseDb = require("../models/exercise");
  log("DB imported.");

  log("Checking exerciseRepository functions...");

  const repoFunctions = Object.keys(exerciseRepository);
  const dbFunctions = Object.keys(exerciseDb);

  const snapshotFuncs = [
    "updateExerciseEntriesSnapshot",
    "clearUserIgnoredUpdate",
    "getExercisesNeedingReview",
  ];

  log("\nSnapshot Functions Check:");
  snapshotFuncs.forEach((func) => {
    const inDb = dbFunctions.includes(func);
    const inRepo = repoFunctions.includes(func);
    log(`- ${func}: In DB? ${inDb}, In Repo? ${inRepo}`);

    if (!inRepo) {
      log(`ERROR: ${func} is MISSING from exerciseRepository!`);
      fs.writeFileSync("test_repo_snapshot.log", output);
      process.exit(1);
    }
  });

  log("\nBase Functions Check (from exerciseDb):");
  const baseFuncs = ["getExerciseById", "searchExercises", "createExercise"];
  baseFuncs.forEach((func) => {
    const inDb = dbFunctions.includes(func);
    const inRepo = repoFunctions.includes(func);
    log(`- ${func}: In DB? ${inDb}, In Repo? ${inRepo}`);

    if (inDb && !inRepo) {
      log(`ERROR: ${func} is in DB but MISSING from Repository!`);
      fs.writeFileSync("test_repo_snapshot.log", output);
      process.exit(1);
    }
  });

  log("\nVerification SUCCESS: exerciseRepository has the required functions.");
  fs.writeFileSync("test_repo_snapshot.log", output);
}

testRepository().catch((err) => {
  const errMsg = "Test failed: " + err.stack;
  console.error(errMsg);
  fs.appendFileSync("test_repo_snapshot.log", errMsg);
  process.exit(1);
});
