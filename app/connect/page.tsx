import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { WordPressForm } from "@/components/WordPressForm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { WordPressConnectionDocument } from "@/lib/types";

export default async function ConnectPage() {
  const user = await requireUser();
  const db = await getDb();
  const connection = await db
    .collection<WordPressConnectionDocument>("wordpressConnections")
    .findOne({ userId: new ObjectId(user.id) });

  return (
    <AppShell user={user}>
      <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Connect WordPress</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Uses WordPress <strong>Application Passwords</strong> (built since WordPress 5.6). No JWT
          plugins or <span className="font-mono">wp-config.php</span> secrets needed. The server checks
          your credentials with <span className="font-mono">/wp-json/wp/v2/users/me</span> before saving.
        </p>
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-950">Steps in WordPress admin</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>
              <span className="font-medium">Site URL —</span> Same as <strong>Settings → General → WordPress
              Address</strong>, e.g. <span className="font-mono text-slate-800">https://yourdomain.com</span>{" "}
              (use HTTPS; no trailing slash required).
            </li>
            <li>
              <span className="font-medium">Username —</span> Your WordPress login username (shown under{" "}
              <strong>Users → Profile</strong>).
            </li>
            <li>
              <span className="font-medium">Application password —</span> In <strong>Users → Profile</strong>,
              open <strong>Application Passwords</strong>, type a label (e.g. AnchorBlog), click{" "}
              <strong>Add New Application Password</strong>, then copy the 24-character password WordPress shows once.
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-600">
            If Application Passwords are missing, your host may need SSL, or a security plugin may be
            blocking the REST API / Authorization header.
          </p>
        </div>
        <div className="mt-6">
          <WordPressForm
            initialSiteUrl={connection?.siteUrl}
            initialWpUsername={connection?.wpUsername}
          />
        </div>
      </section>
    </AppShell>
  );
}
