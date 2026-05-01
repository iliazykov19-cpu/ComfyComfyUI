import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promptLibrarySchema, type PromptLibrary } from './types';
import { buildSeedLibrary } from './seed';

const FILE = path.join(process.cwd(), 'data', 'prompt-library.json');

async function ensureDir() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
}

export async function getLibrary(): Promise<PromptLibrary> {
  await ensureDir();
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return promptLibrarySchema.parse(JSON.parse(raw));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      const seed = buildSeedLibrary();
      await fs.writeFile(FILE, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    throw e;
  }
}

export async function saveLibrary(lib: PromptLibrary): Promise<void> {
  await ensureDir();
  const validated = promptLibrarySchema.parse(lib);
  await fs.writeFile(FILE, JSON.stringify(validated, null, 2), 'utf8');
}
