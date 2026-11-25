import crypto from "crypto";
import { getProTalkDB, ProTalkDbWrapper } from "../../db";
import { executeProTalkQuery, queryAllPg, queryGetPg } from "../../db/protalkDb";
import {
  cleanTelegramBaseUrl,
  getTelegramBotConfig,
  getTelegramTokenFromDB,
  PROXY_PRESETS,
  resolveTelegramButtonUrl,
  sendTelegramMessage,
} from "../telegram";
import { NotificationOwnerRole, sendWebPushToOwner } from "../push/pushService";

export type MailingAudienceType =
  | "all_users"
  | "employers"
  | "employers_paying"
  | "employers_active"
  | "employers_setup"
  | "employers_new"
  | "candidates"
  | "custom";

export interface SelectedMailingRecipient {
  kind: "employer" | "candidate";
  id: string;
}

export interface MailingRecordInput {
  id?: string | null;
  title: string;
  body_md: string;
  image_url?: string | null;
  button_text?: string | null;
  button_url?: string | null;
  audience_type: MailingAudienceType;
  selected_recipients?: SelectedMailingRecipient[];
  send_in_app?: boolean;
  send_push?: boolean;
  send_telegram?: boolean;
}

interface ResolvedTargetUser {
  kind: "employer" | "candidate";
  id: string;
  public_id: string | null;
  name: string;
  email: string;
  telegramChatIds: string[];
  pushOwnerIds: string[];
  pushEnabled: boolean;
  bellEnabled: boolean;
  telegramEnabled: boolean;
}

let mailingsSchemaPromise: Promise<void> | null = null;

