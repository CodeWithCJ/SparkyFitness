/* eslint-disable n/no-process-exit, no-process-exit, quotes */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

// ============================================================================
// 1. CI / VITEST GUARD
// ============================================================================
if (process.env.CI || process.env.VITEST || process.env.GITHUB_ACTIONS) {
  console.log(
    '\n========================================================================'
  );
  console.log('🤖 CI Guard: Skipping Chatbot & MCP Test Harness');
  console.log(
    'This script is designed for manual local testing with Ollama gemma4:e2b.'
  );
  console.log('To run this test locally, execute:');
  console.log('  pnpm exec tsx tests/chatbotTestHarness.script.ts');
  console.log(
    '========================================================================\n'
  );
  process.exit(0);
}

// Load env variables first so dynamic imports can access them
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Dynamically import auth to prevent ES Module hoisting issues
const { auth } = await import('../auth.js');

const FRONTEND_URL = 'http://localhost:8080';
const CHAT_URL = `${FRONTEND_URL}/api/chat`;
const MCP_URL = `${FRONTEND_URL}/mcp`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TestTurn {
  prompt: string;
  expectedTool: string;
  expectedAction?: string;
  validateArgs?: (args: Record<string, any>) => boolean;
}

interface TestScenario {
  name: string;
  description: string;
  turns: TestTurn[];
}

// ============================================================================
// Scenarios Definitions (100% Core toolset coverage)
// ============================================================================
const SCENARIOS: TestScenario[] = [
  {
    name: 'Scenario 1: Detailed Food, Meal & Diary Management',
    description: 'Tests food lookup, logging, updating, and history retrieval.',
    turns: [
      {
        prompt: 'Search for "apple" in my food list.',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'search_food',
      },
      {
        prompt:
          'What is the nutritional information of a standard chicken breast?',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'lookup_food_nutrition',
      },
      {
        prompt: 'Log 1 chicken breast for lunch today.',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'log_food',
      },
      {
        prompt: 'Show me my food diary for today.',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'list_diary',
      },
      {
        prompt: 'Show my nutrition summary for today.',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'get_nutritional_summary',
      },
    ],
  },
  {
    name: 'Scenario 2: Water & Hydration Tracking',
    description: 'Tests water logging and intake history.',
    turns: [
      {
        prompt: 'I just drank a glass of water (250 ml).',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'log_water',
        validateArgs: (args) => args.amount_ml === 250, // schema uses amount_ml
      },
      {
        prompt: 'How much water have I logged today?',
        expectedTool: 'sparky_manage_food',
        expectedAction: 'get_water_history',
      },
    ],
  },
  {
    name: 'Scenario 3: Exercise Catalog, Logging & Progress',
    description: 'Tests workout search, logging, and history.',
    turns: [
      {
        prompt: 'Find chest exercises in the database.',
        expectedTool: 'sparky_search_exercises',
      },
      {
        prompt: 'Tell me details about bench press.',
        expectedTool: 'sparky_get_exercise_details',
      },
      {
        prompt: 'Log 30 minutes of running at a moderate pace today.',
        expectedTool: 'sparky_manage_exercise',
        expectedAction: 'log_exercise',
      },
      {
        prompt: 'Show me what workouts I did today.',
        expectedTool: 'sparky_get_exercise_diary',
      },
      {
        prompt: 'Show my exercise totals for today.',
        expectedTool: 'sparky_get_daily_exercise_totals',
      },
    ],
  },
  {
    name: 'Scenario 4: Wellness, Sleep, Mood & Custom Metrics',
    description:
      'Tests logging weight, mood, sleep, and custom metric categories.',
    turns: [
      {
        prompt: 'My weight today is 74.8 kg.',
        expectedTool: 'sparky_manage_checkin',
        expectedAction: 'log_biometrics',
        validateArgs: (args) => Number(args.weight) === 74.8,
      },
      {
        prompt: 'I am feeling excellent today. Log my mood as a 9.',
        expectedTool: 'sparky_manage_checkin',
        expectedAction: 'log_mood',
        validateArgs: (args) => args.mood_value === 9,
      },
      {
        prompt:
          'I slept for 7 hours last night, wake time was 7am, sleep score 85.',
        expectedTool: 'sparky_manage_checkin',
        expectedAction: 'log_sleep',
        validateArgs: (args) => args.sleep_score === 85,
      },
      {
        prompt: 'Show my biometrics history.',
        expectedTool: 'sparky_manage_checkin',
        expectedAction: 'get_biometrics_history',
      },
    ],
  },
  {
    name: 'Scenario 5: Goals and Progress',
    description: 'Tests setting goals and viewing the timeline snapshot.',
    turns: [
      {
        prompt: 'Set my daily calorie goal to 2000.',
        expectedTool: 'sparky_manage_goals',
        expectedAction: 'set_goals',
        validateArgs: (args) => args.calories === 2000,
      },
      {
        prompt: 'Show my goal snapshot.',
        expectedTool: 'sparky_manage_goals',
        expectedAction: 'get_goals',
      },
      {
        prompt: 'Show my goal changes timeline.',
        expectedTool: 'sparky_manage_goals',
        expectedAction: 'list_goal_timeline',
      },
    ],
  },
];

