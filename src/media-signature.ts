export function detectMediaMimeType(bytes: Uint8Array): string {
  if (hasGifSignature(bytes)) return "image/gif";
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    asciiBytes(bytes, 0, 4) === "RIFF" &&
    asciiBytes(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (findAsciiBytes(bytes, "ftyp", 64) >= 4) return "video/mp4";
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return "";
}

export function hasGifSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 6) return false;
  const signature = asciiBytes(bytes, 0, 6);
  return signature === "GIF87a" || signature === "GIF89a";
}

function findAsciiBytes(
  bytes: Uint8Array,
  target: string,
  maxOffset: number,
): number {
  const lastStart = Math.min(bytes.byteLength - target.length, maxOffset);
  for (let index = 0; index <= lastStart; index += 1) {
    if (asciiBytes(bytes, index, index + target.length) === target)
      return index;
  }
  return -1;
}

function asciiBytes(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
