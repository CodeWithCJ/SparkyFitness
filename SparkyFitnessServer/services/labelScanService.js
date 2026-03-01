const chatRepository = require("../models/chatRepository");
const { log } = require("../config/logging");
const { getDefaultModel } = require("../ai/config");

async function extractNutritionFromLabel(base64Image, mimeType, userId) {
  try {
    const setting = await chatRepository.getActiveAiServiceSetting(userId);
    if (!setting) {
      return { success: false, error: "No AI service configured" };
    }

    const aiService = await chatRepository.getAiServiceSettingForBackend(
      setting.id,
      userId,
    );

    if (aiService.service_type !== "ollama" && !aiService.api_key) {
      return { success: false, error: "API key missing for selected AI service." };
    }

    const model = aiService.model_name || getDefaultModel(aiService.service_type);
    const apiKey = aiService.api_key;

    const prompt =
      "Extract the nutrition facts from this food label image. " +
      "Return a JSON object with these fields: " +
      "name (string), brand (string), serving_size (number), serving_unit (string), " +
      "calories (number), protein (number), carbs (number), fat (number), " +
      "fiber (number), saturated_fat (number), sodium (number), sugars (number). " +
      "All numeric fields should be numbers, not strings. " +
      "serving_size should be a number. " +
      "Use null for any field not visible on the label. " +
      "Return only the JSON object, no other text.";

    let response;

    switch (aiService.service_type) {
      case "google":
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Image,
                      },
                    },
                    { text: prompt },
                  ],
                  role: "user",
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
          },
        );
        break;

      case "openai":
      case "openai_compatible":
      case "mistral":
      case "groq":
      case "openrouter":
      case "custom": {
        const url =
          aiService.service_type === "openai"
            ? "https://api.openai.com/v1/chat/completions"
            : aiService.service_type === "openai_compatible"
              ? `${aiService.custom_url}/chat/completions`
              : aiService.service_type === "mistral"
                ? "https://api.mistral.ai/v1/chat/completions"
                : aiService.service_type === "groq"
                  ? "https://api.groq.com/openai/v1/chat/completions"
                  : aiService.service_type === "openrouter"
                    ? "https://openrouter.ai/api/v1/chat/completions"
                    : aiService.custom_url;

        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(aiService.service_type === "openrouter" && {
              "HTTP-Referer": "https://sparky-fitness.com",
              "X-Title": "Sparky Fitness",
            }),
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${base64Image}`,
                    },
                  },
                  { type: "text", text: prompt },
                ],
              },
            ],
            temperature: 0.3,
          }),
        });
        break;
      }

      case "anthropic":
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            model,
            max_tokens: 1000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mimeType,
                      data: base64Image,
                    },
                  },
                  { type: "text", text: prompt },
                ],
              },
            ],
          }),
        });
        break;

      case "ollama":
        response = await fetch(`${aiService.custom_url}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "user", content: prompt, images: [base64Image] },
            ],
            stream: false,
          }),
        });
        break;

      default:
        return {
          success: false,
          error: `Unsupported service type: ${aiService.service_type}`,
        };
    }

    if (!response.ok) {
      const errorBody = await response.text();
      log(
        "error",
        `Label scan API error for ${aiService.service_type}. Status: ${response.status}, Body: ${errorBody}`,
      );
      return {
        success: false,
        error: `AI service returned status ${response.status}`,
      };
    }

    const data = await response.json();
    let content;

    switch (aiService.service_type) {
      case "google":
        content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        break;
      case "openai":
      case "openai_compatible":
      case "mistral":
      case "groq":
      case "openrouter":
      case "custom":
        content = data.choices?.[0]?.message?.content;
        break;
      case "anthropic":
        content = data.content?.[0]?.text;
        break;
      case "ollama":
        content = data.message?.content;
        break;
    }

    if (!content) {
      return { success: false, error: "No content in AI response" };
    }

    // Strip markdown code fences if present
    content = content
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");

    const nutrition = JSON.parse(content);
    return { success: true, nutrition };
  } catch (error) {
    log("error", `Error extracting nutrition from label for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  extractNutritionFromLabel,
};
