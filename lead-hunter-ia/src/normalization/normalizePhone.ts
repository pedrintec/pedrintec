// Normaliza telefones, com tratamento especial para o Brasil.
// IMPORTANTE: não inventa DDD nem dígitos — se não der para normalizar com
// segurança, devolve o que foi possível ou null.

export function normalizePhone(
  phone?: string | null,
  defaultCountry = "BR",
): string | null {
  if (!phone || typeof phone !== "string") return null;
  let digits = phone.replace(/\D+/g, "");
  if (!digits) return null;

  // Remove zeros de operadora/DDD à esquerda (ex.: 0XX).
  digits = digits.replace(/^0+/, "");

  if (defaultCountry === "BR") {
    // Já vem com DDI 55 + (10 ou 11) dígitos -> mantém.
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      return `+${digits}`;
    }
    // 10 (fixo) ou 11 (celular) dígitos = DDD + número -> prefixa +55.
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
    // 0800 e afins (8 dígitos) -> não força DDI.
    if (digits.length === 8 || digits.length === 9) {
      return digits;
    }
    // Caso ambíguo: retorna os dígitos sem inventar nada.
    return digits.length >= 8 ? digits : null;
  }

  // Outros países: apenas garante o '+' se já houver DDI plausível.
  if (digits.length >= 10) return `+${digits}`;
  return digits.length >= 8 ? digits : null;
}
