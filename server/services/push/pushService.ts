import crypto from "crypto";
import * as webpush from "web-push";
import type { PgDBWrapper } from "../db";

export type NotificationChannel = "bell" | "telegram" | "push";
export type NotificationOwnerRole = "employer" | "candidate" | "admin";

export interface EventChannelMatrix {
  bell: boolean;
  telegram: boolean;
  push: boolean;
}

export interface NotificationThresholds {
  low_balance_rr: number;
  low_general_limits: number;
  low_vacancy_limits: number;
}

export const DEFAULT_NOTIFICATION_THRESHOLDS: NotificationThresholds = {
  low_balance_rr: 100,
  low_general_limits: 10,
  low_vacancy_limits: 10,
};

export interface NormalizedNotificationsConfig {
  telegram_user_ids: string;
  telegram_group_ids: string;
  telegram_channel_ids: string;
  channels: {
    bell: boolean;
    telegram: boolean;
    push: boolean;
  };
  events: Record<string, boolean>;
  event_channels: Record<string, EventChannelMatrix>;
  thresholds: NotificationThresholds;
}

export const EMPLOYER_NOTIFICATION_EVENTS = [
  "new_candidate",
  "interview_stages",
  "interview_reject",
  "interview_success",
  "training_progress",
  "certificate_ready",
  "balance_change",
  "low_balance_rr",
  "low_general_limits",
  "low_vacancy_limits",
] as const;

export const CANDIDATE_NOTIFICATION_EVENTS = [
  "interview_result",
  "training_progress",
  "certificate_issued",
  "hire_decision",
] as const;

const VAPID_SETTINGS_KEY = "web_push_vapid_keys";

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapidKeys: StoredVapidKeys | null = null;
let vapidConfigured = false;

export async function getOrCreateVapidKeys(db: PgDBWrapper): Promise<StoredVapidKeys> {
  if (cachedVapidKeys && vapidConfigured) {
    return cachedVapidKeys;
  }

  try {
    const row = await db.get(`SELECT value FROM system_settings WHERE key = ? LIMIT 1`, [VAPID_SETTINGS_KEY]);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed?.publicKey && parsed?.privateKey) {
        cachedVapidKeys = {
          publicKey: String(parsed.publicKey),
          privateKey: String(parsed.privateKey),
          subject: String(parsed.subject || "mailto:support@hr-rr.online"),
        };
        webpush.setVapidDetails(cachedVapidKeys.subject, cachedVapidKeys.publicKey, cachedVapidKeys.privateKey);
        vapidConfigured = true;
        return cachedVapidKeys;
      }
    }
  } catch (err: any) {
    console.warn("[WebPush] Could not read VAPID keys from system_settings:", err?.message);
  }

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const generated = envPub && envPriv ? { publicKey: envPub, privateKey: envPriv } : webpush.generateVAPIDKeys();

  const keys: StoredVapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:support@hr-rr.online",
  };

  try {
    await db.run(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [VAPID_SETTINGS_KEY, JSON.stringify(keys)]
    );
  } catch (err: any) {
    console.warn("[WebPush] Could not persist VAPID keys to system_settings:", err?.message);
  }

  cachedVapidKeys = keys;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  vapidConfigured = true;
  return keys;
}

export function buildDefaultNotificationsConfig(role: NotificationOwnerRole): NormalizedNotificationsConfig {
  if (role === "candidate") {
    return {
      telegram_user_ids: "",
      telegram_group_ids: "",
      telegram_channel_ids: "",
      channels: {
        bell: true,
        telegram: true,
        push: true,
      },
      events: {
        interview_result: true,
        training_progress: true,
        certificate_issued: true,
        hire_decision: true,
      },
      event_channels: {
        interview_result: { bell: true, telegram: true, push: true },
        training_progress: { bell: true, telegram: true, push: true },
        certificate_issued: { bell: true, telegram: true, push: true },
        hire_decision: { bell: true, telegram: true, push: true },
      },
      thresholds: { ...DEFAULT_NOTIFICATION_THRESHOLDS },
    };
  }

  const empEvents: Record<string, boolean> = {};
  const empMatrix: Record<string, EventChannelMatrix> = {};
  for (const k of EMPLOYER_NOTIFICATION_EVENTS) {
    empEvents[k] = true;
    empMatrix[k] = { bell: true, telegram: true, push: true };
  }

  return {
    telegram_user_ids: "",
    telegram_group_ids: "",
    telegram_channel_ids: "",
    channels: {
      bell: true,
      telegram: true,
      push: true,
    },
    events: empEvents,
    event_channels: empMatrix,
    thresholds: { ...DEFAULT_NOTIFICATION_THRESHOLDS },
  };
}

