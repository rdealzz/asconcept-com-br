// Utilitários de sanitização e validação para blindar entradas do usuário.
// Regras: sem tags HTML, sem handlers on*=, sem javascript:, e limites de tamanho.

const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const SCRIPT_RE = /<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi;
const EVENT_ATTR_RE = /on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_PROTOCOL_RE = /javascript:/gi;
const DATA_HTML_RE = /data:text\/html/gi;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type SanitizeOptions = {
  maxLength?: number;
  allowNewlines?: boolean;
};

/**
 * Sanitiza uma string de texto vinda do usuário.
 * - Remove qualquer tag HTML.
 * - Neutraliza handlers de evento e URLs perigosas.
 * - Corta control chars.
 * - Aplica limite de tamanho (default 500).
 */
export function sanitizeText(input: unknown, opts: SanitizeOptions = {}): string {
  const { maxLength = 500, allowNewlines = false } = opts;
  if (input === null || input === undefined) return "";
  let s = String(input);
  s = s.replace(SCRIPT_RE, "");
  s = s.replace(TAG_RE, "");
  s = s.replace(EVENT_ATTR_RE, "");
  s = s.replace(JS_PROTOCOL_RE, "");
  s = s.replace(DATA_HTML_RE, "");
  s = s.replace(CONTROL_CHARS_RE, "");
  if (!allowNewlines) s = s.replace(/[\r\n\t]+/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

export function sanitizeEmail(input: unknown): string {
  const s = sanitizeText(input, { maxLength: 254 }).toLowerCase();
  // RFC 5322 simplificado — bloqueia praticamente tudo que não é e-mail.
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : "";
}

export function sanitizeUrl(input: unknown, opts: { allowRelative?: boolean } = {}): string {
  const raw = sanitizeText(input, { maxLength: 2048 });
  if (!raw) return "";
  if (opts.allowRelative && raw.startsWith("/")) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") {
      return u.toString();
    }
    return "";
  } catch {
    return "";
  }
}

export function sanitizeNumber(
  input: unknown,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number | null {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = opts;
  const n = typeof input === "number" ? input : Number(String(input ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const val = integer ? Math.trunc(n) : n;
  if (val < min || val > max) return null;
  return val;
}

/** Detecta grosseiramente se o texto contém HTML/script — usar em validação bloqueante. */
export function looksLikeHtmlOrScript(input: unknown): boolean {
  if (input === null || input === undefined) return false;
  const s = String(input);
  return TAG_RE.test(s) || JS_PROTOCOL_RE.test(s) || EVENT_ATTR_RE.test(s);
}
