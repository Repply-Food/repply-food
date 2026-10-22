// public/sw.js — service worker do PWA.
// Guarda em cache SÓ os arquivos do próprio app (código e fontes em
// /_next/static, versionados e imutáveis) para o app instalado abrir rápido
// depois da 1ª vez; e serve /offline quando a navegação cai. NUNCA guarda HTML
// autenticado nem dados do painel (privacidade, D-40).
const CACHE_OFFLINE = "rf-offline-v1";
const CACHE_SHELL = "rf-shell-v1";
const CACHES_ATUAIS = [CACHE_OFFLINE, CACHE_SHELL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Só guarda /offline se vier íntegra (200, sem redirect). Se /offline
      // cair num redirect (login), a instalação FALHA de propósito, para o
      // navegador tentar de novo depois, em vez de guardar uma resposta
      // redirecionada que ele recusa servir.
      const resposta = await fetch("/offline");
      if (!resposta.ok || resposta.redirected) {
        throw new Error("offline indisponível");
      }
      const cache = await caches.open(CACHE_OFFLINE);
      await cache.put("/offline", resposta);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches de versões antigas (ex.: ao subir CACHE_SHELL de versão).
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => !CACHES_ATUAIS.includes(nome))
          .map((nome) => caches.delete(nome))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Arquivos do próprio app (/_next/static): versionados e imutáveis. Cache
  // primeiro — é o que faz o app instalado abrir instantâneo depois da 1ª vez.
  // Um novo deploy gera nomes novos, então nunca serve versão velha.
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_SHELL);
        const emCache = await cache.match(request);
        if (emCache) return emCache;
        const resposta = await fetch(request);
        if (resposta.ok) cache.put(request, resposta.clone());
        return resposta;
      })()
    );
    return;
  }

  // Navegação (HTML): rede primeiro; se cair, a página /offline. Nunca
  // guardamos HTML autenticado nem dados do painel.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline")
          .then((r) => r ?? new Response("Sem conexão", { status: 503 }))
      )
    );
    return;
  }

  // Resto (dados, RSC, APIs): não intercepta — vai direto para a rede.
});
