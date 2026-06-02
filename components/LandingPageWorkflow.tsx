"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Code2,
  ChevronDown,
  Eye,
  FileUp,
  Loader2,
  MonitorSmartphone,
  ExternalLink,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  generateLandingPageAction,
  publishLandingPageDraftAction,
  refineLandingPageAction,
  saveLandingPageChangesAction,
} from "@/app/actions";

type WordPressConnectionOption = {
  id: string;
  label: string;
  websiteContext?: string;
};

type InitialLandingPageProject = {
  projectId: string;
  wordpressConnectionId: string;
  title: string;
  intent: string;
  prompt: string;
  designInspiration?: string;
  html: string;
  css: string;
  slug: string;
  notes?: string;
  screenshotUsed: boolean;
  status: "content" | "drafted";
};

type ScreenshotInput = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

const maxScreenshotBytes = 1_000_000;

export function LandingPageWorkflow({
  connections,
  initialProject,
}: {
  connections: WordPressConnectionOption[];
  initialProject?: InitialLandingPageProject | null;
}) {
  const [wordpressConnectionId, setWordpressConnectionId] = useState(
    initialProject?.wordpressConnectionId ?? connections[0]?.id ?? "",
  );
  const [projectId, setProjectId] = useState(initialProject?.projectId ?? "");
  const [title, setTitle] = useState(initialProject?.title ?? "");
  const [intent, setIntent] = useState(initialProject?.intent ?? "");
  const [prompt, setPrompt] = useState(initialProject?.prompt ?? "");
  const [designInspiration, setDesignInspiration] = useState(
    initialProject?.designInspiration ?? "",
  );
  const [screenshot, setScreenshot] = useState<ScreenshotInput | null>(null);
  const [refineScreenshot, setRefineScreenshot] = useState<ScreenshotInput | null>(null);
  const [html, setHtml] = useState(initialProject?.html ?? "");
  const [css, setCss] = useState(initialProject?.css ?? "");
  const [slug, setSlug] = useState(initialProject?.slug ?? "");
  const [notes, setNotes] = useState(initialProject?.notes ?? "");
  const [screenshotUsed, setScreenshotUsed] = useState(initialProject?.screenshotUsed ?? false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isConnectionDropdownOpen, setIsConnectionDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const refineScreenshotInputRef = useRef<HTMLInputElement>(null);
  const connectionDropdownRef = useRef<HTMLDivElement>(null);

  const selectedConnection = connections.find((connection) => connection.id === wordpressConnectionId);
  const hasGeneratedPage = Boolean(projectId && html.trim() && css.trim());
  const previewDocument = useMemo(
    () => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; min-height: 100%; background: #fff; }
    ${scopeLandingCssForPreview(css)}
  </style>
</head>
<body>${html}</body>
</html>`,
    [css, html],
  );

  useEffect(() => {
    function closeConnectionDropdown(event: MouseEvent) {
      if (!connectionDropdownRef.current?.contains(event.target as Node)) {
        setIsConnectionDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", closeConnectionDropdown);
    return () => document.removeEventListener("mousedown", closeConnectionDropdown);
  }, []);

  useEffect(() => {
    if (!hasGeneratedPage) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(
      new Blob([previewDocument], { type: "text/html;charset=utf-8" }),
    );
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [hasGeneratedPage, previewDocument]);

  function runAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        onSuccess(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function generateLandingPage() {
    runAction(
      async () => {
        const result = await generateLandingPageAction({
          wordpressConnectionId,
          title,
          intent,
          prompt,
          designInspiration,
          screenshot,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (page) => {
        setProjectId(page.projectId);
        setTitle(page.title);
        setSlug(page.slug);
        setHtml(page.html);
        setCss(page.css);
        setNotes(page.notes);
        setScreenshotUsed(page.screenshotUsed);
        toast.success("Landing page generated.");
      },
    );
  }

  function refineLandingPage() {
    runAction(
      async () => {
        const result = await refineLandingPageAction({
          projectId,
          title,
          intent,
          prompt,
          designInspiration,
          screenshot: refineScreenshot,
          html,
          css,
          slug,
          instruction: refineInstruction,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (page) => {
        setTitle(page.title);
        setSlug(page.slug);
        setHtml(page.html);
        setCss(page.css);
        setNotes(page.notes);
        setScreenshotUsed(page.screenshotUsed);
        if (refineScreenshot) {
          setScreenshot(refineScreenshot);
          setRefineScreenshot(null);
        }
        setRefineInstruction("");
        toast.success("Landing page refined.");
      },
    );
  }

  function saveChanges() {
    runAction(
      async () => {
        const result = await saveLandingPageChangesAction({
          projectId,
          title,
          intent,
          prompt,
          designInspiration,
          html,
          css,
          slug,
          notes,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      () => toast.success("Landing page saved."),
    );
  }

  function publishDraft() {
    runAction(
      async () => {
        const result = await publishLandingPageDraftAction({
          projectId,
          title,
          html,
          css,
          slug,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (draft) => {
        toast.success(
          draft.draftLink
            ? `WordPress page draft created: ${draft.draftLink}`
            : `WordPress page draft created with ID ${draft.draftId}.`,
        );
      },
    );
  }

  async function handleScreenshot(
    file: File | undefined,
    onReady: (screenshot: ScreenshotInput) => void,
  ) {
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpe?g|webp)$/i)) {
      toast.error("Choose a PNG, JPG, or WebP screenshot.");
      return;
    }

    try {
      const dataUrl = await imageFileToDataUrl(file);
      onReady({
        dataUrl,
        fileName: file.name,
        mimeType: file.type || "image/png",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read screenshot.");
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      {connections.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          Connect a WordPress project before creating a landing page draft.
        </p>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="-mx-4 -mt-4 border-b border-slate-800 bg-slate-950 px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                Landing page
              </p>
              <h1 className="mt-2 text-2xl font-bold">Create a landing page</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Generate a WordPress-ready page from your prompt, intent, and design inspiration.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-300 sm:w-72">
              <span className="rounded-md bg-white/10 px-2 py-2">Brief</span>
              <span className="rounded-md bg-white/10 px-2 py-2">Preview</span>
              <span className="rounded-md bg-white/10 px-2 py-2">Draft</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">
              WordPress project <span className="ml-1 text-red-600">*</span>
            </span>
            <div ref={connectionDropdownRef} className="relative mt-2 w-full max-w-xl sm:w-[32rem]">
              <button
                type="button"
                onClick={() => {
                  if (!initialProject) {
                    setIsConnectionDropdownOpen((current) => !current);
                  }
                }}
                disabled={Boolean(initialProject)}
                aria-haspopup="listbox"
                aria-expanded={isConnectionDropdownOpen}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 outline-none transition hover:bg-white focus:border-slate-950 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <span className="min-w-0 truncate">
                  {selectedConnection?.label || "Choose where this landing page will be drafted"}
                </span>
                <ChevronDown
                  size={17}
                  aria-hidden
                  className={`shrink-0 text-slate-500 transition ${isConnectionDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isConnectionDropdownOpen ? (
                <div
                  role="listbox"
                  className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
                >
                  {connections.length > 0 ? (
                    connections.map((connection) => {
                      const isSelected = connection.id === wordpressConnectionId;

                      return (
                        <button
                          key={connection.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setWordpressConnectionId(connection.id);
                            setIsConnectionDropdownOpen(false);
                          }}
                          className={`flex w-full rounded-md px-3 py-2.5 text-left transition ${
                            isSelected
                              ? "bg-slate-950 text-white"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="truncate text-sm font-semibold">{connection.label}</span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-500">
                      Connect a WordPress project first.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            {selectedConnection?.websiteContext ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                AI will use this website context: {selectedConnection.websiteContext}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Page title <span className="ml-1 text-red-600">*</span>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="AI SEO Audit Landing Page"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-950 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Intent <span className="ml-1 text-red-600">*</span>
            </span>
            <input
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Convert visitors into booked demo calls"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-950 focus:bg-white"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">
              Prompt <span className="ml-1 text-red-600">*</span>
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              placeholder="Describe the page sections, offer, audience, CTA, tone, and any must-have content."
              className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-950 focus:bg-white"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Design inspiration</span>
            <textarea
              value={designInspiration}
              onChange={(event) => setDesignInspiration(event.target.value)}
              rows={3}
              placeholder="Paste a design URL or describe the layout, colors, typography, and style direction."
              className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-950 focus:bg-white"
            />
          </label>

          <div className="md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Screenshot inspiration</span>
            <div className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {screenshot ? screenshot.fileName : "Upload an optional screenshot"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  PNG, JPG, or WebP. The app compresses large images before sending them to AI.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => screenshotInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileUp size={17} />
                  Upload
                </button>
                {screenshot ? (
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="inline-flex items-center justify-center rounded-lg px-3 text-red-600 hover:bg-red-50"
                    title="Remove screenshot"
                  >
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </div>
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  handleScreenshot(event.target.files?.[0], setScreenshot);
                  event.target.value = "";
                }}
              />
            </div>
            {screenshot?.dataUrl ? (
              <img
                src={screenshot.dataUrl}
                alt="Landing page design inspiration screenshot"
                className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={generateLandingPage}
            disabled={isPending || !wordpressConnectionId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {isPending && !hasGeneratedPage ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {hasGeneratedPage ? "Generate new version" : "Generate landing page"}
          </button>
          {hasGeneratedPage ? (
            <button
              type="button"
              onClick={saveChanges}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
            >
              <Save size={18} />
              Save changes
            </button>
          ) : null}
        </div>
      </section>

      {hasGeneratedPage ? (
        <section className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <Eye size={19} />
                  Preview
                </h2>
                {!screenshotUsed && screenshot ? (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    Screenshot was saved but not used by the active AI provider.
                  </p>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold uppercase text-slate-700">
                <MonitorSmartphone size={14} />
                Responsive
              </span>
            </div>
            {previewUrl ? (
              <div className="mb-3 flex justify-end">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <ExternalLink size={16} />
                  Open full page
                </a>
              </div>
            ) : null}
            <iframe
              title="Landing page preview"
              srcDoc={previewDocument}
              sandbox=""
              className="h-[min(720px,72vh)] min-h-[480px] w-full rounded-lg border border-slate-200 bg-white"
            />
          </div>

          <aside className="min-w-0 self-start space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="block">
                <span className="text-sm font-bold text-slate-950">Slug</span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
              {notes ? <p className="mt-3 text-xs leading-5 text-slate-500">{notes}</p> : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Code2 size={19} />
                Edit code
              </h2>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-950">HTML</span>
                <textarea
                  value={html}
                  onChange={(event) => setHtml(event.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-5 text-slate-50 outline-none focus:border-slate-500"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-950">CSS</span>
                <textarea
                  value={css}
                  onChange={(event) => setCss(event.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-5 text-slate-50 outline-none focus:border-slate-500"
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="block">
                <span className="text-sm font-bold text-slate-950">Ask AI to refine</span>
                <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-slate-950">
                  <textarea
                    value={refineInstruction}
                    onChange={(event) => setRefineInstruction(event.target.value)}
                    rows={4}
                    placeholder="Make the hero more premium and add a stronger CTA section."
                    className="landing-refine-textarea block w-full resize-none border-0 bg-transparent px-4 py-3 pr-20 text-sm leading-6 outline-none"
                  />
                  <button
                    type="button"
                    onClick={refineLandingPage}
                    disabled={isPending || !refineInstruction.trim()}
                    className="absolute bottom-3 right-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300"
                    aria-label="Refine page"
                    title="Refine page"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </label>
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {refineScreenshot ? refineScreenshot.fileName : "Optional refine screenshot"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Add a new visual reference for this refinement.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => refineScreenshotInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <FileUp size={16} />
                      Upload
                    </button>
                    {refineScreenshot ? (
                      <button
                        type="button"
                        onClick={() => setRefineScreenshot(null)}
                        className="inline-flex items-center justify-center rounded-lg px-2 text-red-600 hover:bg-red-50"
                        title="Remove refine screenshot"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={refineScreenshotInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    handleScreenshot(event.target.files?.[0], setRefineScreenshot);
                    event.target.value = "";
                  }}
                />
                {refineScreenshot?.dataUrl ? (
                  <img
                    src={refineScreenshot.dataUrl}
                    alt="Landing page refine screenshot"
                    className="mt-3 max-h-44 rounded-lg border border-slate-200 object-contain"
                  />
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={publishDraft}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-emerald-300"
            >
              <Send size={18} />
              Draft as WordPress page
            </button>
          </aside>
        </section>
      ) : null}
    </div>
  );
}

async function imageFileToDataUrl(file: File) {
  const initialDataUrl = await readFileAsDataUrl(file);
  if (file.size <= maxScreenshotBytes) return initialDataUrl;

  const image = await loadImage(initialDataUrl);
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not compress screenshot.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.82);

  if (compressed.length > 1_600_000) {
    throw new Error("Screenshot is too large. Use a smaller screenshot.");
  }

  return compressed;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read screenshot."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read screenshot."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load screenshot."));
    image.src = src;
  });
}

function scopeLandingCssForPreview(css: string) {
  const cleaned = css
    .replace(/<style\b[^>]*>/gi, "")
    .replace(/<\/style>/gi, "")
    .trim();

  if (!cleaned) return "";

  return cleaned.replace(/(^|})\s*([^@{}][^{}]*)\{/g, (match, close: string, selectorGroup: string) => {
    const scopedSelectors = selectorGroup
      .split(",")
      .map((selector) => {
        const trimmed = selector.trim();
        if (!trimmed) return "";
        if (
          trimmed.startsWith(".anchor-landing-page") ||
          trimmed.startsWith("html") ||
          trimmed.startsWith("body") ||
          trimmed.startsWith("*")
        ) {
          return trimmed;
        }
        return `.anchor-landing-page ${trimmed}`;
      })
      .filter(Boolean)
      .join(", ");

    return `${close} ${scopedSelectors} {`;
  });
}
