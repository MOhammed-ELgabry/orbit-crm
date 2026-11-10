import { BlockList, isIP } from 'net';

/**
 * Address ranges that can never be geolocated to a country: private,
 * loopback, link-local, carrier-grade NAT (100.64/10), multicast, documentation
 * and reserved space. Looking them up would only return noise.
 */
const NON_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, 'ipv6');
}

/** "::ffff:1.2.3.4" -> "1.2.3.4"; strips brackets/zone ids; null if not an IP. */
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  ip = ip.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  return !NON_PUBLIC.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** True for loopback / private peers, i.e. a reverse proxy we operate. */
export function isInternalPeer(peer: string | undefined | null): boolean {
  const ip = normalizeIp(peer);
  return ip !== null && !isPublicIp(ip);
}

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * The client address to use for the (local, country-level) IP lookup.
 *
 *  - Default: `req.ip`, which Express derives with `trust proxy = 1` (one
 *    trusted hop). A client-sent X-Forwarded-For is never read directly.
 *  - Optional `trustedHeader` (e.g. "cf-connecting-ip" when Cloudflare sits in
 *    front of Nginx, where `trust proxy = 1` would otherwise yield
 *    Cloudflare's address): honoured ONLY when the TCP peer of this process is
 *    an internal address (our own reverse proxy), so a client reaching the app
 *    directly cannot forge it. Operators must make the proxy overwrite — not
 *    append to — that header and must not expose the app port publicly.
 */
export function resolveClientIp(
  req: RequestLike,
  trustedHeader?: string | null,
): string | null {
  if (trustedHeader && isInternalPeer(req.socket?.remoteAddress)) {
    const value = req.headers[trustedHeader.toLowerCase()];
    const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0];
    const fromHeader = normalizeIp(first);
    if (fromHeader) return fromHeader;
  }
  return normalizeIp(req.ip);
}
