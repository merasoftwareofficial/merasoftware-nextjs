// Generates new, separate preview credentials into a NEW private directory. Never prints key values.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory) || existsSync(directory)) {
  console.error('Usage: node scripts/website-preview-keygen.mjs <new-absolute-private-directory-outside-repositories>');
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const service = randomBytes(48).toString('base64url'), session = randomBytes(48).toString('base64url');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const files = {
  'preview-private.pem': privateKey,
  'preview-public.pem': publicKey,
  'backend.env': `WEBSITE_PREVIEW_PRIVATE_KEY=${JSON.stringify(privateKey)}\nWEBSITE_PREVIEW_PUBLIC_KEY=${JSON.stringify(publicKey)}\nWEBSITE_PREVIEW_SERVICE_SECRET=${service}\nWEBSITE_PREVIEW_SERVICE_URL=https://www.merasoftware.com\n`,
  'nextjs.env': `WEBSITE_PREVIEW_PUBLIC_KEY=${JSON.stringify(publicKey)}\nWEBSITE_PREVIEW_SERVICE_SECRET=${service}\nWEBSITE_PREVIEW_SESSION_SECRET=${session}\n# Set BLOB_READ_WRITE_TOKEN from the PRIVATE Blob store connected to the Next.js project.\n`,
};
for (const [name, value] of Object.entries(files)) writeFileSync(path.join(directory, name), value, { flag: 'wx', mode: 0o600 });
console.log(`Preview credentials created in ${directory}. Keep this directory private and outside Git. No application configuration was changed.`);
