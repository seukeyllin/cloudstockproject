<!-- src/components/MegaFolderPicker.svelte -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { megaFolders, megaRootFolder, loadMegaFolders, saveMegaRootFolder, loadMegaRootFolder } from '../stores/mega';
  import { onGamepadAction } from '../stores/gamepad';
  import { get } from 'svelte/store';

  export let isOpen = false;
  export let onClose: () => void;
  export let onSelect: () => void;

  let currentPath = '';
  let selectedFolder = '';
  let loading = false;
  let error = '';

  // Navegação por controle
  let folderIndex = 0;
  let listEl: HTMLDivElement | undefined = undefined;

  $: folders = $megaFolders;
  $: rootPath = $megaRootFolder;

  // Mantém o índice válido quando a lista muda
  $: if (folderIndex >= folders.length) folderIndex = Math.max(0, folders.length - 1);

  // Carregar pastas quando o picker abre (reactive a isOpen)
  $: if (isOpen) {
    console.log('🔄 MegaFolderPicker reactive load - isOpen:', isOpen, 'rootPath:', rootPath);
    if (rootPath) {
      currentPath = rootPath;
      console.log('📂 Carregando pasta salva:', rootPath);
      loadMegaFolders(rootPath);
    } else {
      currentPath = '/';
      console.log('📂 Carregando raiz "/"');
      loadMegaFolders('/');
    }
    folderIndex = 0;
  }

  async function handleFolderClick(folder: { name: string; path: string; handle: any }) {
    loading = true;
    error = '';
    currentPath = folder.path;
    selectedFolder = folder.path;
    await loadMegaFolders(folder.path);
    folderIndex = 0;
    loading = false;
  }

  async function goUp() {
    if (currentPath === rootPath) return;

    loading = true;
    error = '';
    const parts = currentPath.split('/').filter(p => p);
    parts.pop(); // Remove último segmento
    const parentPath = '/' + parts.join('/');
    currentPath = parentPath;
    selectedFolder = parentPath;
    await loadMegaFolders(parentPath);
    folderIndex = 0;
    loading = false;
  }

  async function confirmSelection() {
    if (!selectedFolder) {
      error = 'Selecione uma pasta primeiro';
      return;
    }

    try {
      await saveMegaRootFolder(selectedFolder);
      // Carregar ROMs do Mega após selecionar pasta
      const { loadRomsFromMega } = await import('../stores/roms');
      await loadRomsFromMega();

      if (onSelect) onSelect();
      if (onClose) onClose();
    } catch (err) {
      console.error('❌ Erro ao salvar pasta:', err);
      error = 'Erro ao salvar pasta selecionada';
    }
  }

  function close() {
    if (onClose) onClose();
  }

  // ===== Navegação por controle =====
  function moveFolderFocus(dy: number) {
    if (loading || folders.length === 0) return;
    const len = folders.length;
    folderIndex = (folderIndex + dy + len) % len;
    tick().then(() => {
      listEl?.querySelector(`[data-folder-index="${folderIndex}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function confirmFolderFocus() {
    if (loading) return;
    const folder = folders[folderIndex];
    if (folder) handleFolderClick(folder);
  }

  onMount(() => {
    onGamepadAction('up', () => { if (isOpen) moveFolderFocus(-1); });
    onGamepadAction('down', () => { if (isOpen) moveFolderFocus(1); });
    onGamepadAction('confirm', () => { if (isOpen && !error) confirmFolderFocus(); });
    onGamepadAction('back', () => { if (isOpen) goUp(); });
  });

  function getDisplayName(path: string): string {
    const parts = path.split('/').filter(p => p);
    return parts[parts.length - 1] || '/';
  }
</script>

{#if isOpen}
  <div class="modal-overlay" transition:fade={{ duration: 180 }} role="button" tabindex="0" on:click={close} on:keydown={(e) => e.key === 'Escape' && close()}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      transition:fade={{ duration: 180 }}
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="modal-header">
        <h2>Selecionar Pasta do Mega</h2>
        <button class="close-btn" on:click={close} title="Fechar">✕</button>
      </div>

      <div class="path-bar">
        <button class="path-btn" on:click={goUp} disabled={currentPath === rootPath || loading}>
          ↑ Voltar
        </button>
        <span class="current-path">{currentPath || 'Carregando...'}</span>
      </div>

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}

      <div class="folder-list" bind:this={listEl}>
        {#if loading}
          <div class="loading">Carregando pastas...</div>
        {:else if folders.length === 0}
          <div class="empty">Nenhuma subpasta encontrada</div>
        {:else}
          {#each folders as folder, i (folder.path)}
            <button
              class="folder-item"
              class:selected={selectedFolder === folder.path}
              class:menu-focused={folderIndex === i}
              data-folder-index={i}
              on:click={() => handleFolderClick(folder)}
              on:mouseenter={() => folderIndex = i}
              disabled={loading}
            >
              <span class="folder-icon">📁</span>
              <span class="folder-name">{folder.name}</span>
              {#if selectedFolder === folder.path}
                <span class="folder-check">✓</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" on:click={close}>Cancelar</button>
        <button class="btn-confirm" on:click={confirmSelection} disabled={!selectedFolder || loading}>
          {loading ? 'Salvando...' : 'Usar esta pasta'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
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

  .modal {
    width: 92%;
    max-width: 560px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 28px;
    background: rgba(30, 30, 30, 0.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    color: #fff;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 22px 22px 14px;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    padding-left: 6px;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #aaa;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, color 0.2s ease;
  }
  .close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.14); }

  .path-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 22px 16px;
  }

  .path-btn {
    background: rgba(59, 130, 246, 0.85);
    color: white;
    border: none;
    padding: 9px 16px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    flex-shrink: 0;
    transition: filter 0.2s ease, opacity 0.2s ease;
  }
  .path-btn:hover:not(:disabled) { filter: brightness(1.12); }
  .path-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .current-path {
    flex: 1;
    font-family: monospace;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-msg {
    margin: 0 22px 10px;
    padding: 10px 16px;
    color: #ff6b6b;
    font-size: 0.88rem;
    background: rgba(255, 0, 0, 0.08);
    border: 1px solid rgba(255, 0, 0, 0.2);
    border-radius: 14px;
  }

  .folder-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 14px;
    min-height: 180px;
  }

  .folder-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    background: none;
    border: 1px solid transparent;
    border-radius: 14px;
    color: #eee;
    text-align: left;
    cursor: pointer;
    font-size: 0.92rem;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .folder-item:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
  .folder-item.selected { color: #fff; font-weight: 600; }
  .folder-item:disabled { opacity: 0.5; cursor: not-allowed; }

  .folder-icon { font-size: 1.15rem; }
  .folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder-check { color: #34d399; font-size: 0.9rem; flex-shrink: 0; }

  /* Foco de gamepad: mesmo anel dos menus do App */
  .folder-item.menu-focused {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35), 0 3px 10px rgba(0, 0, 0, 0.3);
  }

  .loading, .empty {
    padding: 48px 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.4);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 22px 22px;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: none;
    padding: 11px 20px;
    border-radius: 14px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s ease;
  }
  .btn-cancel:hover { background: rgba(255, 255, 255, 0.16); }

  .btn-confirm {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    border: none;
    padding: 11px 20px;
    border-radius: 14px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: bold;
    transition: filter 0.2s ease;
  }
  .btn-confirm:hover:not(:disabled) { filter: brightness(1.12); }
  .btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Tema claro: o componente herda a classe .light do App via :global */
  :global(.light) .modal {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.08);
    color: #222;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }
  :global(.light) .close-btn {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: #666;
  }
  :global(.light) .close-btn:hover { color: #111; background: rgba(0, 0, 0, 0.1); }
  :global(.light) .current-path { color: rgba(0, 0, 0, 0.5); }
  :global(.light) .folder-item { color: #222; }
  :global(.light) .folder-item:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
  :global(.light) .folder-item.menu-focused {
    background: rgba(0, 0, 0, 0.06);
    border-color: rgba(0, 0, 0, 0.85);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.7), 0 3px 8px rgba(0, 0, 0, 0.18);
  }
  :global(.light) .folder-check { color: #059669; }
  :global(.light) .loading,
  :global(.light) .empty { color: rgba(0, 0, 0, 0.4); }
  :global(.light) .btn-cancel { background: rgba(0, 0, 0, 0.07); color: #333; }
  :global(.light) .btn-cancel:hover { background: rgba(0, 0, 0, 0.12); }
  :global(.light) .error-msg { color: #cc0000; background: rgba(204, 0, 0, 0.07); border-color: rgba(204, 0, 0, 0.2); }
</style>
