import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

// Model Cache Storage's relative URL resolution and response cloning. Keeping
// caches in insertion order lets the tests expose cross-version caches.match().
function harness(base = 'https://repite.test/gym/') {
  const listeners = new Map();
  const stores = new Map();
  const networkCalls = [];
  const addedAssets = [];
  const takeoverSnapshots = [];
  const claimSnapshots = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  let network = url => new Response(`installed:${url}`);
  const key = request => new URL(typeof request === 'string' ? request : request.url, base).href;
  const fetch = async request => {
    const url = key(request);
    networkCalls.push(url);
    return network(url);
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          entries,
          async addAll(requests) {
            const urls = Array.from(requests, key);
            addedAssets.push(...urls);
            const responses = await Promise.all(urls.map(fetch));
            if (responses.some(response => !response.ok)) throw new Error('Shell download failed');
            // addAll publishes its batch only when every response succeeds.
            urls.forEach((url, index) => entries.set(url, responses[index].clone()));
          },
          async match(request) { return entries.get(key(request))?.clone(); },
          async put(request, response) { entries.set(key(request), response.clone()); },
        });
      }
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const cache of stores.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(base),
    addEventListener(type, listener) { listeners.set(type, listener); },
    async skipWaiting() {
      skipWaitingCalls++;
      takeoverSnapshots.push(new Map([...stores].map(([name, cache]) => [name, [...cache.entries.keys()]])));
    },
    clients: { async claim() { claimCalls++; claimSnapshots.push([...stores.keys()]); } },
  };
  const context = vm.createContext({ self, caches, fetch, URL });
  vm.runInContext(source, context, { filename: 'sw.js' });
  const cacheName = vm.runInContext('CACHE_NAME', context);
  const assets = Array.from(vm.runInContext('ASSETS', context));

  return {
    base, caches, cacheName, assets, networkCalls, addedAssets, takeoverSnapshots, claimSnapshots,
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; },
    setNetwork(handler) { network = handler; },
    async seed(name, path, body) {
      const cache = await caches.open(name);
      await cache.put(path, new Response(body));
    },
    async dispatch(type, request) {
      const pending = [];
      let response;
      let handled = false;
      listeners.get(type)({
        request,
        waitUntil(promise) { pending.push(Promise.resolve(promise)); },
        respondWith(promise) { handled = true; response = Promise.resolve(promise); },
      });
      const result = handled ? await response : undefined;
      await Promise.all(pending);
      return result;
    },
    request(path, mode = 'cors', method = 'GET') {
      return { url: new URL(path, base).href, mode, method };
    },
  };
}

test('installation caches the complete shell before taking over', async () => {
  const worker = harness();
  await worker.dispatch('install');
  const required = [
    './', './index.html', './app.css', './app.js', './data.js',
    './default-routine.js', './routine-templates.js', './share.js', './manifest.webmanifest',
    './favicon.svg', './repite-icon-180.png', './repite-icon-192.png', './repite-icon-512.png',
  ];
  assert.deepEqual(worker.assets, required);
  assert.deepEqual(worker.addedAssets, required.map(path => new URL(path, worker.base).href));
  const cache = await worker.caches.open(worker.cacheName);
  for (const asset of required) {
    const response = await cache.match(asset);
    assert.ok(response?.ok, `${asset} is ready before activation`);
    assert.equal(await response.text(), `installed:${new URL(asset, worker.base).href}`);
  }
  assert.equal(worker.skipWaitingCalls, 1);
  assert.deepEqual(worker.takeoverSnapshots[0].get(worker.cacheName), worker.addedAssets);
});

test('a failed shell installation does not take over or publish a partial cache', async () => {
  const worker = harness();
  worker.setNetwork(url => new Response('download', { status: url.endsWith('/app.js') ? 503 : 200 }));
  await assert.rejects(worker.dispatch('install'), /Shell download failed/);
  assert.equal(worker.skipWaitingCalls, 0);
  const cache = await worker.caches.open(worker.cacheName);
  assert.equal(await cache.match('./index.html'), undefined);
  assert.equal(await cache.match('./app.js'), undefined);
});

