/**
 * Synthetic files for the attachment unit tests. Built in memory from a few
 * bytes: no real documents, no personal or medical data, nothing read from disk.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

export function makePng(width = 4, height = 3): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk(
      'IDAT',
      Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]),
    ),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function makeJpeg(width = 4, height = 3): Buffer {
  const sof = Buffer.alloc(17);
  sof.writeUInt16BE(17, 0); // segment length
  sof[2] = 8; // precision
  sof.writeUInt16BE(height, 3);
  sof.writeUInt16BE(width, 5);
  sof[7] = 3; // components
  sof.set([1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1], 8);

  const sos = Buffer.from([
    0x00, 0x0c, 0x03, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0,
  ]);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc0]),
    sof,
    Buffer.from([0xff, 0xda]),
    sos,
    Buffer.from([0x12, 0x34, 0x56, 0x78]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** A lossless (VP8L) WebP header with the given size and a tiny payload. */
export function makeWebp(width = 4, height = 3): Buffer {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const vp8l = Buffer.alloc(8);
  vp8l[0] = 0x2f;
  vp8l.writeUInt32LE(bits >>> 0, 1);

  const chunk = Buffer.alloc(8);
  chunk.write('VP8L', 0, 'latin1');
  chunk.writeUInt32LE(vp8l.length, 4);

  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk, vp8l]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length, 4);

  return Buffer.concat([riff, body]);
}

/** Smallest well-formed PDF the inspector accepts; `extra` goes in the body. */
export function makePdf(extra = ''): Buffer {
  const head = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${extra}\n`;
  const xref = head.length;

  return Buffer.from(
    `${head}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n${xref}\n%%EOF\n`,
    'latin1',
  );
}

export const TEXT_FILE = Buffer.from('just some text, not an attachment\n');
export const EXE_LIKE = Buffer.from([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
]);
