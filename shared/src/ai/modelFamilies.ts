/** Match the GPT-6 family without treating similarly prefixed model IDs as it. */
export function isGpt6Model(modelName: string): boolean {
  return /^gpt-6(?:[.-]|$)/.test(modelName);
}
