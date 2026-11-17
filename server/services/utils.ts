export const DEFAULT_PROTALK_LOG_URL =
  "https://docs.google.com/spreadsheets/d/1HAhAbwKRIXPFi8KhqLhDW6-Ha2tjQf4pj8rrSGPML8A/edit?usp=sharing";

// In-Memory State Container (synced from ProTalk PG on boot, mutations always go to PG directly)
export const db = {
  projects: [] as any[],
  candidates: [] as any[],
  telegramLog: [] as any[],
  payments: [] as any[],
  employers: [] as any[],
  companies: [] as any[],
};

export function notifyTelegram(chatId: string | undefined, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  db.telegramLog.unshift({
    id: "tg-" + Date.now() + Math.random().toString(36).substring(2, 7),
    chatId: chatId || "All Admins",
    message,
    timestamp,
  });
}

export function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

export function transliterateToSlug(str: string): string {
  if (!str) return "";
  const ru: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya", " ": "-",
  };
  return str
    .toLowerCase()
    .replace(/[\s\u00A0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, "-")
    .split("")
    .map((char) => (ru[char] !== undefined ? ru[char] : char))
    .join("")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extracts complete top-level JSON objects from a potentially truncated JSON array or text */
export function extractBalancedJsonObjects(text: string): any[] {
  const results: any[] = [];
  if (!text) return results;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let startIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const candidate = text.slice(startIdx, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
              results.push(parsed);
            }
          } catch {}
          startIdx = -1;
        }
      }
    }
  }
  return results;
}

export function tryParseLLMJson<T = any>(text: string): T | null {
  if (!text || typeof text !== "string") return null;
  let clean = text.trim();
  clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(clean) as T;
  } catch {}

  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");

  if (
    firstBracket !== -1 &&
    lastBracket !== -1 &&
    lastBracket > firstBracket &&
    (firstBrace === -1 || firstBracket < firstBrace)
  ) {
    try {
      return JSON.parse(clean.substring(firstBracket, lastBracket + 1)) as T;
    } catch {}
  }

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1)) as T;
    } catch {}
  }

  if (
    firstBracket !== -1 &&
    (lastBracket === -1 || lastBracket < firstBracket || firstBracket < firstBrace)
  ) {
    const recovered = extractBalancedJsonObjects(clean);
    if (recovered.length > 0) {
      return recovered as unknown as T;
    }
  }

  return null;
}

export function renderPromptTemplate(template: string, vars: Record<string, any>): string {
  if (!template) return "";
  let rendered = template;
  for (const [key, val] of Object.entries(vars)) {
    const safeVal = val === undefined || val === null ? "" : String(val);
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), safeVal);
  }
  return rendered;
}
