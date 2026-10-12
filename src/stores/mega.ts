// src/stores/mega.ts
import { writable, get } from 'svelte/store';
// megajs é pesado: importamos apenas os TIPOS estaticamente (não gera bundle)
// e a biblioteca de verdade só quando o usuário fizer login (dynamic import)
import type { Storage, File } from 'megajs';

export const megaStorage = writable<Storage | null>(null);
export const isMegaLoggedIn = writable(false);
export const megaRootFolder = writable<string>(''); // Caminho da pasta raiz escolhida (ex: /CloudStock)
export const megaFolders = writable<Array<{ name: string; path: string; handle: File }>>([]);

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  nes: ['.nes'],
  n64: ['.z64', '.n64', '.v64', '.rom'],
  ps1: ['.bin', '.iso', '.cue', '.chd', '.rom'],
  ps2: ['.iso', '.chd', '.elf'],
  n3ds: ['.cia', '.3ds', '.cci'],
  snes: ['.sfc'],
  wiiu: ['.wup', '.wud', '.wux', '.wua', '.rpx'],
  gba: ['.gba'],
  psp: ['.iso', '.cso', '.pbp', '.chd', '.dax', '.jso', '.rar', '.zip', '.7z'],
  nds: ['.nds'],
  wii: ['.wbfs', '.iso', '.ciso', '.wad'],
  gc: ['.iso', '.rvz', '.gcz'],
};

export async function loginMega(email: string, password: string) {
  try {
    // Import dinâmico: megajs só entra em memória agora, não no boot do app
    const { Storage } = await import('megajs');

    const storage = new Storage({
      email,
      password,
      autoload: true
    });

    console.log('🔐 Aguardando storage.ready...');
    await storage.ready;
    console.log('✅ storage.ready resolvido');

    // Forçar recarregamento da estrutura de pastas
    console.log('🔄 Chamando storage.reload(true)...');
    const reloadResult = await storage.reload(true);
    console.log('✅ storage.reload(true) resolvido, mounts:', reloadResult?.length);

    megaStorage.set(storage);
    isMegaLoggedIn.set(true);

    console.log('✅ Logado no Mega com sucesso!');
    console.log('📂 Root:', storage.root?.name, '| children:', storage.root?.children?.length || 0);
    if (storage.root?.children) {
      console.log('📂 Root children:', storage.root.children.map(c => ({ name: c.name, dir: c.directory })).filter(c => c.name));
    }
    console.log('📂 Trash:', storage.trash?.name, '| Inbox:', storage.inbox?.name);
    console.log('📂 Files map size:', Object.keys(storage.files || {}).length);

    // Carregar pasta salva (se houver)
    await loadMegaRootFolder();

    return true;
  } catch (error) {
    console.error('❌ Erro no login Mega:', error);
    throw error;
  }
}

export function logoutMega() {
  megaStorage.set(null);
  isMegaLoggedIn.set(false);
  megaRootFolder.set('');
  megaFolders.set([]);
}

// Carrega a pasta raiz salva no settings.json
export async function loadMegaRootFolder() {
  const { LazyStore } = await import('@tauri-apps/plugin-store');
  const settingsStore = new LazyStore('settings.json');
  const saved = await settingsStore.get<{ value: string }>('mega-root-folder');
  console.log('🔍 loadMegaRootFolder - saved:', saved);
  if (saved) {
    megaRootFolder.set(saved.value);
    console.log('📁 Pasta Mega salva carregada:', saved.value);
    // Carregar subpastas automaticamente
    await loadMegaFolders(saved.value);
  } else {
    console.log('📁 Nenhuma pasta salva encontrada');
    // Se não tem pasta salva, carregar raiz do Mega
    await loadMegaFolders('/');
  }
}

