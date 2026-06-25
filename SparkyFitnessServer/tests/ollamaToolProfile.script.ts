/**
 * Dev harness: A/B the chatbot's 'full' (34-tool) vs 'core' (18-tool) tool
 * surface against a real Ollama model, to eyeball tool-selection accuracy and
 * latency on a small/local model.
 *
 * Both arms use the same model, backend, prompt, and the production system
 * prompt — only the tool surface differs (what Ollama gets via
 * buildChatbotTools('core') vs every other provider's 'full'). Tool handlers
 * are stripped before the call, so the model's selection is captured without
 * running any handler — nothing touches the database. This measures tool
 * selection + prefill size, not execution.
 *
 * Prereqs: `ollama serve` running and the model pulled (`ollama pull qwen3:4b`).
 *   Give Ollama real context headroom or the tool block is silently truncated
 *   (which looks exactly like "won't call tools"):
 *     OLLAMA_CONTEXT_LENGTH=16384 ollama serve
 *
 * Run from SparkyFitnessServer/:
 *   pnpm exec tsx tests/ollamaToolProfile.script.ts
 *   OLLAMA_MODEL=qwen3:30b-a3b PROMPT="log a 30 minute run" \
 *     pnpm exec tsx tests/ollamaToolProfile.script.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildChatbotTools, type ChatToolProfile } from '../ai/tools/index.js';
import { getSystemPrompt } from '../services/chatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:4b';
const PROMPT = process.env.PROMPT ?? 'log 2 eggs and a banana for breakfast';
const USER_ID = '00000000-0000-0000-0000-000000000000';
const TZ = 'UTC';

// Same OpenAI-compatible wiring the server uses for Ollama (chatService appends
// /v1 and calls provider.chat); Ollama ignores the api key.
const provider = createOpenAI({
  baseURL: `${OLLAMA_URL}/v1`,
  apiKey: 'ollama',
});
const model = provider.chat(MODEL);
const systemPrompt = getSystemPrompt(TZ, 'None');

// Drop execute so the model's tool selection is captured without running a real
// handler (which would hit the database). Returned tool calls are inspected
// directly instead of executed.
function selectionOnly(
  tools: Record<string, unknown>
): Parameters<typeof generateText>[0]['tools'] {
  const out: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const copy = { ...(tool as Record<string, unknown>) };
    delete copy.execute;
    out[name] = copy;
  }
  return out as Parameters<typeof generateText>[0]['tools'];
}

async function runProfile(profile: ChatToolProfile) {
  const builtTools = buildChatbotTools(USER_ID, TZ, profile);
  const toolCount = Object.keys(builtTools).length;
  const tools = selectionOnly(builtTools as Record<string, unknown>);

  const start = performance.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: PROMPT }],
    tools,
    stopWhen: stepCountIs(1),
    maxRetries: 1,
  });
  const ms = Math.round(performance.now() - start);

  return {
    profile,
    toolCount,
    ms,
    inputTokens: result.usage?.inputTokens ?? null,
    calls: result.toolCalls.map(
      (c) => `${c.toolName}(${JSON.stringify(c.input)})`
    ),
    text: result.text.trim(),
  };
}

function report(r: Awaited<ReturnType<typeof runProfile>>) {
  console.log(
    `\n[${r.profile}] ${r.toolCount} tools | ${r.ms} ms | input≈${r.inputTokens ?? '?'} tok`
  );
  if (r.calls.length > 0) {
    console.log(`  tool calls: ${r.calls.join(', ')}`);
  } else {
    console.log('  tool calls: (none — model answered in text)');
    if (r.text) console.log(`  text: ${r.text.slice(0, 200)}`);
  }
}

async function main() {
  console.log('=== Ollama tool-profile A/B ===');
  console.log(`model: ${MODEL}   url: ${OLLAMA_URL}`);
  console.log(`prompt: "${PROMPT}"`);

  // Warm up so the first timed run doesn't absorb model-load latency.
  process.stdout.write('warming up model... ');
  await generateText({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    maxRetries: 1,
  });
  console.log('done');

  report(await runProfile('full'));
  report(await runProfile('core'));
  console.log('');
}

main().catch((err) => {
  console.error('\nA/B run failed:', err instanceof Error ? err.message : err);
  console.error(
    `Is Ollama running and the model pulled? Try: ollama serve && ollama pull ${MODEL}`
  );
  process.exitCode = 1;
});