export async function ensureMailingsSchemaPg(force = false): Promise<void> {
  if (mailingsSchemaPromise && !force) {
    return mailingsSchemaPromise;
  }

  mailingsSchemaPromise = (async () => {
    try {
      await executeProTalkQuery(`
        CREATE TABLE IF NOT EXISTS admin_mailings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body_md TEXT NOT NULL,
          image_url TEXT,
          button_text TEXT,
          button_url TEXT,
          audience_type TEXT NOT NULL DEFAULT 'employers',
          selected_recipients_json TEXT DEFAULT '[]',
          send_in_app INTEGER DEFAULT 1,
          send_push INTEGER DEFAULT 1,
          send_telegram INTEGER DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'draft',
          total_targets INTEGER DEFAULT 0,
          in_app_sent INTEGER DEFAULT 0,
          push_sent INTEGER DEFAULT 0,
          telegram_sent INTEGER DEFAULT 0,
          telegram_failed INTEGER DEFAULT 0,
          telegram_skipped INTEGER DEFAULT 0,
          created_by_id TEXT,
          created_by_email TEXT,
          sent_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (err: any) {
      console.error("[Mailings] Failed to ensure admin_mailings table:", err?.message);
    }
  })();

  return mailingsSchemaPromise;
}

function normalizeAudienceType(raw: unknown): MailingAudienceType {
  const val = String(raw || "employers").trim();
  const valid: MailingAudienceType[] = [
    "all_users",
    "employers",
    "employers_paying",
    "employers_active",
    "employers_setup",
    "employers_new",
    "candidates",
    "custom",
  ];
  return (valid.includes(val as MailingAudienceType) ? val : "employers") as MailingAudienceType;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHref(rawUrl: string): string | null {
  const u = String(rawUrl || "").trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) {
    return resolveTelegramButtonUrl(u);
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return resolveTelegramButtonUrl(u);
    }
  } catch {}
  return null;
}

export function stripMarkdownToPlain(md: string, maxLength = 320): string {
  if (!md) return "";
  let text = String(md);
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (maxLength > 0 && text.length > maxLength) {
    return text.slice(0, maxLength - 1).trimEnd() + "…";
  }
  return text;
}

export function convertMarkdownToTelegramHtml(title: string, bodyMd: string, maxLength = 3900): string {
  const safeTitle = escapeHtml(String(title || "").trim());
  const rawLines = String(bodyMd || "").replace(/\r\n/g, "\n").split("\n");

  const convertInline = (line: string): string => {
    const tokens: string[] = [];
    const pushToken = (html: string) => {
      const idx = tokens.length;
      tokens.push(html);
      return `\u0000TOK${idx}\u0000`;
    };

    let work = line;

    // Images ![alt](url) -> link
    work = work.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const href = sanitizeHref(url);
      const label = escapeHtml(alt || "Изображение");
      if (href) return pushToken(`<a href="${escapeHtml(href)}">${label}</a>`);
      return pushToken(label);
    });

    // Links [text](url)
    work = work.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const href = sanitizeHref(url);
      const safeLabel = escapeHtml(label);
      if (href) return pushToken(`<a href="${escapeHtml(href)}">${safeLabel}</a>`);
      return pushToken(safeLabel);
    });

    // Inline code `code`
    work = work.replace(/`([^`\n]+)`/g, (_m, code) => pushToken(`<code>${escapeHtml(code)}</code>`));

    // Escape remaining raw HTML
    work = escapeHtml(work);

    // Bold **text** or __text__
    work = work.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>");
    // Strikethrough ~~text~~
    work = work.replace(/~~(.+?)~~/g, "<s>$1</s>");
    // Italic *text* or _text_
    work = work.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
    work = work.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");

    // Restore protected tokens
    work = work.replace(/\u0000TOK(\d+)\u0000/g, (_m, idx) => tokens[Number(idx)] || "");
    return work;
  };

  const outLines: string[] = [];
  let inCodeFence = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      outLines.push(`<code>${escapeHtml(raw)}</code>`);
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      outLines.push("──────────");
      continue;
    }
    const hMatch = raw.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (hMatch) {
      outLines.push(`<b>${convertInline(hMatch[1].trim())}</b>`);
      continue;
    }
    if (/^\s*>\s?/.test(raw)) {
      const q = raw.replace(/^\s*>\s?/, "");
      outLines.push(`▎ <i>${convertInline(q)}</i>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(raw)) {
      const item = raw.replace(/^\s*[-*+]\s+/, "");
      outLines.push(`• ${convertInline(item)}`);
      continue;
    }
    outLines.push(convertInline(raw));
  }

  const bodyHtml = outLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const full = safeTitle ? `<b>${safeTitle}</b>\n\n${bodyHtml}` : bodyHtml;

  if (full.length <= maxLength) return full;
  // Fall back to safe truncated plain text if HTML truncation could slice tags
  const plainTitle = String(title || "").trim();
  const plainBody = stripMarkdownToPlain(bodyMd, maxLength - plainTitle.length - 20);
  return escapeHtml(plainTitle ? `${plainTitle}\n\n${plainBody}` : plainBody);
}

function parseNumericTelegramIds(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^-?\d{4,20}$/.test(s));
}

function parseNotifJson(raw: unknown): any {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function extractEmployerTargets(row: any): ResolvedTargetUser {
  const cfg = parseNotifJson(row.notifications_config);
  const ids = new Set<string>();
  for (const x of parseNumericTelegramIds(row.telegram_chat_id)) ids.add(x);
  for (const x of parseNumericTelegramIds(cfg?.telegram_user_ids)) ids.add(x);

  const pushIds = [row.id, row.public_id, row.user_id].filter(Boolean).map(String);

  return {
    kind: "employer",
    id: String(row.id),
    public_id: row.public_id != null ? String(row.public_id) : null,
    name: row.name || row.contact_name || row.company_name || row.email || `Клиент #${row.public_id || row.id}`,
    email: row.email || row.contact_email || "",
    telegramChatIds: Array.from(ids),
    pushOwnerIds: Array.from(new Set(pushIds)),
    bellEnabled: cfg?.channels?.bell !== false,
    pushEnabled: cfg?.channels?.push !== false,
    telegramEnabled: cfg?.channels?.telegram !== false,
  };
}

function extractCandidateTargets(row: any): ResolvedTargetUser {
  const cfg = parseNotifJson(row.notifications_config);
  const ids = new Set<string>();
  for (const x of parseNumericTelegramIds(cfg?.telegram_user_ids)) ids.add(x);
  for (const x of parseNumericTelegramIds(row.social_telegram)) ids.add(x);

  const pushIds = [row.id, row.public_id, row.legacy_public_id].filter(Boolean).map(String);

  return {
    kind: "candidate",
    id: String(row.id),
    public_id: row.public_id != null ? String(row.public_id) : null,
    name: row.full_name || row.email || `Кандидат #${row.public_id || row.id}`,
    email: row.email || "",
    telegramChatIds: Array.from(ids),
    pushOwnerIds: Array.from(new Set(pushIds)),
    bellEnabled: cfg?.channels?.bell !== false,
    pushEnabled: cfg?.channels?.push !== false,
    telegramEnabled: cfg?.channels?.telegram !== false,
  };
}

async function resolveAudienceTargets(
  db: ProTalkDbWrapper,
  audienceType: MailingAudienceType,
  selectedRecipients: SelectedMailingRecipient[] = []
): Promise<ResolvedTargetUser[]> {
  const out: ResolvedTargetUser[] = [];

  if (audienceType === "custom") {
    const empIds = Array.from(
      new Set(selectedRecipients.filter((r) => r.kind === "employer" && r.id).map((r) => String(r.id)))
    );
    const candIds = Array.from(
      new Set(selectedRecipients.filter((r) => r.kind === "candidate" && r.id).map((r) => String(r.id)))
    );

    if (empIds.length > 0) {
      const ph = empIds.map(() => "?").join(", ");
      const rows = await db.all(
        `SELECT id, public_id, user_id, name, contact_name, company_name, email, contact_email, telegram_chat_id, notifications_config
         FROM employers WHERE id IN (${ph})`,
        empIds
      );
      for (const r of rows || []) out.push(extractEmployerTargets(r));
    }

    if (candIds.length > 0) {
      const ph = candIds.map(() => "?").join(", ");
      const rows = await db.all(
        `SELECT id, public_id, legacy_public_id, full_name, email, social_telegram, notifications_config
         FROM candidates WHERE id IN (${ph})`,
        candIds
      );
      for (const r of rows || []) out.push(extractCandidateTargets(r));
    }
    return out;
  }

  const wantsEmployers = audienceType === "all_users" || audienceType.startsWith("employers");
  const wantsCandidates = audienceType === "all_users" || audienceType === "candidates";

  if (wantsEmployers) {
    let stageWhere = "";
    if (audienceType !== "employers" && audienceType !== "all_users") {
      const stageTarget = audienceType.replace("employers_", "");
      stageWhere = `WHERE stage_key = ?`;
      const empRows = await db.all(
        `WITH emp_stats AS (
          SELECT
            e.id, e.public_id, e.user_id, e.name, e.contact_name, e.company_name,
            e.email, e.contact_email, e.telegram_chat_id, e.notifications_config, e.balance_pay,
            (
              COALESCE(e.balance_pay, 0) > 0 OR EXISTS (
                SELECT 1 FROM wallets w JOIN transactions t ON t.wallet_id = w.id
                WHERE (w.employer_id = e.id OR (e.public_id IS NOT NULL AND w.employer_id = CAST(e.public_id AS TEXT)))
                  AND LOWER(COALESCE(t.type, '')) = 'pay' AND COALESCE(t.amount_rr, 0) > 0
              )
            ) AS has_topup,
            (SELECT COUNT(DISTINCT c.id)::int FROM companies c WHERE c.owner_employer_id = e.id OR c.employer_id = e.id OR (e.public_id IS NOT NULL AND (c.owner_employer_id = CAST(e.public_id AS TEXT) OR c.employer_id = CAST(e.public_id AS TEXT)))) AS companies_count,
            (SELECT COUNT(DISTINCT p.id)::int FROM projects p WHERE p.employer_id = e.id OR (e.public_id IS NOT NULL AND (p.employer_id = CAST(e.public_id AS TEXT) OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)))) AS projects_count,
            (SELECT COUNT(DISTINCT ca.id)::int FROM candidates ca JOIN projects p ON (ca.project_id = p.id OR (p.public_id IS NOT NULL AND ca.project_id = CAST(p.public_id AS TEXT))) WHERE p.employer_id = e.id OR (e.public_id IS NOT NULL AND (p.employer_id = CAST(e.public_id AS TEXT) OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)))) AS candidates_count
          FROM employers e
        ),
        emp_classified AS (
          SELECT *,
            CASE
              WHEN has_topup THEN 'paying'
              WHEN candidates_count > 0 THEN 'active'
              WHEN projects_count > 0 OR companies_count > 0 THEN 'setup'
              ELSE 'new'
            END AS stage_key
          FROM emp_stats
        )
        SELECT * FROM emp_classified ${stageWhere}`,
        [stageTarget]
      );
      for (const r of empRows || []) out.push(extractEmployerTargets(r));
    } else {
      const empRows = await db.all(
        `SELECT id, public_id, user_id, name, contact_name, company_name, email, contact_email, telegram_chat_id, notifications_config
         FROM employers`
      );
      for (const r of empRows || []) out.push(extractEmployerTargets(r));
    }
  }

  if (wantsCandidates) {
    const candRows = await db.all(
      `SELECT id, public_id, legacy_public_id, full_name, email, social_telegram, notifications_config
       FROM candidates`
    );
    for (const r of candRows || []) out.push(extractCandidateTargets(r));
  }

  return out;
}

export async function listMailingRecipientsPage(
  db: ProTalkDbWrapper,
  opts: { kind?: string; search?: string; limit?: number; offset?: number }
) {
  const kind = opts.kind === "employer" || opts.kind === "candidate" ? opts.kind : "all";
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const search = String(opts.search || "").trim();

  const whereParts: string[] = [];
  const params: any[] = [];
  if (kind !== "all") {
    whereParts.push(`kind = ?`);
    params.push(kind);
  }
  if (search) {
    const like = `%${search}%`;
    whereParts.push(
      `(COALESCE(name, '') ILIKE ? OR COALESCE(email, '') ILIKE ? OR COALESCE(public_id, '') ILIKE ? OR COALESCE(tg_handle, '') ILIKE ?)`
    );
    params.push(like, like, like, like);
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const unionSql = `
    WITH all_recipients AS (
      SELECT
        'employer'::text AS kind,
        id,
        COALESCE(CAST(public_id AS TEXT), '') AS public_id,
        COALESCE(NULLIF(name, ''), NULLIF(contact_name, ''), NULLIF(company_name, ''), email, '') AS name,
        COALESCE(NULLIF(email, ''), contact_email, '') AS email,
        COALESCE(telegram_chat_id, '') AS tg_chat_id,
        COALESCE(telegram_username, contact_telegram, '') AS tg_handle,
        COALESCE(notifications_config, '') AS notifications_config,
        created_at::text AS created_at
      FROM employers
      UNION ALL
      SELECT
        'candidate'::text AS kind,
        id,
        COALESCE(CAST(public_id AS TEXT), '') AS public_id,
        COALESCE(NULLIF(full_name, ''), email, '') AS name,
        COALESCE(email, '') AS email,
        ''::text AS tg_chat_id,
        COALESCE(social_telegram, '') AS tg_handle,
        COALESCE(notifications_config, '') AS notifications_config,
        created_at::text AS created_at
      FROM candidates
    )
  `;

  const [cntRow, rows] = await Promise.all([
    db.get(`${unionSql} SELECT COUNT(*)::int AS cnt FROM all_recipients ${whereSql}`, params),
    db.all(
      `${unionSql} SELECT * FROM all_recipients ${whereSql} ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(cntRow?.cnt || 0);
  const items = (rows || []).map((r: any) => {
    const cfg = parseNotifJson(r.notifications_config);
    const hasTg =
      parseNumericTelegramIds(r.tg_chat_id).length > 0 ||
      parseNumericTelegramIds(cfg?.telegram_user_ids).length > 0 ||
      parseNumericTelegramIds(r.tg_handle).length > 0;
    return {
      kind: r.kind as "employer" | "candidate",
      id: String(r.id),
      public_id: r.public_id || "",
      name: r.name || "—",
      email: r.email || "",
      tg_handle: r.tg_handle || "",
      has_telegram: hasTg,
    };
  });

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

export async function previewMailingAudience(
  db: ProTalkDbWrapper,
  audienceType: MailingAudienceType,
  selectedRecipients: SelectedMailingRecipient[] = []
) {
  const targets = await resolveAudienceTargets(db, audienceType, selectedRecipients);
  const employersCount = targets.filter((t) => t.kind === "employer").length;
  const candidatesCount = targets.filter((t) => t.kind === "candidate").length;
  const uniqueChatIds = new Set<string>();
  let usersWithTelegram = 0;

  for (const t of targets) {
    if (t.telegramChatIds.length > 0) {
      usersWithTelegram++;
      for (const cid of t.telegramChatIds) uniqueChatIds.add(cid);
    }
  }

  return {
    totalCount: targets.length,
    employersCount,
    candidatesCount,
    telegramReachableUsers: usersWithTelegram,
    telegramUniqueChats: uniqueChatIds.size,
  };
}

function formatMailingRow(row: any) {
  if (!row) return null;
  let selectedRecipients: SelectedMailingRecipient[] = [];
  try {
    selectedRecipients = row.selected_recipients_json ? JSON.parse(row.selected_recipients_json) : [];
  } catch {
    selectedRecipients = [];
  }
  return {
    ...row,
    selected_recipients: Array.isArray(selectedRecipients) ? selectedRecipients : [],
    send_in_app: Boolean(Number(row.send_in_app ?? 1)),
    send_push: Boolean(Number(row.send_push ?? 1)),
    send_telegram: Boolean(Number(row.send_telegram ?? 1)),
  };
}

export async function listMailingsPage(opts: { search?: string; limit?: number; offset?: number }) {
  await ensureMailingsSchemaPg();
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const search = String(opts.search || "").trim();

  const whereParts: string[] = [];
  const params: any[] = [];
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    whereParts.push(`(title ILIKE ${p} OR body_md ILIKE ${p})`);
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [cntRow, rows] = await Promise.all([
    queryGetPg<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM admin_mailings ${whereSql}`, params),
    queryAllPg(
      `SELECT * FROM admin_mailings ${whereSql} ORDER BY created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(cntRow?.cnt || 0);
  return {
    items: (rows || []).map(formatMailingRow),
    total,
    hasMore: offset + (rows?.length || 0) < total,
  };
}

export async function saveMailingRecord(
  db: ProTalkDbWrapper,
  input: MailingRecordInput,
  adminUser: { id?: string; email?: string }
) {
  await ensureMailingsSchemaPg();
  const audienceType = normalizeAudienceType(input.audience_type);
  const selectedJson = JSON.stringify(Array.isArray(input.selected_recipients) ? input.selected_recipients : []);
  const nowIso = new Date().toISOString();
  const id = input.id && String(input.id).trim() ? String(input.id).trim() : `mail_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const existing = input.id ? await db.get(`SELECT id, status FROM admin_mailings WHERE id = ? LIMIT 1`, [id]) : null;
  if (existing && existing.status === "draft") {
    await db.run(
      `UPDATE admin_mailings
       SET title = ?, body_md = ?, image_url = ?, button_text = ?, button_url = ?,
           audience_type = ?, selected_recipients_json = ?, send_in_app = ?, send_push = ?, send_telegram = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        input.title.trim(),
        input.body_md,
        input.image_url?.trim() || null,
        input.button_text?.trim() || null,
        input.button_url?.trim() || null,
        audienceType,
        selectedJson,
        input.send_in_app !== false ? 1 : 0,
        input.send_push !== false ? 1 : 0,
        input.send_telegram !== false ? 1 : 0,
        nowIso,
        id,
      ]
    );
  } else {
    const newId = existing ? `mail_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` : id;
    await db.run(
      `INSERT INTO admin_mailings (
        id, title, body_md, image_url, button_text, button_url,
        audience_type, selected_recipients_json, send_in_app, send_push, send_telegram,
        status, created_by_id, created_by_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [
        newId,
        input.title.trim(),
        input.body_md,
        input.image_url?.trim() || null,
        input.button_text?.trim() || null,
        input.button_url?.trim() || null,
        audienceType,
        selectedJson,
        input.send_in_app !== false ? 1 : 0,
        input.send_push !== false ? 1 : 0,
        input.send_telegram !== false ? 1 : 0,
        adminUser?.id || null,
        adminUser?.email || null,
        nowIso,
        nowIso,
      ]
    );
    const saved = await db.get(`SELECT * FROM admin_mailings WHERE id = ? LIMIT 1`, [newId]);
    return formatMailingRow(saved);
  }

  const saved = await db.get(`SELECT * FROM admin_mailings WHERE id = ? LIMIT 1`, [id]);
  return formatMailingRow(saved);
}

async function sendTelegramPhotoOrMessage(options: {
  chatId: string;
  htmlText: string;
  imageUrl?: string | null;
  button?: { text: string; url: string };
}): Promise<{ ok: boolean; error?: string }> {
  const imageUrl = options.imageUrl?.trim();
  const btn = options.button?.url
    ? {
        text: options.button.text?.trim() || "🌐 Открыть платформу",
        url: options.button.url,
      }
    : undefined;

  if (imageUrl && /^https?:\/\//i.test(imageUrl) && options.htmlText.length <= 980) {
    try {
      const cfg = await getTelegramBotConfig();
      const token = cfg.botToken || (await getTelegramTokenFromDB());
      const base = cleanTelegramBaseUrl(cfg.apiBaseUrl || PROXY_PRESETS.dialog_ai);
      if (token) {
        const replyMarkup = btn
          ? {
              inline_keyboard: [[{ text: btn.text, url: resolveTelegramButtonUrl(btn.url) }]],
            }
          : undefined;
        const payload: any = {
          chat_id: String(options.chatId),
          photo: imageUrl,
          caption: options.htmlText,
          parse_mode: "HTML",
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;

        const res = await fetch(`${base}/bot${token}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
        const data: any = await res.json().catch(() => ({}));
        if (res.ok && data?.ok) {
          return { ok: true };
        }
      }
    } catch {
      // Fallback gracefully to text message below
    }
  }

  const res = await sendTelegramMessage({
    chatId: options.chatId,
    text: options.htmlText,
    parseMode: "HTML",
    button: btn,
  });
  return { ok: Boolean(res.ok), error: res.error };
}

export async function sendTestTelegramMailing(
  chatIdInput: string | null | undefined,
  adminUser: any,
  input: {
    title: string;
    body_md: string;
    image_url?: string | null;
    button_text?: string | null;
    button_url?: string | null;
  }
) {
  const cfg = await getTelegramBotConfig();
  const explicit = parseNumericTelegramIds(chatIdInput)[0];
  const adminOwn = parseNumericTelegramIds(adminUser?.telegram_chat_id)[0];
  const targetChatId = explicit || adminOwn || cfg.adminTelegramId;

  if (!targetChatId) {
    return { ok: false, error: "Не указан Telegram Chat ID для тестовой отправки" };
  }

  const html = convertMarkdownToTelegramHtml(input.title, input.body_md);
  const result = await sendTelegramPhotoOrMessage({
    chatId: targetChatId,
    htmlText: html,
    imageUrl: input.image_url,
    button: input.button_url
      ? {
          text: input.button_text || "🌐 Открыть платформу",
          url: input.button_url,
        }
      : undefined,
  });

  return {
    ok: result.ok,
    chatId: targetChatId,
    error: result.error,
  };
}

export async function dispatchMailingCampaign(
  db: ProTalkDbWrapper,
  input: MailingRecordInput,
  adminUser: { id?: string; email?: string }
) {
  const saved = await saveMailingRecord(db, input, adminUser);
  if (!saved) throw new Error("Не удалось сохранить запись рассылки");

  const mailingId = String(saved.id);
  const sendInApp = input.send_in_app !== false;
  const sendPush = input.send_push !== false;
  const sendTelegram = input.send_telegram !== false;

  const audienceType = normalizeAudienceType(input.audience_type);
  const targets = await resolveAudienceTargets(db, audienceType, input.selected_recipients || []);

  const metaObj = {
    mailing_id: mailingId,
    format: "markdown",
    image_url: input.image_url?.trim() || null,
    button_text: input.button_text?.trim() || null,
    button_url: input.button_url?.trim() || null,
  };
  const metaJson = JSON.stringify(metaObj);
  const linkVal = input.button_url?.trim() || null;
  const plainExcerpt = stripMarkdownToPlain(input.body_md, 180) || input.title;

  let inAppSent = 0;
  let pushSent = 0;
  let telegramSent = 0;
  let telegramFailed = 0;
  let telegramSkipped = 0;

  if (sendInApp && targets.length > 0) {
    const CHUNK = 80;
    const eligibleBell = targets.filter((t) => t.bellEnabled);
    for (let i = 0; i < eligibleBell.length; i += CHUNK) {
      const slice = eligibleBell.slice(i, i + CHUNK);
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const t of slice) {
        const notifId = `notif_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
        valuesSql.push(`(?, ?, ?, 'admin_mailing', ?, ?, ?, ?, NOW(), ?, ?)`);
        params.push(
          notifId,
          t.id,
          t.kind,
          input.title.trim(),
          input.body_md,
          linkVal,
          metaJson,
          t.kind,
          t.kind === "candidate" ? t.id : null
        );
      }
      await db.run(
        `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at, recipient_kind, candidate_id)
         VALUES ${valuesSql.join(", ")}`,
        params
      );
      inAppSent += slice.length;
    }
  }

  if (sendPush && targets.length > 0) {
    const eligiblePush = targets.filter((t) => t.pushEnabled && t.pushOwnerIds.length > 0);
    for (const t of eligiblePush) {
      try {
        const res = await sendWebPushToOwner(db, {
          ownerType: t.kind as NotificationOwnerRole,
          ownerIds: t.pushOwnerIds,
          title: input.title.trim(),
          body: plainExcerpt,
          url: linkVal || "/",
          tag: `mailing-${mailingId}`,
          data: { kind: "admin_mailing", mailingId },
        });
        if (res.sent > 0) pushSent += res.sent;
      } catch {
        // non-fatal per recipient
      }
    }
  }

  if (sendTelegram && targets.length > 0) {
    const htmlMessage = convertMarkdownToTelegramHtml(input.title, input.body_md);
    const seenChats = new Set<string>();
    const chatQueue: string[] = [];

    for (const t of targets) {
      if (!t.telegramEnabled || t.telegramChatIds.length === 0) {
        telegramSkipped++;
        continue;
      }
      for (const chatId of t.telegramChatIds) {
        if (!seenChats.has(chatId)) {
          seenChats.add(chatId);
          chatQueue.push(chatId);
        }
      }
    }

    for (const chatId of chatQueue) {
      const res = await sendTelegramPhotoOrMessage({
        chatId,
        htmlText: htmlMessage,
        imageUrl: input.image_url,
        button: linkVal
          ? { text: input.button_text?.trim() || "🌐 Открыть платформу", url: linkVal }
          : undefined,
      });
      if (res.ok) telegramSent++;
      else telegramFailed++;
      await new Promise((r) => setTimeout(r, 35));
    }
  }

  const nowIso = new Date().toISOString();
  await db.run(
    `UPDATE admin_mailings
     SET status = 'sent',
         total_targets = ?,
         in_app_sent = ?,
         push_sent = ?,
         telegram_sent = ?,
         telegram_failed = ?,
         telegram_skipped = ?,
         sent_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      targets.length,
      inAppSent,
      pushSent,
      telegramSent,
      telegramFailed,
      telegramSkipped,
      nowIso,
      nowIso,
      mailingId,
    ]
  );

  const finalRow = await db.get(`SELECT * FROM admin_mailings WHERE id = ? LIMIT 1`, [mailingId]);
  return formatMailingRow(finalRow);
}

export async function deleteMailingRecord(db: ProTalkDbWrapper, id: string) {
  await ensureMailingsSchemaPg();
  await db.run(`DELETE FROM admin_mailings WHERE id = ?`, [id]);
}
