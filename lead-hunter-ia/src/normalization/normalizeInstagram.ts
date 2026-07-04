// Normaliza um handle do Instagram para apenas o usuário (sem @, URL, barra).
const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv"]);

export function normalizeInstagram(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  let v = value.trim();
  if (!v) return null;

  // Extrai o handle de uma URL do instagram, se for o caso.
  const urlMatch = v.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (urlMatch) v = urlMatch[1]!;

  v = v.replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();

  if (!/^[a-z0-9_.]{2,30}$/.test(v)) return null;
  if (RESERVED.has(v)) return null;
  return v;
}
