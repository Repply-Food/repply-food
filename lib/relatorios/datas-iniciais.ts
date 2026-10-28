import { hojeNaCasa, somarDias } from "@/lib/admin/datas";

export function datasIniciaisRelatorio(agora: Date, fuso: string) {
  const ontem = somarDias(hojeNaCasa(agora, fuso), -1);
  return { inicio: ontem, fim: ontem, fonte: "historico" as const };
}
