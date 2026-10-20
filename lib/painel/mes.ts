import { FUSO_PADRAO } from "@/lib/admin/fusos";

/** "YYYY-MM-01" do mês atual no fuso da casa (fuso inválido cai no padrão). */
export function mesAtualNoFuso(agora: Date, fuso: string): string {
  const formatar = (zona: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(agora);
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = formatar(fuso);
  } catch {
    partes = formatar(FUSO_PADRAO);
  }
  const ano = partes.find((p) => p.type === "year")?.value ?? "1970";
  const mes = partes.find((p) => p.type === "month")?.value ?? "01";
  return `${ano}-${mes}-01`;
}
