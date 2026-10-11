import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

const bancoUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const endpointRecepcao =
  "http://127.0.0.1:54321/functions/v1/receber-envio";

export type Fixture = {
  restauranteA: string;
  restauranteB: string;
  usuarioA: string;
  usuarioB: string;
  usuarioSemAcesso: string;
  admin: string;
  tokenA: string;
  tokenB: string;
  idsUsuarios: string[];
  idsRestaurantes: string[];
};

export type IdentificadoresFixture = Pick<
  Fixture,
  | "restauranteA"
  | "restauranteB"
  | "usuarioA"
  | "usuarioB"
  | "usuarioSemAcesso"
  | "admin"
>;

type OpcoesFixture = {
  identificadores?: IdentificadoresFixture;
  tokenA?: string;
  tokenB?: string;
};

export async function conectarBanco(): Promise<Client> {
  const cliente = new Client({ connectionString: bancoUrl });
  try {
    await cliente.connect();
    return cliente;
  } catch {
    await cliente.end().catch(() => undefined);
    throw new Error(
      "Não foi possível conectar ao Supabase local. Inicie-o com `npm run supabase:start` e sirva receber-envio com `npm run functions:serve`."
    );
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function criarUsuario(
  cliente: Client,
  id: string,
  email: string
): Promise<void> {
  await cliente.query(
    `insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
      'nao-usada', '{"provider":"email","providers":["email"]}', '{}', now(), now()
    )`,
    [id, email]
  );
}

export function criarIdentificadoresFixture(): IdentificadoresFixture {
  return {
    restauranteA: randomUUID(),
    restauranteB: randomUUID(),
    usuarioA: randomUUID(),
    usuarioB: randomUUID(),
    usuarioSemAcesso: randomUUID(),
    admin: randomUUID(),
  };
}

export async function criarFixture(
  cliente: Client,
  opcoes: OpcoesFixture = {}
): Promise<Fixture> {
  const sufixo = randomUUID();
  const identificadores =
    opcoes.identificadores ?? criarIdentificadoresFixture();
  const {
    restauranteA,
    restauranteB,
    usuarioA,
    usuarioB,
    usuarioSemAcesso,
    admin,
  } = identificadores;
  const tokenA = opcoes.tokenA ?? `rf_teste_a_${randomUUID()}`;
  const tokenB = opcoes.tokenB ?? `rf_teste_b_${randomUUID()}`;
  const fixture: Fixture = {
    ...identificadores,
    tokenA,
    tokenB,
    idsUsuarios: [usuarioA, usuarioB, usuarioSemAcesso, admin],
    idsRestaurantes: [restauranteA, restauranteB],
  };

  try {
    for (const [id, papel] of [
      [usuarioA, "a"],
      [usuarioB, "b"],
      [usuarioSemAcesso, "sem"],
      [admin, "admin"],
    ] as const) {
      await criarUsuario(cliente, id, `${papel}-${sufixo}@teste.repply.local`);
    }

    await cliente.query(
      `insert into public.restaurantes (id, slug, nome, fuso, hora_virada)
     values
       ($1, $2, 'Casa de teste A', 'America/Fortaleza', '05:00'),
       ($3, $4, 'Casa de teste B', 'America/Fortaleza', '05:00')`,
      [restauranteA, `teste-a-${sufixo}`, restauranteB, `teste-b-${sufixo}`]
    );
    await cliente.query(
      "insert into public.acessos (user_id, restaurante_id) values ($1, $2), ($3, $4)",
      [usuarioA, restauranteA, usuarioB, restauranteB]
    );
    await cliente.query(
      "insert into public.admins_repply (user_id) values ($1)",
      [admin]
    );
    await cliente.query(
      `insert into public.tokens_envio (restaurante_id, hash, prefixo)
     values ($1, $2, 'teste-a'), ($3, $4, 'teste-b')`,
      [restauranteA, hashToken(tokenA), restauranteB, hashToken(tokenB)]
    );

    return fixture;
  } catch (erro) {
    await limparFixture(cliente, fixture).catch(() => undefined);
    throw erro;
  }
}

export async function limparFixture(
  cliente: Client,
  fixture: Fixture
): Promise<void> {
  await cliente.query(
    "delete from public.restaurantes where id = any($1::uuid[])",
    [fixture.idsRestaurantes]
  );
  await cliente.query("delete from auth.users where id = any($1::uuid[])", [
    fixture.idsUsuarios,
  ]);
}

export async function comoAutenticado<T>(
  cliente: Client,
  usuarioId: string,
  executar: () => Promise<T>
): Promise<T> {
  await cliente.query("begin");
  try {
    await cliente.query("set local role authenticated");
    await cliente.query("set local request.jwt.claim.role = 'authenticated'");
    await cliente.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [usuarioId]
    );
    const resultado = await executar();
    await cliente.query("commit");
    return resultado;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  }
}

export async function envelhecerSinal(
  cliente: Client,
  restauranteId: string
): Promise<void> {
  await cliente.query(
    `update public.sinal_de_vida
        set ultimo_envio_em = now() - interval '21 seconds'
      where restaurante_id = $1`,
    [restauranteId]
  );
}

export function envelope(
  entradas: unknown[],
  desde = "2026-10-09",
  ate = "2026-10-10"
) {
  return {
    versao_formato: 1,
    versao_scc: "teste-1.0",
    enviado_em: "2026-10-10T02:00:00",
    modo: "janela",
    janela: { desde, ate },
    lote: { numero: 1, total: 1 },
    entradas,
  };
}

export function entrada(
  codEntrada: number,
  parcial: Record<string, unknown> = {}
) {
  return {
    codEntrada,
    DataEntrada: "2026-10-09",
    HoraEntrada: "12:10:00",
    DataSaida: "2026-10-09",
    HoraSaida: "13:05:00",
    ValorItens: 100,
    ValorDescontos: 0,
    ValorAcrescimos: 0,
    TaxaServico: 10,
    Complemento: 0,
    ValorConsumido: 110,
    Pago: "Sim",
    NumeroOcupantes: 2,
    ...parcial,
  };
}

export async function enviar(token: string, corpo: unknown): Promise<Response> {
  try {
    return await fetch(endpointRecepcao, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error(
      "Não foi possível alcançar receber-envio local. Inicie o Supabase com `npm run supabase:start` e sirva a função com `npm run functions:serve`."
    );
  }
}
