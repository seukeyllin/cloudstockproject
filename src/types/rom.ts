// src/types/rom.ts
export interface Rom {
  id: string;                    // nome do arquivo original (ex: "super-mario-bros.nes")
  title: string;
  platform: string;
  filePath: string;              // caminho completo no disco
  coverPath?: string;            // ex: "downloaded_media/nes/covers/super-mario-bros.jpg"
  size: number;
  lastModified: Date;

  // Metadados que podem vir do cloudstore.metadata.txt
  year?: number;
  collection?: string;
  description?: string;
}