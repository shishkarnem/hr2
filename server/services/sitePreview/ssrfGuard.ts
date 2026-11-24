import dns from "dns/promises";
import net from "net";

const MAX_URL_LENGTH = 1024;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  let ip = String(rawIp || "").trim().toLowerCase();
  if (!ip) return true;

  // Handle IPv6 zone index (e.g. fe80::1%eth0)
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  // Unwrap IPv4-mapped IPv6 addresses (::ffff:a.b.c.d)
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) {
      ip = mapped;
    }
  }

  if (net.isIPv4(ip)) {
    const num = ipv4ToInt(ip);
    if (num === null) return true;
    const inRange = (cidrBase: string, prefixLen: number) => {
      const base = ipv4ToInt(cidrBase);
      if (base === null) return false;
      const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
      return (num & mask) === (base & mask);
    };
    return (
      inRange("0.0.0.0", 8) || // Current network / unspecified
      inRange("10.0.0.0", 8) || // Private RFC 1918
      inRange("100.64.0.0", 10) || // Carrier-grade NAT RFC 6598
      inRange("127.0.0.0", 8) || // Loopback
      inRange("169.254.0.0", 16) || // Link-local & cloud metadata (169.254.169.254)
      inRange("172.16.0.0", 12) || // Private RFC 1918
      inRange("192.0.0.0", 24) || // IETF protocol assignments
      inRange("192.0.2.0", 24) || // TEST-NET-1
      inRange("192.168.0.0", 16) || // Private RFC 1918
      inRange("198.18.0.0", 15) || // Benchmark testing
      inRange("198.51.100.0", 24) || // TEST-NET-2
      inRange("203.0.113.0", 24) || // TEST-NET-3
      inRange("224.0.0.0", 4) || // Multicast
      inRange("240.0.0.0", 4) // Reserved / Broadcast
    );
  }

  if (net.isIPv6(ip)) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // Unique local fc00::/7
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true; // Link-local fe80::/10
    if (ip.startsWith("ff")) return true; // Multicast
    return false;
  }

  return true;
}

export function normalizeExternalUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  // Reject dangerous or non-http explicit schemes early
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      // Allow punycode/IDN but forbid single-label internal hostnames
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<string> {
  const normalized = normalizeExternalUrl(rawUrl);
  if (!normalized) {
    throw new Error("Invalid external URL");
  }

  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Blocked internal hostname");
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Blocked private IP target");
    }
    return normalized;
  }

  const resolved = await dns.lookup(host, { all: true, verbatim: false });
  if (!resolved || resolved.length === 0) {
    throw new Error("Unable to resolve target hostname");
  }
  for (const record of resolved) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error("Target hostname resolved to private/reserved IP");
    }
  }

  return normalized;
}

export async function readBoundedBuffer(res: Response, maxBytes: number): Promise<Buffer> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > maxBytes) {
    throw new Error("Response too large");
  }
  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("Response too large");
    return Buffer.from(ab);
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new Error("Response exceeded maximum byte limit");
        }
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel cleanup errors
    }
  }
  return Buffer.concat(chunks, total);
}

export async function fetchExternalSafe(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string>; skipDnsCheckForTrustedApi?: boolean } = {}
): Promise<{ response: Response; finalUrl: string; buffer: Buffer }> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const maxBytes = options.maxBytes ?? 6 * 1024 * 1024;
  let currentUrl = options.skipDnsCheckForTrustedApi
    ? normalizeExternalUrl(rawUrl) || (() => { throw new Error("Invalid URL"); })()
    : await assertSafeExternalUrl(rawUrl);

  for (let hop = 0; hop <= 3; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "image/webp,image/png,image/jpeg,image/*,text/html;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect missing Location header");
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = await assertSafeExternalUrl(nextUrl);
      continue;
    }

    const buffer = await readBoundedBuffer(res, maxBytes);
    return { response: res, finalUrl: currentUrl, buffer };
  }

  throw new Error("Too many redirects");
}
