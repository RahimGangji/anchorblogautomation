"use client";

import { useActionState } from "react";
import { Cable } from "lucide-react";
import { saveShopifyConnectionAction } from "@/app/actions";
import type { ActionResult } from "@/lib/types";

type ShopifyFormProps = {
  initialShopDomain?: string;
  initialBlogId?: string;
  initialAuthorName?: string;
};

export function ShopifyForm({
  initialShopDomain = "",
  initialBlogId = "",
  initialAuthorName = "",
}: ShopifyFormProps) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    saveShopifyConnectionAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Shopify store domain</span>
        <input
          name="shopDomain"
          defaultValue={initialShopDomain}
          placeholder="your-store.myshopify.com"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          autoComplete="url"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Admin API access token</span>
        <input
          name="accessToken"
          type="password"
          placeholder="shpat_..."
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          autoComplete="new-password"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Blog ID</span>
        <input
          name="blogId"
          defaultValue={initialBlogId}
          placeholder="gid://shopify/Blog/123456789 or numeric ID"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Author name</span>
        <input
          name="authorName"
          defaultValue={initialAuthorName}
          placeholder="Rahim"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          autoComplete="name"
        />
      </label>

      {state?.ok === true ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Shopify connected successfully. Refresh this page to see the active connection.
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
        <Cable size={18} aria-hidden />
        {pending ? "Validating..." : "Connect Shopify"}
      </button>
    </form>
  );
}
