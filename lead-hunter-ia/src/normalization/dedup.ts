import type { Lead } from "../types/index.js";
import { normalizeDomain } from "./normalizeDomain.js";
import { normalizePhone } from "./normalizePhone.js";
import { normalizeEmail } from "./normalizeEmail.js";
import { normalizeInstagram } from "./normalizeInstagram.js";
import { normalizeCompanyName } from "./normalizeCompanyName.js";
import { companyNameSimilarity } from "./similarity.js";

// Deduplicação PURA (sem dependência de banco), testável isoladamente.

function dupKeys(l: Lead) {
  return {
    domain: normalizeDomain(l.site || ""),
    phone: l.phone ? normalizePhone(l.phone) : null,
    whats: l.whatsapp ? normalizePhone(l.whatsapp) : null,
    email: l.email ? normalizeEmail(l.email) : null,
    insta: l.instagram ? normalizeInstagram(l.instagram) : null,
    name: normalizeCompanyName(l.companyName),
    city: (l.city || "").toLowerCase().trim(),
  };
}

/** True se dois leads são (provavelmente) a mesma empresa. */
export function leadsAreDuplicate(a: Lead, b: Lead): boolean {
  const c = dupKeys(a);
  const k = dupKeys(b);
  if (c.domain && k.domain && c.domain === k.domain) return true;
  const cTel = c.phone || c.whats;
  if (cTel && (k.phone === cTel || k.whats === cTel)) return true;
  if (c.email && k.email && c.email === k.email) return true;
  if (c.insta && k.insta && c.insta === k.insta) return true;
  if (c.name && k.name && c.city === k.city) {
    if (c.name === k.name) return true;
    if (companyNameSimilarity(a.companyName, b.companyName) >= 0.9) return true;
  }
  return false;
}

/** True se `candidate` já existe em `existing`. */
export function isDuplicate(candidate: Lead, existing: Lead[]): boolean {
  return existing.some((e) => leadsAreDuplicate(candidate, e));
}

/** Remove duplicados internos de uma lista. */
export function dedupeLeads(leads: Lead[]): Lead[] {
  const kept: Lead[] = [];
  for (const lead of leads) {
    if (!isDuplicate(lead, kept)) kept.push(lead);
  }
  return kept;
}
