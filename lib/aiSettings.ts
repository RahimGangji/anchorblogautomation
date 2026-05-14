import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import type { AiProvider, AiSettingsDocument } from "@/lib/types";

export const defaultAiSettings = {
  activeProvider: "gpt" as AiProvider,
  gptModel: "gpt-5.5",
  claudeModel: "claude-sonnet-4.6",
  geminiModel: "gemini-3.1",
};

export type ActiveAiSettings = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export async function getAiSettings(userId: ObjectId) {
  const db = await getDb();
  return await db.collection<AiSettingsDocument>("aiSettings").findOne({ userId });
}

export function getActiveAiSettings(settings: AiSettingsDocument | null): ActiveAiSettings | null {
  if (!settings) return null;

  if (settings.activeProvider === "gpt" && settings.gptApiKey?.trim()) {
    return {
      provider: "gpt",
      apiKey: settings.gptApiKey.trim(),
      model: settings.gptModel || defaultAiSettings.gptModel,
    };
  }

  if (settings.activeProvider === "claude" && settings.claudeApiKey?.trim()) {
    return {
      provider: "claude",
      apiKey: settings.claudeApiKey.trim(),
      model: settings.claudeModel || defaultAiSettings.claudeModel,
    };
  }

  if (settings.activeProvider === "gemini" && settings.geminiApiKey?.trim()) {
    return {
      provider: "gemini",
      apiKey: settings.geminiApiKey.trim(),
      model: settings.geminiModel || defaultAiSettings.geminiModel,
    };
  }

  return null;
}
