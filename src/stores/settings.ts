// src/stores/settings.ts
import { writable } from 'svelte/store';
import { LazyStore } from '@tauri-apps/plugin-store';

// Criamos uma instância do plugin de armazenamento
const store = new LazyStore('settings.json');

// Criamos uma store comum do Svelte para o caminho das ROMs
export const romsRootPath = writable<string>('');

// Função para carregar o dado salvo quando o app abrir
export async function loadSettings() {
    const saved = await store.get<{ value: string }>('roms-root-path');
    if (saved) {
        romsRootPath.set(saved.value);
    }
}

// Função para salvar o dado permanentemente
export async function savePath(path: string) {
    await store.set('roms-root-path', { value: path });
    await store.save(); // Importante: no Store precisa dar save() para gravar no disco
    romsRootPath.set(path);
}