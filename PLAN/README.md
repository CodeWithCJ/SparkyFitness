# Token Usage Optimization & Local Ollama Model Support Plan

This document outlines a deep analysis and detailed implementation plan to optimize token usage in the **SparkyFitness Chatbot AI** and **MCP Tool Server**, making them highly efficient and fully compatible with **local Ollama models** (e.g., Llama 3.2, Qwen 2.5, Mistral).

---

## 1. Executive Summary

Users are currently affected by two major categories of issues:
1. **High Token Consumption (Cost & Latency)**: Chat sessions consume excessive tokens due to verbose tool schemas, pretty-printed JSON tool outputs, and large pagination limits, which exhaust context budgets and lead to premature history truncation.
2. **Local Ollama Failures**: Local models frequently fail to invoke tools, trigger silent context truncations (resulting in "dumb model" behavior), or error out on complex JSON schemas because Ollama’s default context window is 2048/4096 tokens and small models struggle with massive toolsets.

### Key Goals
*   **Reduce Token Overhead by 50%–70%** for system prompts, tool schemas, and tool results.
*   **Prevent History Eviction**: Stop large tool outputs (up to 25k chars / 6k tokens) from wiping out conversation history.
*   **Ensure 100% Ollama Compatibility**: Enforce context window size configurations, simplify schemas, and optimize the MCP adapters for IDE-integrated local models.

### 🛡️ Safeguards for Cloud & High-VRAM Local Models (Quality Preservation)
We will ensure that high-performance models—both cloud-hosted (Claude 3.5 Sonnet, GPT-4o, Gemini 2.5 Flash) and powerful local ones run on high-VRAM setups (e.g., Llama 3.3 70B, Qwen 2.5 72B via Ollama)—experience **zero quality loss**:
1. **User-Controlled Profiling (No Hardcoding)**: The choice of tool profile is entirely controlled by the user via the `chat_tool_profile` database setting. We **never** force a profile based on service type. A user running a powerful local setup can select the `full` profile to access all features (Coaching, Habits, Wizard, Vision, Engagement, Reports).
2. **Positive Performance Impact**: Reducing whitespace and database-level micronutrient bloat from lists decreases latency and API costs across all setups without omitting any decision-relevant data.
3. **Preserving History**: By preventing tool dumps from exceeding context budgets, both cloud and high-VRAM local sessions maintain a much longer, more stable memory of prior chat turns.

---

## 2. Current State & Technical Analysis

### A. The Tool Schema Bloat (System Prompt Overhead)
The chatbot loads tools dynamically using profiles:
*   `full`: Registers **11 tool builders** containing dozens of operations.
*   `core`: Registers **4 tool builders** (exercise, food, checkin, goals).

However, individual tools (such as `sparky_manage_food` in `SparkyFitnessServer/ai/tools/foodTools.ts`) are structured as **large union schemas** containing up to 16 distinct actions (e.g., `search_food`, `log_food`, `create_food`, `delete_entry`). 
*   **The Issue**: Generating JSON schemas for these complex Zod union types produces massive schemas (often 3,000–6,000 characters per tool).
*   **Ollama Impact**: Small local models (3B to 7B parameters) fail to parse or follow instructions within massive union schemas, leading to syntax errors or incorrect tool selection.

### B. Verbose Tool Outputs (Formatted JSON)
In `SparkyFitnessServer/ai/tools/formatting.ts`, successful tool results are returned as:
```typescript
text = JSON.stringify(data, null, 2);
```
*   **The Issue**: Pretty-printing JSON with 2-space indentation adds substantial whitespace overhead (newlines, spaces, brackets). For a 20-item list, this formatting can add **1.5× to 2×** the token cost of a compact, minified JSON or a formatted Markdown table.
*   **Redundant Fields**: Although `compactRecord` strips empty arrays and nulls, list tools like food searches still return detailed database records (e.g., 20+ micronutrient properties per food variant), most of which are irrelevant to the user's immediate question.

### C. Dangerous Truncation Limits vs. Budgets
In `SparkyFitnessServer/ai/tools/truncation.ts`, the tool output character limit is set to:
```typescript
export const CHARACTER_LIMIT = 25_000;
```
*   **The Issue**: `25_000` characters is equivalent to roughly **6,250 tokens**.
*   In `SparkyFitnessServer/services/chatService.ts`, the context sliding window budgets are:
    *   `CONTEXT_TOKEN_BUDGET = 6000` (Cloud models)
    *   `CORE_PROFILE_CONTEXT_TOKEN_BUDGET = 2000` (Local/Ollama models)
*   If a tool returns 25,000 characters, it **instantly overflows** the sliding window budget. The chatbot responds by slicing off history, completely erasing the user's conversation context just to digest one database dump.

