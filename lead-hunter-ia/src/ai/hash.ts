import { createHash } from "node:crypto";

// Hash estável dos campos relevantes do lead — usado para evitar reanalisar
// o mesmo lead sem necessidade (economia de tokens). Campos normalizados
// (trim + lowercase) para que variações irrelevantes não invalidem o cache.

export interface HashableLead {
  company_name?: string | null;
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  niche?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
}

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

export function leadInputHash(lead: HashableLead): string {
  const basis = [
    norm(lead.company_name),
    norm(lead.website),
    norm(lead.instagram),
    norm(lead.city),
    norm(lead.niche),
    norm(lead.phone),
    norm(lead.email),
    norm(lead.source),
  ].join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}
