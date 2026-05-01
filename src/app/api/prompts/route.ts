import { NextRequest, NextResponse } from 'next/server';
import { getLibrary, saveLibrary } from '@/lib/prompts/storage';
import { promptLibrarySchema } from '@/lib/prompts/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const lib = await getLibrary();
  return NextResponse.json(lib);
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = promptLibrarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid library', details: parsed.error.issues },
      { status: 400 },
    );
  }
  await saveLibrary(parsed.data);
  return NextResponse.json({ ok: true });
}
