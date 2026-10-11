// Tipos mínimos do runtime Deno que as Edge Functions usam.
//
// O Supabase roda o Deno de verdade no `serve` e no deploy; este arquivo só
// existe para o `tsc --noEmit` do projeto (que varre **/*.ts) conseguir
// verificar `supabase/functions/` sem instalar o Deno aqui.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: {
    get(chave: string): string | undefined;
  };
};
