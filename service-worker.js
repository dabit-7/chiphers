/* ══════════════════════════════════════════
   SERVICE WORKER — Cifras PWA
   Estratégia:
   - App shell (HTML, fontes, ícones): Cache First
   - Dados (songs.json, playlists.json): Network First
     → atualiza sempre que online, usa cache offline
══════════════════════════════════════════ */

const APP_CACHE    = 'cifras-app-v1';
const DATA_CACHE   = 'cifras-data-v1';

// Arquivos do app shell — cacheados na instalação
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Arquivos de dados — network first
const DATA_URLS = [
  './songs.json',
  './playlists.json'
];

/* ── INSTALL: pré-cacheia o app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      // addAll falha se qualquer recurso falhar;
      // usamos add individualmente para não bloquear em fontes externas
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => {
          console.warn('[SW] Não foi possível cachear:', url);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpa caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== DATA_CACHE)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isData = DATA_URLS.some(d => url.pathname.endsWith(d.replace('./', '/')));

  if (isData) {
    // Network First para JSON — sempre tenta buscar versão nova
    event.respondWith(networkFirst(event.request));
  } else {
    // Cache First para app shell e assets
    event.respondWith(cacheFirst(event.request));
  }
});

/* ─ Network First: tenta rede, cai no cache se offline ─ */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline e sem cache disponível.' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ─ Cache First: retorna cache, atualiza em background ─ */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Atualiza cache em background (stale-while-revalidate)
    fetch(request).then(response => {
      if (response && response.ok) {
        caches.open(APP_CACHE).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  // Não está no cache — busca na rede e guarda
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Fallback para index.html em rotas desconhecidas (SPA)
    return caches.match('./index.html');
  }
}
