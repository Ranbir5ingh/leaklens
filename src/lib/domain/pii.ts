/**
 * DPDP Act 2023: customer names, phones and addresses are personal data. Reconciliation does not
 * need them, so we minimise: values are masked in the browser before upload, masked again on the
 * server (idempotent), and addresses are never stored — only the pincode survives.
 */

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => (p.length <= 1 ? p : p[0] + "•".repeat(Math.min(p.length - 1, 4)))).join(" ");
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "••••••" + digits.slice(-4);
}

const PII_HEADER = /(name|customer|buyer|consignee|phone|mobile|contact|email|address|addr|street|landmark)/i;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;

/**
 * Redact sample cells before they are sent to an outside AI model for mapping suggestions.
 * We do not know which columns are PII until the mapping is decided, so we redact by header
 * hint and by value shape (phones, emails, multi-word free text).
 */
export function redactForAI(header: string, value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (!s) return "";
  if (PII_HEADER.test(header) && !/(id|ref|no|number|code)$/i.test(header.trim())) return "[redacted]";
  let out = s.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
  if (/^[A-Za-z][A-Za-z.']+(\s+[A-Za-z.']+){1,}$/.test(out) && out.length > 12) out = "[text]";
  return out.slice(0, 40);
}
