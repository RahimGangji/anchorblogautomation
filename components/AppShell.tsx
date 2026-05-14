import Link from "next/link";
import { ImagePlus, KeyRound, LogOut, PenLine, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";

type AppShellProps = {
  user: {
    name: string;
    email: string;
  };
  children: ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-sm font-bold tracking-wide text-slate-950">
            AnchorBlog Automation
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/create"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <PenLine size={17} aria-hidden />
              Create
            </Link>
            <Link
              href="/connect"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <PlugZap size={17} aria-hidden />
              Connect
            </Link>
            <Link
              href="/api-keys"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <KeyRound size={17} aria-hidden />
              API Keys
            </Link>
            <Link
              href="/create-image"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ImagePlus size={17} aria-hidden />
              Create Image
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                title="Log out"
              >
                <LogOut size={17} aria-hidden />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-500">Signed in as</p>
          <p className="text-sm text-slate-700">
            {user.name} - {user.email}
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
