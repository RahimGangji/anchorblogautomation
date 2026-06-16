import Groq from "groq-sdk";
import type { z } from "zod";
import {
  aiContentReportSchema,
  contentSchema,
  landingPageContentSchema,
  outlineSchema,
} from "@/lib/validators";
import type { BlogOutline } from "@/lib/types";
import type { ActiveAiSettings } from "@/lib/aiSettings";

const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const defaultMaxOutputTokens = 4096;
const longFormMaxOutputTokens = 16000;
const landingPageMaxOutputTokens = 20000;

type CompleteOptions = {
  maxOutputTokens?: number;
};

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required.");
  }

  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("The AI response did not include JSON.");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

async function completeJson(
  system: string,
  user: string,
  settings?: ActiveAiSettings | null,
  options: CompleteOptions = {},
) {
  if (settings) {
    return extractJson(await completeWithUserProvider(system, user, settings, options));
  }

  const completion = await getGroqClient().chat.completions.create({
    model,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("The AI did not return content.");
  }

  return extractJson(content);
}

async function completeJsonWithOptionalImage(
  system: string,
  user: string,
  image: LandingPageImageInput | null | undefined,
  settings?: ActiveAiSettings | null,
  options: CompleteOptions = {},
) {
  if (!image || !settings || !providerSupportsImage(settings.provider)) {
    return {
      json: await completeJson(system, user, settings, options),
      imageUsed: false,
    };
  }

  const text =
    settings.provider === "gpt"
      ? await completeOpenAiWithImage(system, user, image, settings, options)
      : settings.provider === "claude"
        ? await completeClaudeWithImage(system, user, image, settings, options)
        : await completeGeminiWithImage(system, user, image, settings, options);

  return {
    json: extractJson(text),
    imageUsed: true,
  };
}

function providerSupportsImage(provider: ActiveAiSettings["provider"]) {
  return provider === "gpt" || provider === "claude" || provider === "gemini";
}

async function completeWithUserProvider(
  system: string,
  user: string,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  if (settings.provider === "gpt") {
    return await completeOpenAi(system, user, settings, options);
  }

  if (settings.provider === "claude") {
    return await completeClaude(system, user, settings, options);
  }

  return await completeGemini(system, user, settings, options);
}

async function completeOpenAiWithImage(
  system: string,
  user: string,
  image: LandingPageImageInput,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      instructions: system,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: user },
            { type: "input_image", image_url: image.dataUrl },
          ],
        },
      ],
      temperature: 0.6,
      max_output_tokens: options.maxOutputTokens,
      text: { format: { type: "json_object" } },
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("GPT", response.status, body));
  }

  return readOpenAiText(body);
}

async function completeOpenAi(
  system: string,
  user: string,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      instructions: system,
      input: user,
      temperature: 0.6,
      max_output_tokens: options.maxOutputTokens,
      text: { format: { type: "json_object" } },
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("GPT", response.status, body));
  }

  return readOpenAiText(body);
}

async function completeClaudeWithImage(
  system: string,
  user: string,
  image: LandingPageImageInput,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: options.maxOutputTokens ?? defaultMaxOutputTokens,
      temperature: 0.6,
      system: `${system}\nReturn only valid JSON. Do not include markdown fences.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.dataUrl.replace(/^data:[^;]+;base64,/, ""),
              },
            },
            { type: "text", text: user },
          ],
        },
      ],
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("Claude", response.status, body));
  }

  return readClaudeText(body);
}

async function completeGeminiWithImage(
  system: string,
  user: string,
  image: LandingPageImageInput,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${system}\nReturn only valid JSON. Do not include markdown fences.` }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: user },
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.dataUrl.replace(/^data:[^;]+;base64,/, ""),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: options.maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("Gemini", response.status, body));
  }

  return readGeminiText(body);
}

async function completeClaude(
  system: string,
  user: string,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: options.maxOutputTokens ?? defaultMaxOutputTokens,
      temperature: 0.6,
      system: `${system}\nReturn only valid JSON. Do not include markdown fences.`,
      messages: [{ role: "user", content: user }],
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("Claude", response.status, body));
  }

  return readClaudeText(body);
}