// Salva a pasta raiz escolhida
export async function saveMegaRootFolder(path: string) {
  const { LazyStore } = await import('@tauri-apps/plugin-store');
  const settingsStore = new LazyStore('settings.json');
  await settingsStore.set('mega-root-folder', { value: path });
  await settingsStore.save();
  megaRootFolder.set(path);
  console.log('💾 Pasta Mega salva:', path);
}

// Helper para obter o caminho completo de um nó
function getNodePath(node: File): string {
  const parts: string[] = [];
  let current: File | undefined = node;
  while (current && current.name && current.name !== 'Cloud Drive') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return '/' + parts.join('/');
}

// Lista pastas filhas de um nó (File) do Mega
async function listMegaChildren(node: File): Promise<Array<{ name: string; path: string; handle: File }>> {
  const children: Array<{ name: string; path: string; handle: File }> = [];

  if (!node.children || !Array.isArray(node.children)) return children;

  const nodePath = getNodePath(node);

  for (const child of node.children) {
    if (child.directory && child.name) {
      children.push({
        name: child.name,
        path: `${nodePath}/${child.name}`.replace('//', '/'),
        handle: child
      });
    }
  }

  return children.sort((a, b) => a.name.localeCompare(b.name));
}

// Carrega as pastas de um caminho específico
export async function loadMegaFolders(folderPath: string) {
  const storage = get(megaStorage);
  if (!storage || !storage.root) {
    console.warn('⚠️ Sem storage Mega ou root não carregado');
    megaFolders.set([]);
    return;
  }

  try {
    console.log(`🔍 loadMegaFolders chamado para: "${folderPath}"`);
    console.log(`📂 Root: "${storage.root?.name}" | children count: ${storage.root?.children?.length || 0}`);
    if (storage.root?.children) {
      console.log('📂 Root children names:', storage.root.children.map(c => c.name).filter(Boolean));
    }

    // Usar navigate do SDK que é o método correto (está em MutableFile, não em Storage)
    let currentNode: File = storage.root;

    if (folderPath !== '/') {
      const pathParts = folderPath.split('/').filter(p => p);
      console.log('🧭 pathParts para navigate:', pathParts);
      const navigated = storage.root.navigate(pathParts);
      console.log('🧭 navigate result:', navigated?.name, navigated?.directory, navigated?.children?.length || 0);
      if (navigated && navigated.directory) {
        currentNode = navigated;
      } else {
        console.error(`❌ Pasta não encontrada via navigate: ${folderPath}`);
        console.log('Children root:', storage.root.children?.map(c => c.name).filter(Boolean));
        megaFolders.set([]);
        return;
      }
    } else {
      console.log('📂 Carregando da raiz "/"');
    }

    const folders = await listMegaChildren(currentNode);
    megaFolders.set(folders);
    console.log(`✅ ${folders.length} pastas encontradas em ${folderPath}:`, folders.map(f => f.name));
  } catch (error) {
    console.error('❌ Erro ao carregar pastas do Mega:', error);
    megaFolders.set([]);
  }
}

// Lista TODOS os arquivos recursivamente a partir de uma pasta raiz
export async function listAllMegaFiles(rootPath: string): Promise<Array<{ name: string; path: string; platform: string; handle: File }>> {
  const storage = get(megaStorage);
  if (!storage || !storage.root) return [];

  const allFiles: Array<{ name: string; path: string; platform: string; handle: File }> = [];

  async function traverse(node: File, currentPath: string, platform: string) {
    if (!node.children || !Array.isArray(node.children)) return;

    for (const child of node.children) {
      if (!child.name) continue;
      const childPath = `${currentPath}/${child.name}`.replace('//', '/');

      if (child.directory) {
        // Se for uma pasta de plataforma conhecida, usa ela como plataforma
        const lowerName = child.name.toLowerCase();
        const newPlatform = PLATFORM_EXTENSIONS[lowerName] ? lowerName : platform;
        await traverse(child, childPath, newPlatform);
      } else {
        // É arquivo - verifica extensão
        const ext = child.name.toLowerCase().slice(child.name.lastIndexOf('.'));
        const supportedExts = PLATFORM_EXTENSIONS[platform];

        if (supportedExts && supportedExts.includes(ext)) {
          allFiles.push({
            name: child.name,
            path: childPath,
            platform: platform.toUpperCase(),
            handle: child
          });
        }
      }
    }
  }

  // Encontrar o nó raiz usando navigate (está em MutableFile)
  const pathParts = rootPath.split('/').filter(p => p);
  let rootNode: File = storage.root;
  if (pathParts.length > 0) {
    const navigated = storage.root.navigate(pathParts);
    if (navigated) {
      rootNode = navigated;
    } else {
      console.error(`❌ Pasta raiz não encontrada via navigate: ${rootPath}`);
      return [];
    }
  }

  await traverse(rootNode, rootPath, 'unknown');
  console.log(`📦 ${allFiles.length} arquivos de ROM encontrados no Mega`);
  return allFiles;
}

