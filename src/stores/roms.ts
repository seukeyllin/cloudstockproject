// src/stores/roms.ts
import { writable, get } from 'svelte/store';
import type { Rom } from '../types/rom';
import { loadMetadata, type MetadataMap } from '../utils/metadataParser';
import { readDir, stat } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { megaStorage } from './mega';
import { downloadMegaFile, megaRootFolder, listAllMegaFilesWithHandles } from './mega';
import { convertFileSrc } from '@tauri-apps/api/core';

export const romsStore = writable<Rom[]>([]);

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  n3ds: ['.cia', '.3ds', '.cci'],
  snes: ['.sfc'],
  wiiu: ['.wup', '.wud', '.wux', '.wua', '.rpx'],
  nes: ['.nes'],
  n64: ['.z64', '.n64', '.v64', '.rom'],
  ps1: ['.bin', '.iso', '.cue', '.chd', '.rom'],
  ps2: ['.iso', '.chd', '.elf'],
  gba: ['.gba'],
  psp: ['.iso', '.cso', '.pbp', '.chd', '.dax', '.jso', '.rar', '.zip', '.7z'],
  nds: ['.nds'],
  wii: ['.wbfs', '.iso', '.ciso', '.wad'],
  gc: ['.iso', '.rvz', '.gcz'],
};

export async function scanRoms(rootPath: string) {
  console.log('🔍 Iniciando scan local em:', rootPath);
  const scannedRoms: Rom[] = [];

  try {
    const entries = await readDir(rootPath);

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      const systemFolder = await join(rootPath, entry.name);
      const platform = entry.name.toLowerCase();

      // Carrega metadados (cloudstore.metadata.txt)
      const metadata = await loadMetadata(systemFolder);

      // Índice de capas: <plataforma>/media/box2dfront (mesmo nome do arquivo do jogo)
      const coversFolder = await join(systemFolder, 'media', 'box2dfront');
      const coverMap = new Map<string, string>(); // nome lowercase -> nome real
      try {
        const coverFiles = await readDir(coversFolder);
        for (const cf of coverFiles) {
          if (!cf.isDirectory) coverMap.set(cf.name.toLowerCase(), cf.name);
        }
      } catch {
        // Pasta de capas não existe para esta plataforma
      }

      // Lê todos os arquivos da pasta do sistema
      const files = await readDir(systemFolder);

      for (const file of files) {
        if (file.isDirectory) continue;

        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        const supportedExts = PLATFORM_EXTENSIONS[platform];

        if (!supportedExts || !supportedExts.includes(ext)) continue;

        // Pega metadados se existir
        const meta = metadata.get(file.name.toLowerCase()) || {};

        // Procura capa em media/box2dfront com o mesmo nome do arquivo do jogo
        const baseName = file.name.slice(0, -ext.length);
        let coverPath = '';
        for (const candidate of [`${baseName}.jpg`, `${baseName}.png`, `${baseName}.jpeg`, `${baseName}.webp`]) {
          const actualName = coverMap.get(candidate.toLowerCase());
          if (actualName) {
            coverPath = await join(coversFolder, actualName);
            break;
          }
        }

        const fullPath = await join(systemFolder, file.name);
        const fileInfo = await stat(fullPath);

        const rom: Rom = {
          id: `local_${platform}_${file.name}`,
          title: meta.title || file.name.replace(ext, '').replace(/[-_]/g, ' '),
          platform: platform.toUpperCase(),
          filePath: fullPath,
          coverPath,
          size: fileInfo.size,
          lastModified: new Date(),
          year: meta.year,
          collection: meta.collection,
          description: meta.description,
          status: 'local',
        };

        scannedRoms.push(rom);
      }
    }

    // Visão unificada: guarda o resultado do scan como fonte local e reconstrói
    localLibrary = scannedRoms;
    rebuildLibrary();
    console.log(`✅ ${scannedRoms.length} ROMs locais encontradas (biblioteca unificada: ${get(romsStore).length})`);
  } catch (error) {
    console.error('❌ Erro no scan local:', error);
  }
}

/**
 * ===== Fonte única de verdade =====
 * Duas bibliotecas internas (local = scan do disco, cloud = lista do MEGA) e uma
 * função de reconstrução determinística. Sempre que uma das fontes muda, o
 * romsStore é regenerado do zero — elimina merges dependentes de ordem.
 */
