const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the real pixel size from a PNG's IHDR chunk (bytes 16-23, big-endian). */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  const isPng = bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
  const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
  if (!isPng || ihdr !== "IHDR") throw new Error("Not a PNG file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