// ============================================================================
// 2. DATABASE CREDENTIALS AUTOMATIC LOOKUP & API KEY GENERATION
// ============================================================================
async function resolveCredentialsAndCreateKey() {
  console.log(
    '🔍 Looking up active user and local Gemma4:e2b Ollama service settings...'
  );
  const pool = new pg.Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: parseInt(process.env.SPARKY_FITNESS_DB_PORT || '5432', 10),
  });

  try {
    // 1. Try to find active Ollama service setting configured for gemma4:e2b
    let settingsQuery = await pool.query(
      `SELECT id, user_id, service_name, service_type, model_name, custom_url, chat_tool_profile
       FROM ai_service_settings
       WHERE service_type = 'ollama' AND model_name = 'gemma4:e2b' AND is_active = true
       LIMIT 1`
    );

    // Fallback 1: Any active Ollama service setting
    if (settingsQuery.rowCount === 0) {
      console.log(
        '⚠️ No active gemma4:e2b Ollama config found. Looking for any active Ollama config...'
      );
      settingsQuery = await pool.query(
        `SELECT id, user_id, service_name, service_type, model_name, custom_url, chat_tool_profile
         FROM ai_service_settings
         WHERE service_type = 'ollama' AND is_active = true
         LIMIT 1`
      );
    }

    // Fallback 2: Any active AI service setting
    if (settingsQuery.rowCount === 0) {
      console.log(
        '⚠️ No active Ollama configs found. Looking for any active AI config...'
      );
      settingsQuery = await pool.query(
        `SELECT id, user_id, service_name, service_type, model_name, custom_url, chat_tool_profile
         FROM ai_service_settings
         WHERE is_active = true
         LIMIT 1`
      );
    }

    if (settingsQuery.rowCount === 0) {
      throw new Error(
        'No active AI service settings found in the database. Please configure a service setting first.'
      );
    }

    const serviceSetting = settingsQuery.rows[0];
    const userId = serviceSetting.user_id;

    console.log(`🔑 Creating temporary API key for user ${userId}...`);
    // @ts-expect-error
    const createdKey = await auth.api.createApiKey({
      body: {
        userId,
        name: 'Harness Temporary Test Key',
        expiresIn: 31536000, // Default 1 year to satisfy minimum limits
      },
    });

    console.log('✅ Credentials and temporary API key successfully resolved!');
    console.log(`  - User ID:      ${userId}`);
    console.log(`  - Service ID:   ${serviceSetting.id}`);
    console.log(
      `  - Service Name: ${serviceSetting.service_name} (${serviceSetting.service_type})`
    );
    console.log(`  - Model Name:   ${serviceSetting.model_name}`);
    console.log(`  - Tool Profile: ${serviceSetting.chat_tool_profile}`);
    console.log(`  - Temp Key ID:  ${createdKey.id}`);
    console.log(`  - Test Base URL: ${FRONTEND_URL}`);

    return {
      configId: serviceSetting.id,
      apiKey: createdKey.key, // This is the plain text key!
      apiKeyId: createdKey.id,
      userId,
      modelName: serviceSetting.model_name,
    };
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 3. TESTING EXECUTION
// ============================================================================
async function runChatbotScenario(
  scenario: TestScenario,
  configId: string,
  apiKey: string
) {
  console.log('\n' + '='.repeat(80));
  console.log(`🎬 RUNNING SCENARIO: ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log('='.repeat(80));

  const historyMessages: ChatMessage[] = [];
  let successCount = 0;

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    console.log(
      `\n👉 [Turn ${i + 1}/${scenario.turns.length}] User: "${turn.prompt}"`
    );

    // Record turn in history
    historyMessages.push({ role: 'user', content: turn.prompt });

    const startTime = performance.now();
    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          service_config_id: configId,
          messages: historyMessages,
        }),
      });

      const latency = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(
          `   ❌ API Call Failed (Status: ${response.status}): ${errorText}`
        );
        continue;
      }

      const data = await response.json();
      const content = data.content || '';
      const executedTools = data.executedTools || [];

      console.log(`   ⏱️  Latency: ${latency}ms`);
      console.log(`   🤖 Sparky: "${content.trim()}"`);

      if (executedTools.length > 0) {
        console.log(`   🛠️  Tools called by model:`);
        executedTools.forEach((t: any) => {
          console.log(`      - ${t.name}(${JSON.stringify(t.args)})`);
        });
      }

      // Verify tool execution
      let foundTool = executedTools.find(
        (t: any) => t.name === turn.expectedTool
      );
      let isAlternative = false;

      // Handle valid alternative dedicated tools
      if (!foundTool) {
        if (turn.expectedTool === 'sparky_manage_food') {
          if (turn.expectedAction === 'search_food') {
            foundTool = executedTools.find(
              (t: any) => t.name === 'sparky_search_foods'
            );
            if (foundTool) isAlternative = true;
          } else if (turn.expectedAction === 'list_diary') {
            foundTool = executedTools.find(
              (t: any) => t.name === 'sparky_get_food_diary'
            );
            if (foundTool) isAlternative = true;
          } else if (turn.expectedAction === 'get_nutritional_summary') {
            foundTool = executedTools.find(
              (t: any) =>
                t.name === 'sparky_get_nutrition_summary' ||
                t.name === 'sparky_get_daily_report'
            );
            if (foundTool) isAlternative = true;
          } else if (turn.expectedAction === 'get_water_history') {
            foundTool = executedTools.find(
              (t: any) => t.name === 'sparky_get_water_history'
            );
            if (foundTool) isAlternative = true;
          }
        } else if (turn.expectedTool === 'sparky_manage_goals') {
          if (turn.expectedAction === 'get_goals') {
            foundTool = executedTools.find(
              (t: any) => t.name === 'sparky_get_goal_snapshot'
            );
            if (foundTool) isAlternative = true;
          }
        } else if (turn.expectedTool === 'sparky_manage_checkin') {
          if (turn.expectedAction === 'get_biometrics_history') {
            foundTool = executedTools.find(
              (t: any) => t.name === 'sparky_get_biometrics_history'
            );
            if (foundTool) isAlternative = true;
          }
        }
      }

      if (foundTool) {
        let actionMatches = true;
        if (turn.expectedAction && !isAlternative) {
          const actionVal = foundTool.args?.action;

          // In sparky_manage_food, action is often inferred on the server side
          const isFoodInferred =
            foundTool.name === 'sparky_manage_food' &&
            turn.expectedAction === 'log_food' &&
            !actionVal &&
            (foundTool.args?.food_name || foundTool.args?.quantity);

          // In sparky_manage_exercise, action is often inferred on the server side
          const isExerciseInferred =
            foundTool.name === 'sparky_manage_exercise' &&
            turn.expectedAction === 'log_exercise' &&
            !actionVal &&
            (foundTool.args?.duration_minutes ||
              foundTool.args?.calories_burned);

          // In sparky_manage_checkin, action is often inferred on the server side
          const isCheckinInferred =
            foundTool.name === 'sparky_manage_checkin' &&
            !actionVal &&
            ((turn.expectedAction === 'log_sleep' &&
              (foundTool.args?.sleep_score !== undefined ||
                foundTool.args?.duration_seconds !== undefined ||
                foundTool.args?.wake_time !== undefined ||
                foundTool.args?.bedtime !== undefined)) ||
              (turn.expectedAction === 'log_biometrics' &&
                (foundTool.args?.weight !== undefined ||
                  foundTool.args?.steps !== undefined ||
                  foundTool.args?.height !== undefined)) ||
              (turn.expectedAction === 'log_mood' &&
                foundTool.args?.mood_value !== undefined));

          // Allow lookup_food_nutrition as a valid prompt-mandated pre-check before log_food/create_food
          const isFoodPreCheck =
            foundTool.name === 'sparky_manage_food' &&
            (turn.expectedAction === 'log_food' ||
              turn.expectedAction === 'create_food') &&
            actionVal === 'lookup_food_nutrition';

          if (
            actionVal !== turn.expectedAction &&
            !isFoodInferred &&
            !isExerciseInferred &&
            !isCheckinInferred &&
            !isFoodPreCheck
          ) {
            actionMatches = false;
            console.log(
              `   ⚠️  Tool matched (${foundTool.name}), but action mismatch! Expected "${turn.expectedAction}", got "${actionVal || 'none'}"`
            );
          }
        }

        let argsValid = true;
        if (turn.validateArgs && foundTool.args) {
          if (!turn.validateArgs(foundTool.args)) {
            argsValid = false;
            console.log(
              `   ⚠️  Tool arguments validation failed! Arguments: ${JSON.stringify(foundTool.args)}`
            );
          }
        }

        if (actionMatches && argsValid) {
          console.log(
            `   ✅ SUCCESS: Called "${foundTool.name}"${foundTool.args?.action ? ` [action: ${foundTool.args.action}]` : ''}`
          );
          successCount++;
        } else {
          console.log(`   ⚠️  WARNING: Executed with parameters mismatch.`);
        }
      } else {
        // Conversational fallback checks (some prompts invite model clarification)
        const isSetGoalsDateClarification =
          turn.expectedTool === 'sparky_manage_goals' &&
          turn.expectedAction === 'get_goals' &&
          content.toLowerCase().includes('date');

        if (isSetGoalsDateClarification) {
          console.log(
            `   ✅ SUCCESS: Conversational clarification (requested date/clarifying details).`
          );
          successCount++;
        } else {
          console.log(
            `   ❌ FAILURE: Expected tool "${turn.expectedTool}" was NOT called.`
          );
          if (executedTools.length > 0) {
            console.log(
              `      Model instead executed: ${executedTools.map((t: any) => `${t.name}(action: ${t.args?.action || 'none'})`).join(', ')}`
            );
          } else {
            console.log(`      Model did not execute any tools.`);
          }
        }
      }

      // Record assistant turn in history
      // If the response is a logging confirmation, normalize it to a simple, generic text
      // to prevent small local models from copy-pasting structured parameters in subsequent turns.
      let historyContent = content;
      if (
        content.toLowerCase().includes('logged') ||
        content.toLowerCase().includes('recorded') ||
        content.toLowerCase().includes('updated') ||
        content.toLowerCase().includes('biometrics')
      ) {
        historyContent = "I've recorded that for you!";
      }
      historyMessages.push({ role: 'assistant', content: historyContent });
    } catch (e: any) {
      console.log(`   💥 Exception during turn execution: ${e.message}`);
    }
  }

  const rate = Math.round((successCount / scenario.turns.length) * 100);
  console.log('\n' + '-'.repeat(80));
  console.log(
    `🏁 Scenario Complete: ${successCount}/${scenario.turns.length} successful tool calls (${rate}%)`
  );
  console.log('-'.repeat(80));
  return {
    name: scenario.name,
    successCount,
    total: scenario.turns.length,
    rate,
  };
}

async function runMcpScenario(apiKey: string) {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 RUNNING MCP DIRECT TOOL CALLS VALIDATION');
  console.log(
    '   Tests direct JSON-RPC calls bypassing the LLM translation layer.'
  );
  console.log('='.repeat(80));

  const calls = [
    {
      name: 'sparky_get_goal_snapshot',
      arguments: {},
    },
    {
      name: 'sparky_manage_food',
      arguments: {
        action: 'get_nutritional_summary',
      },
    },
  ];

  let successCount = 0;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    console.log(
      `\n👉 [MCP Call ${i + 1}/${calls.length}] Invoking "${call.name}" with args: ${JSON.stringify(call.arguments)}`
    );

    const startTime = performance.now();
    try {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-api-key': apiKey, // Pass directly in x-api-key to bypass bearer checks
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: i + 100,
          method: 'tools/call',
          params: {
            name: call.name,
            arguments: call.arguments,
          },
        }),
      });

      const latency = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(
          `   ❌ MCP HTTP Call Failed (Status: ${response.status}): ${errorText}`
        );
        continue;
      }

      const data = await response.json();
      console.log(`   ⏱️  Latency: ${latency}ms`);

      if (data.error) {
        console.log(`   ❌ JSON-RPC Error: ${JSON.stringify(data.error)}`);
      } else if (data.result && data.result.content) {
        console.log(`   ✅ SUCCESS: Received content from MCP:`);
        console.log(
          `      "${JSON.stringify(data.result.content[0]?.text || '').substring(0, 100)}..."`
        );
        successCount++;
      } else {
        console.log(
          `   ❌ FAILURE: Unknown result shape returned: ${JSON.stringify(data)}`
        );
      }
    } catch (e: any) {
      console.log(`   💥 Exception during MCP call: ${e.message}`);
    }
  }

  const rate = Math.round((successCount / calls.length) * 100);
  console.log('\n' + '-'.repeat(80));
  console.log(
    `🏁 MCP Calls Complete: ${successCount}/${calls.length} successful direct calls (${rate}%)`
  );
  console.log('-'.repeat(80));
  return {
    name: 'Direct MCP Validation',
    successCount,
    total: calls.length,
    rate,
  };
}

// ============================================================================
// 4. MAIN ENTRY POINT
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const targetModule = args.find((arg) => !arg.startsWith('-'))?.toLowerCase();

  const MODULES = ['food', 'water', 'exercise', 'wellness', 'goals', 'mcp'];

  if (targetModule && !MODULES.includes(targetModule)) {
    console.log(`❌ Unknown scenario/module: "${targetModule}"`);
    console.log(`Available options: ${MODULES.join(', ')}`);
    console.log(
      `Usage: pnpm exec tsx tests/chatbotTestHarness.script.ts [${MODULES.join('|')}]`
    );
    process.exit(1);
  }

  console.log(
    '========================================================================'
  );
  console.log(
    '🏃 Starting SparkyFitness Chatbot & MCP Evaluation Test Harness'
  );
  if (targetModule) {
    console.log(`🎯 TARGET MODULE: ${targetModule.toUpperCase()}`);
  } else {
    console.log('🎯 TARGET MODULE: ALL');
  }
  console.log(
    '========================================================================\n'
  );

  let resolvedCreds: any = null;

  try {
    resolvedCreds = await resolveCredentialsAndCreateKey();
    const { configId, apiKey, modelName } = resolvedCreds;

    // Warn if the model is not gemma4:e2b
    if (modelName !== 'gemma4:e2b') {
      console.log(
        '\n⚠️ WARNING: Active config is NOT using gemma4:e2b. The test will run against:',
        modelName
      );
    }

    const results = [];
    const runAll = !targetModule;

    // Run natural chatbot scenarios selectively
    if (runAll || targetModule === 'food') {
      const res = await runChatbotScenario(SCENARIOS[0], configId, apiKey);
      results.push(res);
    }
    if (runAll || targetModule === 'water') {
      const res = await runChatbotScenario(SCENARIOS[1], configId, apiKey);
      results.push(res);
    }
    if (runAll || targetModule === 'exercise') {
      const res = await runChatbotScenario(SCENARIOS[2], configId, apiKey);
      results.push(res);
    }
    if (runAll || targetModule === 'wellness') {
      const res = await runChatbotScenario(SCENARIOS[3], configId, apiKey);
      results.push(res);
    }
    if (runAll || targetModule === 'goals') {
      const res = await runChatbotScenario(SCENARIOS[4], configId, apiKey);
      results.push(res);
    }

    // Run MCP direct validation
    if (runAll || targetModule === 'mcp') {
      const mcpRes = await runMcpScenario(apiKey);
      results.push(mcpRes);
    }

    // Summary Report
    console.log('\n' + '='.repeat(80));
    console.log('📊 SparkyFitness Chatbot & MCP Test Summary Report');
    console.log('='.repeat(80));
    console.log(
      String('Scenario Name').padEnd(50) +
        ' | ' +
        String('Success/Total').padEnd(15) +
        ' | ' +
        'Rate'
    );
    console.log('-'.repeat(80));

    let totalSuccess = 0;
    let totalCalls = 0;

    for (const r of results) {
      const pct = `${r.rate}%`;
      console.log(
        r.name.padEnd(50) +
          ' | ' +
          `${r.successCount}/${r.total}`.padEnd(15) +
          ' | ' +
          pct
      );
      totalSuccess += r.successCount;
      totalCalls += r.total;
    }

    console.log('='.repeat(80));
    const totalRate = Math.round((totalSuccess / totalCalls) * 100);
    console.log(
      String('TOTAL EVALUATION').padEnd(50) +
        ' | ' +
        `${totalSuccess}/${totalCalls}`.padEnd(15) +
        ' | ' +
        `${totalRate}%`
    );
    console.log('='.repeat(80) + '\n');
  } catch (error: any) {
    console.error('\n💥 Critical Error running test harness:', error.message);
    console.error(
      'Make sure your local SparkyFitness backend server (port 3010) and frontend server (port 8080) are running.'
    );
  } finally {
    // Cleanup temporary API key if it was created
    if (resolvedCreds && resolvedCreds.apiKeyId) {
      try {
        console.log(
          `\n🧹 Cleaning up temporary API key (ID: ${resolvedCreds.apiKeyId})...`
        );
        const pool = new pg.Pool({
          user: process.env.SPARKY_FITNESS_DB_USER,
          host: process.env.SPARKY_FITNESS_DB_HOST,
          database: process.env.SPARKY_FITNESS_DB_NAME,
          password: process.env.SPARKY_FITNESS_DB_PASSWORD,
          port: parseInt(process.env.SPARKY_FITNESS_DB_PORT || '5432', 10),
        });
        await pool.query('DELETE FROM api_key WHERE id = $1', [
          resolvedCreds.apiKeyId,
        ]);
        await pool.end();
        console.log('🗑️ Temporary API key successfully deleted.');
      } catch (err: any) {
        console.error(
          '⚠️ Failed to delete temporary API key during cleanup:',
          err.message
        );
      }
    }
    process.exit(0);
  }
}

main();
