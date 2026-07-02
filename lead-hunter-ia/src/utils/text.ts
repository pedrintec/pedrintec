// Utilitários de texto: extração por regex, normalização e similaridade.
// NÃO coletamos dados pessoais sensíveis; foco em dados de contato COMERCIAIS públicos.

/** Remove acentos e normaliza para comparação. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Mantém só dígitos (para telefones/WhatsApp). */
export function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

/** Extrai e-mails (descarta imagens/assets que parecem e-mail). */
export function extractEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) ?? [];
  return unique(
    found
      .map((e) => e.toLowerCase())
      .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e))
      .filter((e) => !e.includes("example.com")),
  );
}

/** Extrai telefones em formatos brasileiros comuns (e internacionais simples). */
export function extractPhones(text: string): string[] {
  // Ex.: (11) 91234-5678, +55 11 91234 5678, 0800 123 4567
  const re =
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}|0800[\s.-]?\d{3}[\s.-]?\d{3,4}/g;
  const found = text.match(re) ?? [];
  return unique(
    found
      .map((p) => p.trim())
      .filter((p) => {
        const d = digitsOnly(p);
        return d.length >= 8 && d.length <= 13; // descarta ruído
      }),
  );
}

/** Detecta link/WhatsApp a partir do HTML. */
export function extractWhatsapp(html: string): string | undefined {
  const m =
    html.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)[/=]?(\+?\d{8,15})/i) ??
    html.match(/whatsapp[^0-9]{0,20}(\+?\d{2,3}[\s.-]?\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4})/i);
  if (m && m[1]) return digitsOnly(m[1]);
  return undefined;
}

export function extractInstagram(html: string): string | undefined {
  const m = html.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i);
  if (m && m[1] && !["p", "reel", "explore"].includes(m[1].toLowerCase())) {
    return `https://instagram.com/${m[1]}`;
  }
  return undefined;
}

export function extractLinkedin(html: string): string | undefined {
  const m = html.match(/linkedin\.com\/(company|in)\/([A-Za-z0-9_-]{2,60})/i);
  if (m) return `https://linkedin.com/${m[1]}/${m[2]}`;
  return undefined;
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Similaridade de strings (Dice coefficient sobre bigramas), 0..1.
 * Usada para detectar nomes de empresa "parecidos" (dedup).
 */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(x);
  const mb = bigrams(y);
  let overlap = 0;
  for (const [bg, count] of ma) {
    const other = mb.get(bg) ?? 0;
    overlap += Math.min(count, other);
  }
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** Extrai o domínio "raiz" para dedup (remove www e protocolo). */
export function rootDomain(url: string): string {
  try {
    const host = new URL(url).host.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return normalize(url);
  }
}
