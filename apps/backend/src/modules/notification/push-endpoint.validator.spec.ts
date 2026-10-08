import * as https from 'https';
import * as net from 'net';

import {
  createSafeLookup,
  isPublicIp,
  PushEndpointError,
  resolvePublicAddresses,
  validatePushEndpoint,
  validatePushKeys,
} from './push-endpoint.validator';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof PushEndpointError ? error.code : 'other';
  }
  return undefined;
}

// Valid-shaped keys: 65-byte uncompressed point (0x04 prefix) + 16-byte secret.
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
  'base64url',
);
const AUTH = Buffer.alloc(16, 9).toString('base64url');

describe('push endpoint validator', () => {
  describe('validatePushEndpoint (storage + send-time syntax)', () => {
    it('accepts ordinary public https endpoints (no provider allowlist)', () => {
      for (const endpoint of [
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://web.push.apple.com/abc',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
        'https://push.some-new-provider.example.org/v1/xyz',
        'https://fcm.googleapis.com:443/fcm/send/abc',
      ]) {
        expect(codeOf(() => validatePushEndpoint(endpoint))).toBeUndefined();
      }
    });

    it('rejects http and other schemes', () => {
      expect(
        codeOf(() => validatePushEndpoint('http://push.example.com/a')),
      ).toBe('endpoint_not_https');
      expect(
        codeOf(() => validatePushEndpoint('ftp://push.example.com/a')),
      ).toBe('endpoint_not_https');
      expect(codeOf(() => validatePushEndpoint('javascript:alert(1)'))).toBe(
        'endpoint_not_https',
      );
    });

    it('rejects credentials in the URL', () => {
      expect(
        codeOf(() =>
          validatePushEndpoint('https://user:pass@push.example.com/a'),
        ),
      ).toBe('endpoint_has_credentials');
      expect(
        codeOf(() => validatePushEndpoint('https://user@push.example.com/a')),
      ).toBe('endpoint_has_credentials');
    });

    it('rejects non-443 ports and fragments', () => {
      expect(
        codeOf(() => validatePushEndpoint('https://push.example.com:8443/a')),
      ).toBe('endpoint_bad_port');
      expect(
        codeOf(() => validatePushEndpoint('https://push.example.com:22/a')),
      ).toBe('endpoint_bad_port');
      expect(
        codeOf(() => validatePushEndpoint('https://push.example.com/a#frag')),
      ).toBe('endpoint_has_fragment');
    });

    it('rejects over-long endpoints, empty and non-string input', () => {
      expect(
        codeOf(() =>
          validatePushEndpoint(`https://push.example.com/${'a'.repeat(2100)}`),
        ),
      ).toBe('endpoint_too_long');
      expect(codeOf(() => validatePushEndpoint(''))).toBe('endpoint_invalid');
      expect(codeOf(() => validatePushEndpoint(undefined))).toBe(
        'endpoint_invalid',
      );
      expect(codeOf(() => validatePushEndpoint(123))).toBe('endpoint_invalid');
      expect(codeOf(() => validatePushEndpoint('not a url'))).toBe(
        'endpoint_invalid',
      );
      expect(
        codeOf(() => validatePushEndpoint('https://push.example.com/a\nb')),
      ).toBe('endpoint_invalid');
    });

    it('rejects literal IP endpoints in every notation', () => {
      for (const endpoint of [
        'https://127.0.0.1/a',
        'https://10.0.0.5/a',
        'https://192.168.1.1/a',
        'https://169.254.169.254/latest/meta-data',
        'https://8.8.8.8/a',
        'https://[::1]/a',
        'https://[2001:4860:4860::8888]/a',
        'https://[::ffff:127.0.0.1]/a',
        'https://2130706433/a',
        'https://0x7f.0.0.1/a',
        'https://0177.0.0.1/a',
        'https://127.1/a',
      ]) {
        expect(codeOf(() => validatePushEndpoint(endpoint))).toBe(
          'endpoint_ip_literal',
        );
      }
    });

    it('rejects localhost and internal-looking host names', () => {
      for (const endpoint of [
        'https://localhost/a',
        'https://LOCALHOST/a',
        'https://foo.localhost/a',
        'https://printer.local/a',
        'https://db.internal/a',
        'https://service.intranet/a',
        'https://router.lan/a',
        'https://host.home.arpa/a',
        'https://metadata.google.internal/a',
        'https://intranet/a',
        'https://db/a',
      ]) {
        expect(codeOf(() => validatePushEndpoint(endpoint))).toBe(
          'endpoint_internal_host',
        );
      }
    });

    it('does not echo the endpoint back in the error', () => {
      let thrown: unknown;
      try {
        validatePushEndpoint('https://user:secret@push.example.com/a');
      } catch (error) {
        thrown = error;
      }

      // Fails if validatePushEndpoint() does not throw at all.
      expect(thrown).toBeInstanceOf(PushEndpointError);
      expect((thrown as Error).message).not.toContain('secret');
      expect((thrown as Error).message).not.toContain('push.example.com');
    });
  });

  describe('validatePushKeys', () => {
    it('accepts a well-formed p256dh/auth pair', () => {
      expect(codeOf(() => validatePushKeys(P256DH, AUTH))).toBeUndefined();
    });

    it('rejects wrong lengths, wrong prefix, bad alphabet and non-strings', () => {
      expect(codeOf(() => validatePushKeys('short', AUTH))).toBe(
        'keys_invalid',
      );
      expect(codeOf(() => validatePushKeys(P256DH, 'short'))).toBe(
        'keys_invalid',
      );
      expect(
        codeOf(() =>
          validatePushKeys(
            Buffer.concat([Buffer.from([5]), Buffer.alloc(64, 7)]).toString(
              'base64url',
            ),
            AUTH,
          ),
        ),
      ).toBe('keys_invalid');
      expect(codeOf(() => validatePushKeys(`${P256DH}!!`, AUTH))).toBe(
        'keys_invalid',
      );
      expect(codeOf(() => validatePushKeys(undefined, AUTH))).toBe(
        'keys_invalid',
      );
      expect(codeOf(() => validatePushKeys(P256DH, 5))).toBe('keys_invalid');
    });
  });

  describe('isPublicIp', () => {
    it('allows ordinary public addresses', () => {
      for (const ip of [
        '8.8.8.8',
        '1.1.1.1',
        '142.250.74.46',
        '2606:4700:4700::1111',
        '2a00:1450:4001:81b::200e',
      ]) {
        expect(isPublicIp(ip)).toBe(true);
      }
    });

    it('blocks loopback, unspecified, RFC1918, CGNAT, link-local/metadata, multicast, reserved, TEST-NETs', () => {
      for (const ip of [
        '127.0.0.1',
        '127.255.255.254',
        '0.0.0.0',
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '100.64.0.1',
        '100.127.255.255',
        '169.254.169.254',
        '169.254.0.1',
        '224.0.0.1',
        '239.255.255.255',
        '240.0.0.1',
        '255.255.255.255',
        '192.0.2.1',
        '198.51.100.1',
        '203.0.113.1',
        '198.18.0.1',
        '198.19.255.255',
        '192.0.0.1',
      ]) {
        expect(isPublicIp(ip)).toBe(false);
      }
    });

    it('does not over-block neighbours of the private ranges', () => {
      for (const ip of [
        '172.15.255.255',
        '172.32.0.1',
        '100.63.255.255',
        '100.128.0.1',
        '11.0.0.1',
        '192.167.255.255',
      ]) {
        expect(isPublicIp(ip)).toBe(true);
      }
    });

    it('blocks IPv6 loopback, unspecified, link-local, ULA, multicast, doc, Teredo, 6to4', () => {
      for (const ip of [
        '::1',
        '::',
        'fe80::1',
        'fc00::1',
        'fd12:3456:789a::1',
        'ff02::1',
        '2001:db8::1',
        '2001::1',
        '2002:7f00:1::1',
      ]) {
        expect(isPublicIp(ip)).toBe(false);
      }
    });

    it('blocks IPv4-mapped and NAT64 forms (private AND public embedded IPv4)', () => {
      for (const ip of [
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '::ffff:169.254.169.254',
        '::ffff:8.8.8.8',
        '64:ff9b::7f00:1',
        '64:ff9b::a00:1',
      ]) {
        expect(isPublicIp(ip)).toBe(false);
      }
    });

    it('rejects things that are not IPs', () => {
      expect(isPublicIp('example.com')).toBe(false);
      expect(isPublicIp('')).toBe(false);
      expect(isPublicIp('999.1.1.1')).toBe(false);
    });
  });

  describe('resolvePublicAddresses (DNS safety)', () => {
    it('returns the addresses when ALL are public', async () => {
      const result = await resolvePublicAddresses(
        'push.example.com',
        async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '2606:4700:4700::1111', family: 6 },
        ],
      );

      expect(result).toHaveLength(2);
    });

    it('rejects a hostname that resolves to a private address (DNS pointing inward)', async () => {
      await expect(
        resolvePublicAddresses('push.example.com', async () => [
          { address: '10.1.2.3', family: 4 },
        ]),
      ).rejects.toMatchObject({ code: 'blocked_address' });

      await expect(
        resolvePublicAddresses('push.example.com', async () => [
          { address: '169.254.169.254', family: 4 },
        ]),
      ).rejects.toMatchObject({ code: 'blocked_address' });
    });

    it('rejects a MIXED answer (one private record among public ones)', async () => {
      await expect(
        resolvePublicAddresses('push.example.com', async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]),
      ).rejects.toMatchObject({ code: 'blocked_address' });
    });

    it('fails closed on a DNS error or an empty answer', async () => {
      await expect(
        resolvePublicAddresses('push.example.com', async () => {
          throw new Error('ENOTFOUND');
        }),
      ).rejects.toMatchObject({ code: 'dns_failed' });

      await expect(
        resolvePublicAddresses('push.example.com', async () => []),
      ).rejects.toMatchObject({
        code: 'dns_failed',
      });
    });
  });

  describe('createSafeLookup (net.connect lookup hook)', () => {
    it('hands the socket the exact validated address (single-address form)', (done) => {
      const lookup = createSafeLookup(async () => [
        { address: '8.8.4.4', family: 4 },
      ]);

      lookup('push.example.com', {}, (err, address, family) => {
        expect(err).toBeNull();
        expect(address).toBe('8.8.4.4');
        expect(family).toBe(4);
        done();
      });
    });

    it('supports the all:true form used by autoSelectFamily', (done) => {
      const lookup = createSafeLookup(async () => [
        { address: '8.8.4.4', family: 4 },
      ]);

      lookup('push.example.com', { all: true }, (err, addresses) => {
        expect(err).toBeNull();
        expect(addresses).toEqual([{ address: '8.8.4.4', family: 4 }]);
        done();
      });
    });

    it('errors (EBLOCKED) instead of returning a private address', (done) => {
      const lookup = createSafeLookup(async () => [
        { address: '127.0.0.1', family: 4 },
      ]);

      lookup('push.example.com', {}, (err, address) => {
        expect(err).not.toBeNull();
        expect((err as NodeJS.ErrnoException).code).toBe('EBLOCKED');
        expect(address).toBeUndefined();
        done();
      });
    });
  });

  describe('https.Agent + safe lookup, end to end', () => {
    it('never opens a connection when the hostname resolves to loopback', async () => {
      let connections = 0;
      const server = net.createServer((socket) => {
        connections += 1;
        socket.destroy();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const { port } = server.address() as net.AddressInfo;

      const agent = new https.Agent({
        keepAlive: false,
        lookup: createSafeLookup(async () => [
          { address: '127.0.0.1', family: 4 },
        ]),
      } as https.AgentOptions);

      const outcome = await new Promise<string>((resolve) => {
        const req = https.request(
          {
            host: 'push.example.com',
            port,
            path: '/',
            method: 'POST',
            agent,
            timeout: 3000,
          },
          () => resolve('responded'),
        );
        req.on('error', (error: NodeJS.ErrnoException) =>
          resolve(error.code ?? 'error'),
        );
        req.on('timeout', () => {
          req.destroy();
          resolve('timeout');
        });
        req.end();
      });

      agent.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      expect(outcome).toBe('EBLOCKED');
      expect(connections).toBe(0);
    });
  });
});