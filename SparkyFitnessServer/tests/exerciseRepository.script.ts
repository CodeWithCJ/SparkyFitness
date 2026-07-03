import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { loadSecrets } from '../utils/secretLoader.js';
import exerciseRepository from '../models/exerciseRepository.js';
import exerciseDb from '../models/exercise.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testRepository() {
  let output = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = (msg: any) => {
    console.log(msg);
    output += msg + '\n';
  };
  log('Starting test script...');
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  log('Dotenv loaded.');
  loadSecrets();
  log('Secrets loaded.');
  log('Repository imported.');
  log('DB imported.');
  log('Checking exerciseRepository functions...');
  const repoFunctions = Object.keys(exerciseRepository);
  const dbFunctions = Object.keys(exerciseDb);
  const snapshotFuncs = [
    'updateExerciseEntriesSnapshot',
    'clearUserIgnoredUpdate',
    'getExercisesNeedingReview',
  ];
  log('\nSnapshot Functions Check:');
  snapshotFuncs.forEach((func) => {
    const inDb = dbFunctions.includes(func);
    const inRepo = repoFunctions.includes(func);
    log(`- ${func}: In DB? ${inDb}, In Repo? ${inRepo}`);
    if (!inRepo) {
      log(`ERROR: ${func} is MISSING from exerciseRepository!`);
      fs.writeFileSync('test_repo_snapshot.log', output);
      throw new Error(`Missing function: ${func}`);
    }
  });
  log('\nBase Functions Check (from exerciseDb):');
  const baseFuncs = ['getExerciseById', 'searchExercises', 'createExercise'];
  baseFuncs.forEach((func) => {
    const inDb = dbFunctions.includes(func);
    const inRepo = repoFunctions.includes(func);
    log(`- ${func}: In DB? ${inDb}, In Repo? ${inRepo}`);
    if (inDb && !inRepo) {
      log(`ERROR: ${func} is in DB but MISSING from Repository!`);
      fs.writeFileSync('test_repo_snapshot.log', output);
      throw new Error(`Missing repository function: ${func}`);
    }
  });
  log('\nVerification SUCCESS: exerciseRepository has the required functions.');
  fs.writeFileSync('test_repo_snapshot.log', output);
}
testRepository().catch((err) => {
  const errMsg = 'Test failed: ' + err.stack;
  console.error(errMsg);
  fs.appendFileSync('test_repo_snapshot.log', errMsg);
  process.exitCode = 1;
});
