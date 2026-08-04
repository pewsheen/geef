export type ImportableMediaFile = Pick<File, "name" | "type">;

const MIME_TYPE_BY_EXTENSION = new Map([
  ["gif", "image/gif"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
]);

const EXTENSION_BY_MIME_TYPE = new Map([
  ["image/gif", "gif"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);

const IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const SUPPORTED_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
]);

export function isImportableMediaFile(file: ImportableMediaFile): boolean {
  return Boolean(mediaMimeType(file));
}

export function isGifFile(file: ImportableMediaFile): boolean {
  return mediaMimeType(file) === "image/gif";
}

export function isImageFile(file: ImportableMediaFile): boolean {
  return IMAGE_MIME_TYPES.has(mediaMimeType(file));
}

export function isVideoFile(file: ImportableMediaFile): boolean {
  return VIDEO_MIME_TYPES.has(mediaMimeType(file));
}

export function mediaMimeType(file: ImportableMediaFile): string {
  const declaredType = String(file?.type || "").toLowerCase();
  if (SUPPORTED_MIME_TYPES.has(declaredType)) return declaredType;
  if (declaredType === "image/jpg") return "image/jpeg";

  const extension = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return MIME_TYPE_BY_EXTENSION.get(extension) || "";
}

export function mediaExtension(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE.get(String(mimeType || "").toLowerCase()) || "";
}

export function mediaKind(file: ImportableMediaFile): "image" | "video" | "" {
  const mimeType = mediaMimeType(file);
  if (IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (VIDEO_MIME_TYPES.has(mimeType)) return "video";
  return "";
}

export function ensureMediaFilename(
  filename: string,
  mimeType: string,
): string {
  const extension = mediaExtension(mimeType);
  const fallback = extension ? `media.${extension}` : "media";
  const safeName =
    String(filename || fallback)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .trim()
      .slice(0, 120) || fallback;
  if (!extension) return safeName;

  const currentMimeType = mediaMimeType({ name: safeName, type: "" });
  if (currentMimeType === mimeType) return safeName;
  const stem = safeName.replace(/\.[^.]+$/, "") || "media";
  return `${stem}.${extension}`;
}
