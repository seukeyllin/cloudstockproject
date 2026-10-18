// src/stores/settings.ts
import { writable, get } from 'svelte/store';
import { LazyStore } from '@tauri-apps/plugin-store';
import { megaRootFolder } from './mega';

// Criamos uma instância do plugin de armazenamento
const store = new LazyStore('settings.json');

// Criamos uma store comum do Svelte para o caminho das ROMs
export const romsRootPath = writable<string>('');

// Pastas de destino de download por plataforma (chave lowercase; 'default' = padrão)
export const downloadDirs = writable<Record<string, string>>({});

// Função para carregar o dado salvo quando o app abrir
export async function loadSettings() {
    const saved = await store.get<{ value: string }>('roms-root-path');
    if (saved) {
        romsRootPath.set(saved.value);
    }

    const megaSaved = await store.get<{ value: string }>('mega-root-folder');
    if (megaSaved) {
        megaRootFolder.set(megaSaved.value);
    }

    const dirsSaved = await store.get<{ value: Record<string, string> }>('download-dirs');
    if (dirsSaved?.value) {
        downloadDirs.set(dirsSaved.value);
    }
}

// Retorna a pasta de destino salva para a plataforma (ou a padrão)
export async function getDownloadDir(platform: string): Promise<string | null> {
    const dirs = get(downloadDirs);
    return dirs[platform.toLowerCase()] ?? dirs['default'] ?? null;
}

// Persiste a pasta de destino de uma plataforma
export async function setDownloadDir(platform: string, path: string): Promise<void> {
    const next = { ...get(downloadDirs), [platform.toLowerCase()]: path };
    downloadDirs.set(next);
    await store.set('download-dirs', { value: next });
    await store.save();
}

// Função para salvar o dado permanentemente
export async function savePath(path: string) {
    await store.set('roms-root-path', { value: path });
    await store.save(); // Importante: no Store precisa dar save() para gravar no disco
    romsRootPath.set(path);
}

// Salva a pasta raiz do Mega
export async function saveMegaRootFolder(path: string) {
    await store.set('mega-root-folder', { value: path });
    await store.save();
    megaRootFolder.set(path);
}

// Favoritos do usuário (ids de ROM) — persistidos em settings.json
export const favorites = writable<Set<string>>(new Set());

export async function loadFavorites() {
    const saved = await store.get<{ value: string[] }>('favorites');
    if (saved?.value) {
        favorites.set(new Set(saved.value));
    }
}

export async function toggleFavorite(id: string) {
    favorites.update(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        store.set('favorites', { value: Array.from(next) });
        store.save();
        return next;
    });
}