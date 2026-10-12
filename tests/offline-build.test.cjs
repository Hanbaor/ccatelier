const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const preload = path.join(root, 'tools/offline-build.cjs');
const optionalURL = 'https://redefine-version.ohevan.com/api/v2/info';

function harness() {
  let originalCalls = 0, syncCalls = 0;
  const original = () => { originalCalls++; throw new Error('Original network function reached'); };
  const dns = () => ({lookup: original, lookupService: original, resolve: original, resolve4: original, reverse: original});
  const resolver = () => { function Resolver() {} Object.assign(Resolver.prototype, dns()); return Resolver; };
  const modules = {
    'node:http': {request: original, get: original},
    'node:https': {request: original, get: original},
    'node:net': {connect: original, createConnection: original, Socket: {prototype: {connect: original}}},
    'node:tls': {connect: original}, 'node:http2': {connect: original},
    'node:dgram': {createSocket: original},
    'node:dns': {...dns(), Resolver: resolver(), promises: {...dns(), Resolver: resolver()}},
    'node:module': {syncBuiltinESMExports() { syncCalls++; }}
  };
  const diagnostics = [], hooks = {};
  const process = {stderr: {write: text => diagnostics.push(text)}, on: (event, fn) => { hooks[event] = fn; }};
  const context = vm.createContext({require: name => { assert.ok(modules[name], name); return modules[name]; }, process, fetch: original});
  vm.runInContext(fs.readFileSync(preload, 'utf8'), context);
  return {modules, context, process, diagnostics, hooks, calls: () => originalCalls, synced: () => syncCalls};
}

test('offline preload replaces network functions without ever calling their originals', () => {
  const h = harness();
  const operations = [];
  for (const name of ['http', 'https']) for (const method of ['get', 'request']) operations.push(() => h.modules[`node:${name}`][method]('https://unexpected.invalid/'));
  for (const method of ['connect', 'createConnection']) operations.push(() => h.modules['node:net'][method]());
  operations.push(() => h.modules['node:net'].Socket.prototype.connect());
  for (const name of ['tls', 'http2']) operations.push(() => h.modules[`node:${name}`].connect());
  operations.push(() => h.modules['node:dgram'].createSocket(), () => h.context.fetch());
  const dns = h.modules['node:dns'];
  for (const object of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
    for (const method of ['lookup', 'lookupService', 'resolve', 'resolve4', 'reverse']) operations.push(() => object[method]());
  }
  for (const operation of operations) assert.throws(operation, {code: 'ERR_OFFLINE_BUILD_NETWORK'});
  assert.equal(h.calls(), 0);
  assert.equal(h.synced(), 1);
  assert.equal(h.diagnostics.length, operations.length);
  h.process.exitCode = 0; // Catching or clearing an error must not report success.
  h.hooks.exit();
  assert.equal(h.process.exitCode, 1);
});

test('only the fixed optional check receives a non-fatal local error', () => {
  const h = harness(), get = h.modules['node:https'].get;
  assert.throws(() => get(optionalURL, {timeout: 3000}, () => {}), {code: 'ERR_OFFLINE_BUILD_OPTIONAL_CHECK'});
  assert.equal(h.process.exitCode, undefined);
  h.hooks.exit();
  assert.equal(h.process.exitCode, undefined);
  for (const args of [
    [optionalURL + '?new=1', {timeout: 3000}, () => {}],
    [optionalURL, {timeout: 3000, method: 'POST'}, () => {}],
    [optionalURL, {timeout: 3000, hostname: 'unexpected.invalid'}, () => {}],
    [optionalURL, {}, () => {}], [optionalURL],
    [new URL(optionalURL), {timeout: 3000}, () => {}]
  ]) assert.throws(() => get(...args), {code: 'ERR_OFFLINE_BUILD_NETWORK'});
  assert.equal(h.calls(), 0);
});

test('installed Redefine welcome script handles the local error without transport or fake data', async () => {
  const h = harness(), themeRoot = path.join(root, 'node_modules/hexo-theme-redefine');
  const pkg = JSON.parse(fs.readFileSync(path.join(themeRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '2.9.0', 'review optional check when upgrading the theme');
  let ready;
  const statuses = new Map(), warnings = [];
  vm.runInNewContext(fs.readFileSync(path.join(themeRoot, 'scripts/events/welcome.js'), 'utf8'), {
    require(name) {
      if (name === '../../package.json') return pkg;
      if (name === 'https') return h.modules['node:https'];
      if (name === '../utils/log-prefix') return {ensurePrefix: value => value};
      throw new Error(`Unexpected upstream dependency: ${name}`);
    },
    hexo: {on: (event, fn) => { assert.equal(event, 'ready'); ready = fn; }, locals: {set: (key, value) => statuses.set(key, value)}, log: {warn: message => warnings.push(message), info: () => assert.fail('Must not fabricate update metadata')}}
  });
  await ready();
  assert.equal(h.calls(), 0);
  assert.equal(h.process.exitCode, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Optional Redefine update check disabled in offline build/);
  assert.deepEqual([...statuses], [['cdnTestStatus_cdnjs', 404], ['cdnTestStatus_zstatic', 404], ['cdnTestStatus_npmMirror', 404]]);
});

test('explicit preload fails a child even when unexpected network errors are caught', () => {
  const original = require('node:https').get;
  const result = spawnSync(process.execPath, ['--require', preload, '-e',
    "try { require('node:https').get('https://unexpected.invalid/'); } catch {} process.exitCode = 0;"], {cwd: root, encoding: 'utf8', timeout: 10000});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ERR_OFFLINE_BUILD_NETWORK/);
  assert.equal(require('node:https').get, original, 'parent process must be untouched');
});

test('offline preload also rejects built-in ESM networking exports', () => {
  const result = spawnSync(process.execPath, ['--require', preload, '--input-type=module', '-e',
    "import {get} from 'node:https'; try { get('https://unexpected.invalid/'); } catch {}"], {cwd: root, encoding: 'utf8', timeout: 10000});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ERR_OFFLINE_BUILD_NETWORK/);
});
