export const gptTextModels = ["gpt-5.5", "gpt-5.4"] as const;

export const claudeTextModels = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export const geminiTextModels = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
] as const;

export const geminiImageModel = "gemini-2.5-flash-image";

export function imageModelForProvider(provider: string | null | undefined, textModel: string | null | undefined) {
  if (provider === "gemini") return geminiImageModel;
  return textModel ?? "";
}
