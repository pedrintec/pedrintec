import type { ExtractedData, ScoreEvidence } from "../types/index.js";
import { EvidenceBuilder } from "./scoreEvidence.js";

// Acesso Comercial: facilidade de abordagem (canais públicos disponíveis).

export function accessScore(data: ExtractedData): { score: number; evidences: ScoreEvidence[] } {
  const b = new EvidenceBuilder("access");
  const hasWhats = !!data.whatsapp || data.techSignals.includes("tem-whatsapp");
  const hasPhone = data.phones.length > 0;
  const hasEmail = data.emails.length > 0;

  let channels = 0;
  if (hasWhats) {
    b.add(30, "WhatsApp público");
    channels++;
  }
  if (hasPhone) {
    b.add(20, "Telefone público");
    channels++;
  }
  if (hasEmail) {
    b.add(20, "E-mail público");
    channels++;
  }
  if (data.instagram) {
    b.add(15, "Instagram público");
    channels++;
  }
  if (data.linkedin) {
    b.add(10, "LinkedIn público");
    channels++;
  }
  if (channels >= 2) b.add(5, "Múltiplos canais de contato");

  return b.result();
}
