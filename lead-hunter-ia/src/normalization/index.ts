// Barril do módulo de normalização.
export { normalizeDomain } from "./normalizeDomain.js";
export { normalizePhone } from "./normalizePhone.js";
export { normalizeEmail } from "./normalizeEmail.js";
export { normalizeInstagram } from "./normalizeInstagram.js";
export { normalizeCompanyName } from "./normalizeCompanyName.js";
export { similarity, companyNameSimilarity } from "./similarity.js";

// WhatsApp segue a mesma normalização de telefone.
export { normalizePhone as normalizeWhatsapp } from "./normalizePhone.js";
