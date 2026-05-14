"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowRight,
  BarChart3,
  Bold,
  CheckCircle2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Minus,
  ListPlus,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  generateContentAction,
  generateOutlineAction,
  publishDraftAction,
  refineContentAction,
  refineOutlineAction,
} from "@/app/actions";
import type { BlogOutline } from "@/lib/types";
import { analyzeYoastSeo } from "@/lib/yoastSeo";
import type { YoastIssue, YoastReport } from "@/lib/yoastSeo";

type Step = "brief" | "outline" | "content";

const emptyOutline: BlogOutline = {
  title: "",
  sections: [],
};

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32];
const defaultFontSize = 16;

const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { class: "rounded-lg" })];
  },
});

const FontSizeMark = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const size = element.style.fontSize;
          return size ? Number.parseInt(size, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.size) return {};
          return { style: `font-size: ${attributes.size}px` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[style*=font-size]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export function BlogWorkflow({
  hasConnection,
  connectedProvider,
}: {
  hasConnection: boolean;
  connectedProvider?: string;
}) {
  const [step, setStep] = useState<Step>("brief");
  const [keyword, setKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState("");
  const [seoEntities, setSeoEntities] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [outline, setOutline] = useState<BlogOutline>(emptyOutline);
  const [outlineInstruction, setOutlineInstruction] = useState("");
  const [contentInstruction, setContentInstruction] = useState("");
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [seoReport, setSeoReport] = useState<YoastReport | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit, ImageNode, FontSizeMark],
    content: contentHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[420px] rounded-b-lg border border-t-0 border-slate-200 bg-white px-4 py-4 text-sm leading-7 outline-none prose prose-slate max-w-none focus:border-slate-950 prose-img:my-6 prose-img:max-w-full",
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
        const result = await generateOutlineAction({
          keyword,
          secondaryKeywords,
          seoEntities,
          prompt,
        });
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
        setSlug(data.slug);
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
          slug,
          metaTitle,
          metaDescription,
          instruction: contentInstruction,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        setTitle(data.title);
        setSlug(data.slug);
        setContentHtml(data.contentHtml);
        setMetaTitle(data.metaTitle);
        setMetaDescription(data.metaDescription);
        setContentInstruction("");
        setNotice("Content revised.");
      },
    );
  }

  function publishDraft() {
    if (!runSeoAnalysis()) return;

    runAction(
      async () => {
        const result = await publishDraftAction({
          projectId,
          title,
          outline,
          contentHtml,
          slug,
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

  function runSeoAnalysis() {
    if (!keyword.trim()) {
      setError("Add a primary keyword before running the Yoast SEO check.");
      return null;
    }

    if (!contentHtml.trim() || contentHtml.trim() === "<p></p>") {
      setError("Generate or write content before running the Yoast SEO check.");
      return null;
    }

    const report = analyzeYoastSeo({
      contentHtml,
      primaryKeyword: keyword,
      metaDescription,
      metaTitle,
      slug,
      title,
    });
    setSeoReport(report);
    setError("");
    setNotice("Yoast SEO check updated.");
    return report;
  }

  function chooseImage() {
    imageInputRef.current?.click();
  }

  function insertImage(file: File | undefined) {
    if (!editor) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;

      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            src: reader.result,
            alt: file.name.replace(/\.[^.]+$/, ""),
            title: file.name.replace(/\.[^.]+$/, ""),
          },
        })
        .run();
    };
    reader.readAsDataURL(file);
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
                Give the AI a primary keyword, supporting SEO context, and direction. It will
                return a structured outline you can edit before content generation.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Primary keyword</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="blog automation for WordPress"
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Secondary keywords</span>
              <textarea
                value={secondaryKeywords}
                onChange={(event) => setSecondaryKeywords(event.target.value)}
                rows={3}
                placeholder="AI blog writer, WordPress content automation, SEO blog workflow"
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">SEO entities</span>
              <textarea
                value={seoEntities}
                onChange={(event) => setSeoEntities(event.target.value)}
                rows={3}
                placeholder="WordPress, CMS drafts, editorial calendar, meta description, internal links"
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
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
                <span className="text-sm font-medium text-slate-700">Slug</span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="wordpress-blog-slug"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Meta description</span>
              <textarea
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Post title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
              />
            </label>
            <RichTextToolbar editor={editor} onInsertImage={chooseImage} />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                insertImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <EditorContent editor={editor} />
            <YoastSeoPanel
              report={seoReport}
              onAnalyze={runSeoAnalysis}
              primaryKeyword={keyword}
            />
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

function RichTextToolbar({
  editor,
  onInsertImage,
}: {
  editor: Editor | null;
  onInsertImage: () => void;
}) {
  const disabled = !editor;
  const currentSize = getCurrentFontSize(editor);

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-slate-200 bg-slate-50 p-2">
      <ToolbarButton
        active={editor?.isActive("paragraph")}
        disabled={disabled}
        label="Paragraph"
        onClick={() => editor?.chain().focus().setParagraph().run()}
      >
        <Type size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 1 })}
        disabled={disabled}
        label="Heading 1"
        onClick={() => applyHeading(editor, 1)}
      >
        <Heading1 size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 2 })}
        disabled={disabled}
        label="Heading 2"
        onClick={() => applyHeading(editor, 2)}
      >
        <Heading2 size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 3 })}
        disabled={disabled}
        label="Heading 3"
        onClick={() => applyHeading(editor, 3)}
      >
        <Heading3 size={17} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        active={editor?.isActive("bold")}
        disabled={disabled}
        label="Bold"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("italic")}
        disabled={disabled}
        label="Italic"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic size={17} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        disabled={disabled}
        label="Decrease font size"
        onClick={() => changeFontSize(editor, -1)}
      >
        <Minus size={17} />
      </ToolbarButton>
      <span className="min-w-10 px-2 text-center text-xs font-semibold text-slate-600">
        {currentSize}px
      </span>
      <ToolbarButton
        disabled={disabled}
        label="Increase font size"
        onClick={() => changeFontSize(editor, 1)}
      >
        <Plus size={17} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        active={editor?.isActive("bulletList")}
        disabled={disabled}
        label="Bullet list"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("orderedList")}
        disabled={disabled}
        label="Numbered list"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("blockquote")}
        disabled={disabled}
        label="Quote"
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={17} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton disabled={disabled} label="Add image from device" onClick={onInsertImage}>
        <ImagePlus size={17} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        disabled={disabled || !editor?.can().undo()}
        label="Undo"
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 size={17} />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled || !editor?.can().redo()}
        label="Redo"
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 size={17} />
      </ToolbarButton>
    </div>
  );
}

