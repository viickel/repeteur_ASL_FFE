// Service Worker – ASL-FFE Répéteur
// Version du cache : incrémenter pour forcer la mise à jour
const CACHE_NAME = 'asl-ffe-v1';

// Fichiers à mettre en cache pour le mode hors-ligne
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    // PeerJS depuis CDN – on tente de le cacher aussi
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
];

// ── Installation : mise en cache des ressources statiques ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // On cache chaque ressource individuellement pour éviter qu'une
            // erreur réseau (ex: CDN) bloque toute l'installation
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url =>
                    cache.add(url).catch(err =>
                        console.warn(`[SW] Impossible de cacher: ${url}`, err)
                    )
                )
            );
        })
    );
    // Active immédiatement sans attendre la fermeture des anciens onglets
    self.skipWaiting();
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch : stratégie Cache-First avec fallback réseau ──
self.addEventListener('fetch', (event) => {
    // On ne gère que les requêtes GET
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Ressource trouvée en cache → on la retourne immédiatement
                // et on met à jour le cache en arrière-plan (stale-while-revalidate)
                fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then(cache =>
                                cache.put(event.request, networkResponse)
                            );
                        }
                    })
                    .catch(() => {}); // Silencieux si hors-ligne
                return cachedResponse;
            }

            // Pas en cache → on tente le réseau
            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache =>
                        cache.put(event.request, responseToCache)
                    );
                }
                return networkResponse;
            }).catch(() => {
                // Hors-ligne et pas en cache → page de fallback minimale
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
