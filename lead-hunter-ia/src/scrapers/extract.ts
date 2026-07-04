import * as cheerio from "cheerio";
import type { ExtractedData } from "../types/index.js";
import {
  extractEmails,
  extractInstagram,
  extractLinkedin,
  extractPhones,
  extractWhatsapp,
  unique,
} from "../utils/text.js";

// Extração de dados COMERCIAIS públicos de uma página HTML usando Cheerio.
// Ética: extraímos apenas dados de contato de negócios publicados pela própria
// empresa (telefone, e-mail comercial, redes). Não coletamos dados pessoais sensíveis.

/** Termos que indicam atendimento manual / intenção (alimentam o score). */
const SIGNAL_TERMS = [
  "agendamento",
  "agendar",
  "orçamento",
  "orcamento",
  "atendimento",
  "suporte",
  "consulta",
  "delivery",
  "reserva",
  "fale conosco",
  "whatsapp",
  "horário de atendimento",
];

/** Indícios de presença (ou ausência) de automação/chatbot. */
const CHATBOT_HINTS = [
  "chatbot",
  "chat-bot",
  "tawk.to",
  "intercom",
  "drift",
  "zendesk",
  "crisp.chat",
  "manychat",
  "jivochat",
  "blip",
  "rdstation",
];

export function extractFromHtml(html: string, url: string): ExtractedData {
  const $ = cheerio.load(html);

  // Remove scripts/estilos para texto limpo.
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const lowerHtml = html.toLowerCase();
  const lowerText = text.toLowerCase();

  // Nome da empresa: prioriza og:site_name > title > h1.
  // Títulos genéricos de páginas (ex.: "Fale Conosco", "Contato", "Home")
  // são descartados para o pipeline cair no domínio do site.
  const GENERIC_NAMES = [
    "fale conosco",
    "contato",
    "home",
    "início",
    "inicio",
    "página inicial",
    "pagina inicial",
    "sobre",
    "sobre nós",
    "blog",
    "menu",
    "404",
    "not found",
  ];
  const rawName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    $("title").first().text().trim().split(/[|\-–—]/)[0]?.trim() ||
    $("h1").first().text().trim() ||
    "";
  const companyName =
    rawName && !GENERIC_NAMES.includes(rawName.toLowerCase()) ? rawName : undefined;

  // E-mails: também varre mailto:.
  const mailtos = $('a[href^="mailto:"]')
    .map((_, el) => $(el).attr("href")?.replace("mailto:", "").split("?")[0] ?? "")
    .get();
  const emails = unique([...extractEmails(text), ...mailtos.map((m) => m.toLowerCase())]).filter(
    Boolean,
  );

  // Telefones: varre tel: + texto.
  // Links tel: costumam ser mais limpos que telefones extraídos do texto livre,
  // por isso entram primeiro (phones[0] vira o "telefone principal" do lead).
  const tels = $('a[href^="tel:"]')
    .map((_, el) => ($(el).attr("href")?.replace("tel:", "") ?? "").trim())
    .get()
    .filter(Boolean);
  const phones = unique([...tels, ...extractPhones(text)]);

  const whatsapp = extractWhatsapp(html);
  const instagram = extractInstagram(html);
  const linkedin = extractLinkedin(html);

  // Endereço: heurística simples (procura CEP / "Rua"/"Av." no texto).
  const addrMatch =
    text.match(/(Rua|Av\.?|Avenida|Travessa|Rod\.?|Rodovia)[^,;]{3,60}\d{1,5}[^.;]{0,40}/i)?.[0] ??
    text.match(/\d{5}-?\d{3}/)?.[0];
  const address = addrMatch?.trim();

  // Sinais textuais.
  const signals = SIGNAL_TERMS.filter((t) => lowerText.includes(t));

  // Sinais técnicos.
  const techSignals: string[] = [];
  const hasForm = $("form").length > 0;
  if (hasForm) techSignals.push("tem-formulario");
  const hasChatbot = CHATBOT_HINTS.some((h) => lowerHtml.includes(h));
  techSignals.push(hasChatbot ? "tem-chatbot" : "sem-chatbot");
  if (whatsapp || lowerHtml.includes("wa.me")) techSignals.push("tem-whatsapp");
  if (instagram) techSignals.push("tem-instagram");
  if (linkedin) techSignals.push("tem-linkedin");

  // Heurística "site simples/desatualizado": pouca quantidade de scripts/CSS modernos.
  const scriptCount = $("script").length; // já removidos acima? não — removemos antes do text, recarrega
  // (recarrega rapidamente só para contar tags estruturais)
  const $raw = cheerio.load(html);
  const isSimple =
    $raw("script").length <= 3 &&
    !lowerHtml.includes("react") &&
    !lowerHtml.includes("next") &&
    text.length < 4000;
  if (isSimple) techSignals.push("site-simples");

  void scriptCount;

  return {
    companyName,
    phones,
    whatsapp,
    emails,
    instagram,
    linkedin,
    address,
    signals,
    techSignals,
    rawTextSample: text.slice(0, 2000),
  };
}
