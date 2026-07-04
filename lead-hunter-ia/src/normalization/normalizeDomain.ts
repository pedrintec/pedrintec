// Normaliza uma URL/host para o domínio raiz: "https://www.x.com.br/p?a=1" -> "x.com.br".
export function normalizeDomain(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  let s = url.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.toLowerCase();
    const clean = host.replace(/^www\./, "");
    return clean || null;
  } catch {
    const fallback = url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]!
      .trim();
    return fallback || null;
  }
}
