// public/sw.js — service worker MÍNIMO (D: sem guardar dados do painel).
// Única função: quando a navegação falhar (offline), servir /offline.
const CACHE = "rf-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Só guarda /offline se vier íntegra (200, sem redirect). Se por algum
      // motivo /offline cair num redirect (login), a instalação FALHA de
      // propósito, para o navegador tentar de novo depois, em vez de guardar
      // uma resposta redirecionada que o navegador recusa servir.
      const resposta = await fetch("/offline");
      if (!resposta.ok || resposta.redirected) {
        throw new Error("offline indisponível");
      }
      const cache = await caches.open(CACHE);
      await cache.put("/offline", resposta);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // só navegação; nada de dados
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match("/offline")
        .then((r) => r ?? new Response("Sem conexão", { status: 503 }))
    )
  );
});