function sanitizeThresholdVal(val: any, fallback: number): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function parseNotificationsConfig(
  raw: any,
  role: NotificationOwnerRole = "employer"
): NormalizedNotificationsConfig {
  const defaults = buildDefaultNotificationsConfig(role);
  let parsed: any = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw;
  }

  const channels = {
    bell: parsed?.channels?.bell !== undefined ? Boolean(parsed.channels.bell) : defaults.channels.bell,
    telegram: parsed?.channels?.telegram !== undefined ? Boolean(parsed.channels.telegram) : defaults.channels.telegram,
    push: parsed?.channels?.push !== undefined ? Boolean(parsed.channels.push) : defaults.channels.push,
  };

  const allowedKeys = role === "candidate" ? [...CANDIDATE_NOTIFICATION_EVENTS] : [...EMPLOYER_NOTIFICATION_EVENTS];
  const events: Record<string, boolean> = { ...defaults.events };
  const event_channels: Record<string, EventChannelMatrix> = {};

  for (const key of allowedKeys) {
    const defMat = defaults.event_channels[key] || { bell: true, telegram: true, push: true };
    let incMat = parsed?.event_channels?.[key];
    let hasLegacyEvBool = parsed?.events && typeof parsed.events[key] === "boolean";
    let legacyEvVal = hasLegacyEvBool ? Boolean(parsed.events[key]) : undefined;

    // Seamless migration from deprecated keys
    if (role !== "candidate") {
      if ((key === "interview_reject" || key === "interview_success") && !incMat && !hasLegacyEvBool) {
        if (parsed?.event_channels?.interview_passed) incMat = parsed.event_channels.interview_passed;
        if (parsed?.events && typeof parsed.events.interview_passed === "boolean") {
          hasLegacyEvBool = true;
          legacyEvVal = Boolean(parsed.events.interview_passed);
        }
      }
      if (key === "certificate_ready" && !incMat && !hasLegacyEvBool) {
        if (parsed?.event_channels?.test_passed) incMat = parsed.event_channels.test_passed;
        if (parsed?.events && typeof parsed.events.test_passed === "boolean") {
          hasLegacyEvBool = true;
          legacyEvVal = Boolean(parsed.events.test_passed);
        }
      }
    }

    const hasMatTg = incMat && typeof incMat.telegram === "boolean";
    const tgVal =
      hasLegacyEvBool && hasMatTg
        ? Boolean(legacyEvVal) && Boolean(incMat.telegram)
        : hasMatTg
        ? Boolean(incMat.telegram)
        : hasLegacyEvBool
        ? Boolean(legacyEvVal)
        : defMat.telegram;

    event_channels[key] = {
      bell: incMat?.bell !== undefined ? Boolean(incMat.bell) : defMat.bell,
      telegram: tgVal,
      push: incMat?.push !== undefined ? Boolean(incMat.push) : defMat.push,
    };
    events[key] = tgVal;
  }

  const thresholds: NotificationThresholds = {
    low_balance_rr: sanitizeThresholdVal(parsed?.thresholds?.low_balance_rr, DEFAULT_NOTIFICATION_THRESHOLDS.low_balance_rr),
    low_general_limits: sanitizeThresholdVal(parsed?.thresholds?.low_general_limits, DEFAULT_NOTIFICATION_THRESHOLDS.low_general_limits),
    low_vacancy_limits: sanitizeThresholdVal(parsed?.thresholds?.low_vacancy_limits, DEFAULT_NOTIFICATION_THRESHOLDS.low_vacancy_limits),
  };

  return {
    telegram_user_ids: String(parsed?.telegram_user_ids ?? "").trim(),
    telegram_group_ids: String(parsed?.telegram_group_ids ?? "").trim(),
    telegram_channel_ids: String(parsed?.telegram_channel_ids ?? "").trim(),
    channels,
    events,
    event_channels,
    thresholds,
  };
}