test('production navigation and modules use one installed version without network requests', async () => {
  const worker = harness();
  // An older cache is first in Cache Storage, as it would be during an update.
  await worker.seed('repite-v1-old', './index.html', 'old HTML');
  await worker.seed('repite-v1-old', './app.js', 'old JavaScript');
  await worker.seed('unrelated-site', './data.js', 'unrelated module');
  await worker.dispatch('install');
  worker.networkCalls.length = 0;
  worker.setNetwork(url => new Response(`newer-network-build:${url}`));

  for (const path of ['./', './?installed=1', './history']) {
    const response = await worker.dispatch('fetch', worker.request(path, 'navigate'));
    assert.equal(await response.text(), `installed:${new URL('./index.html', worker.base).href}`);
  }
  for (const path of ['./app.css', './app.js', './data.js', './default-routine.js', './share.js']) {
    const response = await worker.dispatch('fetch', worker.request(path));
    assert.equal(await response.text(), `installed:${new URL(path, worker.base).href}`);
  }
  assert.deepEqual(worker.networkCalls, []);
});

test('a same-origin production cache miss can still use the network', async () => {
  const worker = harness();
  await worker.dispatch('install');
  worker.networkCalls.length = 0;
  worker.setNetwork(url => new Response(`live:${url}`));
  const response = await worker.dispatch('fetch', worker.request('./user-photo.png'));
  assert.equal(await response.text(), `live:${new URL('./user-photo.png', worker.base).href}`);
  assert.equal(worker.networkCalls.length, 1);
});

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`${host} prefers the development network and falls back to its current cache offline`, async () => {
    const worker = harness(`http://${host}:4173/`);
    await worker.seed('repite-v1-old', './', 'stale navigation');
    await worker.seed('repite-v1-old', './app.js', 'stale module');
    await worker.seed('unrelated-site', './data.js', 'unrelated data');
    await worker.dispatch('install');
    worker.networkCalls.length = 0;
    worker.setNetwork(url => new Response(`development:${url}`));

    for (const [path, mode] of [['./', 'navigate'], ['./app.js', 'cors']]) {
      const response = await worker.dispatch('fetch', worker.request(path, mode));
      assert.equal(await response.text(), `development:${new URL(path, worker.base).href}`);
    }
    worker.setNetwork(() => { throw new TypeError('Offline'); });
    for (const [path, mode] of [['./', 'navigate'], ['./index.html', 'navigate'], ['./app.js', 'cors'], ['./data.js', 'cors']]) {
      const response = await worker.dispatch('fetch', worker.request(path, mode));
      assert.equal(await response.text(), `installed:${new URL(path, worker.base).href}`);
    }
    assert.equal(worker.networkCalls.length, 6);
    const current = await worker.caches.open(worker.cacheName);
    assert.equal(await (await current.match('./app.js')).text(), `installed:${new URL('./app.js', worker.base).href}`);
  });
}

test('activation removes only obsolete app caches and claims clients after cleanup', async () => {
  const worker = harness();
  const ownedOld = ['repite-v1-old', 'rutina-elegante-v7-final'];
  const unrelated = ['another-app-v3', 'repite', 'rutina-elegante', 'photos-cache'];
  for (const name of [...ownedOld, ...unrelated]) await worker.seed(name, './index.html', name);
  await worker.dispatch('install');
  await worker.dispatch('activate');
  assert.deepEqual((await worker.caches.keys()).sort(), [...unrelated, worker.cacheName].sort());
  assert.equal(worker.claimCalls, 1);
  assert.deepEqual(worker.claimSnapshots[0].sort(), [...unrelated, worker.cacheName].sort());
  const current = await worker.caches.open(worker.cacheName);
  assert.ok(await current.match('./app.js'));
});

test('non-GET and external requests are left to the browser', async () => {
  const worker = harness();
  assert.equal(await worker.dispatch('fetch', worker.request('./submit', 'cors', 'POST')), undefined);
  assert.equal(await worker.dispatch('fetch', worker.request('https://another.test/module.js')), undefined);
  assert.deepEqual(worker.networkCalls, []);
});
