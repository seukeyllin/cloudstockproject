// src/types/rom.ts
export interface Rom {
  id: string;
  title: string;
  platform: string;
  filePath: string;
  coverPath: string;
  size: number;
  lastModified: Date;
  year?: number;
  collection?: string;
  description?: string;
  
  // 🔥 O status mapeado corretamente no lugar certo!
  status: 'local' | 'syncing' | 'cloud'; 
}