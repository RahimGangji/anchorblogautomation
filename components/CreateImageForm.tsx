"use client";

import { useActionState } from "react";
import Image from "next/image";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { generateImageAction } from "@/app/actions";
import type { ActionResult } from "@/lib/types";
import type { GeneratedImage } from "@/lib/imageAi";

type CreateImageFormProps = {
  activeModel: string;
  activeProvider: string;
  canGenerate: boolean;
};

export function CreateImageForm({
  activeModel,
  activeProvider,
  canGenerate,
}: CreateImageFormProps) {
  const [state, action, pending] = useActionState<
    ActionResult<GeneratedImage> | undefined,
    FormData
  >(generateImageAction, undefined);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Image prompt</span>
          <textarea
            name="prompt"
            rows={7}
            placeholder="Create a realistic featured image for a blog post about AI workflow automation in small businesses."
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-950"
            required
          />
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
          Active image provider: <span className="font-semibold">{activeProvider}</span>
          {activeModel ? <span> / {activeModel}</span> : null}
        </div>

        {!canGenerate ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Image creation only works after you save your own GPT or Gemini API key and select it
            as the active provider.
          </p>
        ) : null}

        {state?.ok === false ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !canGenerate}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
          {pending ? "Creating..." : "Create image"}
        </button>
      </form>

      {state?.ok === true ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Generated image</p>
              <p className="mt-1 text-sm text-slate-600">
                Created with {state.data.provider} / {state.data.model}
              </p>
            </div>
            <a
              href={state.data.dataUrl}
              download={`anchorblog-image.${state.data.mimeType.includes("jpeg") ? "jpg" : "png"}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              <Download size={18} />
              Download
            </a>
          </div>
          <Image
            src={state.data.dataUrl}
            alt="Generated result"
            width={1024}
            height={1024}
            unoptimized
            className="mt-4 w-full rounded-lg border border-slate-200"
          />
        </div>
      ) : null}
    </div>
  );
}
