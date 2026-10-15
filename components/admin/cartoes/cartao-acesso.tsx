"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { FormularioEmail } from "@/components/admin/formulario-email";
import { QuadroCopieAgora } from "@/components/admin/quadro-copie-agora";
import { Button } from "@/components/ui/button";
import {
  criarLoginAction,
  redefinirSenhaAction,
  trocarEmailAction,
} from "@/lib/admin/actions";
import { momentoNaCasa } from "@/lib/admin/datas";
import { avisoDeLoginLigado, avisoDeOutrasCasas } from "@/lib/admin/mensagens";
import type { EmailInput } from "@/lib/admin/schemas";
import { plural } from "@/lib/admin/texto";
import type { DetalheDoRestaurante, LoginDoDetalhe } from "@/lib/admin/tipos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type SenhaParaCopiar = { email: string; senha: string; mensagem: string };
const BOTAO = "md:h-9 md:text-sm";

function juntar(...frases: string[]): string {
  return frases.filter((frase) => frase !== "").join(" ");
}

/**
 * E-mail que já tinha conta e foi ligado a esta casa. `avisoDeLoginLigado`
 * conta "as duas casas" a partir de uma outra casa; sem nenhuma outra
 * (`outrasCasas` 0, uma conta que não abria casa nenhuma), a frase fala só
 * desta.
 */
function textoDoLoginLigado(outrasCasas: number): string {
  return outrasCasas > 0
    ? avisoDeLoginLigado(outrasCasas)
    : "Este e-mail já tinha acesso; agora vê esta casa.";
}

/**
 * Cartão 3 (desenho §1.1, D-55): criar login, redefinir senha e trocar
 * e-mail. A senha provisória aparece uma vez, com a mensagem pronta para o
 * WhatsApp; sair da página apaga o quadro.
 */
export function CartaoAcesso({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante, logins } = detalhe;
  const [senha, setSenha] = useState<SenhaParaCopiar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function criar(valores: EmailInput): Promise<string | null> {
    setAviso(null);
    const resultado = await criarLoginAction(restaurante.id, valores);
    if (!resultado.ok) return resultado.error;
    if (resultado.data?.tipo === "novo") setSenha(resultado.data);
    if (resultado.data?.tipo === "ligado") {
      setAviso(textoDoLoginLigado(resultado.data.outrasCasas));
    }
    return null;
  }

  return (
    <Cartao titulo="Acesso do cliente">
      {senha ? (
        <QuadroCopieAgora
          titulo="Copie agora: esta senha não aparece de novo"
          rotulo={`Senha provisória de ${senha.email}`}
          valor={senha.senha}
          copias={[
            {
              rotulo: "Copiar mensagem para o WhatsApp",
              texto: senha.mensagem,
            },
          ]}
        />
      ) : null}
      {aviso ? (
        <output className="brand-surface block rounded-lg p-3 text-sm">
          {aviso}
        </output>
      ) : null}
      {logins.length === 0 ? (
        <>
          <p className="text-sm text-quiet">Esta casa ainda não tem login.</p>
          <FormularioEmail
            rotulo="E-mail do cliente"
            botao="Criar login"
            aoEnviar={criar}
          />
        </>
      ) : (
        <ul className="flex flex-col gap-4">
          {logins.map((login) => (
            <li key={login.userId}>
              <LinhaDoLogin
                login={login}
                detalhe={detalhe}
                aoRedefinir={setSenha}
                aoAvisar={setAviso}
              />
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function LinhaDoLogin({
  login,
  detalhe,
  aoRedefinir,
  aoAvisar,
}: {
  login: LoginDoDetalhe;
  detalhe: DetalheDoRestaurante;
  aoRedefinir: (senha: SenhaParaCopiar) => void;
  aoAvisar: (texto: string | null) => void;
}) {
  const { restaurante } = detalhe;
  const [etapa, setEtapa] = useState<"nada" | "redefinir" | "email">("nada");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const ultimoAcesso = login.ultimoAcessoEm
    ? `último acesso: ${momentoNaCasa(login.ultimoAcessoEm, new Date(detalhe.agoraIso), restaurante.fuso)}`
    : "ainda não entrou";

  function redefinir() {
    setErro(null);
    iniciar(async () => {
      const resultado = await redefinirSenhaAction(
        restaurante.id,
        login.userId
      );
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      if (resultado.data) {
        aoRedefinir({
          email: resultado.data.email,
          senha: resultado.data.senha,
          mensagem: resultado.data.mensagem,
        });
        aoAvisar(
          avisoDeOutrasCasas(resultado.data.outrasCasas, "senha") || null
        );
      }
      setEtapa("nada");
    });
  }

  async function trocarEmail(valores: EmailInput): Promise<string | null> {
    const resultado = await trocarEmailAction(
      restaurante.id,
      login.userId,
      valores
    );
    if (!resultado.ok) return resultado.error;
    toast.success("E-mail trocado. O cliente já entra com o e-mail novo.");
    setEtapa("nada");
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <span className="break-all font-bold">{login.email}</span>
        <span className="text-quiet">{ultimoAcesso}</span>
        {login.outrasCasas > 0 ? (
          <span className="text-quiet">
            {`abre ${plural(login.outrasCasas + 1, "casa", "casas")}`}
          </span>
        ) : null}
        {login.precisaTrocarSenha ? (
          <span className="number-mono w-fit rounded-full border px-2 py-0.5 text-xs">
            precisa trocar a senha
          </span>
        ) : null}
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {etapa === "redefinir" ? (
        <Confirmacao
          texto={juntar(
            "Gera uma senha provisória nova, pede a troca no próximo acesso e desconecta os aparelhos deste login.",
            avisoDeOutrasCasas(login.outrasCasas, "senha")
          )}
          rotuloConfirmar="Redefinir senha"
          enviando={enviando}
          aoConfirmar={redefinir}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : etapa === "email" ? (
        <FormularioEmail
          rotulo="E-mail novo"
          botao="Trocar e-mail"
          aviso={juntar(
            "O cliente passa a entrar com o e-mail novo, sem e-mail de confirmação.",
            avisoDeOutrasCasas(login.outrasCasas, "email")
          )}
          aoEnviar={trocarEmail}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("redefinir")}
          >
            Redefinir senha
          </Button>
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("email")}
          >
            Trocar e-mail
          </Button>
        </div>
      )}
    </div>
  );
}
