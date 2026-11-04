import { BufferReader } from './attachment-inspector';
import {
  detectSpreadsheetContainer,
  inspectXls,
  inspectXlsx,
  isEncryptedOoxmlPackage,
  SpreadsheetRejectedError,
  XLSX_LIMITS,
  type SpreadsheetFailure,
} from './attachment-spreadsheet-inspector';
import {
  contentTypesXml,
  makeNonWorkbookCompoundFile,
  makeXls,
  makeXlsx,
  makeZip,
} from './attachment-spreadsheet-fixtures';

async function failureOf(
  check: (reader: BufferReader) => Promise<void>,
  buffer: Buffer,
): Promise<SpreadsheetFailure | 'accepted'> {
  try {
    await check(new BufferReader(buffer));
    return 'accepted';
  } catch (error) {
    if (error instanceof SpreadsheetRejectedError) return error.failure;
    throw error;
  }
}

const xlsx = (buffer: Buffer) => failureOf(inspectXlsx, buffer);
const xls = (buffer: Buffer) => failureOf(inspectXls, buffer);

describe('detectSpreadsheetContainer', () => {
  it('recognises the ZIP and the compound-file signatures only', () => {
    expect(detectSpreadsheetContainer(makeXlsx().subarray(0, 12))).toBe('xlsx');
    expect(detectSpreadsheetContainer(makeXls().subarray(0, 12))).toBe('xls');
    expect(detectSpreadsheetContainer(Buffer.from('<html>'))).toBeNull();
    expect(
      detectSpreadsheetContainer(Buffer.from('MZ\u0090\u0000')),
    ).toBeNull();
    expect(detectSpreadsheetContainer(Buffer.alloc(3))).toBeNull();
  });
});

