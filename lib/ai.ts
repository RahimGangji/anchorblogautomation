import Groq from "groq-sdk";
import { contentSchema, outlineSchema } from "@/lib/validators";
import type { BlogOutline } from "@/lib/types";

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

async function completeJson(system: string, user: string) {
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

export async function createOutline(keyword: string, prompt: string) {
  const json = await completeJson(
    "You create SEO blog outlines. Return only valid JSON with title and sections. Each section has heading and bullets.",
    `Keyword: ${keyword}
Prompt: ${prompt}

Create a practical blog outline with 5 to 8 sections. Include search-intent coverage, useful subtopics, and no fluff.`,
  );

  return outlineSchema.parse(json);
}

export async function reviseOutline(outline: BlogOutline, instruction: string) {
  const json = await completeJson(
    "You revise SEO blog outlines. Preserve useful manual edits unless the instruction asks otherwise. Return only valid JSON with title and sections.",
    `Current outline:
${JSON.stringify(outline, null, 2)}

Revision instruction:
${instruction}`,
  );

  return outlineSchema.parse(json);
}

export async function createContent(keyword: string, prompt: string, outline: BlogOutline) {
  const json = await completeJson(
    "You write publish-ready blog articles. Return only valid JSON with title, contentHtml, metaTitle, and metaDescription. contentHtml must use semantic HTML tags such as h2, h3, p, ul, li, strong, and a where useful.",
    `Keyword: ${keyword}
Prompt: ${prompt}
Outline:
${JSON.stringify(outline, null, 2)}

Write a polished blog post from this outline. Include a concise intro, actionable sections, and a natural conclusion. Generate SEO meta title and meta description.`,
  );

  return contentSchema.parse(json);
}

export async function reviseContent(params: {
  keyword: string;
  outline: BlogOutline;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  instruction: string;
}) {
  const json = await completeJson(
    "You revise blog content based on user instructions. Preserve unchanged sections and return only valid JSON with title, contentHtml, metaTitle, and metaDescription.",
    `Keyword: ${params.keyword}
Outline:
${JSON.stringify(params.outline, null, 2)}

Current contentHtml:
${params.contentHtml}

Current metaTitle:
${params.metaTitle}

Current metaDescription:
${params.metaDescription}

Revision instruction:
${params.instruction}`,
  );

  return contentSchema.parse(json);
}
