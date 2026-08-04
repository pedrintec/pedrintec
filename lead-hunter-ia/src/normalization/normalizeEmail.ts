// Normaliza e valida (formato básico) um e-mail.
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function normalizeEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;
  const clean = email
    .trim()
    .toLowerCase()
    // remove pontuação/aspas/parênteses presos nas pontas
    .replace(/^[<("'\s.;,]+/, "")
    .replace(/[>)"'\s.;,]+$/, "");
  if (!EMAIL_RE.test(clean)) return null;
  // descarta e-mails de assets
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(clean)) return null;
  return clean;
}
