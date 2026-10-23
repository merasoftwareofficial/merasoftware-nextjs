// Run against an isolated `next start --hostname localhost` build, never a live service.
import http from 'node:http';
import assert from 'node:assert/strict';
const port = Number(process.argv[2] || 3305);
const cases = [
  ['deepinteriors-preview.merasoftware.com', '/', 401],
  ['deepinteriors-preview.merasoftware.com', '/Images/a.jpg', 401],
  ['deepinteriors-preview.merasoftware.com', '/admin', 404],
  ['deepinteriors-preview.merasoftware.com', '/api/users', 404],
  ['deepinteriors-preview.merasoftware.com', '/sw.js', 404],
  ['deepinteriors-preview.merasoftware.com', '/external-upload', 401],
  ['www.merasoftware.com', '/api/website-preview-runtime', 404],
  ['www.merasoftware.com', '/contact/', 308],
  ['www.merasoftware.com', '/external-upload', 307],
  ['www.merasoftware.com', '/manifest.webmanifest', 200],
];
for (const [host, path, expected] of cases) {
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port, path, headers: { Host: host, 'x-website-preview-path': '/index.html' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    }); req.on('error', reject); req.end();
  });
  assert.equal(result, expected, `${host}${path}`);
  console.log(`PASS ${expected} ${host}${path}`);
}
console.log('Production Next.js host routing: PASS');
