/**
 * Cria, no banco LOCAL, contas de teste para abrir as telas sem passar pelo
 * admin. Recusa qualquer endereço que não seja desta máquina.
 *
 * Uso: npm run local:acesso
 * Pode rodar quantas vezes quiser: repõe a senha provisória e o aviso de troca.
 */
import { createClient } from "@supabase/supabase-js";
import { enderecoLocal } from "./gerador-dados-ficticios";

/** Valores de TESTE. Só existem no banco local. */
export const ACESSO_LOCAL = {
  dono: { email: "dono@casa-teste.local", senhaProvisoria: "provisoria-123" },
  admin: { email: "admin@repply.local", senha: "admin-local-123" },
  casas: [
    { slug: "casa-teste-local", nome: "Casa de Teste Local" },
    { slug: "segunda-casa-local", nome: "Segunda Casa Local" },
  ],
} as const;

async function main(): Promise<void> {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!enderecoLocal(url))
    throw new Error("Este comando só roda contra o banco local (127.0.0.1).");
  if (!chave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY no .env.local");

  const db = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: casas, error: erroCasas } = await db
    .from("restaurantes")
    .upsert(
      ACESSO_LOCAL.casas.map((c) => ({ ...c })),
      { onConflict: "slug" }
    )
    .select("id, slug");
  if (erroCasas || !casas || casas.length !== ACESSO_LOCAL.casas.length)
    throw new Error("não criou as casas");

  async function garantirConta(
    email: string,
    senha: string,
    aviso: boolean
  ): Promise<string> {
    const { data: lista } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existente = lista?.users.find((u) => u.email === email);
    const atributos = {
      password: senha,
      email_confirm: true,
      app_metadata: { precisa_trocar_senha: aviso },
    };
    const { data, error } = existente
      ? await db.auth.admin.updateUserById(existente.id, atributos)
      : await db.auth.admin.createUser({ email, ...atributos });
    if (error || !data.user) throw new Error(`não criou a conta ${email}`);
    return data.user.id;
  }

  const dono = await garantirConta(
    ACESSO_LOCAL.dono.email,
    ACESSO_LOCAL.dono.senhaProvisoria,
    true
  );
  const admin = await garantirConta(
    ACESSO_LOCAL.admin.email,
    ACESSO_LOCAL.admin.senha,
    false
  );

  const { error: erroAcessos } = await db.from("acessos").upsert(
    casas.map((c) => ({ user_id: dono, restaurante_id: c.id })),
    { onConflict: "user_id,restaurante_id" }
  );
  if (erroAcessos) throw new Error("não deu acesso às casas");

  const { error: erroAdmin } = await db
    .from("admins_repply")
    .upsert({ user_id: admin }, { onConflict: "user_id" });
  if (erroAdmin) throw new Error("não marcou o admin");

  console.log(
    "Pronto. Contas de teste em scripts/acesso-local.ts (ACESSO_LOCAL). Entre em /entrar."
  );
}

if (process.argv[1]?.endsWith("acesso-local.ts")) {
  main().catch((erro) => {
    console.error(
      "[acesso-local]",
      erro instanceof Error ? erro.message : "falhou"
    );
    process.exit(1);
  });
}
