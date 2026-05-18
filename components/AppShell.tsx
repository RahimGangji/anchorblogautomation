"use client";

import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Menu, PenLine, PlugZap, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";

type AppShellProps = {
  user: {
    name: string;
    email: string;
  };
  children: ReactNode;
};

const navItems = [
  { href: "/create", label: "Create", icon: PenLine },
  { href: "/connect", label: "Connect", icon: PlugZap },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
];

export function AppShell({ user, children }: AppShellProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = (user.email.trim()[0] || user.name.trim()[0] || "U").toUpperCase();

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="min-w-0 shrink truncate text-base font-bold tracking-tight text-slate-950"
          >
            AnchorBlog Automation
          </Link>
          <nav className="hidden min-w-0 items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Icon size={17} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
            <div ref={menuRef} className="relative ml-2 border-l border-slate-200 pl-3">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((current) => !current)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-1.5 pr-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                  {initial}
                </span>
                <ChevronDown size={15} aria-hidden />
              </button>
              {isUserMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
                >
                  <div className="border-b border-slate-100 px-3 py-3">
                    <p className="text-sm font-semibold text-slate-950">{user.name}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      <LogOut size={17} aria-hidden />
                      Log out
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </nav>
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} aria-hidden />
          </button>
        </div>
      </header>
      {isMobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,88vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Menu</p>
                <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-3">
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Icon size={18} aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <form action={logoutAction} className="border-t border-slate-200 p-3">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                <LogOut size={18} aria-hidden />
                Log out
              </button>
            </form>
          </aside>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
