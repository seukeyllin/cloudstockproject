// src/stores/roms.ts
import { writable } from 'svelte/store';
import type { Rom } from '../types/rom';
import { loadMetadata, type MetadataMap } from '../utils/metadataParser';
import { readDir, readFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export const romsStore = writable<Rom[]>([]);

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  nes: ['.nes'],
  n64: ['.z64', '.n64', '.v64'],
  ps1: ['.bin', '.iso', '.cue', '.chd'],
  ps2: ['.iso', '.chd', '.elf'],
  // adicione mais plataformas aqui depois
};

export async function scanRoms(rootPath: string) {
  console.log('🔍 Iniciando scan em:', rootPath);
  const scannedRoms: Rom[] = [];

  try {
    const entries = await readDir(rootPath);

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      const systemFolder = await join(rootPath, entry.name);
      const platform = entry.name.toLowerCase();

      // Carrega metadados (cloudstore.metadata.txt)
      const metadata = await loadMetadata(systemFolder);

      // Lê todos os arquivos da pasta do sistema
      const files = await readDir(systemFolder);

      for (const file of files) {
        if (file.isDirectory) continue;

        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        const supportedExts = PLATFORM_EXTENSIONS[platform];

        if (!supportedExts || !supportedExts.includes(ext)) continue;

        // Pega metadados se existir
        const meta = metadata.get(file.name.toLowerCase()) || {};

        const fullPath = await join(systemFolder, file.name);
        const stats = await readFile(fullPath); // só pra pegar tamanho

        const rom: Rom = {
          id: file.name,
          title: meta.title || file.name.replace(ext, '').replace(/[-_]/g, ' '),
          platform: platform.toUpperCase(),
          filePath: fullPath,
          coverPath: `downloaded_media/${platform}/covers/${file.name.replace(ext, '')}.jpg`,
          size: stats.byteLength,
          lastModified: new Date(),
          year: meta.year,
          collection: meta.collection,
          description: meta.description,
        };

        scannedRoms.push(rom);
      }
    }

    romsStore.set(scannedRoms);
    console.log(`✅ ${scannedRoms.length} ROMs encontrados e carregados!`);
  } catch (error) {
    console.error('❌ Erro no scan:', error);
  }
}