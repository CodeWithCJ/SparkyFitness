import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageWizardSchema, type ManageWizardInput } from "../schemas/wizard.js";
import type { ToolResponse } from "../types.js";

const STEPS = {
  start: {
    question: "Welcome to your daily check-in! Let's start with your **weight**. What is it today?",
    next: "weight"
  },
  weight: {
    question: "Got it. How many **steps** did you get in yesterday or today?",
    next: "steps"
  },
  steps: {
    question: "Nice! How was your **sleep**? (Duration and quality score 0-100)",
    next: "sleep"
  },
  sleep: {
    question: "And your **mood** today? (Scale of 1-10)",
    next: "mood"
  },
  mood: {
    question: "Finally, let's check your **habits**. Did you complete your daily goals?",
    next: "habits"
  },
  habits: {
    question: "All set! I've prepared a summary of your entries. Should I save everything?",
    next: "complete"
  },
  complete: {
    question: "Excellent. Your daily check-in is complete and saved. Have a great day!",
    next: null
  }
};

export function registerWizardTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_daily_checkin_wizard",
    {
      title: "Daily Check-in Wizard",
      description: "A guided, step-by-step interactive assistant for your daily health check-in. Use 'daily_checkin' action and pass the current step.",
      inputSchema: manageWizardSchema,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as ManageWizardInput;
      
      const currentStep = args.step || "start";
      const stepInfo = (STEPS as any)[currentStep];
      
      if (!stepInfo) {
        return {
          content: [{ type: "text", text: "Invalid wizard step." }],
          isError: true
        };
      }

      return {
        content: [{ type: "text", text: stepInfo.question }],
        structuredContent: {
          current_step: currentStep,
          next_step: stepInfo.next,
          guided: true
        }
      };
    }
  );
}
