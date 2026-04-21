// src/utils/metadataParser.ts
import type { Rom } from '../types/rom';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface MetadataEntry {
  title?: string;
  year?: number;
  collection?: string;
  description?: string;
}

export type MetadataMap = Map<string, MetadataEntry>;

/**
 * Lê o arquivo cloudstore.metadata.txt de uma pasta de sistema
 * e retorna um Map com os metadados de cada jogo.
 */
export async function loadMetadata(systemFolder: string): Promise<MetadataMap> {
  const metadataMap = new Map<string, MetadataEntry>();

  try {
    const metadataPath = await join(systemFolder, 'cloudstore.metadata.txt');
    const content = await readTextFile(metadataPath);

    const lines = content.split(/\r?\n/);
    let currentGame: string | null = null;
    let currentEntry: MetadataEntry = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#') || trimmed === '') continue; // ignora comentários e linhas vazias

      if (trimmed.startsWith('game:')) {
        // salva o entry anterior
        if (currentGame) {
          metadataMap.set(currentGame.toLowerCase().trim(), { ...currentEntry });
        }

        // começa novo jogo
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

    // salva o último entry
    if (currentGame) {
      metadataMap.set(currentGame.toLowerCase().trim(), { ...currentEntry });
    }
  } catch (err) {
    // arquivo não existe ou erro → retorna map vazio (normal)
    console.warn(`⚠️ Metadata não encontrado em ${systemFolder}`);
  }

  return metadataMap;
}