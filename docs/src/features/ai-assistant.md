## Sparky Buddy (AI Assistant)
### Core AI Features
- **Food Recognition**: Analyze food photos for automatic logging and nutrition extraction
- **Nutrition Analysis**: Intelligent nutrition information extraction from text and images
- **Meal Suggestions**: AI-powered meal recommendations and recipe generation
- **Question Answering**: General nutrition and fitness guidance, personalized advice
- **Exercise Logging**: Log exercises with duration, distance, and calorie estimates
- **Measurement Logging**: Log standard and custom body measurements
- **Water Intake Logging**: Track daily water consumption
- **Calorie target review**: Ask whether your calorie target is right. The assistant compares the target with your estimated maintenance (the same adaptive estimate as the Goals screen) and your weight trend, and gives the calories for the weekly change you want. It never lowers a target below the safe minimum and changes your goal only after you agree.
- **Training, run and plan reviews**: See [Adaptive coaching](/features/exercises/adaptive-coaching) for the strength and run reviews and for plan weight changes.

### Chat Interface
- **Image Upload**: Send photos for food analysis
- **Text Input**: Natural language food descriptions, questions, and commands
- **History**: Persistent chat conversation history with session grouping
- **Metadata Storage**: Stores structured data like food options, exercise suggestions within chat history
- **Settings**: Direct access to AI service configuration

### Voice input on web and mobile

In **Ask Sparky** on the web, Android, or iOS, tap the microphone, dictate a message, then stop recording. Review or edit the recognized text and tap **Send**. Dictation does not automatically send messages or add food to your diary; the existing chat handles your request after you send it.

Open **Settings → Developer & Integrations → AI Service Settings → Voice input** on the web, or **Settings → Voice settings** on mobile. The server stores these settings for both clients; reopening the screen or returning to the app/browser refreshes changes made elsewhere.

- **Voice input On/Off:** turning it off hides the microphone without clearing your selected model. Voice input is on by default, using System recognition.
- **System recognition (default):** uses the device or browser speech recognizer without a Sparky AI transcription charge. Microphone/speech permission is required. Availability, languages, offline support, and whether audio is processed by a cloud service depend on your device or browser. Some browsers and embedded webviews do not support this mode; the chat offers Voice settings, never an automatic switch to AI.
- **Optional AI transcription:** first enable audio input on a compatible configuration in the web app's AI Service Settings. Under Voice input, choose **AI transcription**, then explicitly select a **Voice model**. A compatible Chat configuration is suggested first, not automatically selected. Provider charges may apply. Voice is independent of the **Chat** and **Vision** selections; choose **System (default)** to return to system recognition.
- **Supported AI transports:** Google models accepting inline audio, or OpenAI, Mistral, and compatible `/audio/transcriptions` endpoints. Choose a transcription-capable model, not an ordinary text-chat model. OpenAI-compatible/custom endpoints can omit the API key when the server does not require one.
- **Privacy and limits:** AI mode sends the recording through your SparkyFitness server to the selected provider. Uploads are limited to 10 MB; the server buffers audio in memory and does not save audio in chat history. Temporary device recordings are deleted after completion or cancellation; browser recordings stay in memory and microphone tracks are stopped. Provider-side retention follows that provider's policy.
- **Foreground only:** leaving the chat, switching browser tabs, backgrounding the app, disabling voice, or changing recognition mode cancels capture/transcription. The web also supports Cancel and Escape. Sending and editing are temporarily disabled during capture/transcription so a late result cannot overwrite another message. Failed recognition leaves the existing draft intact.
- **Browser requirements:** microphone recording requires HTTPS (or localhost for development), microphone permission, and a supported MediaRecorder format. WebM/Opus, MP4, and Ogg/Opus are supported when offered by the browser. A missing recognizer or denied permission never enables a paid provider automatically.

AI transcription requires an updated client and server, with the database migrations applied. Native microphone/speech-recognition dependencies require a rebuilt mobile app, not just an over-the-air JavaScript update.

### Food Integration
- **Auto-Logging**: Directly add recognized foods to diary with confirmation
- **Nutrition Confirmation**: Review and edit AI suggestions before logging
- **Meal Context**: Understand meal timing and context for accurate logging
- **Brand Recognition**: Identify specific food brands and products

## Food Preferences and Saved Tasks

The web chat's **Food preferences and tasks** panel shows lasting food preferences and saved work. Tell Sparky explicitly what to remember, or edit and forget preferences in the panel. A choice for one meal does not replace a lasting preference. These preferences are stored separately from conversation history.

