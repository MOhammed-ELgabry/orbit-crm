import {
  AttachmentRejectedError,
  BufferReader,
  extensionOf,
  inspectAttachment,
  type InspectionFailure,
  type InspectionHints,
  type InspectionLimits,
} from './attachment-inspector';
import {
  contentTypesXml,
  makeXls,
  makeXlsx,
  XLS_MIME,
  XLSX_MIME,
} from './attachment-spreadsheet-fixtures';
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
  spreadsheetMaxBytes: 10 * 1024 * 1024,
  maxImageDimension: 10_000,
  maxImagePixels: 40_000_000,
};

const inspect = (
  buffer: Buffer,
  hints: InspectionHints,
  limits: Partial<InspectionLimits> = {},
) =>
  inspectAttachment(new BufferReader(buffer), { ...LIMITS, ...limits }, hints);

async function failureOf(
  buffer: Buffer,
  hints: InspectionHints,
  limits: Partial<InspectionLimits> = {},
): Promise<InspectionFailure | 'accepted'> {
  try {
    await inspect(buffer, hints, limits);
    return 'accepted';
  } catch (error) {
    if (error instanceof AttachmentRejectedError) return error.failure;
    throw error;
  }
}

const HTML = Buffer.from('<html><body>not a workbook</body></html>');

describe('extensionOf', () => {
  it.each([
    ['report.xlsx', 'xlsx'],
    ['REPORT.XLSX', 'xlsx'],
    ['a.b.c.xls', 'xls'],
    ['C:\\docs\\q1.xls', 'xls'],
    ['noext', ''],
    ['.xlsx', ''],
    ['trailingdot.', ''],
    ['weird.ex e', ''],
    ['x.waytoolongextension', ''],
  ])('%s -> "%s"', (name, expected) => {
    expect(extensionOf(name)).toBe(expected);
  });

  it('tolerates a missing name', () => {
    expect(extensionOf(undefined)).toBe('');
  });
});

