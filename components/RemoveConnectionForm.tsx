"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { removeCmsConnectionAction } from "@/app/actions";
import type { ActionResult } from "@/lib/types";

type RemoveConnectionFormProps = {
  provider?: "wordpress" | "shopify";
  connectionId?: string;
};

export function RemoveConnectionForm({ provider, connectionId }: RemoveConnectionFormProps) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    async (_state, formData) => removeCmsConnectionAction(formData),
    undefined,
  );

  return (
    <form action={action} className="space-y-3 sm:flex sm:flex-col sm:items-end">
      {provider && connectionId ? (
        <>
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="connectionId" value={connectionId} />
        </>
      ) : null}
      {state?.ok === true ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Connection removed. Refresh this page to connect a new CMS.
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
        aria-label="Remove connection"
        title="Remove connection"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
      >
        {pending ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Trash2 size={18} aria-hidden />}
      </button>
    </form>
  );
}
