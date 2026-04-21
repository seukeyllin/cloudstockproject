<script lang="ts">
  import { onMount } from 'svelte';
  import { romsStore, scanRoms } from './stores/roms';
  import type { Rom } from './types/rom';
  import { loadSettings, romsRootPath,savePath } from './stores/settings';

  let currentPlatform = 'all';
  let isDark = true;

  // Reage ao store (reatividade automática do Svelte)
  $: roms = $romsStore;
  $: filteredRoms = currentPlatform === 'all'
    ? roms
    : roms.filter(r => r.platform.toLowerCase() === currentPlatform.toLowerCase());

  function toggleTheme() {
    isDark = !isDark;
  }

    //IMPLEMENTAÇÃO NOVA
onMount(async () => {
    await loadSettings();
    // Usamos o '$' para ler o valor atual que está guardado no computador
    const savedPath = $romsRootPath; 
    
    if (savedPath) {
      console.log("🔄 Carregando pasta salva:", savedPath);
      // Se já existe um caminho salvo, ele escaneia sozinho ao abrir o app
      await scanRoms(savedPath);
    }
  });


async function handleScan() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Selecione a pasta raiz das suas ROMs"
    });

      // Se o usuário fechar o seletor sem escolher nada, a gente para aqui
    if (!selected || Array.isArray(selected)) return;

      // Salva a pasta escolhida permanentemente na store 'settings'
      romsRootPath.set(selected);
    console.log("📁 Pasta selecionada:", selected);

      // Salva permanentemente usando a função correta
      await savePath(selected);
      
      await scanRoms(selected);
    } catch (error) {
      console.error("❌ Erro ao abrir seletor:", error);
      alert("Não foi possível abrir o seletor de pasta.");
    }
  }
</script>

<div class="app" class:light={!isDark}>
  <header class="header">
    <div class="left">
      <button class="theme-btn" on:click={toggleTheme}>
        {isDark ? '☀️' : '🌙'}
      </button>
      <div class="logo">
        <h1>☁️ CloudStock</h1>
      </div>
    </div>

    <div class="actions">
      <button class="btn-scan" on:click={handleScan}>🔍 Escanear ROMs</button>
      <button class="btn-backup">💾 Backup na Nuvem</button>
      <button class="btn-add">+ Adicionar ROM</button>
    </div>
  </header>

  <div class="main-content">
    <aside class="sidebar">
      <nav>
        <button class="platform" class:active={currentPlatform === 'all'} 
           on:click={() => currentPlatform = 'all'}>
          📚 Todos os jogos
        </button>
        <button class="platform" class:active={currentPlatform === 'nes'} 
           on:click={() => currentPlatform = 'nes'}>
          NES
        </button>
        <button class="platform" class:active={currentPlatform === 'n64'} 
           on:click={() => currentPlatform = 'n64'}>
          N64
        </button>
        <button class="platform" class:active={currentPlatform === 'ps1'} 
           on:click={() => currentPlatform = 'ps1'}>
          PlayStation 1
        </button>
        <button class="platform" class:active={currentPlatform === 'ps2'} 
           on:click={() => currentPlatform = 'ps2'}>
          PlayStation 2
        </button>
      </nav>
    </aside>

    <main class="content">
      <h2 class="page-title">
        {#if currentPlatform === 'all'}
          Todos os ROMs ({filteredRoms.length})
        {:else}
          {currentPlatform.toUpperCase()} ({filteredRoms.length})
        {/if}
      </h2>

      <div class="rom-grid">
        {#each filteredRoms as rom}
<div class="rom-card">
  <div class="cover">
    {#if rom.coverPath}
      <img src={rom.coverPath} alt={rom.title} />
    {:else}
      <span style="font-size: 3rem;">🕹️</span>
    {/if}
  </div>
  <p class="title">{rom.title}</p>
  <p class="platform-tag">{rom.platform}</p>
</div>
        {/each}
      </div>
    </main>
  </div>
</div>

<style>
  /* Layout Base */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #1a1a1a;
    color: #fff;
    font-family: sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
    height: 60px;
    background: #252525;
    border-bottom: 1px solid #333;
  }

  .left { display: flex; align-items: center; gap: 15px; }
  .logo h1 { font-size: 1.2rem; margin: 0; }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 220px;
    background: #202020;
    padding: 20px 10px;
    border-right: 1px solid #333;
  }

  .platform {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: #aaa;
    text-align: left;
    padding: 10px;
    margin-bottom: 5px;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .platform:hover { background: #333; color: #fff; }
  .platform.active { background: #3b82f6; color: white; }

  /* Grid de ROMs */
  .content {
    flex: 1;
    padding: 30px;
    overflow-y: auto;
  }

  .rom-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 20px;
  }

  .rom-card {
    background: #2a2a2a;
    padding: 20px;
    border-radius: 12px;
    text-align: center;
    transition: transform 0.2s;
    border: 1px solid #333;
  }

  .rom-card:hover { transform: translateY(-5px); border-color: #444; }
  .cover { font-size: 3rem; margin-bottom: 10px; }
  .title { font-weight: bold; margin: 5px 0; }
  .platform-tag { font-size: 0.8rem; color: #888; }

  /* Botões de Ação */
  

  .actions { display: flex; gap: 10px; }
  .btn-scan { background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; }
  .btn-scan:hover { background: #059669;}
  .btn-add { background: #3b82f6; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; }
  .btn-backup { background: #444; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; }

  /* Tema Claro */
  .light { background: #f8f9fa; color: #111; }
  .light .header { background: #fff; border-bottom: 1px solid #ddd; }
  .light .sidebar { background: #f1f1f1; border-right: 1px solid #ddd; }
  .light .rom-card { background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-color: #eee; }
  .light .platform { color: #555; }
  .light .platform:hover { background: #e0e0e0; }

  .theme-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
  }
</style>