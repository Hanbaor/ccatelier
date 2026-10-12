'use strict';

// Explicit, process-local verification mode: node --require ./tools/offline-build.cjs …
// This is a build diagnostic, NOT a security sandbox. It does not constrain native
// addons or child processes. Never load it in the deployed application/server.
const optionalVersionURL = 'https://redefine-version.ohevan.com/api/v2/info';
let unexpectedNetwork = false;

function blocked(api) {
  unexpectedNetwork = true;
  process.exitCode = 1;
  const error = new Error(`Offline build forbids network access via ${api}`);
  error.code = 'ERR_OFFLINE_BUILD_NETWORK';
  // A dependency may catch the exception; retain a visible diagnostic and failure.
  process.stderr.write(`${error.code}: ${error.message}\n`);
  throw error;
}

function deny(object, key, label) {
  if (typeof object[key] === 'function') object[key] = () => blocked(label);
}

for (const protocol of ['http', 'https']) {
  const module = require(`node:${protocol}`);
  deny(module, 'request', `${protocol}.request`);
  deny(module, 'get', `${protocol}.get`);
}

require('node:https').get = function offlineGet(url, options, callback) {
  // Match only the fixed, optional Redefine 2.9.0 welcome check. No response is
  // fabricated: upstream's existing catch logs the error and marks CDNs unknown.
  if (url === optionalVersionURL && options && options.timeout === 3000 &&
      Object.keys(options).length === 1 && typeof callback === 'function') {
    const error = new Error('Optional Redefine update check disabled in offline build');
    error.code = 'ERR_OFFLINE_BUILD_OPTIONAL_CHECK';
    throw error;
  }
  return blocked('https.get');
};

const net = require('node:net');
for (const key of ['connect', 'createConnection']) deny(net, key, `net.${key}`);
deny(net.Socket.prototype, 'connect', 'net.Socket.connect');
deny(require('node:tls'), 'connect', 'tls.connect');
deny(require('node:http2'), 'connect', 'http2.connect');
deny(require('node:dgram'), 'createSocket', 'dgram.createSocket');
deny(globalThis, 'fetch', 'fetch');

const dns = require('node:dns');
for (const object of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of Object.getOwnPropertyNames(object)) {
    if (/^(lookup|resolve|reverse)/.test(key)) deny(object, key, `dns.${key}`);
  }
}
// Also update built-in ESM named exports after replacing the CommonJS methods.
require('node:module').syncBuiltinESMExports();
process.on('exit', () => { if (unexpectedNetwork) process.exitCode = 1; });
