// src/types/rom.ts
export interface Rom {
  id: string;
  title: string;
  platform: string;
  filePath: string;
  coverPath: string;
  // Handle do arquivo de capa no Mega (baixado em segundo plano)
  coverHandle?: any | null;
  // Handle do próprio arquivo de ROM no Mega (necessário para baixar)
  handle?: any | null;
  size: number;
  lastModified: Date;
  year?: number;
  collection?: string;
  description?: string;

  // 🔥 O status mapeado corretamente no lugar certo!
  // 'hybrid' = existe local E na nuvem (card unificado, pode jogar offline e baixar de novo)
  status: 'local' | 'syncing' | 'cloud' | 'hybrid';
}