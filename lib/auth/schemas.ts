import { z } from "zod";
import { SENHA_MINIMA } from "./senha";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Digite um e-mail válido"));

const senhaNova = z
  .string()
  .min(
    SENHA_MINIMA,
    `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres`
  )
  .max(128, "Senha longa demais");

const iguais = (d: { senha: string; confirmacao: string }) =>
  d.senha === d.confirmacao;
const avisoIguais = {
  message: "As duas senhas não são iguais",
  path: ["confirmacao"],
};

export const entrarSchema = z.object({
  email,
  senha: z.string().min(1, "Digite a senha"),
});
export type EntrarInput = z.infer<typeof entrarSchema>;

export const esqueciSchema = z.object({ email });
export type EsqueciInput = z.infer<typeof esqueciSchema>;

export const novaSenhaSchema = z
  .object({ senha: senhaNova, confirmacao: z.string() })
  .refine(iguais, avisoIguais);
export type NovaSenhaInput = z.infer<typeof novaSenhaSchema>;

/** `senhaAtual` vem vazia no primeiro acesso (a ação decide se ela é exigida). */
export const trocarSenhaSchema = z
  .object({ senhaAtual: z.string(), senha: senhaNova, confirmacao: z.string() })
  .refine(iguais, avisoIguais);
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;
