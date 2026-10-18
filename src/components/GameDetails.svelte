<!-- src/components/GameDetails.svelte -->
<!-- Tela de Detalhes do Jogo — duas colunas no estilo eShop, adaptada ao glassmorphism VisionOS -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fade, fly } from 'svelte/transition';
  import type { Rom } from '../types/rom';
  import { getCoverUrl, downloadRomToDisk } from '../stores/roms';
  import { getDownloadDir, setDownloadDir } from '../stores/settings';
  import iconFavoritosWhite from '../assets/icons/icon_favoritos_white.png';
  import iconFavoritosBlack from '../assets/icons/icon_favoritos_black.png';

  export let rom: Rom;
  export let isDark = true;
  export let isFavorite = false;
  // Foco do gamepad controlado pelo App (arquitetura de cadeia de prioridade única)
  export let focusedAction: 'main' | 'favorite' = 'main';

  export let onClose: () => void;
  export let onToggleFavorite: (id: string) => void;

  // ===== Estado interno =====
  let downloadState: 'idle' | 'downloading' | 'done' | 'error' = 'idle';
  let statusText = '';

  $: sizeLabel = rom.size > 0 ? formatSize(rom.size) : '—';

  function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  // ===== Download da ROM do MEGA =====
  async function handleMainAction() {
    if (downloadState === 'downloading') return;

    // ROM local/híbrida: abrir/executar com o programa padrão
    if (rom.status === 'local' || rom.status === 'hybrid') {
      try {
        await invoke('open_path', { path: rom.filePath });
      } catch (err) {
        console.error('❌ Erro ao executar ROM local:', err);
      }
      return;
    }

    // ROM na nuvem: baixar para a pasta de destino da plataforma
    downloadState = 'downloading';
    statusText = 'Baixando...';
    try {
      if (!rom.handle) throw new Error('Handle do MEGA indisponível');

      const platform = rom.platform.toLowerCase();

      // 1. Pasta de destino salva para esta plataforma (ou 'default')
      let destDir = await getDownloadDir(platform);

      // 2. Sem pasta salva → seletor nativo para escolher ONDE salvar
      if (!destDir) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const picked = await open({
          directory: true,
          multiple: false,
          title: `Onde salvar as ROMs de ${rom.platform.toUpperCase()}?`
        });
        if (!picked || Array.isArray(picked)) {
          downloadState = 'idle';
          statusText = '';
          return;
        }
        destDir = picked;
        // Persistir para os próximos downloads da plataforma
        await setDownloadDir(platform, destDir);
      }

      // 3. Download + update reativo (cloud → local)
      await downloadRomToDisk(rom, destDir);

      downloadState = 'done';
      statusText = '';
    } catch (err) {
      console.error('❌ Erro ao baixar ROM do MEGA:', err);
      downloadState = 'error';
      statusText = '';
    }
  }

  function handleFavorite() {
    onToggleFavorite(rom.id);
  }

  // Expõe a ação principal para o App (botão A do gamepad)
  export function triggerMainAction() {
    handleMainAction();
  }

  // Indica se há download em andamento (bloqueia fechar com B)
  export function isDownloading(): boolean {
    return downloadState === 'downloading';
  }
</script>

