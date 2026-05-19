import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { requireUser } from "@/lib/auth";
import {
  defaultAiSettings,
  getAiSettings,
  normalizeClaudeModel,
  normalizeGeminiModel,
  normalizeGptModel,
} from "@/lib/aiSettings";

export default async function ApiKeysPage() {
  const user = await requireUser();
  const settings = await getAiSettings(new ObjectId(user.id));

  return (
    <AppShell user={user}>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">API Keys</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Add your own AI provider key and choose which model should generate outlines, content,
          revisions, SEO metadata, and slugs.
        </p>

        <div className="mt-6">
          <AiSettingsForm
            initial={{
              activeProvider: settings?.activeProvider ?? defaultAiSettings.activeProvider,
              gptModel: normalizeGptModel(settings?.gptModel),
              hasGptKey: Boolean(settings?.gptApiKey),
              claudeModel: normalizeClaudeModel(settings?.claudeModel),
              hasClaudeKey: Boolean(settings?.claudeApiKey),
              geminiModel: normalizeGeminiModel(settings?.geminiModel),
              hasGeminiKey: Boolean(settings?.geminiApiKey),
            }}
          />
        </div>
      </section>
    </AppShell>
  );
}
