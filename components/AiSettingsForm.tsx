"use client";

import { useActionState, useState } from "react";
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

const providers: Array<{
  apiKeyName: string;
  hasKeyField: "hasGptKey" | "hasClaudeKey" | "hasGeminiKey";
  modelField: "gptModel" | "claudeModel" | "geminiModel";
  modelName: string;
  models: Array<[string, string]>;
  provider: AiProvider;
  title: string;
}> = [
  {
    apiKeyName: "gptApiKey",
    hasKeyField: "hasGptKey",
    modelField: "gptModel",
    modelName: "gptModel",
    models: [
      ["gpt-5.5", "GPT 5.5"],
      ["gpt-5.4", "GPT 5.4"],
    ],
    provider: "gpt",
    title: "GPT",
  },
  {
    apiKeyName: "claudeApiKey",
    hasKeyField: "hasClaudeKey",
    modelField: "claudeModel",
    modelName: "claudeModel",
    models: [
      ["claude-sonnet-4.6", "Claude Sonnet 4.6"],
      ["claude-haiku-4.5", "Claude Haiku 4.5"],
      ["claude-opus-4.7", "Claude Opus 4.7"],
    ],
    provider: "claude",
    title: "Claude",
  },
  {
    apiKeyName: "geminiApiKey",
    hasKeyField: "hasGeminiKey",
    modelField: "geminiModel",
    modelName: "geminiModel",
    models: [
      ["gemini-3.1", "Gemini 3.1"],
      ["gemini-3.0", "Gemini 3.0"],
    ],
    provider: "gemini",
    title: "Gemini",
  },
];

export function AiSettingsForm({ initial }: AiSettingsFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(initial.activeProvider);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    saveAiSettingsAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {providers.map((item) => (
          <label
            key={item.provider}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
              selectedProvider === item.provider
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="activeProvider"
              value={item.provider}
              checked={selectedProvider === item.provider}
              onChange={() => setSelectedProvider(item.provider)}
              className="h-4 w-4 accent-slate-950"
            />
            <span className="text-sm font-semibold">{item.title}</span>
          </label>
        ))}
      </div>

      {providers.map((item) =>
        item.provider === selectedProvider ? (
          <ProviderFields
            key={item.provider}
            apiKeyName={item.apiKeyName}
            defaultModel={initial[item.modelField]}
            hasKey={initial[item.hasKeyField]}
            modelName={item.modelName}
            models={item.models}
            title={item.title}
          />
        ) : (
          <input
            key={item.provider}
            type="hidden"
            name={item.modelName}
            value={initial[item.modelField]}
          />
        ),
      )}

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

function ProviderFields({
  apiKeyName,
  defaultModel,
  hasKey,
  modelName,
  models,
  title,
}: {
  apiKeyName: string;
  defaultModel: string;
  hasKey: boolean;
  modelName: string;
  models: Array<[string, string]>;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title} settings</h2>
      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">Model</span>
        <select
          name={modelName}
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
