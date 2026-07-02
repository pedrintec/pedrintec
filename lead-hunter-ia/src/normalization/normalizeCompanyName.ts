// Remove sufixos societários e ruído para comparar nomes de empresa.
const SUFFIXES = [
  "ltda",
  "me",
  "epp",
  "eireli",
  "s/a",
  "sa",
  "s\\.a\\.",
  "mei",
  "cnpj",
  "ltda.",
];

export function normalizeCompanyName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  let s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase();

  // remove sufixos societários como palavras isoladas
  for (const suf of SUFFIXES) {
    s = s.replace(new RegExp(`\\b${suf}\\b`, "g"), " ");
  }

  return s
    .replace(/[^a-z0-9]+/g, " ") // pontuação -> espaço
    .replace(/\s+/g, " ")
    .trim();
}