let localLibrary: Rom[] = [];
let cloudLibrary: Rom[] = [];

/**
 * Chave de casamento local <-> nuvem: plataforma + nome base do jogo normalizado.
 * - plataforma em lowercase (local usa nome da pasta; cloud também chega lowercase via mega.ts)
 * - nome: lowercase, SEM extensão (game.iso e game.cso são o mesmo jogo),
 *   com sufixos de formato/régio no fim removidos (ex: "(USA)", "[!]", "(Rev 1)")
 * Ignora o caminho completo (pasta local pode diferir da estrutura do MEGA).
 */
function romKey(platform: string, fileName: string): string {
  let normalized = fileName
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Remove a extensão (tudo depois do último ponto, se houver)
  const dot = normalized.lastIndexOf('.');
  if (dot > 0) normalized = normalized.slice(0, dot);

  // Remove sufixos de formato no fim: (USA), (Europe), [!], (Rev 1), (v2.0) etc.
  normalized = normalized
    .replace(/(?:\s*[(\[][^)\]]*[)\]])+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `${platform.toLowerCase()}::${normalized}`;
}

function fileNameOf(rom: Rom): string {
  return rom.filePath.split(/[\\/]/).pop() || '';
}

/**
 * Reconstrói o romsStore unificado a partir das duas fontes.
 * Regra: se o mesmo jogo existe nas duas, a entrada LOCAL vence (instalada)
 * e herda handle/coverHandle da nuvem para permitir re-download futuro.
 */
function rebuildLibrary() {
  const byKey = new Map<string, Rom>();

  // 1. Nuvem primeiro (base)
  for (const c of cloudLibrary) {
    byKey.set(romKey(c.platform, fileNameOf(c)), c);
  }

  // 2. Local por cima (vence) — status vira 'hybrid' (existe nas duas fontes)
  //    e herda handle/coverHandle da nuvem casada para permitir re-download futuro
  for (const l of localLibrary) {
    const key = romKey(l.platform, fileNameOf(l));
    const cloud = byKey.get(key);
    if (cloud && cloud.status !== 'local') {
      byKey.set(key, {
        ...l,
        status: 'hybrid',
        handle: cloud.handle ?? null,
        coverHandle: cloud.coverHandle ?? null,
      });
    } else if (!cloud) {
      byKey.set(key, l);
    }
    // Se cloud.status === 'local' (entrada pós-download), a versão cloud já é local — mantém ela
  }

  const merged = Array.from(byKey.values());

  // Diagnóstico de duplicidade: quantas chaves colidiram
  const dupCount = localLibrary.length + cloudLibrary.length - merged.length;
  if (dupCount > 0) {
    console.log(`🔀 ${dupCount} jogo(s) casado(s) entre local e nuvem (unificados em um card)`);
  }

  romsStore.set(merged);
}

/**
 * Baixa uma ROM da nuvem para a pasta de destino e atualiza o estado reativo
 * para "local" (instalada) sem recarregar o app.
 * Retorna o caminho do arquivo salvo.
 */
export async function downloadRomToDisk(rom: Rom, destDir: string): Promise<string> {
  if (!rom.handle) throw new Error('Handle do MEGA indisponível');

  const fileName = rom.filePath.split('/').pop() || 'rom';
  const buffer = await downloadMegaFile(rom.handle);

  const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');

  if (!(await exists(destDir))) {
    await mkdir(destDir, { recursive: true });
  }

  const destPath = await join(destDir, fileName);
  await writeFile(destPath, new Uint8Array(buffer));

  // Fonte única de verdade: a ROM baixada entra na biblioteca local
  // (herdando handle/cover da nuvem) e o store unificado é regenerado.
  const downloaded: Rom = { ...rom, status: 'local', filePath: destPath };
  localLibrary = [...localLibrary.filter(l => l.id !== rom.id), downloaded];
  cloudLibrary = cloudLibrary.filter(c => c.id !== rom.id);
  rebuildLibrary();

  console.log(`📥 ROM baixada e instalada: ${destPath}`);
  return destPath;
}

