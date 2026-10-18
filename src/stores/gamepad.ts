import { writable, get } from 'svelte/store';

/**
 * Store de suporte a controles (Gamepad API).
 * - Detecta conexão/desconexão de controles.
 * - Loop com requestAnimationFrame expõe o estado "cru" dos botões/eixos.
 * - Dispara callbacks para ações de navegação (debounce embutido por botão).
 */

export interface GamepadState {
  connected: boolean;
  label: string;
}

// Estado exposto para a UI (HUD de dicas, etc.)
export const gamepadConnected = writable(false);
export const gamepadLabel = writable('');

// Callbacks registrados pelo App (nome da ação -> handler)
type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'shoulderL' | 'shoulderR' | 'select' | 'y' | 'start';
const handlers: Partial<Record<Action, () => void>> = {};

export function onGamepadAction(action: Action, fn: () => void) {
  handlers[action] = fn;
}

// Índices padrão do Gamepad API "standard" mapping
const BUTTONS = {
  A: 0,          // Xbox A / PS Cruz
  B: 1,          // Xbox B / PS Círculo
  Y: 3,          // Xbox Y / PS Triângulo
  SELECT: 8,     // Select / View / Share
  START: 9,      // Start / Menu
  L1: 4,
  R1: 5,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

// Analógico esquerdo
const AXIS_H = 0; // esquerda(-1) / direita(+1)
const AXIS_V = 1; // cima(-1) / baixo(+1)
const AXIS_THRESHOLD = 0.5;

// Debounce: intervalo mínimo entre repetições de cada ação (ms)
const REPEAT_DELAY = 180;

let rafId: number | null = null;
let running = false;

// Última vez que cada ação foi disparada (para debounce)
const lastFired: Record<string, number> = {};
// Estado anterior dos botões "edge-triggered" (só disparam na transição)
const prevPressed: Record<string, boolean> = {};

function tryFire(action: Action, key: string, repeatable: boolean) {
  const now = performance.now();
  if (repeatable) {
    // D-Pad/analógico: repete enquanto segura, com delay
    if (now - (lastFired[key] ?? -Infinity) < REPEAT_DELAY) return;
    lastFired[key] = now;
    handlers[action]?.();
  } else {
    // Botões de ação: só disparam na transição solto->pressionado
    if (prevPressed[key]) return;
    prevPressed[key] = true;
    if (now - (lastFired[key] ?? -Infinity) < REPEAT_DELAY) return;
    lastFired[key] = now;
    handlers[action]?.();
  }
}

function clearPressed() {
  // Ao desconectar, limpa estados de transição
  for (const k of Object.keys(prevPressed)) prevPressed[k] = false;
}

function poll() {
  if (!running) return;

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad: Gamepad | null = null;
  for (const p of pads) {
    if (p && p.connected) { pad = p; break; }
  }

  if (pad) {
    const b = pad.buttons;

    // D-Pad (repetição contínua ao segurar)
    if (b[BUTTONS.DPAD_UP]?.pressed) tryFire('up', 'dup', true);
    else prevPressed['dup'] = false;

    if (b[BUTTONS.DPAD_DOWN]?.pressed) tryFire('down', 'ddown', true);
    else prevPressed['ddown'] = false;

    if (b[BUTTONS.DPAD_LEFT]?.pressed) tryFire('left', 'dleft', true);
    else prevPressed['dleft'] = false;

    if (b[BUTTONS.DPAD_RIGHT]?.pressed) tryFire('right', 'dright', true);
    else prevPressed['dright'] = false;

    // Analógico esquerdo (mesmo comportamento do D-Pad)
    const axV = pad.axes[AXIS_V] ?? 0;
    const axH = pad.axes[AXIS_H] ?? 0;

    if (axV <= -AXIS_THRESHOLD) tryFire('up', 'aup', true);
    else prevPressed['aup'] = false;

    if (axV >= AXIS_THRESHOLD) tryFire('down', 'adown', true);
    else prevPressed['adown'] = false;

    if (axH <= -AXIS_THRESHOLD) tryFire('left', 'aleft', true);
    else prevPressed['aleft'] = false;

    if (axH >= AXIS_THRESHOLD) tryFire('right', 'aright', true);
    else prevPressed['aright'] = false;

    // Botões de ação (edge-triggered)
    if (b[BUTTONS.A]?.pressed) tryFire('confirm', 'a', false);
    else prevPressed['a'] = false;

    if (b[BUTTONS.B]?.pressed) tryFire('back', 'b', false);
    else prevPressed['b'] = false;

    if (b[BUTTONS.L1]?.pressed) tryFire('shoulderL', 'l1', false);
    else prevPressed['l1'] = false;

    if (b[BUTTONS.R1]?.pressed) tryFire('shoulderR', 'r1', false);
    else prevPressed['r1'] = false;

    if (b[BUTTONS.SELECT]?.pressed) tryFire('select', 'select', false);
    else prevPressed['select'] = false;

    if (b[BUTTONS.Y]?.pressed) tryFire('y', 'y', false);
    else prevPressed['y'] = false;

    if (b[BUTTONS.START]?.pressed) tryFire('start', 'start', false);
    else prevPressed['start'] = false;
  }

  rafId = requestAnimationFrame(poll);
}

export function startGamepadListener() {
  if (running) return;
  running = true;

  const updateConnection = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let found: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) { found = p; break; }
    }
    gamepadConnected.set(!!found);
    gamepadLabel.set(found?.id ?? '');
    if (!found) clearPressed();
  };

  window.addEventListener('gamepadconnected', (e) => {
    console.log('🎮 Controle conectado:', (e as GamepadEvent).gamepad.id);
    updateConnection();
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    console.log('🎮 Controle desconectado:', (e as GamepadEvent).gamepad.id);
    updateConnection();
  });

  // Alguns navegadores só expõem o gamepad após o primeiro poll
  updateConnection();
  rafId = requestAnimationFrame(poll);
}

export function stopGamepadListener() {
  running = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  gamepadConnected.set(false);
}

export function isGamepadConnected(): boolean {
  return get(gamepadConnected);
}
