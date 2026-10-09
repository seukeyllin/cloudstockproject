// src/stores/roms.ts
import { writable, get } from 'svelte/store';
import type { Rom } from '../types/rom';
import { loadMetadata, type MetadataMap } from '../utils/metadataParser';
import { readDir, stat, BaseDirectory } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { megaStorage } from './mega';

export const romsStore = writable<Rom[]>([]);

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  n3ds: ['.cia', '.3ds', '.cci'],
  snes: ['.sfc'],
  wiiu: ['.wup', '.wud', '.wux', '.wua', '.rpx'],
  nes: ['.nes'],
  n64: ['.z64', '.n64', '.v64'],
  ps1: ['.bin', '.iso', '.cue', '.chd', '.rom'],
  ps2: ['.iso', '.chd', '.elf'],
  gba: ['.gba'],
  psp: ['.iso'],
  nds: ['.nds'],
  wii: ['.wbfs', '.iso', '.ciso', '.wad'],
  gc: ['.iso', '.rvz', '.gcz'],
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
        const fileInfo = await stat(fullPath);

        const rom: Rom = {
          id: file.name,
          title: meta.title || file.name.replace(ext, '').replace(/[-_]/g, ' '),
          platform: platform.toUpperCase(),
          filePath: fullPath,
          coverPath: `downloaded_media/${platform}/covers/${file.name.replace(ext, '')}.jpg`,
          size: fileInfo.size, // 🟢 Agora pega o tamanho instantaneamente!
          lastModified: new Date(),
          year: meta.year,
          collection: meta.collection,
          description: meta.description,
          status: 'local', // Usa o tipo que vai vir lá do outro arquivo
        };

        scannedRoms.push(rom);
      }
    }

    romsStore.set(scannedRoms);
    console.log(`✅ ${scannedRoms.length} ROMs encontrados e carregados!`);

    await syncRomsWithMega();
  } catch (error) {
    console.error('❌ Erro no scan:', error);
  }
}

export async function syncRomsWithMega() {
  const storage = get(megaStorage);
  
  if (!storage) {
    console.log('☁️ Sem sessão do Mega ativa para cruzar dados.');
    return;
  }

  try {
    const cloudFileNames = (storage.root?.children || []).map((node: any) => node.name.toLowerCase());

    romsStore.update(currentRoms => {
      return currentRoms.map(rom => {
        const localFileName = rom.filePath.split(/[\\/]/).pop()?.toLowerCase();

        if (localFileName && cloudFileNames.includes(localFileName)) {
          return { ...rom, status: 'cloud' };
        }

        return { ...rom, status: 'local' };
      });
    });

    console.log('🔄 Comparação CloudStock <> Mega concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao sincronizar listagem com o Mega:', error);
  }
}