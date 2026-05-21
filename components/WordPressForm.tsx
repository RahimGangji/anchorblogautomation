"use client";

import { useActionState } from "react";
import { Cable } from "lucide-react";
import { saveWordPressConnectionAction } from "@/app/actions";
import type { ActionResult } from "@/lib/types";

type WordPressFormProps = {
  initialSiteUrl?: string;
  initialWpUsername?: string;
  initialWebsiteContext?: string;
  disabled?: boolean;
};

export function WordPressForm({
  initialSiteUrl = "",
  initialWpUsername = "",
  initialWebsiteContext = "",
  disabled = false,
}: WordPressFormProps) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    saveWordPressConnectionAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">WordPress site URL</span>
        <input
          name="siteUrl"
          defaultValue={initialSiteUrl}
          placeholder="https://example.com"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          disabled={disabled}
          autoComplete="url"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Website context for AI</span>
        <textarea
          name="websiteContext"
          defaultValue={initialWebsiteContext}
          rows={4}
          placeholder="Describe the website, audience, services, tone, location, and anything AI should know before writing."
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-950"
          disabled={disabled}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">WordPress username</span>
        <input
          name="wpUsername"
          defaultValue={initialWpUsername}
          placeholder="your-login-name"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          disabled={disabled}
          autoComplete="username"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Application password</span>
        <input
          name="wpApplicationPassword"
          type="password"
          placeholder="Paste the 24-character app password from WordPress"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
          required
          disabled={disabled}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          Use the password WordPress generates under Application Passwords (24 characters, often shown in
          groups). Do not paste your normal WordPress admin login password here—that will always return
          HTTP 401.
        </span>
      </label>

      {state?.ok === true ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          WordPress connected successfully. Refresh this page to see the active connection.
        </p>
      ) : null}

      {state?.ok === false ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        <Cable size={18} aria-hidden />
        {pending ? "Validating..." : disabled ? "Project limit reached" : "Connect WordPress"}
      </button>
    </form>
  );
}
