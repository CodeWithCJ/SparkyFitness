import zlib from 'node:zlib';

export interface ZipEntry {
  path: string;
  isDirectory: boolean;
  uncompressedSize: number;
  getData: () => Buffer;
}

/**
 * Parses a standard ZIP archive buffer and provides access to uncompressed entry data.
 * Pure Node.js implementation using `node:zlib.inflateRawSync` with Central Directory parsing.
 */
export function parseZipArchive(buffer: Buffer): ZipEntry[] {
  let eocdOffset = -1;
  const minEocdSize = 22;
  const maxSearchRange = Math.min(buffer.length, 65536 + minEocdSize);
  const searchStart = buffer.length - maxSearchRange;

  for (let i = buffer.length - minEocdSize; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP archive: End of Central Directory not found');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize > buffer.length) {
    throw new Error(
      'Invalid ZIP archive: Central directory exceeds buffer bounds'
    );
  }

  const entries: ZipEntry[] = [];
  const seenLocalHeaderOffsets = new Set<number>();
  let currentOffset = cdOffset;

  for (let i = 0; i < totalEntries && currentOffset < cdOffset + cdSize; i++) {
    if (currentOffset + 46 > buffer.length) {
      throw new Error(
        'Invalid ZIP archive: Central directory header exceeds buffer bounds'
      );
    }

    if (buffer.readUInt32LE(currentOffset) !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(currentOffset + 10);
    const compressedSize = buffer.readUInt32LE(currentOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(currentOffset + 24);
    const fileNameLength = buffer.readUInt16LE(currentOffset + 28);
    const extraFieldLength = buffer.readUInt16LE(currentOffset + 30);
    const fileCommentLength = buffer.readUInt16LE(currentOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentOffset + 42);

    if (seenLocalHeaderOffsets.has(localHeaderOffset)) {
      throw new Error(
        'Invalid ZIP archive: Duplicate local header offset detected'
      );
    }
    seenLocalHeaderOffsets.add(localHeaderOffset);

    const totalHeaderLength =
      46 + fileNameLength + extraFieldLength + fileCommentLength;
    if (currentOffset + totalHeaderLength > buffer.length) {
      throw new Error(
        'Invalid ZIP archive: Central directory record exceeds buffer bounds'
      );
    }

    const fileNameBytes = buffer.subarray(
      currentOffset + 46,
      currentOffset + 46 + fileNameLength
    );
    const fileName = fileNameBytes.toString('utf8');

    if (localHeaderOffset + 30 > buffer.length) {
      throw new Error(
        'Invalid ZIP archive: Local header offset exceeds buffer bounds'
      );
    }

    const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const fileDataOffset =
      localHeaderOffset + 30 + localFileNameLen + localExtraLen;

    if (fileDataOffset + compressedSize > buffer.length) {
      throw new Error(
        'Invalid ZIP archive: Compressed data exceeds buffer bounds'
      );
    }

    const compressedData = buffer.subarray(
      fileDataOffset,
      fileDataOffset + compressedSize
    );

    const isDirectory = fileName.endsWith('/');

    entries.push({
      path: fileName,
      isDirectory,
      uncompressedSize,
      getData: () => {
        const MAX_UNCOMPRESSED_ENTRY_SIZE = 100 * 1024 * 1024; // 100 MB max per entry

        if (isDirectory || uncompressedSize === 0) {
          return Buffer.alloc(0);
        }
        if (uncompressedSize > MAX_UNCOMPRESSED_ENTRY_SIZE) {
          throw new Error(
            `ZIP entry exceeds maximum safe uncompressed size limit (${MAX_UNCOMPRESSED_ENTRY_SIZE} bytes): ${fileName}`
          );
        }
        if (compressionMethod === 0) {
          return Buffer.from(compressedData);
        }
        if (compressionMethod === 8) {
          return zlib.inflateRawSync(compressedData, {
            maxOutputLength: MAX_UNCOMPRESSED_ENTRY_SIZE,
          });
        }
        throw new Error(
          `Unsupported ZIP compression method: ${compressionMethod}`
        );
      },
    });

    currentOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}