export function mergeNotificationsConfig(
  existingRaw: any,
  incomingRaw: any,
  role: NotificationOwnerRole = "employer"
): NormalizedNotificationsConfig {
  const existingCfg = parseNotificationsConfig(existingRaw, role);
  let inc: any = {};
  if (typeof incomingRaw === "string" && incomingRaw.trim()) {
    try {
      inc = JSON.parse(incomingRaw);
    } catch {
      inc = {};
    }
  } else if (incomingRaw && typeof incomingRaw === "object") {
    inc = incomingRaw;
  }

  const nextChannels = {
    ...existingCfg.channels,
    ...(inc?.channels || {}),
  };

  const allowedKeys = role === "candidate" ? [...CANDIDATE_NOTIFICATION_EVENTS] : [...EMPLOYER_NOTIFICATION_EVENTS];
  const nextEvents: Record<string, boolean> = { ...existingCfg.events };
  const nextEventChannels: Record<string, EventChannelMatrix> = {};

  for (const key of allowedKeys) {
    const curMat = existingCfg.event_channels[key] || { bell: true, telegram: true, push: true };
    const incMat = inc?.event_channels?.[key];
    const hasExplicitMatrixTg = incMat && typeof incMat.telegram === "boolean";
    const hasExplicitEventsTg = inc?.events && typeof inc.events[key] === "boolean";

    const nextTg = hasExplicitMatrixTg
      ? Boolean(incMat.telegram)
      : hasExplicitEventsTg
      ? Boolean(inc.events[key])
      : Boolean(curMat.telegram);

    nextEventChannels[key] = {
      bell: incMat?.bell !== undefined ? Boolean(incMat.bell) : Boolean(curMat.bell),
      telegram: nextTg,
      push: incMat?.push !== undefined ? Boolean(incMat.push) : Boolean(curMat.push),
    };
    nextEvents[key] = nextTg;
  }

  const nextThresholds: NotificationThresholds = {
    low_balance_rr:
      inc?.thresholds?.low_balance_rr !== undefined
        ? sanitizeThresholdVal(inc.thresholds.low_balance_rr, existingCfg.thresholds.low_balance_rr)
        : existingCfg.thresholds.low_balance_rr,
    low_general_limits:
      inc?.thresholds?.low_general_limits !== undefined
        ? sanitizeThresholdVal(inc.thresholds.low_general_limits, existingCfg.thresholds.low_general_limits)
        : existingCfg.thresholds.low_general_limits,
    low_vacancy_limits:
      inc?.thresholds?.low_vacancy_limits !== undefined
        ? sanitizeThresholdVal(inc.thresholds.low_vacancy_limits, existingCfg.thresholds.low_vacancy_limits)
        : existingCfg.thresholds.low_vacancy_limits,
  };

  return parseNotificationsConfig(
    {
      telegram_user_ids:
        inc?.telegram_user_ids !== undefined ? String(inc.telegram_user_ids ?? "").trim() : existingCfg.telegram_user_ids,
      telegram_group_ids:
        inc?.telegram_group_ids !== undefined ? String(inc.telegram_group_ids ?? "").trim() : existingCfg.telegram_group_ids,
      telegram_channel_ids:
        inc?.telegram_channel_ids !== undefined ? String(inc.telegram_channel_ids ?? "").trim() : existingCfg.telegram_channel_ids,
      channels: nextChannels,
      events: nextEvents,
      event_channels: nextEventChannels,
      thresholds: nextThresholds,
    },
    role
  );
}

export function isChannelEnabledForEvent(
  config: NormalizedNotificationsConfig,
  eventKey: string,
  channel: NotificationChannel
): boolean {
  if (!config?.channels?.[channel]) return false;
  if (channel === "telegram") {
    const hasMat = config.event_channels?.[eventKey] && typeof config.event_channels[eventKey].telegram === "boolean";
    const hasEv = typeof config.events?.[eventKey] === "boolean";
    if (hasMat && hasEv) {
      return config.event_channels[eventKey].telegram && config.events[eventKey];
    }
    if (hasMat) return config.event_channels[eventKey].telegram;
    if (hasEv) return config.events[eventKey];
    return true;
  }
  const mat = config.event_channels?.[eventKey];
  if (mat && typeof mat[channel] === "boolean") {
    return mat[channel];
  }
  return true;
}

