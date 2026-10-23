import 'server-only';
import { get, head, list, put, del, BlobNotFoundError } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { artifactKey, canonicalManifest, hashManifest, PreviewError, type PreviewFile } from './core';

export interface PreviewStorage {
  read(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number; contentType: string } | null>;
  inventory(prefix: string): Promise<{ key: string; size: number }[]>;
  metadata(key: string): Promise<{ size: number; contentType: string } | null>;
  writeManifest(projectId: string, versionId: string, files: PreviewFile[]): Promise<void>;
  token(file: PreviewFile, until: number): Promise<string>;
  remove(prefix: string): Promise<void>;
}
export const storage: PreviewStorage = {
  async read(key) { const value = await get(key, { access: 'private' }); return value?.statusCode === 200 ? { stream: value.stream, size: value.blob.size, contentType: value.blob.contentType } : null; },
  async metadata(key) { try { const v = await head(key); return { size: v.size, contentType: v.contentType }; } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; } },
  async inventory(prefix) {
    const files: { key: string; size: number }[] = []; let cursor: string | undefined;
    do { const page = await list({ prefix, cursor, limit: 1000 }); files.push(...page.blobs.map(b => ({ key: b.pathname, size: b.size }))); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
    return files;
  },
  async writeManifest(projectId, versionId, files) {
    const key = artifactKey(projectId, versionId), data = JSON.stringify(canonicalManifest(files));
    try { await put(key, data, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' }); }
    catch (error) {
      const existing = await this.read(key);
      if (!existing || await new Response(existing.stream).text() !== data) throw error;
    }
  },
  token(file, validUntil) { return generateClientTokenFromReadWriteToken({ pathname: file.key, maximumSizeInBytes: Math.max(file.size, 1),
    allowedContentTypes: [file.contentType], validUntil, addRandomSuffix: false, allowOverwrite: false }); },
  async remove(prefix) { const objects = await this.inventory(prefix); for (let i = 0; i < objects.length; i += 100) await del(objects.slice(i, i + 100).map(f => f.key)); },
};
// Immutable, hash-verified artifacts only. Authorization is still checked before every file read.
// This is a bounded per-process optimization, never an ownership/visibility source of truth.
const manifestCaches = new WeakMap<PreviewStorage, Map<string, { files: PreviewFile[]; until: number }>>();
export async function loadManifest(store: PreviewStorage, projectId: string, versionId: string, expected: string) {
  let cache = manifestCaches.get(store);
  if (!cache) { cache = new Map(); manifestCaches.set(store, cache); }
  const cacheKey = `${projectId}/${versionId}/${expected}`, cached = cache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.files;
  const result = await store.read(artifactKey(projectId, versionId));
  if (!result || result.size > 512_000) throw new PreviewError('Preview manifest unavailable', 503);
  const files = await new Response(result.stream).json() as PreviewFile[];
  if (!Array.isArray(files) || hashManifest(files) !== expected) throw new PreviewError('Preview manifest integrity check failed', 503);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { files, until: Date.now() + 10 * 60_000 });
  return files;
}
