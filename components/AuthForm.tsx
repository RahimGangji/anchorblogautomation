"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import type { ActionResult } from "@/lib/types";
import { loginAction, signupAction } from "@/app/actions";

type AuthFormProps = {
  mode: "login" | "signup";
};

const initialState: ActionResult | undefined = undefined;

export function AuthForm({ mode }: AuthFormProps) {
  const action = mode === "signup" ? signupAction : loginAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === "signup";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-10 text-sm font-semibold text-slate-600">
        AnchorBlog Automation
      </Link>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-slate-950">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          {isSignup
            ? "Start building WordPress drafts with AI-assisted outlines and rich editing."
            : "Log in to continue your blog automation workflow."}
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-4">
        {isSignup ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              name="name"
              autoComplete="name"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
              required
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <div className="mt-2 flex rounded-lg border border-slate-200 bg-white transition focus-within:border-slate-950">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="w-full rounded-l-lg bg-transparent px-4 py-3 text-sm outline-none"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="inline-flex w-12 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {state?.ok === false ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "Please wait..." : isSignup ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        {isSignup ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-semibold text-slate-950 underline-offset-4 hover:underline"
        >
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
