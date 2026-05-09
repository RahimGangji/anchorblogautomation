import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { RemoveConnectionForm } from "@/components/RemoveConnectionForm";
import { ShopifyForm } from "@/components/ShopifyForm";
import { WordPressForm } from "@/components/WordPressForm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ShopifyConnectionDocument, WordPressConnectionDocument } from "@/lib/types";

export default async function ConnectPage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnection, shopifyConnection] = await Promise.all([
    db
      .collection<WordPressConnectionDocument>("wordpressConnections")
      .findOne({ userId, status: "connected" }),
    db
      .collection<ShopifyConnectionDocument>("shopifyConnections")
      .findOne({ userId, status: "connected" }),
  ]);
  const activeProvider = wordpressConnection ? "WordPress" : shopifyConnection ? "Shopify" : "";

  return (
    <AppShell user={user}>
      <section className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Connect CMS</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Connect either WordPress or Shopify. Only one CMS can be active at a time.
        </p>

        {activeProvider ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-900">
              {activeProvider} is connected
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              {wordpressConnection
                ? `Drafts will be sent to ${wordpressConnection.siteUrl}.`
                : `Drafts will be sent to ${shopifyConnection?.shopDomain} blog "${shopifyConnection?.blogTitle}".`}
            </p>
            <div className="mt-4">
              <RemoveConnectionForm />
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-950">WordPress</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use a WordPress Application Password from Users / Profile. The app validates
                credentials with the WordPress REST API before saving.
              </p>
              <div className="mt-5">
                <WordPressForm />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-950">Shopify</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use a Shopify Admin API access token with content write access and a Blog ID.
                Articles are created unpublished.
              </p>
              <div className="mt-5">
                <ShopifyForm />
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
