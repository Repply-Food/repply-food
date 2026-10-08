# Migrar do piloto para a infraestrutura paga

**Gatilho (D-09): o primeiro cliente pagante.** Antes dele, o projeto roda no Supabase Free (organização na conta do Lucas Ferreira) e na Vercel Hobby. Os dois não servem para cliente pagante:
- o Free não tem backup e pausa;
- o Hobby proíbe uso comercial.

## 1. Supabase: transferir o projeto para a organização Pro da Repply Hub

O Food vira um projeto a mais na organização que já paga o Repply CRM (D-06). O custo extra é a computação do projeto, cerca de US$ 10 por mês.

**Antes, uma vez:** teste a transferência com um **projeto de teste**. Confira se o endereço (`https://<id>.supabase.co`) e as chaves continuam iguais. A documentação oficial não garante isso; guias de terceiros dizem que sim.

**Pré-requisitos** (pela documentação do Supabase):
- [ ] Você é **dono** da organização de origem e **membro** da organização de destino.
- [ ] O projeto não tem integração com o GitHub ativa nem *log drains* configurados. Se tiver, desligue antes e religue depois.
- [ ] A região continua a mesma: a transferência não muda região.

**Passos:**
1. Painel do projeto → Configurações gerais → **Transferir projeto** → escolher a organização da Repply Hub.
2. Conferir:
   - endereço e chaves;
   - Edge Functions;
   - segredos;
   - pg_cron;
   - Vault;
   - Auth (URL do site, SMTP, modelos de e-mail).
3. Conferir no admin que todos os restaurantes seguem "em dia" depois de 5 a 10 minutos.
4. **Se o endereço mudou:** atualize `NEXT_PUBLIC_SUPABASE_URL` no painel e peça à SCC para trocar a `Url` no arquivo de configuração de cada restaurante. Por isso o endereço nunca fica dentro do executável.
5. Conferir que o **backup diário** aparece ativo.

## 2. Painel: sair da Vercel Hobby

A escolha é feita no momento do gatilho:

| Opção | Custo | Observação |
|---|---|---|
| **Vercel Pro** | US$ 20 por mês **por pessoa que faz commit** | Nada muda no código. O mesmo time pode regularizar o Repply CRM, que também está no Hobby |
| **Cloudflare Workers** (adaptador OpenNext) | ~US$ 5 por mês, fixo | Antes, um teste curto de compatibilidade com o Next.js do projeto (middleware, Server Actions) |

Depois de decidir:
1. Criar o projeto no plano escolhido.
2. Configurar as variáveis.
3. Apontar `food.repplyhub.com.br`.
4. Publicar.
5. Rodar o roteiro de demonstração.

## 3. Depois da migração

- [ ] Registrar em `docs/decisoes.md` como **decisão nova** a hospedagem escolhida e a data.
- [ ] Atualizar [`publicar.md`](publicar.md) com o novo método de deploy.
- [ ] Atualizar o `README.md`, na seção de hospedagem.
