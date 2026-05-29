import type { ToolResponse } from "../types.js";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

function getModel() {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) return null;

  // Prefer Gemini if key starts with AIza, else assume OpenAI/Compatible
  if (apiKey.startsWith("AIza")) {
    const google = createGoogleGenerativeAI({ apiKey });
    return google("gemini-1.5-flash");
  } else {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  }
}

export async function analyzeFoodImage(imageUrl: string): Promise<ToolResponse> {
  const model = getModel();

  if (!model) {
    return {
      content: [{
        type: "text",
        text: "⚠️ Vision API is not configured.\n\nThe VISION_API_KEY environment variable is not set. To enable food image analysis, configure a vision API key (Gemini or GPT-4o Vision) in your environment.",
      }],
      structuredContent: {
        status: "not_configured",
        message: "VISION_API_KEY environment variable is not set",
      },
    };
  }

  try {
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the food in this image and provide a detailed nutritional estimate (calories, protein, carbs, fat). If it's a full meal, estimate for each component and then total. Format the output clearly." },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    return {
      content: [{
        type: "text",
        text: `🔬 Food Image Analysis Result:\n\n${text}`,
      }],
      structuredContent: {
        status: "success",
        analysis: text,
      },
    };
  } catch (error: any) {
    console.error("Vision Analysis Error:", error);
    return {
      content: [{
        type: "text",
        text: `❌ Error analyzing image: ${error.message}`,
      }],
      isError: true,
    };
  }
}

export async function scanLabel(imageUrl: string): Promise<ToolResponse> {
  const model = getModel();

  if (!model) {
    return {
      content: [{
        type: "text",
        text: "⚠️ Vision API is not configured.\n\nThe VISION_API_KEY environment variable is not set. To enable nutrition label scanning, configure a vision API key (Gemini or GPT-4o Vision) in your environment.",
      }],
      structuredContent: {
        status: "not_configured",
        message: "VISION_API_KEY environment variable is not set",
      },
    };
  }

  try {
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all nutritional information from this label. Include serving size, calories, protein, carbs, fat, and any other available micronutrients. Format as structured text." },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    return {
      content: [{
        type: "text",
        text: `🏷️ Nutrition Label Scan Result:\n\n${text}`,
      }],
      structuredContent: {
        status: "success",
        data: text,
      },
    };
  } catch (error: any) {
    console.error("Label Scan Error:", error);
    return {
      content: [{
        type: "text",
        text: `❌ Error scanning label: ${error.message}`,
      }],
      isError: true,
    };
  }
}
