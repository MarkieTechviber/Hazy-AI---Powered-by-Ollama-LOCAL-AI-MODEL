'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(ip, bits);
const publicV6 = new net.BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');
for (const [ip, bits] of [['2001:db8::', 32], ['2001::', 32], ['2002::', 16]]) blocked.addSubnet(ip, bits, 'ipv6');

function isPrivateIp(address) {
  const host = String(address).replace(/^\[|\]$/g, '');
  const family = net.isIP(host);
  if (family === 4) return blocked.check(host, 'ipv4');
  if (family === 6) return !publicV6.check(host, 'ipv6') || blocked.check(host, 'ipv6');
  return true;
}

async function resolvePublicUrl(raw, lookup = dns.lookup, { allowLocalhost = false } = {}) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only credential-free HTTP(S) URLs are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!allowLocalhost && (['localhost', 'ip6-localhost', 'ip6-loopback'].includes(host) || /\.(localhost|local|internal|lan)$/.test(host))) throw new Error('Local network URLs are blocked.');
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || (!allowLocalhost && addresses.some(item => isPrivateIp(item.address)))) throw new Error('Private network or unresolved target.');
  return { url, addresses };
}

// Resolve once, validate every answer, and pin that result to the actual socket.
// TLS certificate verification still uses the original hostname.
async function publicFetch(raw, options = {}) {
  const { url, addresses } = await resolvePublicUrl(raw, options.lookup, options);
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: options.method || 'GET', headers: options.headers,
      signal: options.signal,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      }
    }, response => {
      let bytes = 0;
      const chunks = [];
      response.on('error', reject);
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > (options.maxBytes || 2 * 1024 * 1024)) { response.destroy(new Error('Response size limit exceeded.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const noBody = [204, 205, 304].includes(response.statusCode) || options.method === 'HEAD';
        resolve(new Response(noBody ? null : Buffer.concat(chunks), { status: response.statusCode, headers }));
      });
    });
    request.setTimeout(options.timeoutMs || 10000, () => request.destroy(new Error('Network request timed out.')));
    request.on('error', reject);
    request.end(options.body);
  });
}
module.exports = { isPrivateIp, resolvePublicUrl, publicFetch };