async function completeGemini(
  system: string,
  user: string,
  settings: ActiveAiSettings,
  options: CompleteOptions,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${system}\nReturn only valid JSON. Do not include markdown fences.` }],
        },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: options.maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("Gemini", response.status, body));
  }

  return readGeminiText(body);
}

function providerError(provider: string, status: number, body: unknown) {
  const message =
    readNestedString(body, ["error", "message"]) ||
    readNestedString(body, ["message"]) ||
    `${provider} returned HTTP ${status}.`;

  return `${provider} API error: ${message}`;
}

function readNestedString(value: unknown, path: string[]) {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : "";
}

function readOpenAiText(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const outputText = (body as { output_text?: unknown }).output_text;
    if (typeof outputText === "string" && outputText.trim()) return outputText;

    const output = (body as { output?: unknown }).output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const content = (item as { content?: unknown }).content;
        if (!Array.isArray(content)) continue;
        const text = content
          .map((part) =>
            part && typeof part === "object" && !Array.isArray(part)
              ? (part as { text?: unknown }).text
              : "",
          )
          .filter((part): part is string => typeof part === "string")
          .join("");
        if (text.trim()) return text;
      }
    }
  }

  throw new Error("GPT did not return text content.");
}

function readClaudeText(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const stopReason = (body as { stop_reason?: unknown }).stop_reason;
    if (stopReason === "max_tokens") {
      throw new Error(
        "Claude hit the output token limit before finishing. Try generating again or shorten the requested page/article detail.",
      );
    }

    const content = (body as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .map((part) =>
          part && typeof part === "object" && !Array.isArray(part)
            ? (part as { text?: unknown }).text
            : "",
        )
        .filter((part): part is string => typeof part === "string")
        .join("");
      if (text.trim()) return text;
    }
  }

  throw new Error("Claude did not return text content.");
}

function readGeminiText(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const candidates = (body as { candidates?: unknown }).candidates;
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const content = (candidate as { content?: unknown }).content;
        if (!content || typeof content !== "object" || Array.isArray(content)) continue;
        const parts = (content as { parts?: unknown }).parts;
        if (!Array.isArray(parts)) continue;
        const text = parts
          .map((part) =>
            part && typeof part === "object" && !Array.isArray(part)
              ? (part as { text?: unknown }).text
              : "",
          )
          .filter((part): part is string => typeof part === "string")
          .join("");
        if (text.trim()) return text;
      }
    }
  }

  throw new Error("Gemini did not return text content.");
}

function limitText(value: unknown, max: number) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function normalizeContentJson(json: unknown) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return json;
  }

  return {
    ...json,
    contentHtml: normalizeFaqFormatting(stripAnchorTags((json as { contentHtml?: unknown }).contentHtml)),
    slug: limitText((json as { slug?: unknown }).slug, 120),
    metaTitle: limitText((json as { metaTitle?: unknown }).metaTitle, 80),
    metaDescription: limitText((json as { metaDescription?: unknown }).metaDescription, 180),
  };
}

function stripAnchorTags(value: unknown) {
  if (typeof value !== "string") return value;

  return value
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "");
}

function normalizeFaqFormatting(value: unknown) {
  if (typeof value !== "string") return value;

  return value.replace(
    /(<(p|li)\b[^>]*>)([\s\S]*?)(\s+(?:A|Answer)\s*[:.-]\s*)([\s\S]*?)(<\/\2>)/gi,
    (match, openTag: string, tagName: string, questionHtml: string, answerLabel: string, answerHtml: string, closeTag: string) => {
      if (!looksLikeFaqQuestion(questionHtml)) return match;

      const question = questionHtml.trim();
      const answer = `${answerLabel.trim()} ${answerHtml.trim()}`;

      if (tagName.toLowerCase() === "li") {
        return `${openTag}${question}<br>${answer}${closeTag}`;
      }

      return `${openTag}${question}${closeTag}<p>${answer}</p>`;
    },
  );
}

function looksLikeFaqQuestion(value: string) {
  const plainText = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(q|question|faq)\s*(\d+)?\s*[:.)-]/i.test(plainText) || /\?$/.test(plainText);
}

type SeoBrief = {
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
  websiteContext?: string;
};

type LandingPageImageInput = {
  dataUrl: string;
  mimeType: string;
  fileName?: string;
};

type LandingPageBrief = {
  title: string;
  intent: string;
  prompt: string;
  designInspiration?: string;
  websiteContext?: string;
  screenshot?: LandingPageImageInput | null;
};

export type AiContentReport = z.infer<typeof aiContentReportSchema>;

function formatSeoBrief(brief: SeoBrief) {
  return `Blog brief:
Primary keyword: ${brief.keyword}
Secondary keywords: ${brief.secondaryKeywords?.trim() || "None provided"}
SEO entities: ${brief.seoEntities?.trim() || "None provided"}
Website context: ${brief.websiteContext?.trim() || "None provided"}
User instructions and desired angle: ${brief.prompt}`;
}

export async function createOutline(brief: SeoBrief, settings?: ActiveAiSettings | null) {
  const json = await completeJson(
    "You are a senior SEO strategist and blog editor. Create conversion-aware, search-intent-matched blog outlines that are practical, specific, and useful to readers. Return only valid JSON with title and sections. Each section must have a clear heading and bullets. Do not include markdown fences.",
    `${formatSeoBrief(brief)}

Create a high-quality blog outline with 6 to 9 sections.

Requirements:
- Match the likely search intent behind the primary keyword before expanding into related ideas.
- Use secondary keywords as natural subtopics, not repeated phrases.
- Cover SEO entities with useful explanations, examples, comparisons, or decision criteria.
- Include a strong introduction angle, practical body sections, and a conclusion that helps the reader decide what to do next.
- Prefer sections that answer real reader questions, remove confusion, and produce actionable takeaways.
- Add FAQ coverage when the brief asks for it or when FAQs would naturally satisfy search intent.
- Avoid thin, generic, duplicated, or keyword-stuffed sections.`,
    settings,
  );

  return outlineSchema.parse(json);
}

export async function reviseOutline(
  brief: SeoBrief,
  outline: BlogOutline,
  instruction: string,
  settings?: ActiveAiSettings | null,
) {
  const json = await completeJson(
    "You are a senior SEO strategist and blog editor. Revise outlines to improve usefulness, search-intent alignment, topical coverage, and reader flow. Preserve useful manual edits unless the instruction asks otherwise. Return only valid JSON with title and sections. Do not include markdown fences.",
    `${formatSeoBrief(brief)}

Current outline:
${JSON.stringify(outline, null, 2)}

Revision instruction:
${instruction}

Revise the outline so it still targets the primary keyword and follows the instruction.

Quality bar:
- Strengthen weak or generic headings.
- Improve section order so the article moves from problem, context, and criteria to practical advice and next steps.
- Keep secondary keywords and SEO entities natural and useful.
- Add or refine FAQ coverage when requested or when it improves search-intent coverage.
- Remove filler, repeated ideas, and sections that do not help the reader.`,
    settings,
  );

  return outlineSchema.parse(json);
}

export async function createContent(
  brief: SeoBrief,
  outline: BlogOutline,
  settings?: ActiveAiSettings | null,
) {
  const json = await completeJson(
    "You are a senior blog writer, SEO editor, and conversion copywriter. Write publish-ready articles that are specific, helpful, well structured, and easy to act on. Return only valid JSON with title, slug, contentHtml, metaTitle, and metaDescription. slug must be a lowercase URL slug with hyphens and no leading or trailing hyphen. contentHtml must use semantic HTML tags such as h2, h3, p, ul, li, and strong where useful. When adding FAQs, put each question and its answer in separate block elements; never put the answer on the same line as the question. Do not add internal links, external links, citations, source names, or any <a> tags. metaTitle must be 80 characters or fewer. metaDescription must be 180 characters or fewer. Do not include markdown fences.",
    `${formatSeoBrief(brief)}

Outline:
${JSON.stringify(outline, null, 2)}

Write a polished, productive blog post from this outline.

Content quality requirements:
- Start with a concise intro that confirms the reader's problem and previews the value of the article.
- Make every section useful: include practical steps, examples, decision criteria, mistakes to avoid, comparisons, checklists, or concise explanations where they fit.
- Use the primary keyword naturally in the title, early content, and relevant headings without stuffing.
- Weave secondary keywords and SEO entities into helpful context, not as forced phrases.
- Use short paragraphs, clear h2/h3 headings, and lists for scannable advice.
- Avoid generic filler, exaggerated claims, fake statistics, unsupported citations, and repetitive wording.
- Write in a confident, plain-language style that fits the website context.
- If the user asks for FAQs, format every FAQ as a question paragraph followed by an answer paragraph.
- End with a natural conclusion that summarizes the decision or next step.

Do not add internal links, external links, citations, source names, or linked anchor tags. Generate a WordPress-ready slug, SEO meta title, and meta description within the character limits.`,
    settings,
    { maxOutputTokens: longFormMaxOutputTokens },
  );

  return contentSchema.parse(normalizeContentJson(json));
}

export async function reviseContent(params: {
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
  websiteContext?: string;
  outline: BlogOutline;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  instruction: string;
  settings?: ActiveAiSettings | null;
}) {
  const json = await completeJson(
    "You are a senior blog writer, SEO editor, and conversion copywriter. Revise blog content to make it more helpful, specific, readable, and aligned with the user's instruction. Preserve unchanged sections when they already work. Return only valid JSON with title, slug, contentHtml, metaTitle, and metaDescription. slug must be a lowercase URL slug with hyphens and no leading or trailing hyphen. When adding or editing FAQs, put each question and its answer in separate block elements; never put the answer on the same line as the question. Do not add or preserve internal links, external links, citations, source names, or any <a> tags. Convert existing linked text to plain text. metaTitle must be 80 characters or fewer. metaDescription must be 180 characters or fewer. Do not include markdown fences.",
    `${formatSeoBrief({
      keyword: params.keyword,
      secondaryKeywords: params.secondaryKeywords,
      seoEntities: params.seoEntities,
      prompt: params.prompt,
      websiteContext: params.websiteContext,
    })}

Outline:
${JSON.stringify(params.outline, null, 2)}

Current contentHtml:
${params.contentHtml}

Current metaTitle:
${params.metaTitle}

Current metaDescription:
${params.metaDescription}

Current slug:
${params.slug}

Revision instruction:
${params.instruction}

Keep the article aligned with the primary keyword, supporting secondary keywords, and SEO entities while following the revision instruction.

Revision quality requirements:
- Improve weak, generic, repetitive, or thin sections.
- Add practical examples, steps, decision criteria, mistakes to avoid, or concise explanations where they make the article more useful.
- Preserve the article's useful structure and manual edits unless the instruction asks for a bigger rewrite.
- Keep paragraphs scannable and headings clear.
- If FAQs are added or revised, put each question in one paragraph and its answer in the next paragraph.
- Keep the title, slug, meta title, and meta description aligned with the final article.

Do not add internal links, external links, citations, source names, or linked anchor tags. If existing content contains links, keep the visible anchor text but remove the link markup.`,
    params.settings,
    { maxOutputTokens: longFormMaxOutputTokens },
  );

  return contentSchema.parse(normalizeContentJson(json));
}

function formatLandingPageBrief(brief: LandingPageBrief) {
  return `Landing page brief:
Title: ${brief.title}
Intent: ${brief.intent}
Website context: ${brief.websiteContext?.trim() || "None provided"}
Design inspiration: ${brief.designInspiration?.trim() || "None provided"}
Screenshot: ${brief.screenshot ? `${brief.screenshot.fileName || "Uploaded screenshot"} (${brief.screenshot.mimeType})` : "None provided"}
User prompt: ${brief.prompt}`;
}

function normalizeLandingPageJson(json: unknown) {
  const parsed = landingPageContentSchema.parse(json);
  const html = sanitizeLandingHtml(parsed.html);
  const css = sanitizeLandingCss(parsed.css);

  return landingPageContentSchema.parse({
    ...parsed,
    html,
    css,
  });
}

function sanitizeLandingHtml(value: string) {
  const cleaned = value
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .trim();

  if (/class=(["'])[^"']*\banchor-landing-page\b[^"']*\1/i.test(cleaned)) {
    return cleaned;
  }

  return `<main class="anchor-landing-page">${cleaned}</main>`;
}

function sanitizeLandingCss(value: string) {
  const cleaned = value
    .replace(/<style\b[^>]*>/gi, "")
    .replace(/<\/style>/gi, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\((?!['"]?data:image\/)[^)]+\)/gi, "none")
    .trim();

  return cleaned.includes(".anchor-landing-page")
    ? cleaned
    : `.anchor-landing-page {\n  font-family: Arial, sans-serif;\n}\n${cleaned}`;
}

export async function createLandingPage(
  brief: LandingPageBrief,
  settings?: ActiveAiSettings | null,
) {
  const { json, imageUsed } = await completeJsonWithOptionalImage(
    "You are a senior conversion copywriter and landing page designer. Return only valid JSON with title, slug, html, css, and optional notes. Generate a WordPress-ready landing page body fragment, not a full document. Do not include html, head, body, script, link, external CSS, tracking code, or form submission endpoints. Use one wrapper with class anchor-landing-page, and scope all CSS under .anchor-landing-page. CSS must be plain CSS, not Tailwind classes. Do not include markdown fences.",
    `${formatLandingPageBrief(brief)}

Create a complete landing page that satisfies the intent and prompt.

Output requirements:
- html must be a semantic landing page body fragment wrapped in <main class="anchor-landing-page">.
- css must style the full landing page and every selector must be scoped to .anchor-landing-page.
- Include a strong hero, clear value proposition, benefits or features, trust/social proof placeholder, how it works or process, a clear CTA section, and FAQs when useful.
- Match the design inspiration and uploaded screenshot when image context is available, but do not copy brand names, logos, or copyrighted text from the inspiration.
- Use accessible headings, buttons/links with clear labels, responsive sections, and polished spacing.
- Avoid fake statistics, unsupported claims, external scripts, external stylesheets, tracking pixels, and live forms.`,
    brief.screenshot,
    settings,
    { maxOutputTokens: landingPageMaxOutputTokens },
  );

  return {
    ...normalizeLandingPageJson(json),
    screenshotUsed: imageUsed,
  };
}

export async function reviseLandingPage(
  params: LandingPageBrief & {
    html: string;
    css: string;
    slug: string;
    instruction: string;
    settings?: ActiveAiSettings | null;
  },
) {
  const { json, imageUsed } = await completeJsonWithOptionalImage(
    "You are a senior conversion copywriter and landing page designer. Revise landing page HTML and CSS based on user instructions while preserving useful existing work. Return only valid JSON with title, slug, html, css, and optional notes. Do not include html, head, body, script, link, external CSS, tracking code, or form submission endpoints. Use one wrapper with class anchor-landing-page, and scope all CSS under .anchor-landing-page. If the user pastes Tailwind-style HTML, adapt it into concise semantic HTML and compact scoped CSS; do not preserve or expand every utility class into a massive stylesheet. Do not include markdown fences.",
    `${formatLandingPageBrief(params)}

Current slug:
${params.slug}

Current HTML:
${params.html}

Current CSS:
${params.css}

Revision instruction:
${params.instruction}

Revise the page so the rendered preview is more effective for the stated intent. Keep CSS scoped, responsive, and WordPress-friendly. If the instruction asks for visual changes, update both html and css as needed. Keep the JSON compact enough to parse reliably.`,
    params.screenshot,
    params.settings,
    { maxOutputTokens: landingPageMaxOutputTokens },
  );

  return {
    ...normalizeLandingPageJson(json),
    screenshotUsed: imageUsed,
  };
}

export async function analyzeContentWithAi(
  brief: SeoBrief,
  input: {
    title: string;
    slug: string;
    contentHtml: string;
    metaTitle: string;
    metaDescription: string;
  },
  settings?: ActiveAiSettings | null,
) {
  const json = await completeJson(
    "You are an expert SEO and readability auditor. Return only valid JSON with seoScore, readabilityScore, summary, seoAnalysis, and readabilityAnalysis. Scores must be whole numbers from 0 to 100. seoAnalysis and readabilityAnalysis must be arrays of findings with severity, location, issue, and recommendation. severity must be one of good, warning, or error.",
    `${formatSeoBrief(brief)}

Article title:
${input.title}

Slug:
${input.slug}

Meta title:
${input.metaTitle}

Meta description:
${input.metaDescription}

Content HTML:
${input.contentHtml}

Score the article for SEO out of 100 and readability out of 100. Check keyword usage, title/meta alignment, headings, search intent, internal links, external links, image/alt opportunities, paragraph length, sentence clarity, structure, scannability, and obvious missing sections. Include exact locations such as heading names, paragraph descriptions, metadata fields, or "overall article" so the user knows where each issue is. Include both errors and strengths where useful.`,
    settings,
  );

  return aiContentReportSchema.parse(json);
}
