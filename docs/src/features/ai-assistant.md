## Sparky Buddy (AI Assistant)

### Core AI Features

- **Food Recognition**: Analyze food photos for automatic logging and nutrition extraction
- **Nutrition Analysis**: Intelligent nutrition information extraction from text and images
- **Meal Suggestions**: AI-powered meal recommendations and recipe generation
- **Question Answering**: General nutrition and fitness guidance, personalized advice
- **Exercise Logging**: Log exercises with duration, distance, and calorie estimates
- **Measurement Logging**: Log standard and custom body measurements
- **Water Intake Logging**: Track daily water consumption

### Chat Interface

- **Image Upload**: Send photos for food analysis
- **Text Input**: Natural language food descriptions, questions, and commands
- **History**: Persistent chat conversation history with session grouping
- **Metadata Storage**: Stores structured data like food options, exercise suggestions within chat history
- **Settings**: Direct access to AI service configuration

### Food Integration

- **Auto-Logging**: Directly add recognized foods to diary with confirmation
- **Nutrition Confirmation**: Review and edit AI suggestions before logging
- **Meal Context**: Understand meal timing and context for accurate logging
- **Brand Recognition**: Identify specific food brands and products

## Food Preferences and Saved Tasks

The web and mobile chats' **Food preferences and tasks** panel shows lasting food preferences and saved work. Tell Sparky explicitly what to remember, or edit and forget preferences in the panel. A choice for one meal does not replace a lasting preference. These preferences are stored separately from conversation history.

Multi-step food tasks keep their ingredient selections, portion variants, source evidence and next step. Ingredients that still need matching remain in the draft with incomplete nutrition. Saving a draft does not publish a recipe or add food to the diary. Select a task to inspect its checkpoint and operation history, cancel remaining work, or resume it in chat. Resume does not start a background job.

This information belongs to the signed-in person and is not shared with family diary viewers.

## Saved Recipe Drafts

Ask Sparky to import an original recipe URL, transcribe an attached recipe image, or edit a saved recipe. Each ingredient remains in a saved draft while its product, portion and nutrition are verified. A source yield such as “2 loaves” stays visible until the number of servings is confirmed. Missing ingredients or nutrition remain unresolved; partial subtotals are not shown as complete recipe totals.

Provider ingredients use full details for the exact selected product. Importing an ingredient saves it to the food library without logging it. Publishing a complete draft creates a private saved recipe, or edits your selected recipe after checking that it has not changed. The assistant verifies the saved ingredient quantities and nutrient snapshots before reporting success. Existing diary entries keep their logged nutrition.

You can ask to undo a recipe publication. Undo checks for later edits and refuses to overwrite newer work. Undoing recipe creation also requires that nobody uses it in a diary, meal plan, another recipe or favorite. Import, publication and undo retries reuse their request IDs and operation IDs, preventing duplicate saves.

## Verified Diary Changes

Ask Sparky to replace, resize, scale, move, copy or delete logged foods or a whole meal. Replacements keep the same diary entry and group while updating the selected food, portion and nutrition together. Resizing, moving and copying retain the logged snapshot, including notes, photos and custom nutrients, rather than refreshing an old entry from today's catalog. Linked drink records and daily water totals change in the same transaction.

The assistant inspects the current selection before applying it. Ambiguous food names require choosing the intended entry. Bulk and whole-meal deletions show a preview and require explicit confirmation. You can ask to undo a completed action; undo restores its prior snapshots only if later edits would not be overwritten. Copy undo removes the copies and leaves the source meal intact. A provider reference claiming implausible energy per bread slice triggers source verification instead of a guessed calorie correction.

## Meal Plans and Shopping Lists

Ask Sparky to build a meal plan around your goals, lasting preferences and confirmed leftovers. The draft retains every food and saved recipe assignment, date window and portion. Preview shows actual daily nutrition and current goals; incomplete ingredients remain visible and block publication. Saving creates a normal meal-plan template. Scheduling also writes its verified future diary entries in the same transaction, preserving historical entries. Replacing an existing future schedule requires a preview and explicit confirmation. Undo checks both the template and its diary entries before restoring the prior state.

Saved recipe logging expands every linked recipe using its confirmed yield. Missing components, cycles, incompatible units or implausible nutrition stop the entire log. Recorded unknown nutrients stay unknown when the food catalog changes.

Shopping lists can use a completed plan's captured quantities, an existing saved plan or explicit items. Quantities combine only when food identity and units are compatible. Confirmed pantry amounts reduce the required amount; item counts are never converted to weights without a verified reference. Select the shopping task in **Food preferences and tasks** to mark purchases in web or mobile. The list, checks and operation history persist across chats. Ask to add or remove items, or undo the latest change; undo refuses to overwrite later edits.

## Troubleshooting AI Providers

Most "OpenAI Compatible / OpenRouter isn't working" reports come from provider configuration, not from SparkyFitness itself. The most common cases:

### OpenRouter: "No allowed providers are available for the selected model" (HTTP 404)

This is an **OpenRouter account setting**, not a SparkyFitness error. OpenRouter serves each model through one or more upstream providers. If your account is restricted to a subset of providers, a model whose upstream is excluded fails with this 404 — this most often hits the free (`:free`) models, which run on providers you may not have enabled.

The error body shows the mismatch directly:

- `available_providers` — the providers that can actually serve the model
- `requested_providers` — the providers your account currently allows

**Fix:** In your OpenRouter account settings, review the allowed-providers / data-policy preferences, then either enable the provider that serves your chosen model **or** pick a model served by a provider you already allow (e.g. an `openai/`, `anthropic/`, or `google/` model if those are your allowed upstreams).