describe('inspectAttachment - Excel workbooks', () => {
  describe('valid files', () => {
    it('accepts a valid .xlsx and reports its real type', async () => {
      await expect(
        inspect(makeXlsx(), {
          originalName: 'Quarter 1.xlsx',
          declaredMimeType: XLSX_MIME,
        }),
      ).resolves.toEqual({
        kind: 'SPREADSHEET',
        contentType: XLSX_MIME,
        width: null,
        height: null,
      });
    });

    it('accepts a valid .xls and reports its real type', async () => {
      await expect(
        inspect(makeXls(), {
          originalName: 'old.xls',
          declaredMimeType: XLS_MIME,
        }),
      ).resolves.toEqual({
        kind: 'SPREADSHEET',
        contentType: XLS_MIME,
        width: null,
        height: null,
      });
    });

    it('accepts an upper-case extension and a MIME type with parameters', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'A.XLSX',
          declaredMimeType: `${XLSX_MIME}; charset=binary`,
        }),
      ).toBe('accepted');
    });

    it.each([
      'application/vnd.ms-excel',
      'application/x-msexcel',
      'application/x-excel',
      'application/excel',
    ])('accepts the .xls MIME alias %s', async (mime) => {
      expect(
        await failureOf(makeXls(), {
          originalName: 'a.xls',
          declaredMimeType: mime,
        }),
      ).toBe('accepted');
    });

    it.each(['', 'application/octet-stream', undefined])(
      'accepts a browser that did not classify the file (MIME %p), because name and bytes agree',
      async (mime) => {
        expect(
          await failureOf(makeXlsx(), {
            originalName: 'a.xlsx',
            declaredMimeType: mime,
          }),
        ).toBe('accepted');
        expect(
          await failureOf(makeXls(), {
            originalName: 'a.xls',
            declaredMimeType: mime,
          }),
        ).toBe('accepted');
      },
    );

    it('accepts a Unicode (Arabic) file name', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'تقرير المبيعات.xlsx',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('accepted');
    });
  });

  describe('extension does not match', () => {
    it.each(['report.txt', 'report.zip', 'report', 'report.csv', 'report.doc'])(
      'refuses a real .xlsx named %s',
      async (name) => {
        expect(
          await failureOf(makeXlsx(), {
            originalName: name,
            declaredMimeType: XLSX_MIME,
          }),
        ).not.toBe('accepted');
      },
    );

    it('refuses an .xlsx workbook named .xls and an .xls workbook named .xlsx', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.xls',
          declaredMimeType: XLS_MIME,
        }),
      ).toBe('type_mismatch');
      expect(
        await failureOf(makeXls(), {
          originalName: 'a.xlsx',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('type_mismatch');
    });

    it('refuses a workbook that claims to be an image or a PDF by name', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.png',
          declaredMimeType: 'image/png',
        }),
      ).toBe('unsupported_type');
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.pdf',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('type_mismatch');
    });
  });

  describe('MIME type does not match', () => {
    it.each([
      'text/html',
      'image/png',
      'application/pdf',
      'application/zip',
      'text/csv',
      'application/x-msdownload',
    ])('refuses a real .xlsx declared as %s', async (mime) => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.xlsx',
          declaredMimeType: mime,
        }),
      ).toBe('type_mismatch');
    });

    it('refuses an .xlsx declared with the .xls type and the other way round', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.xlsx',
          declaredMimeType: XLS_MIME,
        }),
      ).toBe('type_mismatch');
      expect(
        await failureOf(makeXls(), {
          originalName: 'a.xls',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('type_mismatch');
    });

    it('refuses an image or a PDF that declares an Excel MIME type', async () => {
      expect(
        await failureOf(makePng(), {
          originalName: 'a.png',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('type_mismatch');
      expect(
        await failureOf(makePdf(), {
          originalName: 'a.pdf',
          declaredMimeType: XLS_MIME,
        }),
      ).toBe('type_mismatch');
    });
  });

  describe('renamed non-Excel files', () => {
    const claims = {
      originalName: 'invoice.xlsx',
      declaredMimeType: XLSX_MIME,
    };

    it.each([
      ['a PDF', makePdf()],
      ['a PNG', makePng()],
      ['a JPEG', makeJpeg()],
      ['a WebP', makeWebp()],
      ['an HTML page', HTML],
      ['plain text', TEXT_FILE],
      ['an executable', EXE_LIKE],
    ])('refuses %s renamed to .xlsx', async (_label, bytes) => {
      expect(await failureOf(bytes, claims)).toBe('type_mismatch');
    });

    it.each([
      ['a PDF', makePdf()],
      ['an HTML page', HTML],
      ['an executable', EXE_LIKE],
    ])('refuses %s renamed to .xls', async (_label, bytes) => {
      expect(
        await failureOf(bytes, {
          originalName: 'a.xls',
          declaredMimeType: XLS_MIME,
        }),
      ).toBe('type_mismatch');
    });

    it('refuses a ZIP / compound file that is not a workbook but claims to be one', async () => {
      const notWorkbook = makeXlsx({ omit: ['xl/workbook.xml'] });

      expect(await failureOf(notWorkbook, claims)).toBe('type_mismatch');
    });

    it('refuses an unknown file with an unrelated name as an unsupported type', async () => {
      expect(
        await failureOf(HTML, {
          originalName: 'page.html',
          declaredMimeType: 'text/html',
        }),
      ).toBe('unsupported_type');
    });

    it('refuses a workbook with no name and no MIME type at all', async () => {
      expect(await failureOf(makeXlsx(), {})).toBe('unsupported_type');
    });
  });

  describe('macro-enabled and other Excel formats', () => {
    it.each(['book.xlsm', 'book.XLSM', 'book.xltm', 'addin.xlam', 'old.xla'])(
      'refuses the macro-enabled name %s before reading the file',
      async (name) => {
        let reads = 0;
        const reader = {
          size: 1024,
          read: () => {
            reads += 1;
            return Promise.resolve(Buffer.alloc(0));
          },
        };

        await expect(
          inspectAttachment(reader, LIMITS, {
            originalName: name,
            declaredMimeType: XLSX_MIME,
          }),
        ).rejects.toMatchObject({ failure: 'spreadsheet_macro' });
        expect(reads).toBe(0);
      },
    );

    it('refuses an .xlsm even when its bytes are a macro-free workbook', async () => {
      expect(
        await failureOf(makeXlsx(), {
          originalName: 'a.xlsm',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('spreadsheet_macro');
    });

    it('refuses macros hidden behind an .xlsx name (VBA part, macro content type, macro sheet)', async () => {
      const hints = { originalName: 'a.xlsx', declaredMimeType: XLSX_MIME };

      expect(
        await failureOf(
          makeXlsx({ extraParts: { 'xl/vbaProject.bin': Buffer.from('x') } }),
          hints,
        ),
      ).toBe('spreadsheet_macro');
      expect(
        await failureOf(
          makeXlsx({
            contentTypes: contentTypesXml(
              'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
            ),
          }),
          hints,
        ),
      ).toBe('spreadsheet_macro');
      expect(
        await failureOf(
          makeXlsx({ extraParts: { 'xl/macrosheets/sheet1.xml': '<m/>' } }),
          hints,
        ),
      ).toBe('spreadsheet_macro');
    });

    it('refuses macros in an .xls (VBA storage, Excel 4.0 macro sheet)', async () => {
      const hints = { originalName: 'a.xls', declaredMimeType: XLS_MIME };

      expect(
        await failureOf(
          makeXls({ extraEntries: [{ name: '_VBA_PROJECT_CUR', type: 1 }] }),
          hints,
        ),
      ).toBe('spreadsheet_macro');
      expect(
        await failureOf(
          makeXls({ boundsheetTypes: [1], sheetBofKinds: [0x40] }),
          hints,
        ),
      ).toBe('spreadsheet_macro');
    });

    it.each(['book.xlsb', 'tpl.xltx', 'tpl.xlt', 'book.xlw'])(
      'refuses the unsupported Excel format %s',
      async (name) => {
        expect(
          await failureOf(makeXlsx(), {
            originalName: name,
            declaredMimeType: XLSX_MIME,
          }),
        ).toBe('unsupported_type');
      },
    );
  });

  describe('encrypted and active content', () => {
    it('refuses a password-protected .xlsx (compound file named .xlsx) with a clear reason', async () => {
      const encrypted = makeXls({
        streamName: null,
        extraEntries: [
          { name: 'EncryptionInfo', type: 2 },
          { name: 'EncryptedPackage', type: 2 },
        ],
      });

      expect(
        await failureOf(encrypted, {
          originalName: 'secret.xlsx',
          declaredMimeType: XLSX_MIME,
        }),
      ).toBe('spreadsheet_encrypted');
    });

    it('refuses an encrypted .xls', async () => {
      expect(
        await failureOf(makeXls({ filepass: true }), {
          originalName: 'a.xls',
          declaredMimeType: XLS_MIME,
        }),
      ).toBe('spreadsheet_encrypted');
    });

    it('refuses embedded objects', async () => {
      expect(
        await failureOf(
          makeXlsx({ extraParts: { 'xl/embeddings/o.bin': Buffer.from('x') } }),
          {
            originalName: 'a.xlsx',
          },
        ),
      ).toBe('spreadsheet_active_content');
    });
  });

  describe('size limit (enforced by the backend)', () => {
    const hints = { originalName: 'big.xlsx', declaredMimeType: XLSX_MIME };

    it('accepts a file exactly at the limit and refuses one byte more', async () => {
      const file = makeXlsx({
        extraParts: { 'xl/media/data.bin': Buffer.alloc(4096, 7) },
      });

      expect(
        await failureOf(file, hints, { spreadsheetMaxBytes: file.length }),
      ).toBe('accepted');
      expect(
        await failureOf(file, hints, { spreadsheetMaxBytes: file.length - 1 }),
      ).toBe('too_large');
    });

    it('refuses a workbook above the default 10 MiB limit', async () => {
      const file = makeXlsx({
        extraParts: { 'xl/media/data.bin': Buffer.alloc(10 * 1024 * 1024) },
      });

      expect(file.length).toBeGreaterThan(10 * 1024 * 1024);
      expect(await failureOf(file, hints)).toBe('too_large');
    });

    it('refuses an oversized file BEFORE reading its structure', async () => {
      const reads: number[] = [];
      const reader = {
        size: 11 * 1024 * 1024,
        read: (offset: number, length: number) => {
          reads.push(offset);
          return Promise.resolve(
            Buffer.concat([
              Buffer.from([0x50, 0x4b, 3, 4]),
              Buffer.alloc(Math.max(0, length - 4)),
            ]),
          );
        },
      };

      await expect(
        inspectAttachment(reader, LIMITS, hints),
      ).rejects.toMatchObject({ failure: 'too_large' });
      // Only the first 12 bytes (type detection) were read.
      expect(reads).toEqual([0]);
    });

    it('the spreadsheet limit does not change the image or PDF limits', async () => {
      expect(
        await failureOf(
          makePdf(),
          { originalName: 'a.pdf' },
          { pdfMaxBytes: 40, spreadsheetMaxBytes: 10 * 1024 * 1024 },
        ),
      ).toBe('too_large');
      expect(
        await failureOf(
          makePng(),
          { originalName: 'a.png' },
          { spreadsheetMaxBytes: 1 },
        ),
      ).toBe('accepted');
    });

    it('refuses an empty file', async () => {
      expect(await failureOf(Buffer.alloc(0), hints)).toBe('empty');
    });
  });

  describe('regressions: images and PDFs keep their behaviour', () => {
    it('still accepts PNG / JPEG / WebP / PDF with their own names and MIME types', async () => {
      expect(
        await failureOf(makePng(), {
          originalName: 'a.png',
          declaredMimeType: 'image/png',
        }),
      ).toBe('accepted');
      expect(
        await failureOf(makeJpeg(), {
          originalName: 'a.jpg',
          declaredMimeType: 'image/jpeg',
        }),
      ).toBe('accepted');
      expect(
        await failureOf(makeWebp(), {
          originalName: 'a.webp',
          declaredMimeType: 'image/webp',
        }),
      ).toBe('accepted');
      expect(
        await failureOf(makePdf(), {
          originalName: 'a.pdf',
          declaredMimeType: 'application/pdf',
        }),
      ).toBe('accepted');
    });

    it('still decides images and PDFs from the bytes, not from a misleading name', async () => {
      // Existing behaviour: the extension is corrected later, not rejected.
      expect(
        await failureOf(makePng(), {
          originalName: 'a.dat',
          declaredMimeType: 'application/octet-stream',
        }),
      ).toBe('accepted');
      expect(await failureOf(makePdf(), { originalName: 'a.png' })).toBe(
        'accepted',
      );
    });

    it('works without any hints (the original two-argument call)', async () => {
      await expect(
        inspectAttachment(new BufferReader(makePng()), LIMITS),
      ).resolves.toMatchObject({
        kind: 'IMAGE',
      });
      await expect(
        inspectAttachment(new BufferReader(makePdf()), LIMITS),
      ).resolves.toMatchObject({
        kind: 'PDF',
      });
    });

    it('still refuses text and executables as unsupported', async () => {
      expect(await failureOf(TEXT_FILE, { originalName: 'a.txt' })).toBe(
        'unsupported_type',
      );
      expect(await failureOf(EXE_LIKE, { originalName: 'a.exe' })).toBe(
        'unsupported_type',
      );
    });
  });
});
