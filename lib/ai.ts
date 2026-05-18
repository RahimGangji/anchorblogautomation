import Groq from "groq-sdk";
import type { z } from "zod";
import { aiContentReportSchema, contentSchema, outlineSchema } from "@/lib/validators";
import type { BlogOutline } from "@/lib/types";
import type { ActiveAiSettings } from "@/lib/aiSettings";

const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

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

async function completeJson(system: string, user: string, settings?: ActiveAiSettings | null) {
  if (settings) {
    return extractJson(await completeWithUserProvider(system, user, settings));
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

async function completeWithUserProvider(system: string, user: string, settings: ActiveAiSettings) {
  if (settings.provider === "gpt") {
    return await completeOpenAi(system, user, settings);
  }

  if (settings.provider === "claude") {
    return await completeClaude(system, user, settings);
  }

  return await completeGemini(system, user, settings);
}

async function completeOpenAi(system: string, user: string, settings: ActiveAiSettings) {
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
      text: { format: { type: "json_object" } },
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("GPT", response.status, body));
  }

  return readOpenAiText(body);
}

async function completeClaude(system: string, user: string, settings: ActiveAiSettings) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 4096,
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

async function completeGemini(system: string, user: string, settings: ActiveAiSettings) {
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
    slug: limitText((json as { slug?: unknown }).slug, 120),
    metaTitle: limitText((json as { metaTitle?: unknown }).metaTitle, 80),
    metaDescription: limitText((json as { metaDescription?: unknown }).metaDescription, 180),
  };
}

type SeoBrief = {
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
};

export type AiContentReport = z.infer<typeof aiContentReportSchema>;

function formatSeoBrief(brief: SeoBrief) {
  return `Primary keyword: ${brief.keyword}
Secondary keywords: ${brief.secondaryKeywords?.trim() || "None provided"}
SEO entities: ${brief.seoEntities?.trim() || "None provided"}
Prompt: ${brief.prompt}`;
}

export async function createOutline(brief: SeoBrief, settings?: ActiveAiSettings | null) {
  const json = await completeJson(
    "You create SEO blog outlines. Return only valid JSON with title and sections. Each section has heading and bullets.",
    `${formatSeoBrief(brief)}

Create a practical blog outline with 5 to 8 sections. Treat the primary keyword as the main ranking target. Use secondary keywords as supporting subtopics where natural, and include SEO entities to improve topical coverage. Include search-intent coverage, useful subtopics, and no fluff.`,
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
    "You revise SEO blog outlines. Preserve useful manual edits unless the instruction asks otherwise. Return only valid JSON with title and sections.",
    `${formatSeoBrief(brief)}

Current outline:
${JSON.stringify(outline, null, 2)}

Revision instruction:
${instruction}

Revise the outline so it still targets the primary keyword, uses relevant secondary keywords naturally, and covers the SEO entities where they fit.`,
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
    "You write publish-ready blog articles. Return only valid JSON with title, slug, contentHtml, metaTitle, and metaDescription. slug must be a lowercase URL slug with hyphens and no leading or trailing hyphen. contentHtml must use semantic HTML tags such as h2, h3, p, ul, li, strong, and a where useful. Internal links must be valid <a href=\"...\">keyword phrase</a> tags, and the anchor text must be the relevant keyword phrase, not a bare URL. metaTitle must be 80 characters or fewer. metaDescription must be 180 characters or fewer.",
    `${formatSeoBrief(brief)}

Outline:
${JSON.stringify(outline, null, 2)}

Write a polished blog post from this outline. Treat the primary keyword as the main target, weave in secondary keywords only where natural, and cover SEO entities with useful context instead of stuffing terms. When adding internal links, link the keyword phrase itself as the anchor text. Include a concise intro, actionable sections, and a natural conclusion. Generate a WordPress-ready slug, SEO meta title, and meta description within the character limits.`,
    settings,
  );

  return contentSchema.parse(normalizeContentJson(json));
}

export async function reviseContent(params: {
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
  outline: BlogOutline;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  instruction: string;
  settings?: ActiveAiSettings | null;
}) {
  const json = await completeJson(
    "You revise blog content based on user instructions. Preserve unchanged sections and return only valid JSON with title, slug, contentHtml, metaTitle, and metaDescription. slug must be a lowercase URL slug with hyphens and no leading or trailing hyphen. Preserve internal links as valid <a href=\"...\">keyword phrase</a> tags, and ensure the anchor text is the relevant keyword phrase, not a bare URL. metaTitle must be 80 characters or fewer. metaDescription must be 180 characters or fewer.",
    `${formatSeoBrief({
      keyword: params.keyword,
      secondaryKeywords: params.secondaryKeywords,
      seoEntities: params.seoEntities,
      prompt: params.prompt,
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

Keep the article aligned with the primary keyword, supporting secondary keywords, and SEO entities while following the revision instruction.`,
    params.settings,
  );

  return contentSchema.parse(normalizeContentJson(json));
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
