import crypto from "crypto";

export function cleanTelegramBaseUrl(rawUrl: string): string {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (url.endsWith("/bot")) {
    url = url.substring(0, url.length - 4);
  }
  return url.replace(/\/+$/, "");
}

export function verifyTelegramInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) return false;

    urlParams.delete("hash");
    const params: string[] = [];
    for (const [key, value] of urlParams.entries()) {
      params.push(`${key}=${value}`);
    }
    params.sort();

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(params.join("\n"))
      .digest("hex");

    return calculatedHash === hash;
  } catch {
    return false;
  }
}

export async function sendTelegramApiMessage(options: {
  chatId: string | number;
  text: string;
  botToken?: string;
  apiBaseUrl?: string;
  secondaryApiBaseUrl?: string;
  replyMarkup?: any;
  timeoutMs?: number;
}) {
  const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const rawBase = options.apiBaseUrl || "https://api.telegram.org";
  const primaryBaseUrl = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 10000;

  if (!token) return { ok: false, description: "Токен бота не задан" };

  const urlsToTry = [primaryBaseUrl];
  if (options.secondaryApiBaseUrl) {
    const sec = cleanTelegramBaseUrl(options.secondaryApiBaseUrl);
    if (!urlsToTry.includes(sec)) urlsToTry.push(sec);
  }

  let lastError: any = null;

  for (const baseUrl of urlsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `${baseUrl}/bot${token}/sendMessage`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(options.chatId),
          text: options.text,
          reply_markup: options.replyMarkup,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        return { ok: true, data, description: "Успешно отправлено", usedBaseUrl: baseUrl };
      }

      lastError = { ok: false, description: data?.description || `HTTP ${res.status}`, data };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return lastError;
      }
    } catch (err: any) {
      clearTimeout(timer);
      const msg = err.name === "AbortError" ? `Таймаут (${timeoutMs}ms) к ${baseUrl}` : err.message;
      lastError = { ok: false, description: msg, error: err };
    }
  }

  return lastError;
}
