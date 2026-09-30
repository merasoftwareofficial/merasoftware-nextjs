const UPLOAD_PATH = "/image/upload/";

/**
 * The delivery URL for an uploaded Cloudinary image, resized to `width` and
 * sent in the best format the browser accepts (WebP/AVIF). Uploads keep the
 * original file (see cloudinary.ts); this only changes what is delivered.
 * `c_limit` never enlarges a smaller original. Other URLs pass through.
 */
export function cloudinaryImageUrl(url: string, width: number): string {
  const at = url.indexOf(UPLOAD_PATH);
  if (!url.startsWith("https://res.cloudinary.com/") || at < 0) return url;
  const start = at + UPLOAD_PATH.length;
  return `${url.slice(0, start)}f_auto,q_auto,c_limit,w_${width}/${url.slice(start)}`;
}