export function mapNotificationKindToEventKey(kind: string, role: NotificationOwnerRole): string | null {
  const k = String(kind || "").toLowerCase();
  if (role === "candidate") {
    if (k === "hire_decision" || k === "decision") return "hire_decision";
    if (k === "certificate" || k === "certificate_issued") return "certificate_issued";
    if (k === "training" || k === "test" || k === "training_progress") return "training_progress";
    if (k === "interview" || k === "interview_result") return "interview_result";
    return null;
  }
  if (k === "new_candidate" || k === "candidate") return "new_candidate";
  if (k === "interview_stages" || k === "interview_stage") return "interview_stages";
  if (k === "interview_reject") return "interview_reject";
  if (k === "interview_success" || k === "interview" || k === "interview_passed") return "interview_success";
  if (k === "certificate_ready" || k === "certificate") return "certificate_ready";
  if (k === "training" || k === "test" || k === "test_passed" || k === "training_progress") return "training_progress";
  if (k === "low_balance_rr") return "low_balance_rr";
  if (k === "low_general_limits") return "low_general_limits";
  if (k === "low_vacancy_limits") return "low_vacancy_limits";
  if (k === "transaction" || k === "limits" || k === "balance" || k === "billing" || k === "balance_change") {
    return "balance_change";
  }
  return null;
}

