import {
  contentDispositionFor,
  repairLatin1Utf8,
  sanitizeDisplayName,
  withExtensionFor,
} from './attachment-filename.util';

describe('sanitizeDisplayName', () => {
  it('keeps only the last path component (traversal attempts become a plain name)', () => {
    expect(sanitizeDisplayName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeDisplayName('C:\\Users\\me\\scan.pdf')).toBe('scan.pdf');
    expect(sanitizeDisplayName('/var/tmp/x.png')).toBe('x.png');
  });

  it('removes control, bidi-override and zero-width characters', () => {
    expect(sanitizeDisplayName('a\u0000b\u202Ec\u200Bd.pdf')).toBe('abcd.pdf');
    expect(sanitizeDisplayName('line1\nline2.png')).toBe('line1 line2.png');
  });

  it('removes leading dots (no hidden / relative names)', () => {
    expect(sanitizeDisplayName('...hidden.png')).toBe('hidden.png');
  });

  it('falls back to a neutral name for empty or non-string input', () => {
    const fallback = sanitizeDisplayName(undefined);
    expect(fallback.length).toBeGreaterThan(0);
    expect(sanitizeDisplayName('   ')).toBe(fallback);
    expect(sanitizeDisplayName('///')).toBe(fallback);
  });

  it('truncates very long names by code point', () => {
    const name = sanitizeDisplayName(`${'ب'.repeat(500)}.pdf`);
    expect(Array.from(name).length).toBeLessThanOrEqual(255);
  });

  it('never produces a name the database CHECK would refuse', () => {
    const inputs = ['a/b\\c.png', '\u0007\u0008.pdf', '  x  ', '..', '.'];

    for (const input of inputs) {
      const out = sanitizeDisplayName(input);
      expect(out.trim()).not.toBe('');
      expect(out).not.toMatch(/[\\/]/);
      // eslint-disable-next-line no-control-regex
      expect(out).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/);
    }
  });
});

describe('repairLatin1Utf8', () => {
  it('recovers a UTF-8 name that arrived decoded as latin1', () => {
    const mojibake = Buffer.from('فاتورة.pdf', 'utf8').toString('latin1');
    expect(repairLatin1Utf8(mojibake)).toBe('فاتورة.pdf');
  });

  it('leaves a correct name alone', () => {
    expect(repairLatin1Utf8('فاتورة.pdf')).toBe('فاتورة.pdf');
    expect(repairLatin1Utf8('plain.png')).toBe('plain.png');
  });
});

describe('withExtensionFor', () => {
  it('keeps an extension that agrees with the real type', () => {
    expect(withExtensionFor('photo.JPG', 'image/jpeg')).toBe('photo.JPG');
  });

  it('replaces an extension that lies about the real type', () => {
    expect(withExtensionFor('invoice.pdf', 'image/png')).toBe('invoice.png');
    expect(withExtensionFor('photo.png', 'application/pdf')).toBe('photo.pdf');
  });

  it('adds one when missing', () => {
    expect(withExtensionFor('scan', 'application/pdf')).toBe('scan.pdf');
  });
});

describe('contentDispositionFor', () => {
  it('encodes the name so it cannot inject a header or parameter', () => {
    const header = contentDispositionFor(
      'attachment',
      'a"; filename=evil.exe\r\nX-Injected: 1.pdf',
    );

    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    // The hostile text survives only INSIDE the quoted value; outside the
    // quotes there is exactly one `filename=` and one `filename*=` parameter.
    const outsideQuotes = header.replace(/"[^"]*"/g, '""');

    expect(outsideQuotes.match(/filename=/g)).toHaveLength(1);
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it('carries a non-ASCII name through RFC 5987 and an ASCII fallback', () => {
    const header = contentDispositionFor('inline', 'فاتورة.pdf');
    expect(header).toContain("filename*=UTF-8''%D9%81");
    expect(header).toContain('filename="_');
  });
});
