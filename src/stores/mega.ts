// src/stores/mega.ts
import { writable } from 'svelte/store';
import { Storage } from 'megajs';

export const megaStorage = writable<Storage | null>(null);
export const isMegaLoggedIn = writable(false);

export async function loginMega(email: string, password: string) {
  try {
    // Apenas instanciar com email e senha já inicia o login
    const storage = new Storage({
      email,
      password
    });

    // Aguardamos a promessa "ready" da biblioteca para confirmar que o login terminou
    await storage.ready;

    megaStorage.set(storage);
    isMegaLoggedIn.set(true);

    console.log('✅ Logado no Mega com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro no login Mega:', error);
    throw error;
  }
}

export function logoutMega() {
  megaStorage.set(null);
  isMegaLoggedIn.set(false);
}