// Synchronous data: URL → Blob.
// Avoids `fetch(dataUrl)`, which throws "Load failed" on Safari for large
// payloads (e.g. high-res camera JPEGs).
export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith("data:")) throw new Error("Invalid data URL");
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Invalid data URL");

  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = meta.endsWith(";base64");
  const mime = (isBase64 ? meta.slice(0, -7) : meta) || "application/octet-stream";

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
