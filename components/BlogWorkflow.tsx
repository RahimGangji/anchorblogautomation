"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import toast from "react-hot-toast";
import {
  ArrowRight,
  BarChart3,
  Bold,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImagePlus,
  Italic,
  Link2,
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
} from "lucide-react";
import {
  analyzeContentAction,
  generateBlogImageAction,
  generateContentAction,
  generateOutlineAction,
  publishDraftAction,
  refineContentAction,
  refineOutlineAction,
} from "@/app/actions";
import type { BlogOutline } from "@/lib/types";
import type { AiContentReport } from "@/lib/ai";
import type { GeneratedImage, ImageSize } from "@/lib/imageAi";

type Step = "brief" | "outline" | "content";
type LinkEditState = {
  from: number;
  to: number;
  keyword: string;
  href: string;
  mode?: "edit" | "insert";
};

const emptyOutline: BlogOutline = {
  title: "",
  sections: [],
};

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32];
const defaultFontSize = 16;

const LinkMark = Mark.create({
  name: "link",
  inclusive: false,

  addAttributes() {
    return {
      href: { default: null },
      target: { default: null },
      rel: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "a[href]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "internal-link",
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (!node.isText) return;

              const linkMark = node.marks.find((mark) => mark.type.name === this.name);
              const href = typeof linkMark?.attrs.href === "string" ? linkMark.attrs.href : "";
              if (!href) return;

              const from = pos;
              const to = pos + node.nodeSize;

              decorations.push(
                Decoration.widget(
                  to,
                  () => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "internal-link-edit-button";
                    button.title = "Edit internal link keyword";
                    button.setAttribute("aria-label", "Edit internal link keyword");
                    button.textContent = "\u270E";
                    button.addEventListener("click", (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent<LinkEditState>("anchorblog:edit-link", {
                          detail: {
                            from,
                            to,
                            href,
                            keyword: this.editor.state.doc.textBetween(from, to, " ").trim(),
                          },
                        }),
                      );
                    });
                    return button;
                  },
                  { key: `edit-link-${from}-${to}-${href}` },
                ),
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

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
  canGenerateImage,
  hasConnection,
  imageModel,
  imageProvider,
  connectedProvider,
}: {
  canGenerateImage: boolean;
  hasConnection: boolean;
  imageModel: string;
  imageProvider: string;
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
  const [aiReport, setAiReport] = useState<AiContentReport | null>(null);
  const [linkEdit, setLinkEdit] = useState<LinkEditState | null>(null);
  const [linkEditKeyword, setLinkEditKeyword] = useState("");
  const [linkEditHref, setLinkEditHref] = useState("");
  const [isImageCreatorOpen, setIsImageCreatorOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize>("1024x1024");
  const [imageSectionIndex, setImageSectionIndex] = useState(0);
  const [featuredImage, setFeaturedImage] = useState<{
    dataUrl: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const featuredImageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit, LinkMark, ImageNode, FontSizeMark],
    content: contentHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[420px] rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm leading-7 outline-none prose prose-slate max-w-none focus:border-slate-950 prose-img:my-6 prose-img:max-w-full",
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

  useEffect(() => {
    function openLinkEdit(event: Event) {
      const detail = (event as CustomEvent<LinkEditState>).detail;
      if (!detail) return;

      setLinkEdit(detail);
      setLinkEditKeyword(detail.keyword);
      setLinkEditHref(detail.href);
    }

    window.addEventListener("anchorblog:edit-link", openLinkEdit);
    return () => window.removeEventListener("anchorblog:edit-link", openLinkEdit);
  }, []);

  const canGenerateContent = useMemo(
    () => projectId && outline.title.trim() && outline.sections.length > 0,
    [outline, projectId],
  );

  function closeLinkEditModal() {
    setLinkEdit(null);
    setLinkEditKeyword("");
    setLinkEditHref("");
  }

  function saveLinkEdit() {
    if (!linkEdit) return;

    if (linkEdit.mode === "insert") {
      insertInternalLink(editor, {
        from: linkEdit.from,
        to: linkEdit.to,
        keyword: linkEditKeyword,
        href: linkEditHref,
      });
    } else {
      updateLinkKeyword(editor, {
        from: linkEdit.from,
        to: linkEdit.to,
        keyword: linkEditKeyword,
        href: linkEditHref,
      });
    }

    closeLinkEditModal();
  }

  function runAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        onSuccess(result);
      } catch (actionError) {
        toast.error(actionError instanceof Error ? actionError.message : "Something went wrong.");
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
        toast.success("Outline created. You can edit it manually or ask AI to revise it.");
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
        toast.success("Outline revised.");
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
        setAiReport(data.aiReport);
        setStep("content");
        toast.success("Content generated and AI SEO report completed.");
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
        setAiReport(data.aiReport);
        setContentInstruction("");
        toast.success("Content revised and AI SEO report updated.");
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
          slug,
          metaTitle,
          metaDescription,
          featuredImage,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (data) => {
        toast.success(
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

  function refreshAiReport() {
    runAction(
      async () => {
        const result = await analyzeContentAction({
          projectId,
          title,
          contentHtml,
          slug,
          metaTitle,
          metaDescription,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (report) => {
        setAiReport(report);
        toast.success("AI SEO report updated.");
      },
    );
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

  function chooseFeaturedImage() {
    featuredImageInputRef.current?.click();
  }

  function updateFeaturedImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file for the featured image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setFeaturedImage({
        dataUrl: reader.result,
        fileName: file.name,
        mimeType: file.type || "image/png",
      });
    };
    reader.readAsDataURL(file);
  }

  function createAndInsertImage() {
    const targetSection = outline.sections[imageSectionIndex];

    if (!targetSection) {
      toast.error("Choose a section where the image should be added.");
      return;
    }

    runAction(
      async () => {
        const result = await generateBlogImageAction({
          prompt: imagePrompt,
          size: imageSize,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      (image) => {
        insertGeneratedImageAfterSection(editor, image, targetSection.heading);
        setImagePrompt("");
        setIsImageCreatorOpen(false);
        toast.success("Image created and inserted into the content.");
      },
    );
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3">
        <StepButton active={step === "brief"} icon={<Sparkles size={18} />} label="Brief" />
        <StepButton active={step === "outline"} icon={<ListPlus size={18} />} label="Outline" />
        <StepButton active={step === "content"} icon={<FileText size={18} />} label="Content" />
        {!hasConnection ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Connect WordPress or Shopify before publishing a draft.
          </p>
        ) : null}
        {step === "content" ? (
          <AiSeoReportPanel
            report={aiReport}
            isPending={isPending}
            onRefresh={refreshAiReport}
          />
        ) : null}
      </aside>

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
            <RichTextToolbar
              editor={editor}
              onInsertImage={chooseImage}
              onInsertLink={(link) => {
                setLinkEdit({ ...link, href: "", mode: "insert" });
                setLinkEditKeyword(link.keyword);
                setLinkEditHref("");
              }}
            />
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
            <input
              ref={featuredImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                updateFeaturedImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950">Featured image</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Add the main image that appears as the blog post thumbnail or header image.
                  </p>
                  {featuredImage ? (
                    <p className="mt-2 break-words text-xs font-medium text-slate-500">
                      Selected: {featuredImage.fileName}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {featuredImage ? (
                    <button
                      type="button"
                      onClick={() => setFeaturedImage(null)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={chooseFeaturedImage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <ImagePlus size={18} />
                    {featuredImage ? "Change image" : "Add image"}
                  </button>
                </div>
              </div>
              {featuredImage ? (
                <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-lg">
                  <Image
                    src={featuredImage.dataUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 900px"
                  />
                </div>
              ) : null}
            </div>
            <EditorContent editor={editor} />
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
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Create blog image</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Generate an image with your active API provider and insert it after a section.
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Active image model: {imageProvider ? imageProvider.toUpperCase() : "None"}
                    {imageModel ? ` / ${imageModel}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImageCreatorOpen((current) => !current)}
                  disabled={isPending || !canGenerateImage}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
                >
                  <ImagePlus size={18} />
                  Create image
                </button>
              </div>

              {!canGenerateImage ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                  Select and save a GPT or Gemini API key in API Keys to create images.
                </p>
              ) : null}

              {isImageCreatorOpen ? (
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Image prompt</span>
                    <textarea
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      rows={4}
                      placeholder="Create a realistic blog image that visualizes the main idea of this section."
                      className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-950"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-sm font-medium text-slate-700">Image size</span>
                    <select
                      value={imageSize}
                      onChange={(event) => setImageSize(event.target.value as ImageSize)}
                      className="mt-2 w-full min-w-0 truncate rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-950"
                    >
                      <option value="1024x1024">Square 1024 x 1024</option>
                      <option value="1536x1024">Landscape 1536 x 1024</option>
                      <option value="1024x1536">Portrait 1024 x 1536</option>
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="text-sm font-medium text-slate-700">Add after section</span>
                    <select
                      value={imageSectionIndex}
                      onChange={(event) => setImageSectionIndex(Number(event.target.value))}
                      className="mt-2 w-full min-w-0 truncate rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-950"
                    >
                      {outline.sections.map((section, index) => (
                        <option key={`${section.heading}-${index}`} value={index}>
                          {section.heading}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
                    <button
                      type="button"
                      onClick={createAndInsertImage}
                      disabled={isPending || !imagePrompt.trim() || outline.sections.length === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-400"
                    >
                      {isPending ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
                      {isPending ? "Creating..." : "Create and insert image"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsImageCreatorOpen(false)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
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
      {linkEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {linkEdit.mode === "insert" ? "Add internal link" : "Edit internal link"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {linkEdit.mode === "insert"
                    ? "Add a linked keyword and internal link URL to the content."
                    : "Update the linked keyword and the internal link URL."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeLinkEditModal}
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Keyword</span>
                <input
                  value={linkEditKeyword}
                  onChange={(event) => setLinkEditKeyword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Internal link</span>
                <input
                  value={linkEditHref}
                  onChange={(event) => setLinkEditHref(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLinkEditModal}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveLinkEdit}
                disabled={!linkEditKeyword.trim() || !linkEditHref.trim()}
                className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
              >
                {linkEdit.mode === "insert" ? "Add link" : "Save link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  onInsertLink,
}: {
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertLink: (link: { from: number; to: number; keyword: string }) => void;
}) {
  const disabled = !editor;
  const currentSize = getCurrentFontSize(editor);

  return (
    <div className="mb-2 flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
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
      <ToolbarButton
        active={editor?.isActive("heading", { level: 4 })}
        disabled={disabled}
        label="Heading 4"
        onClick={() => applyHeading(editor, 4)}
      >
        <Heading4 size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 5 })}
        disabled={disabled}
        label="Heading 5"
        onClick={() => applyHeading(editor, 5)}
      >
        <Heading5 size={17} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 6 })}
        disabled={disabled}
        label="Heading 6"
        onClick={() => applyHeading(editor, 6)}
      >
        <Heading6 size={17} />
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
      <ToolbarButton
        active={editor?.isActive("link")}
        disabled={disabled}
        label="Add internal link"
        onClick={() => startInternalLinkInsert(editor, onInsertLink)}
      >
        <Link2 size={17} />
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

function AiSeoReportPanel({
  isPending,
  onRefresh,
  report,
}: {
  isPending: boolean;
  onRefresh: () => void;
  report: AiContentReport | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <BarChart3 className="text-emerald-700" size={19} />
        <h2 className="text-sm font-semibold text-slate-950">AI SEO report</h2>
      </div>
      {report ? (
        <div className="mt-4 space-y-4">
          <ScoreCard label="SEO" score={report.seoScore} />
          <ScoreCard label="Readability" score={report.readabilityScore} />
          <p className="text-sm leading-6 text-slate-600">{report.summary}</p>
          <IssueSummary
            label="SEO errors"
            count={report.seoAnalysis.filter((issue) => issue.severity === "error").length}
          />
          <IssueSummary
            label="Readability errors"
            count={report.readabilityAnalysis.filter((issue) => issue.severity === "error").length}
          />
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <ReportIssueList title="SEO issues" issues={report.seoAnalysis} />
            <ReportIssueList title="Readability issues" issues={report.readabilityAnalysis} />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            Update AI check
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm leading-6 text-slate-600">
          AI scores will appear here after content is generated.
        </p>
      )}
    </div>
  );
}

function ReportIssueList({
  issues,
  title,
}: {
  issues: AiContentReport["seoAnalysis"];
  title: string;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      {issues.length > 0 ? (
        <div className="mt-2 space-y-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.severity}-${issue.location}-${index}`}
              className={`min-w-0 rounded-lg border px-3 py-2 text-sm ${issueCardClass(issue.severity)}`}
            >
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <span className="font-semibold capitalize">{issue.severity}</span>
                <span className="min-w-0 break-words text-xs font-medium leading-5 text-slate-500 sm:text-right">
                  {issue.location}
                </span>
              </div>
              <p className="mt-2 break-words leading-5 text-slate-700">{issue.issue}</p>
              <p className="mt-2 break-words leading-5 text-slate-600">{issue.recommendation}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          No issues reported.
        </p>
      )}
    </section>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
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

function IssueSummary({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={count > 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
        {count}
      </span>
    </div>
  );
}

function ratingClass(rating: "good" | "ok" | "bad") {
  if (rating === "good") return "bg-emerald-500";
  if (rating === "ok") return "bg-amber-500";
  return "bg-rose-500";
}

function issueCardClass(severity: AiContentReport["seoAnalysis"][number]["severity"]) {
  if (severity === "error") return "border-rose-200 bg-rose-50";
  if (severity === "warning") return "border-amber-200 bg-amber-50";
  return "border-emerald-100 bg-emerald-50";
}

function applyHeading(editor: Editor | null, level: 1 | 2 | 3 | 4 | 5 | 6) {
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

function updateLinkKeyword(
  editor: Editor | null,
  {
    from,
    to,
    keyword,
    href,
  }: {
    from: number;
    to: number;
    keyword: string;
    href: string;
  },
) {
  if (!editor) return;

  const nextKeyword = keyword.trim();
  const nextHref = href.trim();
  if (!nextKeyword || !nextHref) return;

  editor
    .chain()
    .focus()
    .insertContentAt(
      { from, to },
      {
        type: "text",
        text: nextKeyword,
        marks: [
          {
            type: "link",
            attrs: { href: nextHref },
          },
        ],
      },
    )
    .run();
}

function startInternalLinkInsert(
  editor: Editor | null,
  onInsertLink: (link: { from: number; to: number; keyword: string }) => void,
) {
  if (!editor) return;

  const { from, to } = editor.state.selection;
  const keyword = editor.state.doc.textBetween(from, to, " ").trim();

  onInsertLink({ from, to, keyword });
}

function insertInternalLink(
  editor: Editor | null,
  {
    from,
    to,
    keyword,
    href,
  }: {
    from: number;
    to: number;
    keyword: string;
    href: string;
  },
) {
  if (!editor) return;

  const nextKeyword = keyword.trim();
  const nextHref = href.trim();
  if (!nextKeyword || !nextHref) return;

  editor
    .chain()
    .focus()
    .insertContentAt(
      { from, to },
      {
        type: "text",
        text: nextKeyword,
        marks: [
          {
            type: "link",
            attrs: { href: nextHref },
          },
        ],
      },
    )
    .run();
}

function insertGeneratedImageAfterSection(
  editor: Editor | null,
  image: GeneratedImage,
  sectionHeading: string,
) {
  if (!editor) return;

  const targetHeading = normalizeText(sectionHeading);
  let insertAt = editor.state.doc.content.size;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    if (normalizeText(node.textContent) !== targetHeading) return true;

    insertAt = pos + node.nodeSize;
    return false;
  });

  editor
    .chain()
    .focus()
    .insertContentAt(insertAt, [
      {
        type: "image",
        attrs: {
          src: image.dataUrl,
          alt: sectionHeading,
          title: sectionHeading,
        },
      },
      { type: "paragraph" },
    ])
    .run();
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
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
