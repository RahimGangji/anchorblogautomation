"use client";

import { useActionState } from "react";
import { KeyRound, Save } from "lucide-react";
import { saveAiSettingsAction } from "@/app/actions";
import type { ActionResult, AiProvider } from "@/lib/types";

type AiSettingsFormProps = {
  initial: {
    activeProvider: AiProvider;
    gptModel: string;
    hasGptKey: boolean;
    claudeModel: string;
    hasClaudeKey: boolean;
    geminiModel: string;
    hasGeminiKey: boolean;
  };
};

export function AiSettingsForm({ initial }: AiSettingsFormProps) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    saveAiSettingsAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <ProviderCard
          apiKeyName="gptApiKey"
          defaultModel={initial.gptModel}
          defaultProvider={initial.activeProvider}
          hasKey={initial.hasGptKey}
          models={[
            ["gpt-5.5", "GPT 5.5"],
            ["gpt-5.4", "GPT 5.4"],
          ]}
          provider="gpt"
          title="GPT"
        />
        <ProviderCard
          apiKeyName="claudeApiKey"
          defaultModel={initial.claudeModel}
          defaultProvider={initial.activeProvider}
          hasKey={initial.hasClaudeKey}
          models={[
            ["claude-sonnet-4.6", "Claude Sonnet 4.6"],
            ["claude-haiku-4.5", "Claude Haiku 4.5"],
            ["claude-opus-4.7", "Claude Opus 4.7"],
          ]}
          provider="claude"
          title="Claude"
        />
        <ProviderCard
          apiKeyName="geminiApiKey"
          defaultModel={initial.geminiModel}
          defaultProvider={initial.activeProvider}
          hasKey={initial.hasGeminiKey}
          models={[
            ["gemini-3.1", "Gemini 3.1"],
            ["gemini-3.0", "Gemini 3.0"],
          ]}
          provider="gemini"
          title="Gemini"
        />
      </div>

      {state?.ok === true ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          API settings saved. New outlines and content will use your selected provider.
        </p>
      ) : null}

      {state?.ok === false ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? <KeyRound className="animate-pulse" size={18} /> : <Save size={18} />}
        {pending ? "Saving..." : "Save API settings"}
      </button>
    </form>
  );
}

function ProviderCard({
  apiKeyName,
  defaultModel,
  defaultProvider,
  hasKey,
  models,
  provider,
  title,
}: {
  apiKeyName: string;
  defaultModel: string;
  defaultProvider: AiProvider;
  hasKey: boolean;
  models: Array<[string, string]>;
  provider: AiProvider;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <label className="flex items-center gap-3">
        <input
          type="radio"
          name="activeProvider"
          value={provider}
          defaultChecked={defaultProvider === provider}
          className="h-4 w-4 accent-slate-950"
        />
        <span className="text-lg font-semibold text-slate-950">{title}</span>
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">Model</span>
        <select
          name={`${provider}Model`}
          defaultValue={defaultModel}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
        >
          {models.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">API key</span>
        <input
          name={apiKeyName}
          type="password"
          placeholder={hasKey ? "Saved. Leave blank to keep existing key." : "Paste API key"}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {hasKey ? "A key is saved for this provider." : "No key saved yet."}
        </span>
      </label>
    </div>
  );
}