describe('inspectXlsx (ZIP / Open XML)', () => {
  it('accepts a plain workbook (deflated and stored [Content_Types].xml)', async () => {
    expect(await xlsx(makeXlsx())).toBe('accepted');
    expect(await xlsx(makeXlsx({ deflateContentTypes: false }))).toBe(
      'accepted',
    );
  });

  it('accepts a workbook with a ZIP comment (the comment must end the file)', async () => {
    expect(
      await xlsx(makeXlsx({ zip: { comment: Buffer.from('made by a tool') } })),
    ).toBe('accepted');
  });

  it('accepts the usual extra parts (styles, shared strings, media, theme)', async () => {
    expect(
      await xlsx(
        makeXlsx({
          extraParts: {
            'xl/styles.xml': '<styleSheet/>',
            'xl/sharedStrings.xml': '<sst/>',
            'xl/theme/theme1.xml': '<theme/>',
            'xl/media/image1.png': Buffer.from([1, 2, 3]),
            'docProps/core.xml': '<cp/>',
          },
        }),
      ),
    ).toBe('accepted');
  });

  describe('not a workbook', () => {
    it('rejects a Word document (word/document.xml, no xl/workbook.xml)', async () => {
      const docx = makeZip([
        { name: '[Content_Types].xml', data: contentTypesXml(), deflate: true },
        { name: 'word/document.xml', data: '<document/>' },
      ]);

      expect(await xlsx(docx)).toBe('not_spreadsheet');
    });

    it('rejects a plain archive and a Java archive', async () => {
      expect(await xlsx(makeZip([{ name: 'a.txt', data: 'hello' }]))).toBe(
        'not_spreadsheet',
      );
      expect(
        await xlsx(
          makeZip([
            { name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0' },
          ]),
        ),
      ).toBe('not_spreadsheet');
    });

    it('rejects a binary workbook (.xlsb)', async () => {
      expect(
        await xlsx(
          makeXlsx({ extraParts: { 'xl/workbook.bin': Buffer.from([1]) } }),
        ),
      ).toBe('not_spreadsheet');
    });

    it('rejects a workbook whose main part is a template, add-in or unknown type', async () => {
      const type = (value: string) =>
        xlsx(makeXlsx({ contentTypes: contentTypesXml(value) }));

      expect(
        await type(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml',
        ),
      ).toBe('not_spreadsheet');
      expect(await type('application/xml')).toBe('not_spreadsheet');
    });

    it('rejects a package without a workbook override in [Content_Types].xml', async () => {
      expect(
        await xlsx(
          makeXlsx({
            contentTypes:
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
          }),
        ),
      ).toBe('not_spreadsheet');
    });
  });

  describe('macros and active content (an .xlsm is refused even when renamed)', () => {
    it('rejects a VBA project', async () => {
      expect(
        await xlsx(
          makeXlsx({ extraParts: { 'xl/vbaProject.bin': Buffer.from('x') } }),
        ),
      ).toBe('macro');
    });

    it('rejects the VBA part case-insensitively', async () => {
      expect(
        await xlsx(
          makeXlsx({ extraParts: { 'XL/VBAPROJECT.BIN': Buffer.from('x') } }),
        ),
      ).toBe('macro');
    });

    it('rejects a signed VBA project and Excel 4.0 macro sheets', async () => {
      expect(
        await xlsx(
          makeXlsx({
            extraParts: { 'xl/vbaProjectSignature.bin': Buffer.from('x') },
          }),
        ),
      ).toBe('macro');
      expect(
        await xlsx(
          makeXlsx({ extraParts: { 'xl/macrosheets/sheet1.xml': '<m/>' } }),
        ),
      ).toBe('macro');
    });

    it('rejects a macro-enabled content type even without a VBA part', async () => {
      expect(
        await xlsx(
          makeXlsx({
            contentTypes: contentTypesXml(
              'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
            ),
          }),
        ),
      ).toBe('macro');
    });

    it('rejects embedded objects and ActiveX controls', async () => {
      expect(
        await xlsx(
          makeXlsx({
            extraParts: { 'xl/embeddings/oleObject1.bin': Buffer.from('x') },
          }),
        ),
      ).toBe('active_content');
      expect(
        await xlsx(
          makeXlsx({ extraParts: { 'xl/activeX/activeX1.xml': '<a/>' } }),
        ),
      ).toBe('active_content');
    });
  });

  describe('container structure', () => {
    it('rejects an encrypted ZIP entry', async () => {
      const encrypted = makeZip([
        {
          name: '[Content_Types].xml',
          data: contentTypesXml(),
          deflate: true,
          flags: 1,
        },
        { name: 'xl/workbook.xml', data: '<w/>' },
      ]);

      expect(await xlsx(encrypted)).toBe('encrypted');
    });

    it('rejects path traversal, absolute and backslash entry names', async () => {
      for (const name of [
        '../evil.xml',
        'xl/../../evil.xml',
        '/abs.xml',
        'C:/x.xml',
        'xl\\workbook.xml',
      ]) {
        expect(await xlsx(makeXlsx({ extraParts: { [name]: 'x' } }))).toBe(
          'corrupt',
        );
      }
    });

    it('rejects duplicate entry names (readers disagree about which one wins)', async () => {
      const duplicated = makeZip([
        { name: '[Content_Types].xml', data: contentTypesXml(), deflate: true },
        { name: 'xl/workbook.xml', data: '<a/>' },
        { name: 'XL/Workbook.xml', data: '<b/>' },
      ]);

      expect(await xlsx(duplicated)).toBe('corrupt');
    });

    it('rejects data appended after the archive and data prepended before it', async () => {
      expect(
        await xlsx(makeXlsx({ zip: { trailing: Buffer.from('MZ-payload') } })),
      ).toBe('corrupt');
      // A prefix shifts every offset: the file no longer starts as a ZIP.
      expect(
        await xlsx(makeXlsx({ zip: { prefix: Buffer.from('#!/bin/sh\n') } })),
      ).not.toBe('accepted');
    });

    it('rejects a local header whose name differs from the central directory', async () => {
      const confused = makeZip([
        { name: '[Content_Types].xml', data: contentTypesXml(), deflate: true },
        { name: 'xl/workbook.xml', data: '<w/>', localName: 'xl/other.xml' },
      ]);

      expect(await xlsx(confused)).toBe('corrupt');
    });

    it('rejects an unsupported compression method', async () => {
      const exotic = makeZip([
        { name: '[Content_Types].xml', data: contentTypesXml(), deflate: true },
        { name: 'xl/workbook.xml', data: '<w/>', method: 14 },
      ]);

      expect(await xlsx(exotic)).toBe('corrupt');
    });

    it('rejects a truncated file and a file with no end-of-directory record', async () => {
      const full = makeXlsx();

      expect(await xlsx(full.subarray(0, full.length - 10))).toBe('corrupt');
      expect(await xlsx(full.subarray(0, 100))).toBe('corrupt');
      expect(
        await xlsx(
          Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(60)]),
        ),
      ).toBe('corrupt');
    });

    it('rejects an oversized [Content_Types].xml instead of inflating it', async () => {
      const big = makeXlsx({
        contentTypes:
          contentTypesXml() + ' '.repeat(XLSX_LIMITS.maxContentTypesBytes + 1),
      });

      expect(await xlsx(big)).toBe('corrupt');
    });

    it('rejects an archive with too many entries', async () => {
      const parts: Record<string, string> = {};

      for (let index = 0; index <= XLSX_LIMITS.maxEntries; index += 1) {
        parts[`xl/extra/p${index}.xml`] = '';
      }

      expect(await xlsx(makeXlsx({ extraParts: parts }))).toBe('corrupt');
    });

    it('does not read the file as a whole (bounded positional reads)', async () => {
      const buffer = makeXlsx({
        extraParts: { 'xl/media/big.bin': Buffer.alloc(2 * 1024 * 1024) },
      });
      let bytesRead = 0;

      await inspectXlsx({
        size: buffer.length,
        read: (offset, length) => {
          const part = buffer.subarray(offset, offset + length);
          bytesRead += part.length;
          return Promise.resolve(part);
        },
      });

      // The 2 MiB media part is never touched: one 64 KiB window at the end
      // (end-of-directory search) plus headers and the tiny XML part.
      expect(bytesRead).toBeLessThan(128 * 1024);
    });
  });
});

