/* Service worker для PWA-режима badmr.ru.
 * Стратегии:
 *  - навигации и прочие документы — network-first (пользователи сразу
 *    видят обновления вёрстки/данных; кеш — только оффлайн-фолбэк);
 *  - статика (/css, /js, /assets) — cache-first с ревалидацией при
 *    обновлении кеша.
 * При любых изменениях набора кешируемых файлов поднимать VERSION —
 * иначе клиенты останутся на старой статике. */
const VERSION = 'v3';
const CACHE = `badmr-${VERSION}`;
const STATIC_PREFIXES = ['/css/', '/js/', '/assets/'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // манифест и иконки — чтобы установка работала даже в оффлайне
        await cache.addAll([
            '/manifest.webmanifest',
            '/assets/icons/icon-192.png',
            '/assets/icons/icon-512.png',
        ]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // удаляем кеши прошлых версий
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k !== CACHE)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return; // внешние — мимо

    const isStatic = STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));

    if (isStatic) {
        // cache-first: статика без no-cache, обновляем в фоне
        event.respondWith((async () => {
            const cached = await caches.match(event.request);
            if (cached) {
                fetch(event.request).then((res) => {
                    if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
                }).catch(() => {});
                return cached;
            }
            const res = await fetch(event.request);
            if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
            return res;
        })());
        return;
    }

    if (event.request.mode === 'navigate' ||
        (event.request.headers.get('accept') || '').includes('text/html')) {
        // network-first: живые данные всегда свежие; кеш — только оффлайн
        event.respondWith((async () => {
            try {
                const res = await fetch(event.request);
                const cache = await caches.open(CACHE);
                cache.put(event.request, res.clone());
                return res;
            } catch {
                const cached = await caches.match(event.request);
                return cached || new Response('Нет соединения', {
                    status: 503,
                    headers: {'Content-Type': 'text/plain; charset=utf-8'},
                });
            }
        })());
    }
});
