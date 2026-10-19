import "server-only";

/**
 * Monta a política de segurança de conteúdo (CSP) da resposta, com uma senha de
 * uso único (o `nonce`) a cada carregamento.
 *
 * Por que o nonce: o Next (App Router) injeta `<script>` EM LINHA para montar a
 * página no navegador (os dados do RSC). Uma CSP que só permitisse scripts do
 * próprio site bloquearia esses scripts em linha e a página nunca iniciaria.
 * O nonce resolve isso: o porteiro carimba cada script legítimo do Next com a
 * senha do carregamento, e a CSP aceita só quem traz a senha. Script injetado
 * por um atacante não conhece a senha, então não executa.
 *
 * Mantém `script-src 'self'` junto do nonce (não `'strict-dynamic'`): assim os
 * próprios pacotes do Next, servidos do mesmo site, continuam valendo por serem
 * do site, o que é mais robusto, enquanto script em linha ainda exige o nonce.
 */
export function montarCsp(emDesenvolvimento: boolean): {
  nonce: string;
  politica: string;
} {
  const nonce = btoa(crypto.randomUUID());
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    // Só no desenvolvimento: o Turbopack usa `eval` para recarregar a quente.
    // Em produção o Next não usa `eval`, então a brecha fica fechada.
    ...(emDesenvolvimento ? ["'unsafe-eval'"] : []),
  ].join(" ");
  const politica = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    // O Next injeta estilo em linha; sem `'unsafe-inline'` as telas quebram.
    // Estilo em linha não executa JavaScript, então a brecha fica só no estilo.
    "style-src 'self' 'unsafe-inline'",
    `script-src ${script}`,
  ].join("; ");
  return { nonce, politica };
}
