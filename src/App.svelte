<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { romsStore, scanRoms, syncRomsWithMega, loadRomsFromMega, getCoverUrl } from './stores/roms';
  import type { Rom } from './types/rom';
  import { loadSettings, romsRootPath, savePath, favorites, toggleFavorite, loadFavorites } from './stores/settings';
  import { megaStorage, isMegaLoggedIn, loginMega, logoutMega, megaRootFolder } from './stores/mega';
  import { startGamepadListener, onGamepadAction, gamepadConnected } from './stores/gamepad';
  import MegaFolderPicker from './components/MegaFolderPicker.svelte';
  import logoBlack from './assets/logos/logo_cloudstock_black.png';
  import logoWhite from './assets/logos/logo_cloudstock_white.png';
  import iconConfigBlack from './assets/icons/icon_configuracoes_black.png';
  import iconConfigWhite from './assets/icons/icon_configuracoes_white.png';
  import iconFiltroBlack from './assets/icons/icon_filtro_black.png';
  import iconFiltroWhite from './assets/icons/icon_filtro_white.png';
  import iconTemaBlack from './assets/icons/icon_claro-escuro_black.png';
  import iconTemaWhite from './assets/icons/icon_claro-escuro_white.png';
  import iconPesquisaBlack from './assets/icons/icon_pesquisa_black.png';
  import iconPesquisaWhite from './assets/icons/icon_pesquisa_white.png';
  import iconInicioBlack from './assets/icons/icon_inicio_black.png';
  import iconInicioWhite from './assets/icons/icon_inicio_white.png';
  import iconFavoritosBlack from './assets/icons/icon_favoritos_black.png';
  import iconFavoritosWhite from './assets/icons/icon_favoritos_white.png';
  import iconGamepadBlack from './assets/icons/icon_gamepad-conectado_black.png';
  import iconGamepadWhite from './assets/icons/icon_gamepad-conectado_white.png';

  let currentPlatform = 'all';
  // Aba central ativa: 'home' (biblioteca completa) ou 'favorites'
  let activeTab: 'home' | 'favorites' = 'home';
  let isDark = true;
  let showFilterMenu = false;
  let showSettings = false;
  let selectedRomId: string | null = null;
  let searchQuery = '';
  let showSearch = false;
  let searchInput: HTMLInputElement | undefined = undefined;

  function focusSearchInput() {
    tick().then(() => searchInput?.focus());
  }

  // Navegação por controle: índice do card focado (-1 = nenhum)
  let focusedIndex = -1;

  // Navegação por controle nos botões da interface (modo ativado pelo botão B)
  type UiFocus = 'filter' | 'theme' | 'search' | 'settings';
  // Ordem VISUAL na tela: Filtro (esquerda) → Pesquisa → Tema → Config (direita)
  const UI_ORDER: UiFocus[] = ['filter', 'search', 'theme', 'settings'];
  let uiFocus: UiFocus | null = null;

  // Navegação por controle dentro dos menus (filtro e configurações)
  let filterMenuIndex = 0;     // índice na lista ['all', ...platforms]
  let settingsItemIndex = 0;   // índice do item focado no modal de configurações

  // Lista plana de todos os itens do menu de filtro (id + rótulo)
  $: filterEntries = [
    { id: 'all', label: 'Todas as plataformas' },
    ...platforms.map(p => ({ id: p.toLowerCase(), label: p }))
  ];

  // Itens acionáveis do modal de configurações (os desabilitados são pulados)
  $: settingsItems = [
    { id: 'scan', disabled: false, action: handleScan },
    { id: 'backup', disabled: true, action: null },
    { id: 'add', disabled: true, action: null },
    { id: $isMegaLoggedIn ? 'megaFolder' : 'megaConnect', disabled: false, action: $isMegaLoggedIn ? openMegaFolderPicker : handleConnectMega },
    { id: 'drive', disabled: true, action: null }
  ];

  function selectRom(id: string) {
    selectedRomId = selectedRomId === id ? null : id;
  }

  let showMegaModal = false;
  let showMegaFolderPicker = false;
  let megaEmail = '';
  let megaPassword = '';
  let loginError = '';

  // Reage ao store (reatividade automática do Svelte)
  $: roms = $romsStore;
  $: favSet = $favorites;
  $: filteredRoms = (() => {
    let list = currentPlatform === 'all'
      ? [...roms].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
      : roms.filter(r => r.platform.toLowerCase() === currentPlatform.toLowerCase());
    // Aba Favoritos: apenas jogos marcados como favoritos
    if (activeTab === 'favorites') {
      list = list.filter(r => favSet.has(r.id));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(r => r.title.toLowerCase().includes(q));
    return list;
  })();
  $: megaRoot = $megaRootFolder;

  // Dica de favoritar no HUD: "Favoritar" ou "Desfavoritar" conforme o card focado.
  // Some quando o foco está em qualquer botão da UI (não faz sentido lá).
  $: focusedRom = focusedIndex >= 0 && focusedIndex < filteredRoms.length ? filteredRoms[focusedIndex] : null;
  $: favHintLabel = focusedRom && favSet.has(focusedRom.id) ? 'Desfavoritar' : 'Favoritar';
  $: showFavHint = !uiFocus;

  // Lista única de plataformas presentes nas ROMs carregadas (ordenada alfabeticamente)
  $: platforms = Array.from(new Set(roms.map(r => r.platform))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  // ===== Navegação por controle (Gamepad API) =====
  const GRID_COLUMNS = 4;

  // Navegação dentro do menu de filtro (D-Pad cima/baixo)
  function moveFilterMenuFocus(dy: number) {
    const len = filterEntries.length;
    filterMenuIndex = (filterMenuIndex + dy + len) % len;
  }

  // Navegação dentro do modal de configurações (D-Pad cima/baixo, pulando desabilitados)
  function moveSettingsFocus(dy: number) {
    const len = settingsItems.length;
    let idx = settingsItemIndex;
    for (let i = 0; i < len; i++) {
      idx = (idx + dy + len) % len;
      if (!settingsItems[idx].disabled) break;
    }
    settingsItemIndex = idx;
  }

  function confirmFilterMenuFocus() {
    const entry = filterEntries[filterMenuIndex];
    if (entry) selectPlatform(entry.id);
  }

  function confirmSettingsFocus() {
    const item = settingsItems[settingsItemIndex];
    if (!item || item.disabled) return;
    if (item.action) item.action();
  }

  function moveFocus(dx: number, dy: number) {
    if (showFilterMenu || showSettings || showMegaModal || showMegaFolderPicker) return;

    // Modo de navegação nos botões da UI: esquerda/direita trocam de botão
    if (uiFocus) {
      if (dx !== 0) moveUiFocus(dx);
      return;
    }

    if (filteredRoms.length === 0) return;

    let col = focusedIndex >= 0 ? focusedIndex % GRID_COLUMNS : 0;
    let row = focusedIndex >= 0 ? Math.floor(focusedIndex / GRID_COLUMNS) : 0;

    col += dx;
    row += dy;
    if (col < 0) col = 0;
    if (col >= GRID_COLUMNS) col = GRID_COLUMNS - 1;
    if (row < 0) row = 0;

    const maxIndex = filteredRoms.length - 1;
    let newIndex = row * GRID_COLUMNS + col;
    if (newIndex > maxIndex) newIndex = maxIndex;

    focusedIndex = newIndex;
    scrollToFocused();
  }

  function scrollToFocused() {
    const el = document.querySelector(`[data-rom-index="${focusedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Troca a aba central (Início / Favoritos) via clique
  function selectTab(tab: 'home' | 'favorites') {
    activeTab = tab;
    focusedIndex = -1;
  }

  // Alternância de abas via L1/R1 do controle
  function switchTab() {
    if (showSettings || showMegaModal || showMegaFolderPicker || showFilterMenu) return;
    activeTab = activeTab === 'home' ? 'favorites' : 'home';
    focusedIndex = -1;
  }

  function confirmFocused() {
    // Prioridade: confirma o item focado nos menus/modais abertos
    if (showFilterMenu) { confirmFilterMenuFocus(); return; }
    if (showSettings) { confirmSettingsFocus(); return; }
    if (showMegaModal) { showMegaModal = false; return; }
    // Foco está em um botão da UI: confirma o botão
    if (uiFocus) { confirmUiFocus(); return; }
    if (focusedIndex >= 0 && focusedIndex < filteredRoms.length) {
      const rom = filteredRoms[focusedIndex];
      selectRom(rom.id);
    }
  }

  function goBack() {
    if (showMegaFolderPicker) { showMegaFolderPicker = false; return; }
    if (showMegaModal) { showMegaModal = false; return; }
    if (showSettings) { showSettings = false; return; }
    if (showFilterMenu) { showFilterMenu = false; return; }
    if (showSearch) { showSearch = false; searchQuery = ''; return; }
    // Modo de navegação nos botões da UI: B alterna (sai dele)
    if (uiFocus) { uiFocus = null; return; }
    // B entra no modo de navegação dos botões da UI (começa no filtro)
    uiFocus = 'filter';
    focusedIndex = -1;
  }

  // Navegação entre os botões da UI (Filtrar/Tema/Pesquisa/Config) via D-Pad
  function moveUiFocus(dx: number) {
    if (showSettings || showMegaModal || showMegaFolderPicker || showFilterMenu) return;
    const idx = uiFocus ? UI_ORDER.indexOf(uiFocus) : -1;
    if (idx === -1) {
      uiFocus = dx >= 0 ? UI_ORDER[0] : UI_ORDER[UI_ORDER.length - 1];
      focusedIndex = -1;
      return;
    }
    const next = (idx + dx + UI_ORDER.length) % UI_ORDER.length;
    uiFocus = UI_ORDER[next];
    focusedIndex = -1;
  }

  // Confirma o botão da UI que está em foco
  function confirmUiFocus() {
    if (!uiFocus) return;
    const target = uiFocus;
    uiFocus = null;
    if (target === 'filter') {
      showFilterMenu = !showFilterMenu;
      if (showFilterMenu) {
        filterMenuIndex = Math.max(0, filterEntries.findIndex(e => e.id === currentPlatform));
      }
    } else if (target === 'theme') {
      toggleTheme();
    } else if (target === 'search') {
      showSearch = !showSearch;
      if (showSearch) focusSearchInput();
    } else if (target === 'settings') {
      showSettings = true;
    }
  }

  function openSettingsFromGamepad() {
    if (showSettings || showMegaModal || showMegaFolderPicker) return;
    showFilterMenu = false;
    settingsItemIndex = 0;
    showSettings = true;
  }

  // Favoritar/desfavoritar o card focado (botão Y do controle)
  function toggleFavoriteFromGamepad() {
    if (showSettings || showMegaModal || showMegaFolderPicker || showFilterMenu) return;
    if (uiFocus) return;
    if (focusedIndex < 0 || focusedIndex >= filteredRoms.length) return;
    const rom = filteredRoms[focusedIndex];
    toggleFavorite(rom.id);
  }

  function toggleFilterMenuFromGamepad() {
    if (showSettings || showMegaModal || showMegaFolderPicker) return;
    showFilterMenu = !showFilterMenu;
    if (showFilterMenu) {
      filterMenuIndex = Math.max(0, filterEntries.findIndex(e => e.id === currentPlatform));
    }
  }

  function toggleTheme() {
    isDark = !isDark;
  }

  function selectPlatform(platform: string) {
    currentPlatform = platform === 'all' ? 'all' : platform.toLowerCase();
    showFilterMenu = false;
    focusedIndex = -1;
  }

  onMount(async () => {
    // Registra ações do controle
    onGamepadAction('up', () => {
      if (showFilterMenu) { moveFilterMenuFocus(-1); return; }
      if (showSettings) { moveSettingsFocus(-1); return; }
      if (uiFocus) { uiFocus = null; } else moveFocus(0, -1);
    });
    onGamepadAction('down', () => {
      if (showFilterMenu) { moveFilterMenuFocus(1); return; }
      if (showSettings) { moveSettingsFocus(1); return; }
      if (uiFocus) { uiFocus = null; } else moveFocus(0, 1);
    });
    onGamepadAction('left', () => moveFocus(-1, 0));
    onGamepadAction('right', () => moveFocus(1, 0));
    onGamepadAction('confirm', confirmFocused);
    onGamepadAction('back', goBack);
    onGamepadAction('shoulderL', switchTab);
    onGamepadAction('shoulderR', switchTab);
    onGamepadAction('select', openSettingsFromGamepad);
    onGamepadAction('start', openSettingsFromGamepad);
    onGamepadAction('y', toggleFavoriteFromGamepad);
    startGamepadListener();

    await loadSettings();
    await loadFavorites();

    // Usamos o '$' para ler o valor atual que está guardado no computador
    const savedPath = $romsRootPath;

    if (savedPath) {
      console.log("🔄 Carregando pasta local salva:", savedPath);
      // Se já existe um caminho salvo, ele escaneia sozinho ao abrir o app
      await scanRoms(savedPath);
    }

    // Se já tem pasta do Mega salva, carrega ROMs do Mega
    if (megaRoot) {
      console.log("☁️ Pasta do Mega salva encontrada, carregando ROMs...");
      await loadRomsFromMega();
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
  //funções do Modal do Mega
  async function handleConnectMega() {
    showSettings = false;
    openMegaLogin();
}

async function openMegaLogin() {
    showMegaModal = true;
    loginError = '';
}

async function handleMegaLogin() {
  try {
    console.log('🔐 Iniciando login Mega...');
    await loginMega(megaEmail, megaPassword);
    console.log('✅ Login Mega OK, abrindo picker...');
    showMegaModal = false;
    megaEmail = '';
    megaPassword = '';

    // Abrir seletor de pasta do Mega após login
    showMegaFolderPicker = true;
  } catch (err) {
    loginError = 'Email ou senha inválidos. Tente novamente.';
    console.error('❌ Erro login Mega:', err);

  }
}

async function openMegaFolderPicker() {
  showMegaFolderPicker = true;
}

function onMegaFolderSelected() {
  showMegaFolderPicker = false;
}

function onMegaFolderPickerClose() {
  showMegaFolderPicker = false;
}

</script>

<div class="app" class:light={!isDark}>
  <header class="header">
    <div class="left">
      <div class="logo">
        <img src={isDark ? logoWhite : logoBlack} alt="CloudStock" class="logo-img" />
        <span class="logo-name">CloudStock</span>
      </div>
    </div>

    <nav class="center-tabs" data-tab={activeTab}>
      <div class="tab-slider" class:right={activeTab === 'favorites'}></div>
      <button
        class="tab-btn"
        class:active={activeTab === 'home'}
        on:click={() => selectTab('home')}
        title="Início"
      >
        {#key isDark}<img src={isDark ? iconInicioWhite : iconInicioBlack} alt="Início" />{/key}
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'favorites'}
        on:click={() => selectTab('favorites')}
        title="Favoritos"
      >
        {#key isDark}<img src={isDark ? iconFavoritosWhite : iconFavoritosBlack} alt="Favoritos" />{/key}
      </button>
    </nav>

    <div class="actions">
      <button
        class="fab-btn"
        class:ui-focused={uiFocus === 'search'}
        class:active={showSearch}
        on:click={() => { showSearch = !showSearch; if (showSearch) focusSearchInput(); }}
        title="Pesquisar jogos"
      >
        {#key isDark}<img src={isDark ? iconPesquisaWhite : iconPesquisaBlack} alt="Pesquisar jogos" />{/key}
      </button>
      <button
        class="fab-btn"
        class:ui-focused={uiFocus === 'theme'}
        on:click={toggleTheme}
        title="Alternar tema"
      >
        {#key isDark}<img src={isDark ? iconTemaWhite : iconTemaBlack} alt="Alternar tema" />{/key}
      </button>
      <button
        class="fab-btn"
        class:ui-focused={uiFocus === 'settings'}
        on:click={() => showSettings = true}
        title="Configurações"
      >
        {#key isDark}<img src={isDark ? iconConfigWhite : iconConfigBlack} alt="Configurações" />{/key}
      </button>
    </div>
  </header>

  <div class="main-content">
    <main class="content">
      <div class="filter-area">
        <button
          class="filter-fab"
          class:active={currentPlatform !== 'all'}
          class:ui-focused={uiFocus === 'filter'}
          on:click={() => showFilterMenu = !showFilterMenu}
          title="Filtrar por plataforma"
        >
          {#key isDark}<img src={isDark ? iconFiltroWhite : iconFiltroBlack} alt="Filtrar por plataforma" />{/key}
        </button>

        {#if showFilterMenu}
          <div class="filter-popover" transition:fly={{ x: -12, y: -6, duration: 220, opacity: 0.3 }}>
            <div class="filter-popover-title">Filtrar por plataforma</div>
            {#each filterEntries as entry, i}
              <button
                class="filter-item"
                class:active={currentPlatform === entry.id}
                class:menu-focused={filterMenuIndex === i}
                on:click={() => selectPlatform(entry.id)}
                on:mouseenter={() => filterMenuIndex = i}
              >
                <span class="filter-item-label">{entry.label}</span>
                {#if currentPlatform === entry.id}
                  <span class="filter-item-check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if showSearch}
        <div class="search-bar" transition:fly={{ x: -24, duration: 280, opacity: 0.2 }}>
          <input
            type="text"
            bind:this={searchInput}
            placeholder="Pesquisar jogos..."
            bind:value={searchQuery}
            on:keydown={(e) => e.key === 'Escape' && (showSearch = false, searchQuery = '')}
          />
          {#if searchQuery}
            <button class="search-clear" on:click={() => searchQuery = ''} title="Limpar">✕</button>
          {/if}
        </div>
      {/if}

      <h2 class="page-title">
        {#if activeTab === 'favorites'}
          Favoritos{currentPlatform !== 'all' ? ` — ${currentPlatform.toUpperCase()}` : ''} ({filteredRoms.length})
        {:else if currentPlatform === 'all'}
          Todas as ROMs ({filteredRoms.length})
        {:else}
          {currentPlatform.toUpperCase()} ({filteredRoms.length})
        {/if}
      </h2>

      <div class="rom-grid">
        {#each filteredRoms as rom, index (rom.id)}
          <div
            class="rom-card"
            class:selected={selectedRomId === rom.id}
            class:gamepad-focused={focusedIndex === index}
            data-rom-index={index}
            role="button"
            tabindex="0"
            on:click={() => selectRom(rom.id)}
            on:keydown={(e) => e.key === 'Enter' && selectRom(rom.id)}
          >
            <div class="cover">
              {#if rom.coverPath}
                <img src={getCoverUrl(rom.coverPath)} alt={rom.title} on:error={() => {}} />
              {:else}
                <span class="cover-fallback">🕹️</span>
              {/if}
            </div>

            <div class="status-indicator">
              {#if rom.status === 'cloud'}
                <span title="Sincronizado na Nuvem">☁️</span>
              {:else if rom.status === 'syncing'}
                <span title="Sincronizando...">⏳</span>
              {:else}
                <span title="Apenas Local">💻</span>
              {/if}
            </div>

            <button
              class="fav-btn"
              class:fav-active={favSet.has(rom.id)}
              on:click|stopPropagation={() => toggleFavorite(rom.id)}
              title={favSet.has(rom.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              {favSet.has(rom.id) ? '★' : '☆'}
            </button>

            <div class="card-overlay">
              <p class="title">{rom.title}</p>
              <p class="platform-tag">{rom.platform}</p>
            </div>
          </div>
        {/each}
      </div>
    </main>
  </div>
  {#if showMegaModal}
    <div
      class="modal-overlay"
      role="button"
      tabindex="0"
      transition:fade={{ duration: 180 }}
      on:click={() => showMegaModal = false}
      on:keydown={(e) => e.key === 'Escape' && (showMegaModal = false)}
    >
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
          <h2>🔑 Login Mega</h2>
          <button class="modal-close" on:click={() => showMegaModal = false} title="Fechar">✕</button>
        </div>

        <label class="modal-label" for="mega-email">Email</label>
        <input id="mega-email" type="email" placeholder="seu@email.com" bind:value={megaEmail} />

        <label class="modal-label" for="mega-password">Senha</label>
        <input
          id="mega-password"
          type="password"
          placeholder="••••••••"
          bind:value={megaPassword}
          on:keydown={(e) => e.key === 'Enter' && megaEmail && megaPassword && handleMegaLogin()}
        />

        {#if loginError}
          <p class="error-msg">{loginError}</p>
        {/if}

        <div class="modal-buttons">
          <button class="btn-cancel" on:click={() => showMegaModal = false}>Cancelar</button>
          <button class="btn-login" on:click={handleMegaLogin} disabled={!megaEmail || !megaPassword}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showSettings}
    <div
      class="settings-overlay"
      role="button"
      tabindex="0"
      on:click={() => showSettings = false}
      on:keydown={(e) => e.key === 'Escape' && (showSettings = false)}
    >
      <div
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <div class="settings-header">
          <h2>Configurações</h2>
          <button class="settings-close" on:click={() => showSettings = false}>✕</button>
        </div>

        <div class="settings-body">
          <section class="settings-section">
            <h3>Biblioteca</h3>
            <div class="settings-card">
              <button
                class="settings-item"
                class:menu-focused={settingsItemIndex === 0}
                on:click={() => { settingsItemIndex = 0; handleScan(); }}
                on:mouseenter={() => settingsItemIndex = 0}
              >
                <span class="item-icon scan">🔍</span>
                <span class="item-text">
                  <span class="item-title">Escanear ROMs</span>
                  <span class="item-desc">Escolher a pasta local e reindexar a biblioteca</span>
                </span>
              </button>
              <button
                class="settings-item"
                class:menu-focused={settingsItemIndex === 1}
                disabled
                on:mouseenter={() => settingsItemIndex = 1}
              >
                <span class="item-icon backup">💾</span>
                <span class="item-text">
                  <span class="item-title">Backup na Nuvem</span>
                  <span class="item-desc">Sincronizar sua biblioteca com a nuvem</span>
                </span>
              </button>
              <button
                class="settings-item"
                class:menu-focused={settingsItemIndex === 2}
                disabled
                on:mouseenter={() => settingsItemIndex = 2}
              >
                <span class="item-icon add">➕</span>
                <span class="item-text">
                  <span class="item-title">Adicionar ROM</span>
                  <span class="item-desc">Importar um jogo manualmente</span>
                </span>
              </button>
            </div>
          </section>

          <section class="settings-section">
            <h3>Sincronização em Nuvem</h3>
            <div class="settings-card">
              {#if $isMegaLoggedIn}
                <button
                  class="settings-item"
                  class:menu-focused={settingsItemIndex === 3}
                  on:click={() => { settingsItemIndex = 3; logoutMega(); }}
                  on:mouseenter={() => settingsItemIndex = 3}
                >
                  <span class="item-icon mega connected">☁️</span>
                  <span class="item-text">
                    <span class="item-title">Mega Conectado</span>
                    <span class="item-desc">Clique para desconectar</span>
                  </span>
                  <span class="item-badge ok">Ativo</span>
                </button>
                <button
                  class="settings-item"
                  class:menu-focused={settingsItemIndex === 4}
                  on:click={() => { settingsItemIndex = 4; openMegaFolderPicker(); }}
                  on:mouseenter={() => settingsItemIndex = 4}
                >
                  <span class="item-icon folder">📁</span>
                  <span class="item-text">
                    <span class="item-title">{megaRoot ? megaRoot.split('/').pop() || megaRoot : 'Selecionar pasta'}</span>
                    <span class="item-desc">Pasta raiz das ROMs no Mega</span>
                  </span>
                </button>
              {:else}
                <button
                  class="settings-item"
                  class:menu-focused={settingsItemIndex === 3}
                  on:click={() => { settingsItemIndex = 3; handleConnectMega(); }}
                  on:mouseenter={() => settingsItemIndex = 3}
                >
                  <span class="item-icon mega">☁️</span>
                  <span class="item-text">
                    <span class="item-title">Conectar Mega</span>
                    <span class="item-desc">Entre com sua conta para sincronizar</span>
                  </span>
                  <span class="item-badge">Off</span>
                </button>
              {/if}
              <button
                class="settings-item"
                class:menu-focused={settingsItemIndex === 4}
                disabled
                title="Em breve"
                on:mouseenter={() => settingsItemIndex = 4}
              >
                <span class="item-icon drive">🟢</span>
                <span class="item-text">
                  <span class="item-title">Google Drive</span>
                  <span class="item-desc">Em breve</span>
                </span>
                <span class="item-badge soon">Breve</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  {/if}

  <MegaFolderPicker
    isOpen={showMegaFolderPicker}
    onClose={onMegaFolderPickerClose}
    onSelect={onMegaFolderSelected}
  />

  {#if $gamepadConnected}
    <footer class="gamepad-hud" transition:fade={{ duration: 250 }}>
      <span class="hud-hint"><span class="hud-btn b">B</span> Voltar</span>
      <span class="hud-sep"></span>
      <span class="hud-hint"><span class="hud-btn lr">L</span><span class="hud-btn lr">R</span> Abas</span>
      <span class="hud-sep"></span>
      <span class="hud-hint"><span class="hud-btn a">A</span> Confirmar</span>
      {#if showFavHint}
        <span class="hud-sep"></span>
        <span class="hud-hint">
          <span class="hud-btn y">Y</span>
          {favHintLabel}
        </span>
      {/if}
    </footer>

    <div class="gamepad-indicator" transition:fade={{ duration: 250 }} title="Controle conectado">
      {#key isDark}<img src={isDark ? iconGamepadWhite : iconGamepadBlack} alt="Controle conectado" />{/key}
    </div>
  {/if}
</div>

<style>
  
  /* Layout Base */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #1a1a1e;
    background-image: linear-gradient(to bottom, #111113 0%, #1a1a1e 48%, #27272d 100%);
    color: #fff;
    font-family: sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* 24px à esquerda = mesma margem do FAB de filtro (simetria) */
    padding: 0 20px 0 24px;
    height: 80px;
    background: transparent;
    border-bottom: none;
  }

  .left { display: flex; align-items: center; gap: 15px; }
  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo-img {
    height: 56px;
    width: auto;
    display: block;
    object-fit: contain;
  }
  .logo-name {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: inherit;
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Grid de ROMs: respiro lateral + largura máxima centralizada (estilo eShop) */
  .content {
    flex: 1;
    min-width: 0;
    padding: 0 6rem 30px;
    overflow-y: auto;
  }

  .rom-grid {
    width: 100%;
    max-width: 980px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 22px;
  }

  /* Botão flutuante circular padrão (tema/config/filtro) */
  .fab-btn {
    width: 55px;
    height: 55px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
    transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
    padding: 0;
  }
  .fab-btn img {
    width: 55%;
    height: 55%;
    object-fit: contain;
    display: block;
  }
  .fab-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    opacity: 1;
    transform: scale(1.06);
  }

  /* Filtro flutuante: canto superior esquerdo */
  .filter-area {
    position: fixed;
    top: 116px;
    left: 24px;
    z-index: 100;
    display: flex;
  }

  .filter-fab {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
    transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
    padding: 0;
  }
  .filter-fab img {
    width: 55%;
    height: 55%;
    object-fit: contain;
    display: block;
  }

  .filter-fab:hover { background: rgba(255, 255, 255, 0.1); opacity: 1; transform: scale(1.06); }
  .filter-fab.active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4); }

  /* Seleção branca ao redor do botão em foco (navegação por controle) */
  .fab-btn.ui-focused,
  .filter-fab.ui-focused {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.75), 0 3px 10px rgba(0, 0, 0, 0.46);
  }
  .light .fab-btn.ui-focused,
  .light .filter-fab.ui-focused {
    border-color: rgba(0, 0, 0, 0.85);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.8), 0 3px 8px rgba(0, 0, 0, 0.28);
  }

  /* Barra de pesquisa — pill flutuante glass, mesmo idioma dos FABs */
  .search-bar {
    position: fixed;
    top: 116px;
    left: 104px;
    width: 50vw;
    display: flex;
    align-items: center;
    z-index: 100;
  }
  .search-bar input {
    width: 100%;
    height: 55px;
    box-sizing: border-box;
    padding: 0 40px 0 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
    color: #fff;
    font-size: 0.9rem;
    outline: none;
    opacity: 0.85;
    transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
  }
  .search-bar input::placeholder { color: rgba(255, 255, 255, 0.4); }
  .search-bar input:focus {
    border-color: #fff;
    background: rgba(0, 0, 0, 0.4);
    opacity: 1;
  }
  .search-clear {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
  }
  .search-clear:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }

  .light .search-bar input {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.85);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
    color: #111;
  }
  .light .search-bar input::placeholder { color: rgba(0, 0, 0, 0.4); }
  .light .search-bar input:focus { border-color: #000; }
  .light .search-clear { color: rgba(0, 0, 0, 0.5); }
  .light .search-clear:hover { color: #111; background: rgba(0, 0, 0, 0.06); }

  /* Popover do filtro: mesmo vidro dos modais, com título e itens em pílula */
  .filter-popover {
    position: absolute;
    top: 70px;
    left: 0;
    min-width: 250px;
    max-height: 50vh;
    overflow-y: auto;
    padding: 10px;
    border-radius: 18px;
    background: rgba(30, 30, 30, 0.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .filter-popover-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.55);
    padding: 6px 12px 8px;
  }

  .filter-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: none;
    border: 1px solid transparent;
    color: #eee;
    text-align: left;
    padding: 10px 14px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .filter-item:hover { background: rgba(255, 255, 255, 0.08); }
  .filter-item.active { color: #fff; font-weight: 600; }
  .filter-item-check {
    font-size: 0.8rem;
    color: #34d399;
    flex-shrink: 0;
  }

  /* Foco de gamepad nos menus: mesmo anel branco dos FABs */
  .filter-item.menu-focused,
  .settings-item.menu-focused {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35), 0 3px 10px rgba(0, 0, 0, 0.3);
  }
  .light .filter-item.menu-focused,
  .light .settings-item.menu-focused {
    background: rgba(0, 0, 0, 0.06);
    border-color: rgba(0, 0, 0, 0.85);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.7), 0 3px 8px rgba(0, 0, 0, 0.18);
  }

  .page-title {
    text-align: left;
    font-size: 1.05rem;
    font-weight: 600;
    margin: 8px 0 28px;
    color: rgba(255, 255, 255, 0.85);
  }

  .rom-card {
    background: #2a2a2a;
    padding: 0;
    border-radius: 20px;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
    border: 1px solid #333;
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  /* 🟢 INDICADOR DE STATUS */
  .status-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.55);
    padding: 5px;
    border-radius: 50%;
    font-size: 1.1rem;
    line-height: 1;
    cursor: help;
    z-index: 2;
  }

  .light .status-indicator {
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .rom-card:hover {
    transform: translateY(-6px);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.4),
      0 6px 20px rgba(228, 228, 228, 0.28),
      0 14px 28px rgba(0, 0, 0, 0.54);
  }

  /* Sombra de seleção: brilho acinzentado no escuro, branco puro no claro */
  .rom-card.selected {
    border-color: rgba(255, 255, 255, 0.55);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.45), 0 6px 22px rgba(224, 224, 224, 0.35), 0 3px 10px rgba(0, 0, 0, 0.4);
  }
  .light .rom-card.selected {
    border-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95), 0 6px 18px rgba(255, 255, 255, 0.9), 0 4px 14px rgba(0, 0, 0, 0.18);
  }

  /* Foco via controle: mesmo destaque do hover (sombra + brilho) */
  .rom-card.gamepad-focused {
    transform: translateY(-6px);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.4),
      0 6px 20px rgba(228, 228, 228, 0.28),
      0 14px 28px rgba(0, 0, 0, 0.54);
  }

  /* HUD de dicas do controle (mesma proporção e sombra dos FABs) */
  .gamepad-hud {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 18px;
    height: 55px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.8rem;
    pointer-events: none;
  }
  .hud-hint { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .hud-sep { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.18); }
  .hud-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 700;
    color: #fff;
  }
  .hud-btn.a { background: #22c55e; }
  .hud-btn.b { background: #ef4444; }
  .hud-btn.y { background: #eab308; }
  .hud-btn.lr { background: rgba(255, 255, 255, 0.18); border-radius: 6px; }

  .light .gamepad-hud {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
    color: #333;
  }
  .light .hud-sep { background: rgba(0, 0, 0, 0.15); }

  /* Capa full-bleed: ocupa 100% do card quadrado */
  .cover {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #222;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-fallback {
    font-size: 2.6rem;
    opacity: 0.7;
  }

  /* Textos sobrepostos na base da capa com degradê */
  .card-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 26px 12px 10px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.45) 60%, transparent 100%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }
  .title {
    font-weight: 600;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.3;
    color: #fff;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }
  .platform-tag {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Botões de Ação */


  .actions { display: flex; gap: 10px; align-items: center; }

  /* Abas centrais (Início / Favoritos): pill glass dupla com indicador deslizante */
  .center-tabs {
    position: relative;
    display: flex;
    gap: 0;
    align-items: center;
    padding: 5px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
  }
  /* Passada lateral do destaque da aba ativa */
  .tab-slider {
    position: absolute;
    top: 5px;
    bottom: 5px;
    left: 5px;
    width: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .tab-slider.right { transform: translateX(48px); }
  .tab-btn {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity 0.2s ease, transform 0.2s ease;
    padding: 0;
  }
  .tab-btn img {
    width: 50%;
    height: 50%;
    object-fit: contain;
    display: block;
  }
  .tab-btn:hover { opacity: 1; }
  .tab-btn.active { opacity: 1; }
  .light .center-tabs {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
  }
  .light .tab-slider {
    background: rgba(0, 0, 0, 0.14);
    border-color: rgba(0, 0, 0, 0.22);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* Botão de favorito (estrela) sobre o card */
  .fav-btn {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.65);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease, color 0.2s ease, transform 0.2s ease, background 0.2s ease;
  }
  .rom-card:hover .fav-btn,
  .rom-card.gamepad-focused .fav-btn,
  .fav-btn.fav-active {
    opacity: 1;
  }
  .fav-btn:hover {
    color: #fff;
    background: rgba(0, 0, 0, 0.75);
    transform: scale(1.12);
  }
  .fav-btn.fav-active { color: #fbbf24; }
  .light .fav-btn {
    background: rgba(255, 255, 255, 0.85);
    color: rgba(0, 0, 0, 0.55);
  }
  .light .fav-btn:hover {
    color: #111;
    background: rgba(255, 255, 255, 0.95);
  }

  /* Indicador de controle conectado (canto inferior esquerdo, estilo HUD) */
  .gamepad-indicator {
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 900;
    width: 55px;
    height: 55px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .gamepad-indicator img {
    width: 55%;
    height: 55%;
    object-fit: contain;
    display: block;
  }
  .light .gamepad-indicator {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
  }

  /* Modal de Configurações: backdrop blur + 50% opacidade */
  .settings-overlay {
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

  .settings-modal {
    width: 92%;
    max-width: 460px;
    max-height: 80vh;
    overflow-y: auto;
    border-radius: 28px;
    background: rgba(30, 30, 30, 0.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    padding: 26px;
    color: #fff;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.2rem;
    padding-left: 8px;
  }

  .settings-close {
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
  .settings-close:hover { color: #fff; background: rgba(255, 255, 255, 0.14); }

  .settings-section { margin-bottom: 22px; }
  .settings-section h3 {
    margin: 0 0 10px 8px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.55);
  }

  /* Card agrupando itens com divisórias sutis */
  .settings-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 22px;
    overflow: hidden;
  }

  .settings-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .settings-item:last-child { border-bottom: none; }
  .settings-item:hover:not(:disabled) { background: rgba(255, 255, 255, 0.07); }
  .settings-item:disabled { cursor: not-allowed; opacity: 0.55; }

  .item-icon {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .item-icon.scan { background: rgba(16, 185, 129, 0.18); }
  .item-icon.backup { background: rgba(59, 130, 246, 0.18); }
  .item-icon.add { background: rgba(139, 92, 246, 0.18); }
  .item-icon.mega { background: rgba(236, 72, 153, 0.18); }
  .item-icon.mega.connected { background: rgba(16, 185, 129, 0.18); }
  .item-icon.folder { background: rgba(99, 102, 241, 0.18); }
  .item-icon.drive { background: rgba(34, 197, 94, 0.15); }

  .item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item-title {
    font-size: 0.92rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-desc {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
  }
  .item-badge.ok { background: rgba(16, 185, 129, 0.2); color: #34d399; }
  .item-badge.soon { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }

  /* Tema Claro */
  .light {
    background-color: #c4c7cd;
    background-image: linear-gradient(to bottom, #adb2ba 0%, #c3c6cd 50%, #d0d3d8 100%);
    color: #111;
  }
  .light .header { background: transparent; border-bottom: none; }
  .light .page-title { color: #2c2c2e; }
  .light .rom-card { background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-color: #eee; }
  .light .rom-card:hover {
    border-color: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.9),
      0 14px 28px rgba(0, 0, 0, 0.34),
      0 6px 12px rgba(0, 0, 0, 0.17);
  }
  .light .rom-card.gamepad-focused {
    border-color: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.9),
      0 14px 28px rgba(0, 0, 0, 0.34),
      0 6px 12px rgba(0, 0, 0, 0.17);
  }

  /* Glassmorphism no tema claro: vidro ligeiramente mais escuro que o fundo */
  .light .filter-fab {
    background: rgba(0, 0, 0, 0.11);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
  }
  .light .filter-fab:hover { background: rgba(0, 0, 0, 0.17); }
  .light .filter-popover {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.08);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }
  .light .filter-popover-title { color: rgba(0, 0, 0, 0.5); }
  .light .filter-item { color: #222; }
  .light .filter-item:hover { background: rgba(0, 0, 0, 0.06); }
  .light .filter-item-check { color: #059669; }

  /* FABs no tema claro: vidro claro com texto/ícone escuro */
  .light .fab-btn,
  .light .filter-fab {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
  }
  .light .fab-btn:hover,
  .light .filter-fab:hover { background: rgba(0, 0, 0, 0.16); }
  .light .settings-modal {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.08);
    color: #222;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }
  .light .settings-section h3 { color: rgba(0, 0, 0, 0.55); }
  .light .settings-close {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: #666;
  }
  .light .settings-close:hover { color: #111; background: rgba(0, 0, 0, 0.1); }
  .light .settings-card {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.06);
  }
  .light .settings-item { border-bottom-color: rgba(0, 0, 0, 0.05); }
  .light .settings-item:hover:not(:disabled) { background: rgba(0, 0, 0, 0.05); }
  .light .settings-section h3 { color: rgba(0, 0, 0, 0.55); }
  .light .item-desc { color: rgba(0, 0, 0, 0.45); }
  .light .item-badge { background: rgba(0, 0, 0, 0.08); color: rgba(0, 0, 0, 0.55); }
  .light .item-badge.ok { background: rgba(16, 185, 129, 0.15); color: #059669; }
  .light .item-badge.soon { background: rgba(59, 130, 246, 0.12); color: #2563eb; }

  /* Estilos do Modal de Login (glass) */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background: rgba(30, 30, 30, 0.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 26px;
    border-radius: 28px;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.45);
    color: #fff;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .modal-header h2 { margin: 0; font-size: 1.2rem; padding-left: 6px; }

  .modal-close {
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
  .modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.14); }

  .modal-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.5);
    margin: 4px 4px 0;
  }

  .modal input {
    padding: 13px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: white;
    font-size: 1rem;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .modal input::placeholder { color: rgba(255, 255, 255, 0.4); }

  .modal input:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.7);
    background: rgba(255, 255, 255, 0.12);
  }

  .error-msg { color: #ff6b6b; font-size: 0.9rem; margin: 0; }

  .modal-buttons { display: flex; gap: 10px; margin-top: 14px; }

  .btn-cancel {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: none;
    padding: 11px;
    border-radius: 14px;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .btn-cancel:hover { background: rgba(255, 255, 255, 0.16); }

  .btn-login {
    flex: 1;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    border: none;
    padding: 11px;
    border-radius: 14px;
    cursor: pointer;
    font-weight: bold;
    transition: filter 0.2s ease;
  }

  .btn-login:hover:not(:disabled) { filter: brightness(1.12); }

  .btn-login:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Ajuste para o tema claro */
  .light .modal {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.08);
    color: #222;
    box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  }
  .light .modal-close {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: #666;
  }
  .light .modal-close:hover { color: #111; background: rgba(0, 0, 0, 0.1); }
  .light .modal-label { color: rgba(0, 0, 0, 0.45); }
  .light .modal input {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.1);
    color: #222;
  }
  .light .modal input::placeholder { color: rgba(0, 0, 0, 0.35); }
  .light .btn-cancel { background: rgba(0, 0, 0, 0.07); color: #333; }
  .light .btn-cancel:hover { background: rgba(0, 0, 0, 0.12); }

</style>