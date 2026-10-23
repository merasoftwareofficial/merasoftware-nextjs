import { createPreviewService } from '@/lib/website-preview/service';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const service = createPreviewService();
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) { return service.management(request, (await context.params).action); }
export const OPTIONS = POST;