// NOVO: Carrega ROMs do Mega a partir da pasta raiz salva
export async function loadRomsFromMega() {
  const rootPath = get(megaRootFolder);

  if (!rootPath) {
    console.log('☁️ Nenhuma pasta do Mega selecionada');
    return;
  }

  console.log('☁️ Carregando ROMs do Mega a partir de:', rootPath);

  try {
    // 1. Lista todos os arquivos do Mega + os handles das pastas de plataforma
    const { megaFiles, platformFolderHandles } = await listAllMegaFilesWithHandles(rootPath);

    if (megaFiles.length === 0) {
      console.log('📭 Nenhum arquivo de ROM encontrado no Mega');
      return;
    }

    // 2. Baixar e parsear cloudstore.metadata.txt de cada plataforma encontrada
    const metadataByPlatform: Record<string, MetadataMap> = {};

    for (const [platform, folderHandle] of Object.entries(platformFolderHandles)) {
      metadataByPlatform[platform] = await loadMetadataFromMega(folderHandle, platform);
    }

    // 3. Indexar pastas media/box2dfront de cada plataforma (capas com mesmo nome do jogo)
    const coversByPlatform: Record<string, Map<string, any>> = {};
    for (const [platform, folderHandle] of Object.entries(platformFolderHandles)) {
      coversByPlatform[platform] = await indexMegaCovers(folderHandle);
    }

    // 4. Converter para Rom[]
    const roms: Rom[] = [];

    for (const file of megaFiles) {
      const platform = file.platform.toLowerCase();
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      const metadata = metadataByPlatform[platform]?.get(file.name.toLowerCase()) || {};

      // Gerar ID único baseado no caminho
      const id = `cloud_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Capa: <plataforma>/media/box2dfront/<nome do jogo>.(jpg|png|jpeg|webp)
      // O índice guarda o nome COM extensão, então testamos os candidatos
      const baseName = file.name.slice(0, -ext.length);
      let coverHandle: any = null;
      for (const candidate of [`${baseName}.jpg`, `${baseName}.png`, `${baseName}.jpeg`, `${baseName}.webp`]) {
        const found = coversByPlatform[platform]?.get(candidate.toLowerCase());
        if (found) {
          coverHandle = found;
          break;
        }
      }

      const rom: Rom = {
        id,
        title: metadata.title || file.name.replace(ext, '').replace(/[-_]/g, ' '),
        platform: file.platform,
        filePath: file.path, // Caminho no Mega
        coverPath: '',
        coverHandle,
        handle: file.handle, // Handle para download da ROM
        size: file.handle.size ?? 0, // Tamanho real informado pelo MEGA
        lastModified: new Date(),
        year: metadata.year,
        collection: metadata.collection,
        description: metadata.description,
        status: 'cloud',
      };

      roms.push(rom);
    }

    // Visão unificada: guarda a lista da nuvem como fonte cloud e reconstrói.
    // Mesmo arquivo nas duas fontes → vira "local" (instalado), preservando o handle.
    cloudLibrary = roms;
    rebuildLibrary();
    console.log(`✅ ${roms.length} ROMs do Mega processadas (biblioteca unificada: ${get(romsStore).length})`);

    // 5. Baixar capas em segundo plano e injetar ObjectURL nos cards gradualmente
    downloadMegaCoversInBackground();
  } catch (error) {
    console.error('❌ Erro ao carregar ROMs do Mega:', error);
  }
}

// Indexa a pasta media/box2dfront de uma plataforma no Mega: nome lowercase -> handle
async function indexMegaCovers(platformFolderHandle: any): Promise<Map<string, any>> {
  const index = new Map<string, any>();
  try {
    const children = platformFolderHandle.children;
    // No megajs, `children` é um ARRAY de nós (não um mapa por nome)
    if (!Array.isArray(children)) return index;

    const mediaFolder = children.find((c: any) => c.name === 'media');
    if (!mediaFolder?.directory || !Array.isArray(mediaFolder.children)) return index;

    const boxFolder = mediaFolder.children.find((c: any) => c.name === 'box2dfront');
    if (!boxFolder?.directory || !Array.isArray(boxFolder.children)) return index;

    for (const child of boxFolder.children as any[]) {
      if (!child.directory && child.name) {
        index.set(child.name.toLowerCase(), child);
      }
    }
    console.log(`🖼️ ${index.size} capas indexadas em box2dfront`);
  } catch (error) {
    console.error('❌ Erro ao indexar capas do Mega:', error);
  }
  return index;
}

// Baixa as capas do Mega em segundo plano, atualizando os cards conforme chegam
const coverObjectUrls = new Map<string, string>(); // rom.id -> blob URL

async function downloadMegaCoversInBackground() {
  const roms = get(romsStore);

  for (const rom of roms) {
    if (!rom.coverHandle || coverObjectUrls.has(rom.id)) continue;

    try {
      const buffer = await downloadMegaFile(rom.coverHandle);
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      coverObjectUrls.set(rom.id, url);

      romsStore.update(current =>
        current.map(r => (r.id === rom.id ? { ...r, coverPath: url } : r))
      );
    } catch (error) {
      console.warn(`⚠️ Falha ao baixar capa de "${rom.title}":`, error);
    }
  }
}

// Baixa e parseia cloudstore.metadata.txt do Mega para uma plataforma
async function loadMetadataFromMega(platformFolderHandle: any, platform: string): Promise<MetadataMap> {
  const metadataMap = new Map<string, MetadataEntry>();

  try {
    // No megajs, `children` é um ARRAY de nós (não um mapa por nome)
    const children = platformFolderHandle.children;
    if (!Array.isArray(children)) return metadataMap;

    const metaFile = children.find((c: any) => c.name === 'cloudstore.metadata.txt');
    if (!metaFile || metaFile.directory) {
      console.warn(`⚠️ Metadata não encontrado para ${platform} no Mega`);
      return metadataMap;
    }

    // Baixar o arquivo
    const buffer = await downloadMegaFile(metaFile);
    const content = new TextDecoder().decode(buffer);

    const lines = content.split(/\r?\n/);
    let currentGame: string | null = null;
    let currentEntry: MetadataEntry = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#') || trimmed === '') continue;

      if (trimmed.startsWith('game:')) {
        if (currentGame) {
          metadataMap.set(currentGame.toLowerCase().trim(), { ...currentEntry });
        }
        currentGame = trimmed.replace('game:', '').trim();
        currentEntry = {};
        continue;
      }

      if (!currentGame) continue;

      if (trimmed.startsWith('title:')) {
        currentEntry.title = trimmed.replace('title:', '').trim();
      } else if (trimmed.startsWith('year:')) {
        currentEntry.year = parseInt(trimmed.replace('year:', '').trim());
      } else if (trimmed.startsWith('collection:')) {
        currentEntry.collection = trimmed.replace('collection:', '').trim();
      } else if (trimmed.startsWith('description:') || trimmed.startsWith('descryption:')) {
        currentEntry.description = trimmed.replace(/^(description|descryption):/, '').trim();
      }
    }

    if (currentGame) {
      metadataMap.set(currentGame.toLowerCase().trim(), { ...currentEntry });
    }

    console.log(`📄 Metadados carregados do Mega para ${platform}: ${metadataMap.size} entradas`);
  } catch (error) {
    console.error(`❌ Erro ao carregar metadata do Mega para ${platform}:`, error);
  }

  return metadataMap;
}

// Interface local para MetadataEntry (evitar import circular)
interface MetadataEntry {
  title?: string;
  year?: number;
  collection?: string;
  description?: string;
}

// Biblioteca unificada: o status de cada ROM é definido pela sua fonte
// (scan local = 'local', lista MEGA = 'cloud') e atualizado em tempo real
// pelo downloadRomToDisk. Mantida como no-op para compatibilidade de imports.
export async function syncRomsWithMega() {
  console.log('🔄 Biblioteca unificada ativa — status definido por fonte (local/nuvem).');
}

// Função auxiliar para obter URL da capa
export function getCoverUrl(coverPath: string): string {
  try {
    // ObjectURL (capa do Mega já baixada) — usa direto
    if (coverPath.startsWith('blob:') || coverPath.startsWith('http')) {
      return coverPath;
    }
    // Caminho absoluto local (scan local, media/box2dfront) — converte para asset://
    return convertFileSrc(coverPath);
  } catch {
    return coverPath;
  }
}