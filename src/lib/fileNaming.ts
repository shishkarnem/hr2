export function transliterate(str: string): string {
  const ruMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  return str
    .toLowerCase()
    .split('')
    .map(c => ruMap[c] || c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function formatFileNameWithUserAndTimestamp(originalFilename: string, userId?: string | number): string {
  const cleanFilename = (originalFilename || 'file.pdf').trim();
  const lastDot = cleanFilename.lastIndexOf('.');
  let ext = 'pdf';
  let rawBase = cleanFilename;

  if (lastDot > 0) {
    ext = cleanFilename.substring(lastDot + 1).toLowerCase();
    rawBase = cleanFilename.substring(0, lastDot);
  }

  const cleanBase = transliterate(rawBase) || 'file';

  // Extract 6-digit user ID
  let cleanUser = '';
  if (userId) {
    const digits = String(userId).replace(/\D/g, '');
    if (digits.length >= 6) {
      cleanUser = digits.slice(-6);
    } else if (digits.length > 0) {
      cleanUser = digits.padStart(6, '0');
    } else {
      cleanUser = transliterate(String(userId)).replace(/[^a-z0-9]/g, '').slice(0, 10);
    }
  }

  if (!cleanUser && typeof localStorage !== 'undefined') {
    const demoId = localStorage.getItem('demo_user_id') || localStorage.getItem('rr_user_id') || '';
    const digits = demoId.replace(/\D/g, '');
    if (digits.length >= 6) {
      cleanUser = digits.slice(-6);
    }
  }

  if (!cleanUser) {
    cleanUser = '856459';
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const timestamp = `${YYYY}_${MM}_${DD}_${hh}_${mm}_${ss}`;

  return `${cleanBase}_${cleanUser}_${timestamp}.${ext}`;
}

export function formatShortFileDisplayUrl(filename: string, userId?: string | number): string {
  const formattedName = formatFileNameWithUserAndTimestamp(filename, userId);
  return `/file/${formattedName}`;
}

export function toAbsoluteUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(?:https?:|data:|blob:|\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  const origin = typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : '';
  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed}`;
  }
  return `${origin}/${trimmed}`;
}

import { rrImg } from "./img";

export function normalizeFileUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  return rrImg(trimmed);
}

