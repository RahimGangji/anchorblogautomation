"use client";

import { useState } from "react";
import { Store, Wrench } from "lucide-react";
import { RemoveConnectionForm } from "@/components/RemoveConnectionForm";
import { ShopifyForm } from "@/components/ShopifyForm";
import { WordPressForm } from "@/components/WordPressForm";

export type CmsConnectionSummary = {
  id: string;
  provider: "wordpress" | "shopify";
  title: string;
  detail: string;
  websiteContext?: string;
};

type CmsConnectionSwitcherProps = {
  connections: CmsConnectionSummary[];
};

export function CmsConnectionSwitcher({ connections }: CmsConnectionSwitcherProps) {
  const [provider, setProvider] = useState<"wordpress" | "shopify">("wordpress");
  const limitReached = connections.length >= 3;

  return (
    <div className="mt-6 space-y-6">
      {connections.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Connected projects
            </h2>
            <span className="text-xs font-semibold text-slate-500">
              {connections.length}/3 connected
            </span>
          </div>
          <div className="grid gap-3">
            {connections.map((connection) => (
              <article
                key={`${connection.provider}-${connection.id}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-bold uppercase text-slate-700">
                        {connection.provider === "wordpress" ? (
                          <Wrench size={13} aria-hidden />
                        ) : (
                          <Store size={13} aria-hidden />
                        )}
                        {connection.provider}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {connection.title}
                      </h3>
                    </div>
                    <p className="mt-2 break-words text-sm text-slate-600">{connection.detail}</p>
                    {connection.websiteContext ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {connection.websiteContext}
                      </p>
                    ) : null}
                  </div>
                  <RemoveConnectionForm
                    provider={connection.provider}
                    connectionId={connection.id}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 p-5">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 has-[:checked]:border-slate-950 has-[:checked]:bg-slate-950 has-[:checked]:text-white">
            <input
              type="radio"
              name="cmsProvider"
              value="wordpress"
              checked={provider === "wordpress"}
              onChange={() => setProvider("wordpress")}
              className="sr-only"
            />
            WordPress
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 has-[:checked]:border-slate-950 has-[:checked]:bg-slate-950 has-[:checked]:text-white">
            <input
              type="radio"
              name="cmsProvider"
              value="shopify"
              checked={provider === "shopify"}
              onChange={() => setProvider("shopify")}
              className="sr-only"
            />
            Shopify
          </label>
        </div>

        {limitReached ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can connect up to 3 CMS projects. Remove one before adding another.
          </p>
        ) : null}

        <div className="mt-5">
          {provider === "wordpress" ? (
            <div>
              <h2 className="text-lg font-semibold text-slate-950">WordPress</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use a WordPress Application Password from Users / Profile. The app validates
                credentials with the WordPress REST API before saving.
              </p>
              <div className="mt-5">
                <WordPressForm disabled={limitReached} />
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Shopify</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use a Shopify Admin API access token with content write access and a Blog ID.
                Articles are created unpublished.
              </p>
              <div className="mt-5">
                <ShopifyForm disabled={limitReached} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
