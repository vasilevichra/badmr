/* Service worker для PWA-режима badmr.ru.
 * Стратегии:
 *  - статика (/css, /js, /assets) — network-first: свежий файл всегда,
 *    кэш — только фолбэк для оффлайна. Раньше было cache-first — Safari
 *    неделями исполнял старый js после релиза (подгон названий табло
 *    не доходил до телефонов);
 *  - навигации и прочие документы — только сеть, без кеширования:
 *    разметка зависит от User-Agent (phone/desktop), а Cache API в
 *    Safari не учитывает Vary: User-Agent (см. fetch-обработчик).
 * При любых изменениях набора кешируемых файлов или стратегий поднимать
 * VERSION — иначе клиенты останутся на старой статике. */
const VERSION = 'v5';
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
        // network-first: свежая статика при любой онлайн-загрузке, кэш —
        // только оффлайн-фолбэк. Свежий ответ кладём в кэш для оффлайна
        event.respondWith((async () => {
            try {
                const res = await fetch(event.request);
                if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
                return res;
            } catch {
                const cached = await caches.match(event.request);
                if (cached) return cached;
                throw new Error('offline and not cached');
            }
        })());
        return;
    }

    if (event.request.mode === 'navigate' ||
        (event.request.headers.get('accept') || '').includes('text/html')) {
        // Документы НЕ кэшируются и оффлайн-фолбэк из кэша не отдаётся:
        // разметка зависит от User-Agent (phone/desktop), а Cache API в
        // Safari не учитывает Vary: User-Agent — при недоступной сети
        // десктоп получал телефонную страницу (и наоборот). Статика
        // выше по-прежнему в кэше, оффлайн-навигация просто падает.
        return;
    }
});
