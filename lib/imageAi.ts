import type { ActiveAiSettings } from "@/lib/aiSettings";

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
  provider: ActiveAiSettings["provider"];
  model: string;
};

export async function generateImageWithAi(
  settings: ActiveAiSettings,
  prompt: string,
): Promise<GeneratedImage> {
  if (settings.provider === "gpt") {
    return await generateOpenAiImage(settings, prompt);
  }

  if (settings.provider === "gemini") {
    return await generateGeminiImage(settings, prompt);
  }

  throw new Error(
    "Claude does not currently support prompt-to-image generation through its API. Select GPT or Gemini in API Keys.",
  );
}

async function generateOpenAiImage(settings: ActiveAiSettings, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      input: prompt,
      tools: [
        {
          type: "image_generation",
          size: "1024x1024",
          quality: "medium",
          format: "png",
        },
      ],
      tool_choice: { type: "image_generation" },
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("GPT", response.status, body));
  }

  const base64 = readOpenAiImage(body);

  return {
    dataUrl: `data:image/png;base64,${base64}`,
    mimeType: "image/png",
    provider: settings.provider,
    model: settings.model,
  };
}

async function generateGeminiImage(settings: ActiveAiSettings, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(providerError("Gemini", response.status, body));
  }

  const image = readGeminiImage(body);

  return {
    dataUrl: `data:${image.mimeType};base64,${image.data}`,
    mimeType: image.mimeType,
    provider: settings.provider,
    model: settings.model,
  };
}

function readOpenAiImage(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const output = (body as { output?: unknown }).output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        if ((item as { type?: unknown }).type !== "image_generation_call") continue;
        const result = (item as { result?: unknown }).result;
        if (typeof result === "string" && result.trim()) return result;
      }
    }
  }

  throw new Error("GPT did not return an image. Make sure the selected model supports image generation.");
}

function readGeminiImage(body: unknown) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const candidates = (body as { candidates?: unknown }).candidates;
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const content = (candidate as { content?: unknown }).content;
        if (!content || typeof content !== "object" || Array.isArray(content)) continue;
        const parts = (content as { parts?: unknown }).parts;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
          if (!part || typeof part !== "object" || Array.isArray(part)) continue;
          const inlineData = (part as { inlineData?: unknown; inline_data?: unknown }).inlineData ??
            (part as { inline_data?: unknown }).inline_data;
          if (!inlineData || typeof inlineData !== "object" || Array.isArray(inlineData)) continue;
          const data = (inlineData as { data?: unknown }).data;
          const mimeType = (inlineData as { mimeType?: unknown; mime_type?: unknown }).mimeType ??
            (inlineData as { mime_type?: unknown }).mime_type;
          if (typeof data === "string" && typeof mimeType === "string") {
            return { data, mimeType };
          }
        }
      }
    }
  }

  throw new Error("Gemini did not return an image. Make sure the selected model supports image generation.");
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
