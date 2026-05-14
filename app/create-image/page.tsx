import { ObjectId } from "mongodb";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CreateImageForm } from "@/components/CreateImageForm";
import { requireUser } from "@/lib/auth";
import { getActiveAiSettings, getAiSettings } from "@/lib/aiSettings";

export default async function CreateImagePage() {
  const user = await requireUser();
  const settings = getActiveAiSettings(await getAiSettings(new ObjectId(user.id)));
  const canGenerate = Boolean(settings && settings.provider !== "claude");

  return (
    <AppShell user={user}>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Create Image</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Generate a downloadable image from a prompt using your active saved AI API key.
            </p>
          </div>
          <Link
            href="/api-keys"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Manage API keys
          </Link>
        </div>

        {settings?.provider === "claude" ? (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Claude is selected, but Claude does not support prompt-to-image generation through its
            API. Select GPT or Gemini in API Keys to create images.
          </p>
        ) : null}

        <div className="mt-6">
          <CreateImageForm
            activeModel={settings?.model ?? ""}
            activeProvider={settings ? settings.provider.toUpperCase() : "None"}
            canGenerate={canGenerate}
          />
        </div>
      </section>
    </AppShell>
  );
}
