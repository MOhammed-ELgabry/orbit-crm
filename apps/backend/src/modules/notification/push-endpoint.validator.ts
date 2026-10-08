import * as dns from 'dns';
import * as net from 'net';

import { MAX_PUSH_ENDPOINT_LENGTH } from './constants/notification.constants';

/**
 * SSRF defence for Web Push endpoints.
 *
 * A push endpoint is a URL the BROWSER hands us and the SERVER later
 * POSTs to. Because there is deliberately NO provider allowlist
 * (Chrome/FCM, Mozilla autopush, Apple, WNS, and future/self-hosted
 * providers must all work), the protection is layered:
 *
 *   1. Storage time  — validatePushEndpoint(): syntax only (https, no
 *      credentials, port 443, no fragment, length, no IP literal, no
 *      internal-looking host name).
 *   2. Send time     — the same validation again (a row may predate a
 *      rule change) PLUS createSafePushAgent(): an https.Agent whose DNS
 *      lookup resolves ALL addresses, rejects the request if ANY of them
 *      is non-public, and hands the socket the exact IP that was checked
 *      (so there is no resolve-then-connect gap / DNS rebinding window).
 *   3. TLS verification stays ON (rejectUnauthorized is never touched),
 *      redirects are never followed (https.request does not), the
 *      connection is not kept alive, and the total time is bounded.
 */

export type PushEndpointErrorCode =
  | 'endpoint_invalid'
  | 'endpoint_too_long'
  | 'endpoint_not_https'
  | 'endpoint_has_credentials'
  | 'endpoint_bad_port'
  | 'endpoint_has_fragment'
  | 'endpoint_ip_literal'
  | 'endpoint_internal_host'
  | 'keys_invalid';

export class PushEndpointError extends Error {
  constructor(
    public readonly code:
      PushEndpointErrorCode | 'blocked_address' | 'dns_failed',
  ) {
    super(code);
    this.name = 'PushEndpointError';
  }
}

// ---------------------------------------------------------------------
// IP classification (net.BlockList)
// ---------------------------------------------------------------------

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network" / unspecified
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay (deprecated)
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

// IPv6: only global unicast (2000::/3) is a candidate; these special
// ranges INSIDE it are blocked. Everything outside 2000::/3 (loopback
// ::1, unspecified ::, link-local fe80::/10, ULA fc00::/7, multicast
// ff00::/8, IPv4-mapped ::ffff:0:0/96, NAT64 64:ff9b::/96, ...) is
// rejected by not being allowed.
const BLOCKED_V6_IN_GLOBAL: Array<[string, number]> = [
  ['2001::', 32], // Teredo
  ['2001:2::', 48], // benchmarking
  ['2001:10::', 28], // ORCHID
  ['2001:20::', 28], // ORCHIDv2
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['3fff::', 20], // documentation
];

const blockedV4 = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V4)
  blockedV4.addSubnet(addr, prefix, 'ipv4');

const blockedV6 = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V6_IN_GLOBAL)
  blockedV6.addSubnet(addr, prefix, 'ipv6');

const allowedV6 = new net.BlockList();
allowedV6.addSubnet('2000::', 3, 'ipv6');

/** True only for a publicly routable unicast address. */
export function isPublicIp(address: string): boolean {
  const family = net.isIP(address);

  if (family === 4) return !blockedV4.check(address, 'ipv4');

  if (family === 6) {
    return (
      allowedV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6')
    );
  }

  return false;
}

// ---------------------------------------------------------------------
// Storage-time / send-time syntactic validation
// ---------------------------------------------------------------------

const INTERNAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.home.arpa',
  '.in-addr.arpa',
  '.ip6.arpa',
];