### D. Ollama Context Window Limitations
*   Ollama's default model runner sets a context window (`num_ctx`) of `2048` or `4096` tokens unless configured otherwise in a Modelfile or request options.
*   In `SparkyFitnessServer/ai/providerDispatch.ts`, the native Ollama request builder does not supply the `options.num_ctx` parameter:
    ```typescript
    if (ctx.temperature !== undefined) {
      body.options = { temperature: ctx.temperature };
    }
    ```
    This causes Ollama to silently truncate incoming requests when system prompts and history accumulate.
*   For the Vercel AI SDK integration, Ollama is invoked via the OpenAI compatibility endpoint. It does not customize the context window size or pass model configuration parameters, which means Ollama's default context limits apply.

### E. MCP Adapter Unoptimized for Local IDEs
In `SparkyFitnessServer/routes/mcpRoutes.ts`, the MCP server registers tools using:
```typescript
registerRegistryTools(mcpServer, userId, tz);
```
*   This registers the **`full` profile by default**, regardless of the user's active AI settings.
*   When a developer or client hooks up a local model (via Ollama) to their IDE (Cursor, Claude Desktop), the client is flooded with dozens of complex tools. This causes high CPU usage, slow response times, and frequent tool-execution failures.

---

## 3. Proposed Optimizations & Architecture

### A. Compact & Efficient Formatting of Tool Outputs
1.  **Introduce Markdown/Compact Formatting**: Modify `formatting.ts` to format list data using a concise format (e.g. compact Markdown lists or minified JSON) instead of pretty-printed JSON.
2.  **Trim Micronutrient Bloat in Search/List Results**: When search tools return food variants, omit detailed micro-nutrient fields (e.g. `saturated_fat`, `calcium`, `monounsaturated_fat` etc. if they are zero) for list views, providing them only when explicit detail is requested via `sparky_get_food_details`.
3.  **Lower Default Page Sizes**: Reduce `DEFAULT_PAGE_SIZE` from `20` to `5` or `10` for chatbot queries. Chatbots rarely need to read 20 entries at once; 5–10 is sufficient.

### B. Adaptive Truncation & Budgets
1.  **Reduce `CHARACTER_LIMIT`**: Lower the maximum tool output character limit from `25,000` to `8,000` (approx. 2,000 tokens) for cloud models, and `3,000` (approx. 750 tokens) for local/core models.
2.  **Add Token-Aware Truncation**: Dynamically limit tool output sizes based on the active tool profile to guarantee that tool responses can never wipe out chat history.

### C. Split Complex Union Tools
Break down the monolithic `sparky_manage_food` and `sparky_manage_exercise` tools into smaller, specialized tools.
*   **Before**: One tool (`sparky_manage_food`) with a Zod union of 16 actions.
*   **After**: Separate tools with simple, flat arguments:
    *   `sparky_log_food` (simple input for logging)
    *   `sparky_search_foods` (simple input for searching)
    *   `sparky_get_food_diary` (simple input for diary lookup)
    *   `sparky_delete_food_entry` (simple input for deletion)
This drastically reduces the complexity of JSON schemas, making tool selection much faster and 100% reliable for local models.

### D. Enforce Ollama Context Size Configuration
1.  **Configure Request Options**: Update `buildOllamaRequest` in `providerDispatch.ts` to explicitly request a larger context window (e.g., `num_ctx: 8192` or `16384`) in the `options` object:
    ```typescript
    body.options = {
      temperature: ctx.temperature,
      num_ctx: 8192 // Force 8k context window support
    };
    ```
2.  **Pass Context Window in OpenAI-Compatible Endpoint**: If using the Vercel AI SDK over Ollama's `/v1/chat/completions`, configure options to include `num_ctx` in the custom request parameters.

### E. Align MCP Tool Profiles
1.  **Active Setting Detection**: Update `mcpRoutes.ts` to look up the user's active AI settings:
    ```typescript
    const activeSetting = await chatService.getActiveAiServiceSetting(userId, userId);
    const profile = activeSetting?.chat_tool_profile || 'full';
    ```
2.  **Pass Profile to MCP**: Pass this profile to `registerRegistryTools(mcpServer, userId, tz, profile)`. This automatically restricts the registered MCP tools to the `core` subset if the user is using a local/small model configuration.

### F. Additional Enhancements (UX & Prompt Compaction)
1. **SSRF Guard Actionable Error Messages**: Modify the `OutboundUrlBlockedError` constructor in `outboundUrlPolicy.ts` to append:
   *"To allow connections to local services (e.g., local Ollama), set `ALLOW_PRIVATE_NETWORK_AI=true` in your server `.env` configuration."*
