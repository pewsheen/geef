export type ImportableMediaFile = Pick<File, "name" | "type">;

const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

export function isImportableMediaFile(file: ImportableMediaFile): boolean {
  return isGifFile(file) || isVideoFile(file);
}

export function isGifFile(file: ImportableMediaFile): boolean {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

export function isVideoFile(file: ImportableMediaFile): boolean {
  return (
    VIDEO_MIME_TYPES.has(file.type.toLowerCase()) ||
    /\.(?:mp4|webm)$/i.test(file.name)
  );
}
