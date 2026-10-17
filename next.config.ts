import type { NextConfig } from "next";

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL é obrigatória em produção");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Só no desenvolvimento: o login local roda em 127.0.0.1 (é o `site_url` do
  // Supabase local, para onde o link do e-mail volta). Sem isto o Next bloqueia
  // os recursos de desenvolvimento (`/_next/hmr`) fora de `localhost`, a página
  // nunca hidrata e o formulário cai no envio nativo do navegador.
  allowedDevOrigins: ["127.0.0.1"],
  // O `next dev` registra no terminal os argumentos de cada função do servidor,
  // e o login passa e-mail e senha como argumento. Nenhuma senha vai para log.
  logging: { serverFunctions: false },
  // Guarda no navegador o conteúdo das rotas dinâmicas por alguns segundos, para
  // ir e voltar no admin (abrir e fechar o detalhe de uma casa) ficar instantâneo
  // em vez de buscar tudo na nuvem de novo a cada clique. As ações do admin
  // chamam revalidatePath("/admin", "layout"), então depois de suspender, gerar
  // token, etc. a lista se renova — o cache não deixa dado velho.
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