### Every request 404s (doubled URL)

If your custom URL already ends in `/chat/completions`, SparkyFitness appends its own path and the request 404s.

**Fix:** Enter only the base URL ending in `/v1` — for example `https://openrouter.ai/api/v1`. For local servers such as LM Studio or Ollama, use an admin/global AI setting or enable [`ALLOW_PRIVATE_NETWORK_AI=true`](/install/environment-variables) on a trusted self-hosted deployment. SparkyFitness adds `/chat/completions` for you.

### "Model not found" or empty/garbled responses

The model name must be one your endpoint actually hosts. OpenAI names like `gpt-4o-mini` will not exist on most compatible servers.

**Fix:** For the **OpenAI Compatible** and **Custom** service types, enable **Use custom model** and enter your server's own model name.

### Chat works, but photo analysis or label scan fails

Food-photo analysis and nutrition-label scanning request **structured JSON output**; plain chat does not. This is done to improve the quality of results. Some models and servers do not support structured output and reject those requests while chat still works.

**Fix:** Choose a model that supports structured outputs / JSON mode. On OpenRouter, a model's page lists whether it supports "structured outputs".

### Local servers (LM Studio, Ollama, llama.cpp)

These usually run without an API key — leave the **API Key** field blank. Use the OpenAI-compatible base URL the server exposes, for example `http://localhost:1234/v1` (LM Studio) or `http://localhost:11434/v1` (Ollama's OpenAI-compatible endpoint).

Local/private AI URLs are resolved from the backend server's network, not from the browser. To prevent regular users from turning the server into a private-network proxy, private AI URLs are allowed for current admins, global admin-created AI settings, or deployments that explicitly set [`ALLOW_PRIVATE_NETWORK_AI=true`](/install/environment-variables).

### Perplexity AI Setup and Troubleshooting

Perplexity has retired the legacy OpenAI-compatible Chat Completions API (`/v1/chat/completions` and `/v1/sonar`) in favor of their new Agent API (`/v1/responses`). Attempting to connect to `api.perplexity.ai` under the generic **OpenAI Compatible** type returns HTTP 403 `chat_completions_not_available`.

**How to use Perplexity models in SparkyFitness:**

1. **Direct Perplexity Setup (Recommended):**
   - In **AI Settings**, select **Perplexity AI** from the provider dropdown.
   - Enter your Perplexity API key from `console.perplexity.ai`.
   - Select your preferred preset tier (`fast`, `low`, `medium`, `high`, `xhigh`) or enter a custom model. SparkyFitness automatically connects to Perplexity's Agent API (`/v1/responses`) using the appropriate preset.

2. **Via OpenRouter (Alternative):**
   - In **AI Settings**, select **OpenRouter** as the provider.
   - Enter your OpenRouter API key.
   - Select `perplexity/sonar` or `perplexity/sonar-pro` from the model presets. OpenRouter translates requests into standard chat completions.

### Running the chatbot on small local models (Ollama)

Small local models (roughly 3B–8B, e.g. an 8 GB Mac) can drive the chatbot's tools well, but two settings make the difference between "works great" and "acts dumb":

1. **Raise Ollama's context window.** Ollama defaults to a 4096-token context and **silently truncates** anything longer — which chops the tool definitions and system prompt mid-way and produces wrong or malformed tool calls. Raise it before anything else:
   - Set `OLLAMA_CONTEXT_LENGTH=16384` on the Ollama server (e.g. `launchctl setenv OLLAMA_CONTEXT_LENGTH 16384` on macOS, then restart Ollama), **or**
   - Bake `PARAMETER num_ctx 16384` into a Modelfile (`ollama create my-model -f Modelfile`) and point the service at that model.
   - On an 8 GB machine, start at `8192` — context uses VRAM — and only go higher if responses stay fast.
2. **Use the `core` tool profile.** When you add an Ollama service, SparkyFitness now preselects the **core** tool profile (in the service's settings). Core exposes the everyday logging tools plus goals instead of the full tool set, which small models select from far more reliably and which fits a smaller context window. Pick **full** only on a strong local machine with a raised context window.

The server logs a warning when an Ollama service runs the `full` profile, since that combination most often overflows the default context. Also prefer models trained for tool calling (e.g. `qwen2.5:7b-instruct`, `llama3.1:8b`) — plain small chat models make unreliable tool calls.

### Food and serving corrections

The assistant can create private foods from labels or supplied nutrition, edit individual serving variants and choose a default. It checks the serving basis and nutrient plausibility, keeps unknown micronutrients empty, and preserves variants you did not ask to change. Exact provider imports retain the selected external item and serving identifiers. Corrections clear stale provider verification. AI estimates need your explicit acceptance. Saved task receipts show the actual food and variants; undo stops if newer edits or dependencies would be overwritten. Library corrections preserve existing diary snapshots.

### Recorded nutrition analysis

Ask for recorded nutrient totals, goal comparisons or differences between two date ranges. The assistant reads historical diary snapshots and distinguishes logged days, unlogged days and missing nutrient references. It can save the analysis with its dates, source fingerprint and capture time for later review. A logged day may still be incomplete; goal gaps compare recorded food with calendar targets before exercise adjustments. The report states this goal basis and does not infer causes or diagnoses. Each analysis period supports up to 90 calendar days.

Full-profile food chats allow up to 48 steps and 15 minutes for source research, checkpoints and verified publication. Smaller local/core profiles retain their shorter bounds. Longer work stays in saved tasks that can be resumed.