describe('inspectXls (OLE2 compound file + BIFF)', () => {
  it('accepts a plain workbook (regular stream and mini stream, several sheets)', async () => {
    expect(await xls(makeXls())).toBe('accepted');
    expect(await xls(makeXls({ mini: true }))).toBe('accepted');
    expect(
      await xls(
        makeXls({
          boundsheetTypes: [0, 0, 2],
          sheetBofKinds: [0x10, 0x10, 0x20],
        }),
      ),
    ).toBe('accepted');
    expect(await xls(makeXls({ streamName: 'Book' }))).toBe('accepted');
  });

  describe('not a workbook', () => {
    it('rejects Word and PowerPoint compound files', async () => {
      expect(await xls(makeNonWorkbookCompoundFile('WordDocument'))).toBe(
        'not_spreadsheet',
      );
      expect(
        await xls(makeNonWorkbookCompoundFile('PowerPoint Document')),
      ).toBe('not_spreadsheet');
    });

    it('rejects a "Workbook" stream that does not start with a BIFF BOF record', async () => {
      expect(await xls(makeXls({ stream: Buffer.alloc(4096, 0x41) }))).toBe(
        'not_spreadsheet',
      );
    });
  });

  describe('macros, encryption and active content', () => {
    it('rejects VBA storages (Excel 97-2003 macros)', async () => {
      for (const name of ['_VBA_PROJECT_CUR', 'VBA', '_VBA_PROJECT']) {
        expect(await xls(makeXls({ extraEntries: [{ name, type: 1 }] }))).toBe(
          'macro',
        );
      }
    });

    it('rejects an OBPROJ record (workbook has a VBA project)', async () => {
      expect(await xls(makeXls({ obproj: true }))).toBe('macro');
    });

    it('rejects Excel 4.0 macro sheets and VB modules declared in BOUNDSHEET', async () => {
      expect(
        await xls(
          makeXls({ boundsheetTypes: [0, 1], sheetBofKinds: [0x10, 0x40] }),
        ),
      ).toBe('macro');
      expect(
        await xls(makeXls({ boundsheetTypes: [6], sheetBofKinds: [0x06] })),
      ).toBe('macro');
    });

    it('rejects a sheet that is declared a worksheet but whose own header is a macro sheet', async () => {
      expect(
        await xls(makeXls({ boundsheetTypes: [0], sheetBofKinds: [0x40] })),
      ).toBe('macro');
    });

    it('rejects an encrypted workbook (FILEPASS) and an encrypted OOXML package', async () => {
      expect(await xls(makeXls({ filepass: true }))).toBe('encrypted');
      expect(
        await xls(
          makeXls({
            streamName: null,
            extraEntries: [
              { name: 'EncryptionInfo', type: 2 },
              { name: 'EncryptedPackage', type: 2 },
            ],
          }),
        ),
      ).toBe('encrypted');
    });

    it('rejects embedded OLE objects', async () => {
      expect(
        await xls(makeXls({ extraEntries: [{ name: 'ObjectPool', type: 1 }] })),
      ).toBe('active_content');
    });

    it('detects a password-protected .xlsx (compound file with EncryptedPackage)', async () => {
      const encrypted = makeXls({
        streamName: null,
        extraEntries: [{ name: 'EncryptedPackage', type: 2 }],
      });

      expect(await isEncryptedOoxmlPackage(new BufferReader(encrypted))).toBe(
        true,
      );
      expect(await isEncryptedOoxmlPackage(new BufferReader(makeXls()))).toBe(
        false,
      );
      expect(
        await isEncryptedOoxmlPackage(new BufferReader(Buffer.from('nope'))),
      ).toBe(false);
    });
  });

  describe('container structure', () => {
    it('rejects a damaged header, a truncated file and an empty directory', async () => {
      const good = makeXls();
      const badOrder = Buffer.from(good);
      badOrder.writeUInt16LE(0x0000, 28);

      expect(await xls(badOrder)).toBe('corrupt');
      expect(await xls(good.subarray(0, 700))).toBe('corrupt');
      expect(await xls(good.subarray(0, 1536))).toBe('corrupt');
      expect(
        await xls(Buffer.concat([good.subarray(0, 8), Buffer.alloc(2000)])),
      ).toBe('corrupt');
    });

    it('rejects a workbook stream whose globals never end (no EOF record)', async () => {
      const stream = Buffer.alloc(4096);
      const bof = Buffer.alloc(20);

      bof.writeUInt16LE(0x0809, 0);
      bof.writeUInt16LE(16, 2);
      bof.writeUInt16LE(0x0600, 4);
      bof.writeUInt16LE(0x0005, 6);
      bof.copy(stream, 0);
      // The rest is padding records the walker steps over until the end.
      for (let at = 20; at + 4 <= stream.length; at += 4) {
        stream.writeUInt16LE(0x0022, at);
        stream.writeUInt16LE(0, at + 2);
      }

      expect(await xls(makeXls({ stream }))).toBe('corrupt');
    });

    it('rejects a record that claims to be larger than the format allows', async () => {
      const stream = Buffer.alloc(4096);
      const bof = Buffer.alloc(20);

      bof.writeUInt16LE(0x0809, 0);
      bof.writeUInt16LE(16, 2);
      bof.writeUInt16LE(0x0005, 6);
      bof.copy(stream, 0);
      stream.writeUInt16LE(0x0022, 20);
      stream.writeUInt16LE(0xffff, 22);

      expect(await xls(makeXls({ stream }))).toBe('corrupt');
    });
  });
});