{#if rom}
  <div
    class="details-overlay"
    transition:fade={{ duration: 180 }}
    role="button"
    tabindex="0"
    on:click={onClose}
    on:keydown={(e) => e.key === 'Escape' && onClose()}
  >
    <div
      class="details-panel"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      transition:fly={{ y: 26, duration: 260, opacity: 0.4 }}
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <!-- ===== Coluna esquerda: identidade + capa ===== -->
      <div class="left-col">
        <div class="title-block">
          <h1 class="game-title">{rom.title}</h1>
        </div>

        <div class="hero-cover">
          {#if rom.coverPath}
            <img src={getCoverUrl(rom.coverPath)} alt={rom.title} />
          {:else}
            <div class="cover-fallback">
              {#key isDark}<img src={isDark ? iconFavoritosWhite : iconFavoritosBlack} alt="" />{/key}
            </div>
          {/if}
        </div>
      </div>

      <!-- ===== Coluna direita: ações no topo, informações abaixo ===== -->
      <div class="right-col">
        <!-- Ações principais (topo, destaque) -->
        <button
          class="main-action"
          class:gamepad-focused={focusedAction === 'main'}
          class:downloading={downloadState === 'downloading'}
          on:click={handleMainAction}
          disabled={downloadState === 'downloading'}
        >
          {#if downloadState === 'downloading'}
            Baixando...
          {:else if rom.status === 'local' || rom.status === 'hybrid'}
            Jogar / Executar
          {:else}
            Baixar ROM
          {/if}
        </button>
        {#if downloadState === 'done'}
          <p class="download-ok">Download concluído</p>
        {:else if downloadState === 'error'}
          <p class="download-err">Falha no download. Tente novamente.</p>
        {/if}

        <!-- Ação secundária: favoritar -->
        <button
          class="favorite-action"
          class:gamepad-focused={focusedAction === 'favorite'}
          class:fav-active={isFavorite}
          on:click={handleFavorite}
        >
          {#key isDark}
            <img
              class="fav-icon"
              src={isDark ? iconFavoritosWhite : iconFavoritosBlack}
              alt={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            />
          {/key}
          {isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
        </button>

        <!-- Badge de status de nuvem -->
        <div class="cloud-badge" class:local={rom.status === 'local' || rom.status === 'hybrid'}>
          <span class="cloud-dot"></span>
          <span class="cloud-text">
            {rom.status === 'hybrid' ? 'Local + Nuvem (MEGA)' : rom.status === 'local' ? 'Disponível Localmente' : 'Armazenado no MEGA / Nuvem'}
          </span>
        </div>

        <!-- Metadados: Tamanho / Ano / Plataforma -->
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Tamanho</span>
            <span class="meta-value">{sizeLabel}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Ano</span>
            <span class="meta-value">{rom.year ?? '—'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Plataforma</span>
            <span class="meta-value">{rom.platform.toUpperCase()}</span>
          </div>
        </div>

        <!-- Descrição -->
        <div class="description-box">
          <span class="description-label">Descrição</span>
          <p class="description-text">{rom.description || 'Sem descrição disponível para este jogo.'}</p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .details-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  /* Painel de duas colunas — vidro maior estilo eShop */
  .details-panel {
    width: 92%;
    max-width: 980px;
    max-height: 86vh;
    display: flex;
    gap: 28px;
    padding: 32px;
    box-sizing: border-box;
    border-radius: 28px;
    background: rgba(30, 30, 30, 0.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    color: #fff;
    overflow: hidden;
  }

  /* ===== Coluna esquerda ===== */
  .left-col {
    flex: 1.1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .title-block { display: flex; flex-direction: column; gap: 4px; }

  .game-title {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1.15;
    word-break: break-word;
    color: #fff;
  }

  /* Capa em destaque — vidro com sombra/brilho suave */
  .hero-cover {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    overflow: hidden;
    padding: 14px;
  }
  .hero-cover img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.5);
  }
  .cover-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cover-fallback img {
    width: 84px;
    height: 84px;
    object-fit: contain;
    opacity: 0.4;
  }

  /* ===== Coluna direita ===== */
  .right-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Badge de status de nuvem (pill) */
  .cloud-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    align-self: flex-start;
    padding: 9px 16px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.16);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: #93c5fd;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .cloud-badge.local {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
  }
  /* Dot indicador em vez de emoji */
  .cloud-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #93c5fd;
    box-shadow: 0 0 6px rgba(147, 197, 253, 0.8);
    flex-shrink: 0;
  }
  .cloud-badge.local .cloud-dot {
    background: #6ee7b7;
    box-shadow: 0 0 6px rgba(110, 231, 183, 0.8);
  }

  /* Metadados: linha de três colunas */
  .meta-row {
    display: flex;
    gap: 10px;
  }
  .meta-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 0;
  }
  .meta-label {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
  }
  .meta-value {
    font-size: 0.86rem;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Área de descrição — vidro interno com scroll */
  .description-box {
    flex: 1;
    min-height: 90px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow-y: auto;
  }
  .description-label {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: rgba(255, 255, 255, 0.45);
  }
  .description-text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.85);
    white-space: pre-wrap;
  }

  /* Botão principal (pílula glassmorphism com acento eShop) */
  .main-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 54px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: linear-gradient(135deg, rgba(229, 9, 20, 0.92), rgba(190, 8, 18, 0.92));
    color: #fff;
    font-size: 0.98rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(229, 9, 20, 0.35);
    transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
  }
  .main-action:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
  .main-action:disabled { opacity: 0.75; cursor: wait; }

  /* Foco de gamepad: mesmo anel dos menus */
  .main-action.gamepad-focused,
  .favorite-action.gamepad-focused {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.75), 0 6px 20px rgba(0, 0, 0, 0.35);
  }

  .download-ok { margin: 0; font-size: 0.8rem; color: #6ee7b7; text-align: center; }
  .download-err { margin: 0; font-size: 0.8rem; color: #ff6b6b; text-align: center; }

  /* Ação secundária de favoritar */
  .favorite-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    height: 46px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }
  .favorite-action:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
  .favorite-action.fav-active { color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); }
  .fav-icon { width: 18px; height: 18px; object-fit: contain; }

  /* ===== Tema claro ===== */
  :global(.light) .details-panel {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.08);
    color: #222;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }
  :global(.light) .game-title { color: #1a1a1a; }
  :global(.light) .hero-cover {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.08);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
  }
  :global(.light) .hero-cover img { box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22); }
  :global(.light) .cloud-badge {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    color: #1d4ed8;
  }
  :global(.light) .cloud-dot { background: #1d4ed8; box-shadow: none; }
  :global(.light) .cloud-badge.local {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
    color: #059669;
  }
  :global(.light) .cloud-badge.local .cloud-dot { background: #059669; }
  :global(.light) .meta-item,
  :global(.light) .description-box {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.06);
  }
  :global(.light) .meta-label,
  :global(.light) .description-label { color: rgba(0, 0, 0, 0.45); }
  :global(.light) .meta-value { color: #111; }
  :global(.light) .description-text { color: rgba(0, 0, 0, 0.75); }
  :global(.light) .main-action {
    border-color: rgba(0, 0, 0, 0.12);
    box-shadow: 0 6px 18px rgba(229, 9, 20, 0.25);
  }
  :global(.light) .main-action.gamepad-focused,
  :global(.light) .favorite-action.gamepad-focused {
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.8), 0 6px 18px rgba(0, 0, 0, 0.2);
  }
  :global(.light) .favorite-action {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.75);
  }
  :global(.light) .favorite-action:hover { background: rgba(0, 0, 0, 0.1); color: #111; }
  :global(.light) .favorite-action.fav-active { color: #b45309; border-color: rgba(180, 83, 9, 0.4); }
  :global(.light) .download-ok { color: #059669; }
  :global(.light) .download-err { color: #cc0000; }
</style>