export async function upsertPushSubscription(
  db: PgDBWrapper,
  params: {
    ownerType: NotificationOwnerRole;
    ownerId: string;
    ownerPublicId?: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
    deviceLabel?: string;
  }
) {
  const id = `push_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await db.run(
    `INSERT INTO push_subscriptions (
       id, owner_type, owner_id, owner_public_id, endpoint, p256dh, auth, user_agent, device_label, is_active, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())
     ON CONFLICT (endpoint) DO UPDATE SET
       owner_type = EXCLUDED.owner_type,
       owner_id = EXCLUDED.owner_id,
       owner_public_id = COALESCE(EXCLUDED.owner_public_id, push_subscriptions.owner_public_id),
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
       device_label = COALESCE(EXCLUDED.device_label, push_subscriptions.device_label),
       is_active = TRUE,
       updated_at = NOW()`,
    [
      id,
      params.ownerType,
      String(params.ownerId),
      params.ownerPublicId ? String(params.ownerPublicId) : null,
      params.endpoint,
      params.p256dh,
      params.auth,
      params.userAgent || null,
      params.deviceLabel || null,
    ]
  );
  return { id, endpoint: params.endpoint };
}

export async function removePushSubscription(db: PgDBWrapper, endpoint: string) {
  if (!endpoint) return;
  await db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [endpoint]);
}

export async function getUserPushSubscriptions(
  db: PgDBWrapper,
  ownerType: NotificationOwnerRole,
  ownerIds: string[]
) {
  const cleanIds = Array.from(new Set(ownerIds.map((x) => String(x || "").trim()).filter(Boolean)));
  if (cleanIds.length === 0) return [];
  const placeholders = cleanIds.map(() => "?").join(", ");
  return (
    (await db.all(
      `SELECT * FROM push_subscriptions
       WHERE owner_type = ?
         AND is_active = TRUE
         AND (owner_id IN (${placeholders}) OR owner_public_id IN (${placeholders}))
       ORDER BY updated_at DESC`,
      [ownerType, ...cleanIds, ...cleanIds]
    )) || []
  );
}

export async function sendWebPushToOwner(
  db: PgDBWrapper,
  params: {
    ownerType: NotificationOwnerRole;
    ownerIds: string[];
    title: string;
    body: string;
    url?: string;
    tag?: string;
    data?: Record<string, any>;
  }
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await getUserPushSubscriptions(db, params.ownerType, params.ownerIds);
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };

  await getOrCreateVapidKeys(db);

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    icon: "/icons/pwa/pwa-192x192.png",
    badge: "/icons/pwa/badge-72x72.png",
    url: params.url || "/",
    tag: params.tag || "rr-notification",
    data: {
      url: params.url || "/",
      ...(params.data || {}),
    },
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
        { TTL: 60 * 60 * 24 }
      );
      sent++;
    } catch (err: any) {
      failed++;
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        removed++;
        await db.run(`DELETE FROM push_subscriptions WHERE id = ?`, [sub.id]).catch(() => {});
      } else {
        console.warn("[WebPush] Delivery notice:", err?.message || status);
      }
    }
  }

  return { sent, failed, removed };
}

export async function resolveOwnerNotificationsConfig(
  db: PgDBWrapper,
  ownerType: NotificationOwnerRole,
  ownerIds: string[]
): Promise<{ row: any; config: NormalizedNotificationsConfig; resolvedIds: string[] }> {
  const cleanIds = Array.from(new Set(ownerIds.map((x) => String(x || "").trim()).filter(Boolean)));
  if (cleanIds.length === 0) {
    return { row: null, config: buildDefaultNotificationsConfig(ownerType), resolvedIds: [] };
  }

  if (ownerType === "employer") {
    for (const raw of cleanIds) {
      const bare = raw.replace(/^emp-?/i, "").trim();
      const row = await db.get(
        `SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? LIMIT 1`,
        [raw, bare, raw]
      );
      if (row) {
        const allIds = [row.id, row.public_id, row.user_id].filter(Boolean).map(String);
        return {
          row,
          config: parseNotificationsConfig(row.notifications_config, "employer"),
          resolvedIds: Array.from(new Set([...cleanIds, ...allIds])),
        };
      }
    }
  } else if (ownerType === "candidate") {
    for (const raw of cleanIds) {
      const bare = raw.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
      const row = await db.get(
        `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ? LIMIT 1`,
        [raw, bare, bare]
      );
      if (row) {
        const allIds = [row.id, row.public_id, row.legacy_public_id].filter(Boolean).map(String);
        return {
          row,
          config: parseNotificationsConfig(row.notifications_config, "candidate"),
          resolvedIds: Array.from(new Set([...cleanIds, ...allIds])),
        };
      }
    }
  }

  return { row: null, config: buildDefaultNotificationsConfig(ownerType), resolvedIds: cleanIds };
}

export async function dispatchUserNotification(
  db: PgDBWrapper,
  params: {
    ownerType: NotificationOwnerRole;
    ownerIds: string[];
    eventKey: string;
    kind: string;
    title: string;
    body: string;
    link?: string | null;
    meta?: Record<string, any>;
    candidateId?: string | null;
  }
) {
  const { row, config, resolvedIds } = await resolveOwnerNotificationsConfig(db, params.ownerType, params.ownerIds);
  const bellEnabled = isChannelEnabledForEvent(config, params.eventKey, "bell");
  const pushEnabled = isChannelEnabledForEvent(config, params.eventKey, "push");

  let bellId: string | null = null;
  if (bellEnabled && resolvedIds.length > 0) {
    try {
      bellId = `notif_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const primaryUserId = row?.id ? String(row.id) : resolvedIds[0];
      await db.run(
        `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at, recipient_kind, candidate_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          bellId,
          primaryUserId,
          params.ownerType,
          params.kind,
          params.title,
          params.body,
          params.link || null,
          JSON.stringify(params.meta || {}),
          params.ownerType,
          params.candidateId || (params.ownerType === "candidate" ? primaryUserId : null),
        ]
      );
    } catch (err: any) {
      console.warn("[Notifications] Insert bell notice:", err?.message);
    }
  }

  let pushResult = { sent: 0, failed: 0, removed: 0 };
  if (pushEnabled && resolvedIds.length > 0) {
    pushResult = await sendWebPushToOwner(db, {
      ownerType: params.ownerType,
      ownerIds: resolvedIds,
      title: params.title,
      body: params.body,
      url: params.link || "/",
      tag: `${params.ownerType}-${params.eventKey}`,
      data: { kind: params.kind, eventKey: params.eventKey, ...(params.meta || {}) },
    });
  }

  return {
    bellEnabled,
    pushEnabled,
    bellId,
    pushResult,
    config,
    ownerRow: row,
  };
}
