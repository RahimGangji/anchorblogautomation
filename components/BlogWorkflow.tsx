"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowRight,
  FileText,
  Heading2,
  ListPlus,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  generateContentAction,
  generateOutlineAction,
  publishDraftAction,
  refineContentAction,
  refineOutlineAction,
} from "@/app/actions";
import type { BlogOutline } from "@/lib/types";

type Step = "brief" | "outline" | "content";

const emptyOutline: BlogOutline = {
  title: "",
  sections: [],
};

export function BlogWorkflow({
  hasConnection,
  connectedProvider,
}: {
  hasConnection: boolean;
  connectedProvider?: string;
}) {
  const [step, setStep] = useState<Step>("brief");
  const [keyword, setKeyword] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [outline, setOutline] = useState<BlogOutline>(emptyOutline);
  const [outlineInstruction, setOutlineInstruction] = useState("");
  const [contentInstruction, setContentInstruction] = useState("");
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [StarterKit],
    content: contentHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[360px] rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm leading-7 outline-none prose prose-slate max-w-none focus:border-slate-950",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      setContentHtml(activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && contentHtml && editor.getHTML() !== contentHtml) {
      editor.commands.setContent(contentHtml);
    }
  }, [contentHtml, editor]);

  const canGenerateContent = useMemo(
    () => projectId && outline.title.trim() && outline.sections.length > 0,
    [outline, projectId],
  );

  function runAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await action();
        onSuccess(result);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
      }
    });
  }

  function generateOutline() {
    runAction(
      async () => {
        const result = await generateOutlineAction({ keyword, prompt });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setProjectId(data.projectId);
        setOutline(data.outline);
        setTitle(data.outline.title);
        setStep("outline");
        setNotice("Outline created. You can edit it manually or ask AI to revise it.");
      },
    );
  }

  function refineOutline() {
    runAction(
      async () => {
        const result = await refineOutlineAction({
          projectId,
          outline,
          instruction: outlineInstruction,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setOutline(data.outline);
        setTitle(data.outline.title);
        setOutlineInstruction("");
        setNotice("Outline revised.");
      },
    );
  }

  function generateContent() {
    runAction(
      async () => {
        const result = await generateContentAction({ projectId, outline });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setTitle(data.title);
        setContentHtml(data.contentHtml);
        setMetaTitle(data.metaTitle);
        setMetaDescription(data.metaDescription);
        setStep("content");
        setNotice("Content generated. Make edits or ask AI for revisions.");
      },
    );
  }

  function refineContent() {
    runAction(
      async () => {
        const result = await refineContentAction({
          projectId,
          outline,
          contentHtml,
          metaTitle,
          metaDescription,
          instruction: contentInstruction,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setTitle(data.title);
        setContentHtml(data.contentHtml);
        setMetaTitle(data.metaTitle);
        setMetaDescription(data.metaDescription);
        setContentInstruction("");
        setNotice("Content revised.");
      },
    );
  }

  function publishDraft() {
    runAction(
      async () => {
        const result = await publishDraftAction({
          projectId,
          title,
          outline,
          contentHtml,
          metaTitle,
          metaDescription,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setNotice(
          data.draftLink
            ? `Draft created in ${connectedProvider || data.provider}: ${data.draftLink}`
            : `Draft created in ${connectedProvider || data.provider} with ID ${data.draftId}.`,
        );
      },
    );
  }

  function updateSection(index: number, patch: Partial<BlogOutline["sections"][number]>) {
    setOutline((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <StepButton active={step === "brief"} icon={<Sparkles size={18} />} label="Brief" />
        <StepButton active={step === "outline"} icon={<ListPlus size={18} />} label="Outline" />
        <StepButton active={step === "content"} icon={<FileText size={18} />} label="Content" />
        {!hasConnection ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Connect WordPress or Shopify before publishing a draft.
          </p>
        ) : null}
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {notice ? (
          <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {step === "brief" ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">Create a blog brief</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Give the AI a keyword and direction. It will return a structured outline you can
                edit before content generation.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Keyword</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="blog automation for WordPress"
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                placeholder="Write for small business owners who want to publish SEO blogs faster."
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <button
              type="button"
              onClick={generateOutline}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              {isPending ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              Generate outline
            </button>
          </div>
        ) : null}

        {step === "outline" ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">Edit outline</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Adjust the structure manually or ask AI to revise specific parts.
                </p>
              </div>
              <button
                type="button"
                onClick={generateContent}
                disabled={isPending || !canGenerateContent}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
              >
                <ArrowRight size={18} />
                Next
              </button>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Title</span>
              <input
                value={outline.title}
                onChange={(event) =>
                  setOutline((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>

            <div className="space-y-4">
              {outline.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex gap-3">
                    <Heading2 className="mt-3 shrink-0 text-slate-400" size={18} />
                    <input
                      value={section.heading}
                      onChange={(event) =>
                        updateSection(sectionIndex, { heading: event.target.value })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOutline((current) => ({
                          ...current,
                          sections: current.sections.filter((_, index) => index !== sectionIndex),
                        }))
                      }
                      className="rounded-lg px-3 text-slate-500 hover:bg-slate-100"
                      title="Remove section"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <textarea
                    value={section.bullets.join("\n")}
                    onChange={(event) =>
                      updateSection(sectionIndex, {
                        bullets: event.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={4}
                    className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-950"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setOutline((current) => ({
                  ...current,
                  sections: [...current.sections, { heading: "New section", bullets: ["Key point"] }],
                }))
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ListPlus size={18} />
              Add section
            </button>

            <div className="rounded-lg bg-slate-50 p-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Ask AI to revise outline</span>
                <textarea
                  value={outlineInstruction}
                  onChange={(event) => setOutlineInstruction(event.target.value)}
                  rows={3}
                  placeholder="Add a comparison section and make the conclusion more actionable."
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <button
                type="button"
                onClick={refineOutline}
                disabled={isPending || !outlineInstruction.trim()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
              >
                {isPending ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                Revise outline
              </button>
            </div>
          </div>
        ) : null}

        {step === "content" ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">Edit content</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Polish the article, tune metadata, then create a draft in your connected CMS.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Post title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <EditorContent editor={editor} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Meta title</span>
                <input
                  value={metaTitle}
                  onChange={(event) => setMetaTitle(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Meta description</span>
                <textarea
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Ask AI to revise content</span>
                <textarea
                  value={contentInstruction}
                  onChange={(event) => setContentInstruction(event.target.value)}
                  rows={3}
                  placeholder="Make the intro shorter and add more practical examples."
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <button
                type="button"
                onClick={refineContent}
                disabled={isPending || !contentInstruction.trim()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
              >
                {isPending ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                Revise content
              </button>
            </div>
            <button
              type="button"
              onClick={publishDraft}
              disabled={isPending || !hasConnection}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-400"
            >
              {isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Draft to {connectedProvider || "CMS"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StepButton({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {icon}
      {label}
    </div>
  );
}
