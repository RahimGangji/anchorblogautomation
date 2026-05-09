"use client";

import { useActionState } from "react";
import { Unplug } from "lucide-react";
import { removeCmsConnectionAction } from "@/app/actions";
import type { ActionResult } from "@/lib/types";

export function RemoveConnectionForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    async () => removeCmsConnectionAction(),
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
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
        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
      >
        <Unplug size={18} aria-hidden />
        {pending ? "Removing..." : "Remove connection"}
      </button>
    </form>
  );
}