// Conservative RFC 1123 host name: dot-separated labels.
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Parses + validates an endpoint. Throws PushEndpointError. */
export function validatePushEndpoint(endpoint: unknown): URL {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new PushEndpointError('endpoint_invalid');
  }

  if (endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) {
    throw new PushEndpointError('endpoint_too_long');
  }

  // Reject whitespace/control characters up front (URL parsing would
  // silently strip some of them).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f-\u009f]/.test(endpoint)) {
    throw new PushEndpointError('endpoint_invalid');
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new PushEndpointError('endpoint_invalid');
  }

  if (url.protocol !== 'https:') {
    throw new PushEndpointError('endpoint_not_https');
  }

  if (url.username !== '' || url.password !== '') {
    throw new PushEndpointError('endpoint_has_credentials');
  }

  if (url.port !== '' && url.port !== '443') {
    throw new PushEndpointError('endpoint_bad_port');
  }

  if (url.hash !== '' || endpoint.includes('#')) {
    throw new PushEndpointError('endpoint_has_fragment');
  }

  // WHATWG URL normalises hostnames (lower-case, IDNA, and decimal/octal/
  // hex IPv4 forms such as 2130706433 or 0x7f.1 -> 127.0.0.1), so an IP
  // literal in ANY notation shows up here as a canonical IP.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (net.isIP(hostname) !== 0 || hostname.startsWith('[')) {
    throw new PushEndpointError('endpoint_ip_literal');
  }

  if (
    hostname === 'localhost' ||
    INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new PushEndpointError('endpoint_internal_host');
  }

  // Single-label names ("intranet", "db") and anything that is not a
  // plausible public DNS name (punycode is fine, it is ASCII here).
  if (!HOSTNAME.test(hostname)) {
    throw new PushEndpointError('endpoint_internal_host');
  }

  return url;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** p256dh = uncompressed P-256 point (65 bytes, 0x04..); auth = 16 bytes. */
export function validatePushKeys(p256dh: unknown, auth: unknown): void {
  if (
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    !BASE64URL.test(p256dh) ||
    !BASE64URL.test(auth)
  ) {
    throw new PushEndpointError('keys_invalid');
  }

  const key = Buffer.from(p256dh, 'base64url');
  const secret = Buffer.from(auth, 'base64url');

  if (key.length !== 65 || key[0] !== 0x04 || secret.length !== 16) {
    throw new PushEndpointError('keys_invalid');
  }
}

// ---------------------------------------------------------------------
// Send-time: SSRF-safe DNS lookup + https.Agent
// ---------------------------------------------------------------------

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

export type ResolveAll = (hostname: string) => Promise<dns.LookupAddress[]>;

const defaultResolveAll: ResolveAll = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * Resolves `hostname`, requires EVERY returned address to be public
 * (a mixed answer is rejected, so a hostile resolver cannot smuggle one
 * private A record among public ones), and returns the addresses.
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolveAll: ResolveAll = defaultResolveAll,
): Promise<dns.LookupAddress[]> {
  let addresses: dns.LookupAddress[];

  try {
    addresses = await resolveAll(hostname);
  } catch {
    throw new PushEndpointError('dns_failed');
  }

  if (addresses.length === 0) throw new PushEndpointError('dns_failed');

  if (!addresses.every((entry) => isPublicIp(entry.address))) {
    throw new PushEndpointError('blocked_address');
  }

  return addresses;
}

/**
 * `lookup` function for net.connect / https.Agent. The socket connects
 * to the address RETURNED here — i.e. the very address that was just
 * validated — never to a second, unchecked resolution.
 */
export function createSafeLookup(resolveAll: ResolveAll = defaultResolveAll) {
  return (
    hostname: string,
    options: dns.LookupOptions | number | null | undefined,
    callback: LookupCallback,
  ): void => {
    const wantsAll =
      typeof options === 'object' && options !== null && options.all === true;

    resolvePublicAddresses(hostname, resolveAll).then(
      (addresses) => {
        if (wantsAll) {
          callback(null, addresses);
          return;
        }

        const first = addresses[0];
        callback(null, first.address, first.family);
      },
      (error: unknown) => {
        const code =
          error instanceof PushEndpointError ? error.code : 'dns_failed';
        const err: NodeJS.ErrnoException = new Error(code);
        err.code = code === 'blocked_address' ? 'EBLOCKED' : 'ENOTFOUND';
        callback(err);
      },
    );
  };
}