2. **Trimming System Prompts for `core` Profile**: Condense instructions in `getSystemPrompt` (e.g. omitting long food lookup and image scanning guides) when the profile is set to `core`, reducing prompt size by ~30% for local models.
3. **Micro-Nutrient Database Trimming**: Update `projectVariant` in `foodTools.ts` to omit micro-nutrient fields that are null or zero, preventing verbose outputs full of `"calcium": 0, "iron": 0` pairs.

### G. Frontend Defaults & Warning Indicators
1. **Revert Default to Full**: Revert the frontend behavior that automatically forces Ollama service creations to the `core` profile. All new services (including Ollama) will default to the `full` profile.
2. **Conditional Warning for Ollama + Full**: If Ollama is selected as the service type and `full` is selected as the tool profile (or left as default), display a warning card in the form:
   * **Title**: *"Potential Performance Impact for Local Models"*
   * **Message**: *"Running a local model with the Full tool set can cause significant latency or errors unless you have a highly powerful system (e.g., high VRAM GPU). If performance is slow or the model gets confused, switch to the Core tool set."*
3. **Update Test Cases**: Realign `ServiceForm.test.tsx` to assert that Ollama defaults to `full` rather than `core`, but triggers the visibility of the performance warning.

---

## 4. Proposed File Changes & Diffs

### 1. `SparkyFitnessServer/ai/tools/truncation.ts`
Lower character limits for tool output.
```typescript
// Old: export const CHARACTER_LIMIT = 25_000;
// New:
export const CLOUD_CHARACTER_LIMIT = 8_000;
export const LOCAL_CHARACTER_LIMIT = 3_000;

export function getCharacterLimit(profile: 'full' | 'core' = 'full'): number {
  return profile === 'core' ? LOCAL_CHARACTER_LIMIT : CLOUD_CHARACTER_LIMIT;
}
```

### 2. `SparkyFitnessServer/ai/tools/formatting.ts`
Condense tool outputs and use minified JSON or clean markdown lists.
```typescript
import { getCharacterLimit } from './truncation.js';

// Format objects as minified JSON without indentation whitespace
export function formatSuccess(data: unknown, title?: string, profile: 'full' | 'core' = 'full'): string {
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else {
    // Minify JSON to conserve tokens
    text = JSON.stringify(data);
  }

  if (title) {
    text = `# ${title}\n\n${text}`;
  }

  const limit = getCharacterLimit(profile);
  if (text.length > limit) {
    text = text.slice(0, limit - 200) + `\n\n--- ⚠️ Truncated to fit budget.`;
  }
  return text;
}
```

### 3. `SparkyFitnessServer/ai/providerDispatch.ts`
Pass `num_ctx` to the Ollama options.
```typescript
function buildOllamaRequest(ctx: BuildContext): BuiltRequest {
  ...
  const body: Record<string, unknown> = {
    model: ctx.model,
    messages: [message],
    stream: false,
    options: {
      temperature: ctx.temperature ?? 0.2,
      num_ctx: 8192 // Force 8k context window support
    }
  };
  ...
}
```

### 4. `SparkyFitnessServer/routes/mcpRoutes.ts`
Read active service config profile and align tool registry.
```typescript
    const activeSetting = await chatService.getActiveAiServiceSetting(userId, userId);
    const profile = activeSetting?.chat_tool_profile || 'full';
    
    registerRegistryTools(mcpServer, userId, tz, profile);
```

### 5. `SparkyFitnessServer/ai/mcp/mcpAdapter.ts`
Accept `profile` parameter and forward it:
```typescript
export function registerRegistryTools(
  mcpServer: McpServer,
  userId: string,
  tz: string,
  profile: 'full' | 'core' = 'full'
): void {
  const tools = buildChatbotTools(userId, tz, profile) as unknown as Record<
    string,
    RegistryTool
  >;
  registerToolMap(mcpServer, tools);
}
```

---

## 5. Verification Plan

### Automated Verification
1.  **Run Existing Tests**: Execute the test suites in `SparkyFitnessServer/tests/` to verify that tool registries and routing functions remain backwards-compatible.
    ```bash
    pnpm test
    ```
2.  **Write New Tests**: Add test cases for token-based output truncation and verifying the profile-based MCP registration.

### Manual Verification
1.  **Test Ollama Integration**:
    *   Set up a local Ollama instance (e.g. Llama 3.2 3B).
    *   Trigger chat commands and verify that system prompts and tool schemas fit within the context window without errors.
    *   Verify that `num_ctx` is processed and honors the 8K token context limit.
2.  **Verify Token Metrics**:
    *   Review the server logging statements (e.g. `[chat] provider=ollama totalTokens=...`).
    *   Compare token usage before and after changes.
3.  **Validate MCP Client**:
    *   Launch MCP client (e.g., Claude Desktop or Cursor).
    *   Change active provider to a `core` profile and check the list of available tools. Verify that only core tools (exercise, food, checkin, goals) are exposed.