// Lista TODOS os arquivos recursivamente E retorna handles das pastas de plataforma (para metadata)
export async function listAllMegaFilesWithHandles(rootPath: string): Promise<{
  megaFiles: Array<{ name: string; path: string; platform: string; handle: File }>;
  platformFolderHandles: Record<string, File>;
}> {
  const storage = get(megaStorage);
  if (!storage || !storage.root) return { megaFiles: [], platformFolderHandles: {} };

  const allFiles: Array<{ name: string; path: string; platform: string; handle: File }> = [];
  const platformFolderHandles: Record<string, File> = {};

  async function traverse(node: File, currentPath: string, platform: string) {
    if (!node.children || !Array.isArray(node.children)) return;

    for (const child of node.children) {
      if (!child.name) continue;
      const childPath = `${currentPath}/${child.name}`.replace('//', '/');

      if (child.directory) {
        // Se for uma pasta de plataforma conhecida, salva o handle e usa ela como plataforma
        const lowerName = child.name.toLowerCase();
        const newPlatform = PLATFORM_EXTENSIONS[lowerName] ? lowerName : platform;

        if (PLATFORM_EXTENSIONS[lowerName]) {
          platformFolderHandles[lowerName] = child;
        }
        await traverse(child, childPath, newPlatform);
      } else {
        // É arquivo - verifica extensão
        const ext = child.name.toLowerCase().slice(child.name.lastIndexOf('.'));
        const supportedExts = PLATFORM_EXTENSIONS[platform];

        if (supportedExts && supportedExts.includes(ext)) {
          allFiles.push({
            name: child.name,
            path: childPath,
            platform: platform.toUpperCase(),
            handle: child
          });
        }
      }
    }
  }

  // Encontrar o nó raiz
  let rootNode: File = storage.root;
  const pathParts = rootPath.split('/').filter(p => p);

  for (const part of pathParts) {
    if (rootNode.children && Array.isArray(rootNode.children)) {
      const found = rootNode.children.find(child => child.name === part);
      if (found) {
        rootNode = found;
      } else {
        console.error(`❌ Pasta raiz não encontrada: ${rootPath}`);
        return { megaFiles: [], platformFolderHandles: {} };
      }
    } else {
      console.error(`❌ Pasta raiz não encontrada: ${rootPath}`);
      return { megaFiles: [], platformFolderHandles: {} };
    }
  }

  await traverse(rootNode, rootPath, 'unknown');
  console.log(`📦 ${allFiles.length} arquivos de ROM encontrados no Mega`);
  console.log(`📂 Pastas de plataforma encontradas: ${Object.keys(platformFolderHandles).join(', ')}`);
  return { megaFiles: allFiles, platformFolderHandles };
}

// Baixa um arquivo do Mega e retorna um blob/ArrayBuffer
export async function downloadMegaFile(fileHandle: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const stream = fileHandle.download({});
    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    stream.on('end', () => {
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(result.buffer);
    });
    stream.on('error', reject);
  });
}