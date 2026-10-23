import { createPreviewService } from '@/lib/website-preview/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const service = createPreviewService();
async function handle(request: Request) {
  const pathname = request.headers.get('x-website-preview-path');
  if (!pathname) return new Response('Not found', { status: 404 });
  return service.runtime(request, pathname);
}
export { handle as GET, handle as HEAD, handle as POST };
