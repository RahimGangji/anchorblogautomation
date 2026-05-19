"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, KeyRound, Save, Unplug } from "lucide-react";
import { disconnectAiProviderAction, saveAiSettingsAction } from "@/app/actions";
import { claudeTextModels, geminiTextModels, gptTextModels } from "@/lib/aiModels";
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
    models: gptTextModels.map((model) => [model, formatModelLabel(model)]),
    provider: "gpt",
    title: "GPT",
  },
  {
    apiKeyName: "claudeApiKey",
    hasKeyField: "hasClaudeKey",
    modelField: "claudeModel",
    modelName: "claudeModel",
    models: claudeTextModels.map((model) => [model, formatModelLabel(model)]),
    provider: "claude",
    title: "Claude",
  },
  {
    apiKeyName: "geminiApiKey",
    hasKeyField: "hasGeminiKey",
    modelField: "geminiModel",
    modelName: "geminiModel",
    models: geminiTextModels.map((model) => [model, formatModelLabel(model)]),
    provider: "gemini",
    title: "Gemini",
  },
];

export function AiSettingsForm({ initial }: AiSettingsFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(initial.activeProvider);
  const [disconnectProvider, setDisconnectProvider] = useState<(typeof providers)[number] | null>(null);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    saveAiSettingsAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok === true) {
      window.location.reload();
    }
  }, [state]);

  return (
    <div className="space-y-6">
      <ProviderConnectionStatus
        activeProvider={initial.activeProvider}
        initial={initial}
        onDisconnect={setDisconnectProvider}
      />

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

      {disconnectProvider ? (
        <DisconnectConfirmModal
          provider={disconnectProvider}
          onClose={() => setDisconnectProvider(null)}
        />
      ) : null}
    </div>
  );
}

function ProviderConnectionStatus({
  activeProvider,
  initial,
  onDisconnect,
}: {
  activeProvider: AiProvider;
  initial: AiSettingsFormProps["initial"];
  onDisconnect: (provider: (typeof providers)[number]) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {providers.map((item) => {
        const connected = initial[item.hasKeyField];
        const active = activeProvider === item.provider;

        return (
          <div key={item.provider} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">{item.title}</h2>
                  {active ? (
                    <span className="rounded-full bg-slate-950 px-2 py-0.5 text-xs font-semibold text-white">
                      Active
                    </span>
                  ) : null}
                </div>
                <p
                  className={`mt-2 flex items-center gap-2 text-sm font-medium ${
                    connected ? "text-emerald-700" : "text-slate-500"
                  }`}
                >
                  <CheckCircle2 size={16} />
                  {connected ? "API key connected" : "No API key connected"}
                </p>
              </div>

              {connected ? (
                <button
                  type="button"
                  onClick={() => onDisconnect(item)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Unplug size={16} />
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DisconnectConfirmModal({
  onClose,
  provider,
}: {
  onClose: () => void;
  provider: (typeof providers)[number];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Disconnect {provider.title} API key?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This removes the saved {provider.title} key from your account. You can connect it again
            anytime from this page.
          </p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <form action={disconnectAiProviderAction}>
            <input type="hidden" name="provider" value={provider.provider} />
            <ConfirmDisconnectButton />
          </form>
        </div>
      </div>
    </div>
  );
}

function ConfirmDisconnectButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50 sm:w-auto"
    >
      <Unplug size={16} />
      {pending ? "Disconnecting..." : "Disconnect"}
    </button>
  );
}

function formatModelLabel(model: string) {
  return model
    .split("-")
    .map((part) => {
      if (part === "gpt") return "GPT";
      if (part === "claude") return "Claude";
      if (part === "gemini") return "Gemini";
      if (/^\d{8}$/.test(part)) return part;
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(" ");
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