function YoastSeoPanel({
  onAnalyze,
  primaryKeyword,
  report,
}: {
  onAnalyze: () => void;
  primaryKeyword: string;
  report: YoastReport | null;
}) {
  const hasBadIssues = Boolean(
    report?.seoIssues.some((issue) => issue.rating === "bad") ||
      report?.readabilityIssues.some((issue) => issue.rating === "bad"),
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="text-emerald-700" size={20} />
            <h2 className="text-base font-semibold text-slate-950">Yoast SEO check</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Checks this draft against the primary keyword:{" "}
            <span className="font-semibold text-slate-800">{primaryKeyword || "not set"}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <BarChart3 size={18} />
          Run SEO check
        </button>
      </div>

      {report ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <YoastScoreCard label="SEO" score={report.seoScore} />
            <YoastScoreCard label="Readability" score={report.readabilityScore} />
          </div>
          {hasBadIssues ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              Review the red items before drafting. You can still draft after checking, but these
              are the biggest issues Yoast found.
            </p>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
              No major Yoast issues found in the current analysis.
            </p>
          )}
          <YoastIssueList title="SEO analysis" issues={report.seoIssues} />
          <YoastIssueList title="Readability analysis" issues={report.readabilityIssues} />
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm leading-6 text-slate-600">
          Run the check before drafting to see keyword, metadata, link, image, and readability
          feedback.
        </p>
      )}
    </div>
  );
}

function YoastScoreCard({ label, score }: { label: string; score: number }) {
  const rating = score >= 70 ? "good" : score >= 50 ? "ok" : "bad";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${ratingClass(rating)}`} />
        <span className="text-2xl font-semibold text-slate-950">{score}</span>
        <span className="text-sm text-slate-600">/ 100</span>
      </div>
    </div>
  );
}

function YoastIssueList({ issues, title }: { issues: YoastIssue[]; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-2 space-y-2">
        {issues.map((issue) => (
          <div
            key={`${title}-${issue.id}`}
            className="flex gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6"
          >
            {issue.rating === "good" ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
            ) : issue.rating === "ok" ? (
              <Sparkles className="mt-0.5 shrink-0 text-amber-600" size={18} />
            ) : (
              <XCircle className="mt-0.5 shrink-0 text-rose-600" size={18} />
            )}
            <p className="text-slate-700">{issue.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ratingClass(rating: "good" | "ok" | "bad") {
  if (rating === "good") return "bg-emerald-500";
  if (rating === "ok") return "bg-amber-500";
  return "bg-rose-500";
}

function applyHeading(editor: Editor | null, level: 1 | 2 | 3) {
  if (!editor) return;

  const { from, to, empty } = editor.state.selection;
  const parentStart = editor.state.selection.$from.start();
  const parentEnd = editor.state.selection.$from.end();
  const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
  const isPartialSelection = !empty && selectedText && (from > parentStart || to < parentEnd);

  if (!isPartialSelection) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  editor
    .chain()
    .focus()
    .deleteSelection()
    .insertContent({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text: selectedText }],
    })
    .run();
}

function getCurrentFontSize(editor: Editor | null) {
  const size = editor?.getAttributes("fontSize").size;
  return typeof size === "number" ? size : defaultFontSize;
}

function changeFontSize(editor: Editor | null, direction: -1 | 1) {
  if (!editor) return;

  const currentSize = getCurrentFontSize(editor);
  const currentIndex = fontSizes.findIndex((size) => size >= currentSize);
  const fallbackIndex = fontSizes.indexOf(defaultFontSize);
  const baseIndex = currentIndex === -1 ? fallbackIndex : currentIndex;
  const nextIndex = Math.min(Math.max(baseIndex + direction, 0), fontSizes.length - 1);
  const nextSize = fontSizes[nextIndex] ?? defaultFontSize;

  editor.chain().focus().setMark("fontSize", { size: nextSize }).run();
}

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />;
}
