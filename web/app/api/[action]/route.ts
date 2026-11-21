export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!['reports', 'confirm', 'invite'].includes(action)) return Response.json({ error: 'Not found' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const contentLength = Number(request.headers.get('content-length'));
  const limit = action === 'reports' ? 20 * 1024 * 1024 : 1024 * 1024;
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > limit) return Response.json({ error: 'Invalid request size' }, { status: 400 });
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== contentLength || bytes.byteLength > limit) return Response.json({ error: 'Invalid request size' }, { status: 400 });
    const headers: Record<string, string> = { 'Content-Type': request.headers.get('content-type') || '', 'Authorization': request.headers.get('authorization') || '', 'Origin': 'http://127.0.0.1:8787' };
    const member = request.headers.get('x-member-id'); if (member) headers['X-Member-Id'] = member;
    const response = await fetch(`http://127.0.0.1:8787/${action}`, { method: 'POST', headers, body: bytes, cache: 'no-store' });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to reach the extraction backend.' }, { status: 503 }); }
}
