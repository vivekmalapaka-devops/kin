export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:8787/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('backend unavailable');
    return Response.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Start the extraction backend first.' }, { status: 503 }); }
}
