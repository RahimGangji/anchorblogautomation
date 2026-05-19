import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { claudeTextModels, geminiTextModels, gptTextModels } from "@/lib/aiModels";
import type { AiProvider, AiSettingsDocument } from "@/lib/types";

export const defaultAiSettings = {
  activeProvider: "gpt" as AiProvider,
  gptModel: "gpt-5.5",
  claudeModel: "claude-sonnet-4-6",
  geminiModel: "gemini-2.5-flash",
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
      model: normalizeGptModel(settings.gptModel),
    };
  }

  if (settings.activeProvider === "claude" && settings.claudeApiKey?.trim()) {
    return {
      provider: "claude",
      apiKey: settings.claudeApiKey.trim(),
      model: normalizeClaudeModel(settings.claudeModel),
    };
  }

  if (settings.activeProvider === "gemini" && settings.geminiApiKey?.trim()) {
    return {
      provider: "gemini",
      apiKey: settings.geminiApiKey.trim(),
      model: normalizeGeminiModel(settings.geminiModel),
    };
  }

  return null;
}

export function normalizeGptModel(model: string | null | undefined): string {
  return gptTextModels.includes(model as (typeof gptTextModels)[number])
    ? (model as string)
    : defaultAiSettings.gptModel;
}

export function normalizeClaudeModel(model: string | null | undefined): string {
  return claudeTextModels.includes(model as (typeof claudeTextModels)[number])
    ? (model as string)
    : defaultAiSettings.claudeModel;
}

export function normalizeGeminiModel(model: string | null | undefined): string {
  return geminiTextModels.includes(model as (typeof geminiTextModels)[number])
    ? (model as string)
    : defaultAiSettings.geminiModel;
}
