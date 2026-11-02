import {
  AttachmentRejectedError,
  BufferReader,
  inspectAttachment,
  type InspectionFailure,
  type InspectionLimits,
} from './attachment-inspector';
import {
  EXE_LIKE,
  makeJpeg,
  makePdf,
  makePng,
  makeWebp,
  TEXT_FILE,
} from './attachment-test-fixtures';

const LIMITS: InspectionLimits = {
  imageMaxBytes: 5 * 1024 * 1024,
  pdfMaxBytes: 10 * 1024 * 1024,
  maxImageDimension: 10_000,
  maxImagePixels: 40_000_000,
};

const inspect = (buffer: Buffer, limits: Partial<InspectionLimits> = {}) =>
  inspectAttachment(new BufferReader(buffer), { ...LIMITS, ...limits });

async function failureOf(
  buffer: Buffer,
  limits: Partial<InspectionLimits> = {},
): Promise<InspectionFailure> {
  try {
    await inspect(buffer, limits);
  } catch (error) {
    if (error instanceof AttachmentRejectedError) return error.failure;
    throw error;
  }

  throw new Error('expected the file to be rejected');
}

describe('inspectAttachment', () => {
  describe('accepted files (type comes from the CONTENT)', () => {
    it('accepts a PNG and reports its real dimensions', async () => {
      await expect(inspect(makePng(40, 30))).resolves.toEqual({
        kind: 'IMAGE',
        contentType: 'image/png',
        width: 40,
        height: 30,
      });
    });

    it('accepts a JPEG', async () => {
      await expect(inspect(makeJpeg(64, 48))).resolves.toEqual({
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        width: 64,
        height: 48,
      });
    });

    it('accepts a WebP', async () => {
      await expect(inspect(makeWebp(20, 10))).resolves.toEqual({
        kind: 'IMAGE',
        contentType: 'image/webp',
        width: 20,
        height: 10,
      });
    });

    it('accepts a PDF (no dimensions)', async () => {
      await expect(inspect(makePdf())).resolves.toEqual({
        kind: 'PDF',
        contentType: 'application/pdf',
        width: null,
        height: null,
      });
    });
  });

  describe('magic bytes / type mismatch', () => {
    it('rejects an empty file', async () => {
      expect(await failureOf(Buffer.alloc(0))).toBe('empty');
    });

    it('rejects plain text and executables however they are named', async () => {
      expect(await failureOf(TEXT_FILE)).toBe('unsupported_type');
      expect(await failureOf(EXE_LIKE)).toBe('unsupported_type');
    });

    it('rejects an image whose first bytes were swapped for another format', async () => {
      // A "PNG" body behind JPEG magic bytes is not a valid JPEG structure.
      const fake = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        makePng().subarray(3),
      ]);

      expect(await failureOf(fake)).toBe('corrupt');
    });

    it('rejects a PDF-looking file that is just the signature', async () => {
      expect(await failureOf(Buffer.from('%PDF-1.4 hello'))).toBe('corrupt');
    });
  });

  describe('corrupt / truncated / polyglot files', () => {
    it('rejects a truncated PNG', async () => {
      const png = makePng();
      expect(await failureOf(png.subarray(0, png.length - 5))).toBe('corrupt');
    });

    it('rejects a PNG with bytes appended after IEND (polyglot)', async () => {
      const png = Buffer.concat([makePng(), Buffer.from('<script>x</script>')]);
      expect(await failureOf(png)).toBe('corrupt');
    });

    it('rejects a truncated JPEG (no EOI)', async () => {
      const jpeg = makeJpeg();
      expect(await failureOf(jpeg.subarray(0, jpeg.length - 2))).toBe(
        'corrupt',
      );
    });

    it('rejects a WebP whose RIFF size claims more than the file holds', async () => {
      const webp = makeWebp();
      expect(await failureOf(webp.subarray(0, webp.length - 3))).toBe(
        'corrupt',
      );
    });

    it('rejects an animated WebP (VP8X animation flag)', async () => {
      const vp8x = Buffer.alloc(18);
      vp8x.write('VP8X', 0, 'latin1');
      vp8x.writeUInt32LE(10, 4);
      vp8x[8] = 0x02;
      const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), vp8x]);
      const riff = Buffer.alloc(8);
      riff.write('RIFF', 0, 'latin1');
      riff.writeUInt32LE(body.length, 4);

      expect(await failureOf(Buffer.concat([riff, body]))).toBe(
        'unsupported_type',
      );
    });
  });

  describe('limits', () => {
    it('rejects an image above the configured byte limit', async () => {
      expect(await failureOf(makePng(), { imageMaxBytes: 20 })).toBe(
        'too_large',
      );
    });

    it('rejects a PDF above the configured byte limit', async () => {
      expect(await failureOf(makePdf(), { pdfMaxBytes: 40 })).toBe('too_large');
    });

    it('rejects an image wider/taller than the dimension limit', async () => {
      expect(
        await failureOf(makePng(5000, 10), { maxImageDimension: 4000 }),
      ).toBe('dimensions');
    });

    it('rejects an image with too many pixels even if each side is allowed', async () => {
      expect(
        await failureOf(makePng(6000, 6000), {
          maxImageDimension: 10_000,
          maxImagePixels: 1_000_000,
        }),
      ).toBe('dimensions');
    });

    it('rejects a zero-sized image as corrupt', async () => {
      expect(await failureOf(makePng(0, 5))).toBe('corrupt');
    });
  });

  describe('PDF structure and active content', () => {
    it('rejects a PDF without a trailer / EOF marker', async () => {
      const pdf = makePdf();
      expect(await failureOf(pdf.subarray(0, pdf.length - 8))).toBe('corrupt');
    });

    it('rejects a PDF whose startxref points beyond the file', async () => {
      const broken = Buffer.from(
        `%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<<>>\nstartxref\n99999999\n%%EOF\n`,
        'latin1',
      );
      expect(await failureOf(broken)).toBe('corrupt');
    });

    it('rejects an encrypted PDF', async () => {
      expect(await failureOf(makePdf('trailer << /Encrypt 5 0 R >>'))).toBe(
        'pdf_encrypted',
      );
    });

    it.each(['/JavaScript', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA'])(
      'rejects a PDF that carries %s',
      async (token) => {
        expect(await failureOf(makePdf(`<< ${token} (x) >>`))).toBe(
          'pdf_active_content',
        );
      },
    );

    it('does not mistake a longer, harmless name for a forbidden one', async () => {
      await expect(inspect(makePdf('<< /XFAForm 1 >>'))).resolves.toMatchObject(
        {
          kind: 'PDF',
        },
      );
    });

    it('finds a forbidden name that straddles an internal scan-window boundary', async () => {
      // Window size is 64 KiB: put the token across the boundary.
      const filler = 'A'.repeat(64 * 1024 - 10);
      expect(await failureOf(makePdf(`${filler}/JavaScript`))).toBe(
        'pdf_active_content',
      );
    });
  });

  it('never reads the whole file at once (bounded positional reads)', async () => {
    const big = makePdf('B'.repeat(300 * 1024));
    const requested: number[] = [];

    const reader = {
      size: big.length,
      read: (offset: number, length: number) => {
        requested.push(length);
        return Promise.resolve(big.subarray(offset, offset + length));
      },
    };

    await inspectAttachment(reader, LIMITS);

    expect(Math.max(...requested)).toBeLessThanOrEqual(64 * 1024);
  });
});
