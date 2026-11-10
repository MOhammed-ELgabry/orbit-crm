import {
  isInternalPeer,
  isPublicIp,
  normalizeIp,
  resolveClientIp,
} from './client-ip.util';

describe('normalizeIp', () => {
  it.each([
    ['1.2.3.4', '1.2.3.4'],
    ['::ffff:41.1.2.3', '41.1.2.3'],
    ['[2a00:1450::1]', '2a00:1450::1'],
    ['fe80::1%eth0', 'fe80::1'],
    [' 8.8.8.8 ', '8.8.8.8'],
  ])('%s -> %s', (raw, expected) => expect(normalizeIp(raw)).toBe(expected));

  it.each([
    '',
    'abc',
    '999.1.1.1',
    '1.2.3',
    null,
    undefined,
    '1.2.3.4, 5.6.7.8',
  ])('rejects %p', (raw) => expect(normalizeIp(raw as string)).toBeNull());
});

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '41.33.1.1', '2a00:1450:4001:81b::200e'])(
    '%s is public',
    (ip) => expect(isPublicIp(ip)).toBe(true),
  );
  it.each([
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '127.0.0.1',
    '100.64.1.1', // carrier-grade NAT
    '169.254.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '0.0.0.0',
    '224.0.0.1',
  ])('%s is not public', (ip) => expect(isPublicIp(ip)).toBe(false));
});

describe('resolveClientIp', () => {
  const req = (over: object = {}) => ({
    ip: '41.33.1.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  });

  it('defaults to req.ip (trust proxy = 1 already applied by Express)', () => {
    expect(resolveClientIp(req())).toBe('41.33.1.1');
  });

  it('never reads X-Forwarded-For itself', () => {
    expect(
      resolveClientIp(req({ headers: { 'x-forwarded-for': '8.8.8.8' } })),
    ).toBe('41.33.1.1');
  });

  it('honours a configured CDN header only from an internal (proxy) peer', () => {
    const headers = { 'cf-connecting-ip': '41.33.9.9' };
    expect(resolveClientIp(req({ headers }), 'CF-Connecting-IP')).toBe(
      '41.33.9.9',
    );
    // direct internet peer => header ignored (forgeable)
    expect(
      resolveClientIp(
        req({ headers, socket: { remoteAddress: '203.0.114.5' } }),
        'cf-connecting-ip',
      ),
    ).toBe('41.33.1.1');
  });

  it('takes only the first value of a list and ignores garbage', () => {
    expect(
      resolveClientIp(
        req({ headers: { 'cf-connecting-ip': '41.33.9.9, 1.1.1.1' } }),
        'cf-connecting-ip',
      ),
    ).toBe('41.33.9.9');
    expect(
      resolveClientIp(
        req({ headers: { 'cf-connecting-ip': 'nonsense' } }),
        'cf-connecting-ip',
      ),
    ).toBe('41.33.1.1');
  });

  it('returns null when nothing valid is available', () => {
    expect(resolveClientIp(req({ ip: undefined }))).toBeNull();
  });

  it('isInternalPeer', () => {
    expect(isInternalPeer('::ffff:127.0.0.1')).toBe(true);
    expect(isInternalPeer('10.0.0.5')).toBe(true);
    expect(isInternalPeer('8.8.8.8')).toBe(false);
    expect(isInternalPeer(undefined)).toBe(false);
  });
});