Multi-step food tasks keep their ingredient selections, portion variants, source evidence and next step. Ingredients that still need matching remain in the draft with incomplete nutrition. Saving a draft does not publish a recipe or add food to the diary. Select a task to inspect its checkpoint and operation history, cancel remaining work, or resume it in chat. Resume does not start a background job.

This information belongs to the signed-in person and is not shared with family diary viewers.

## Tools from an outside MCP server

An admin can give chat the tools of another MCP server, such as a notes app or a home automation server, so the assistant can use them next to its own.

Whatever the assistant passes to these tools is sent to that server, and what comes back enters the chat. Add only servers you trust.

### Add a server

1. Go to **Admin → Global Data Providers**, select **Add New Data Provider**, give it a name and choose the type **MCP tool server**. Only an admin can add one, and it is never offered in a person's own settings.
2. Enter the server's URL, the address of its Streamable HTTP endpoint (for example `https://tools.example.com/mcp`), and a bearer token if the server needs one. When you edit a saved server, leave the token blank to keep the saved one. Changing its URL needs the token entered again and clears the ticked tools. A server that only speaks the older SSE transport, or that needs an OAuth sign-in, cannot be added.
3. Select **Load tools**. Every tool the server lists is shown. Tick the ones chat may use, up to 20 per server. A tool chat would leave out is listed with the reason and cannot be ticked. A tool you allowed earlier that the server no longer lists is marked, so you can untick it.
4. Turn on **Tell the server who is chatting** only for a server that keeps data per person (see below).
5. Turn on **Activate this provider** and save; chat reads only active servers. Nothing is allowed until you tick it, so a new server gives chat no tools until then.

A server on your own network works too, since only an admin adds one. Over plain `http` the token is sent unencrypted, so use `https` unless the network is one you trust.

### When chat uses them

- Only when chat chooses its tools itself, which is the default. Picking categories under **Chatbot tools**, even all of them with **Full**, leaves them out until you select **Clear all**. So does the **core** tool profile for small local models.
- At most 40 tools from all servers together. Servers are taken in name order, then each server's tools in name order; the rest are left out, and the SparkyFitness log says how many.
- Each tool is named after its server, for example `mcp_household_tools__search`.
- A server that is down or slow is skipped, and chat goes on without it. It has 5 seconds to connect and 5 more to list its tools, and a call has 30 seconds to answer. A server that failed to list its tools is tried again after 15 seconds.
- The tool list is kept for a minute. Saving the provider applies a change at once.
- SparkyFitness's own [MCP server](/features/mcp-server) does not offer these tools to the apps that connect to it.

### Tell the server who is chatting

With this on, each call carries the signed-in person's user ID in the `X-SparkyFitness-User-Id` header, so the server can keep each person's data apart. After switching to a family member's profile, the server's tools refuse to run, since the server would only know who is signed in. With it off, the server is not told who is chatting, so it cannot tell people apart, and its tools also run in a family member's profile. The server should accept the header only together with the token, since SparkyFitness does not sign it.

### Limits and safety

- Chat reads only the text of an answer; images and other parts are left out, and the assistant is told how many.
- An answer longer than 8,000 characters is cut, and the assistant is told to ask for less. A server that can return a lot should offer filters or a limit; SparkyFitness does not page through results.
- A tool's description is cut at 1,024 characters.
- Every allowed tool's input schema goes with every chat request, so one the model provider refuses would fail every chat. A schema is checked first: it must describe an object, follow JSON Schema's draft-07 rules, and be at most 32 KB and 32 levels deep. A tool that fails is left out. The check covers what model providers commonly refuse, but a provider can still refuse a schema that passes.
- The token is sent only to the server's URL, never to another host or port on a redirect. If the server repeats it in a description, an answer or an error, it is replaced with `[redacted]`. A tool whose name or input schema holds the token is left out.
- What the assistant passes to a tool is not written to the SparkyFitness log.

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
2. **Use the `core` tool profile.** When you add an Ollama service, SparkyFitness now preselects the **core** tool profile (in the service's settings). Core exposes the everyday logging tools plus goals (~20 tools) instead of the full ~35, which small models select from far more reliably and which fits a smaller context window. Pick **full** only on a strong local machine with a raised context window.

The server logs a warning when an Ollama service runs the `full` profile, since that combination most often overflows the default context. Also prefer models trained for tool calling (e.g. `qwen2.5:7b-instruct`, `llama3.1:8b`) — plain small chat models make unreliable tool calls.
