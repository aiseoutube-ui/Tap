// =================================================================================
//      CYBERTAP CONQUEST - VANILLA JS CLIENT 1.3 (FLAME & FREEZE FAIRPLAY)
// =================================================================================
// Este script contiene toda la lógica de frontend para el juego.

// --- GLOBAL STATE & CONFIGURATION ---
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxz6JnxM1cfoh3awHKDGgewLEJBUSyMJmYOndymKhJtnd6OcINgCwlwmBYrGEdSJe4E8Q/exec';
const PLAYER_ID_KEY = 'cyberTap_playerId';
const TAP_SYNC_THRESHOLD = 20;
const TAP_SYNC_DEBOUNCE_MS = 3000;
const BACKGROUND_SYNC_INTERVAL_MS = 5000;

let state = {
    gameState: null,
    humanPlayerId: localStorage.getItem(PLAYER_ID_KEY),
    isLoading: false,
    error: null,
    activePage: 'HOME',
    pendingTaps: 0,
    syncTimeoutId: null,
    backgroundSyncIntervalId: null,
    selectedCardForUse: null,
    isChatOpen: false, // Controla el estado abierto/cerrado del chat
    freezeTimerIntervalId: null, // ID para el intervalo del temporizador de congelamiento
    flameTimerIntervalId: null, // NUEVO: ID para el intervalo del temporizador de llama
    // Nuevo estado para controlar qué botón de acción está cargando
    loadingAction: null, // Puede ser 'boosts', 'cards', 'use_card_TARGETID', 'bailout', 'bid_auction'
    // Almacenamiento temporal para simular el decremento visible de monedas
    coinsBeforeFlame: null, 
    coinsTargetFlame: null,
};

// --- CONSTANTES & DEFINICIONES (from constants.ts, types.ts) ---
// NUEVA CARTA FLAME: Drena el 5% inicial y aplica drenaje por segundo.
const CardType = { FREEZE: 'FREEZE', SHIELD: 'SHIELD', THIEF: 'THIEF', PASSIVE_INCOME_1: 'PASSIVE_INCOME_1', FLAME: 'FLAME' };
const BoostType = { MULTITAP: 'MULTITAP', ENERGY_LIMIT: 'ENERGY_LIMIT' };

const CARD_DEFINITIONS = {
  [CardType.FREEZE]: { id: CardType.FREEZE, name: 'Congelar', description: 'Congela a un oponente por 3 minutos, impidiendo que gane monedas.', cost: 7500, isSingleUse: true },
  [CardType.SHIELD]: { id: CardType.SHIELD, name: 'Escudo', description: 'Te protege del próximo ataque de "Congelar" o "Llama". Se consume al usarse.', cost: 5000, isSingleUse: true },
  [CardType.THIEF]: { id: CardType.THIEF, name: 'Ladrón', description: 'Roba un 5% de las monedas de un oponente. Puede fallar.', cost: 10000, isSingleUse: true },
  [CardType.PASSIVE_INCOME_1]: { id: CardType.PASSIVE_INCOME_1, name: 'Data Miner v1', description: 'Genera 1 de Ganancia x Día (XP) por segundo.', cost: 20000, isSingleUse: false, passiveGain: 1 },
  [CardType.FLAME]: { id: CardType.FLAME, name: 'Llama', description: 'Drena inmediatamente el 5% de las monedas del oponente y las drena por 30s.', cost: 9000, isSingleUse: true },
};

const BOOST_DEFINITIONS = {
  [BoostType.MULTITAP]: { id: BoostType.MULTITAP, name: 'Multitap', description: (level) => `Gana +${level} monedas por toque.`, getCost: (level) => 5000 * (2 ** (level - 1)) },
  [BoostType.ENERGY_LIMIT]: { id: BoostType.ENERGY_LIMIT, name: 'Límite de Energía', description: (level) => `Aumenta la energía máxima en 500.`, getCost: (level) => 5000 * (2 ** (level - 1)) },
};

// Costo de rescate (Bailout)
const FREEZE_BAILOUT_COST = 20000; 
// Duración de castigos para simulación (AJUSTADO A 3 MINUTOS)
const FREEZE_DURATION_MS = 3 * 60 * 1000; 
const FLAME_DURATION_MS = 30 * 1000; // 30 segundos para FLAME

// Sonidos internos (Base64 para baja latencia)
const TAP_SOUND = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQQAAAAAAAD/AAAA';
const ENERGY_EMPTY_SOUND = 'data:audio/wav;base64,UklGRkIAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YVwAAACx/8D/x//H/8v/z//P/8//zP/I/7r/q/+r/6n/qf+p/6b/mv+V/5L/kv+T/5b/nP/P//n//f/9//3//f/9//3//f/9//3//f/9//3//f/5/9w==';
const NAV_SOUND = 'data:audio/wav;base64,UklGRkoAAABXQVZFZm10IBAAAAABAAEAESsAAESsAAABAAgAZGF0YUYAAAAA/v8A/v8A/v8AAAAA/v8A/v8A/v8A/v8AAAAAAAD+/wD+/wD+/wAAAAAAAAAAAP7/AP7/AP7/AAAAAAAAAAAAAP7/AP7/AP7/';
// Nuevo sonido: Tono simple para "Sin energía/Bloqueado" (sonido de error/click sin efecto)
const BLOCKED_SOUND = 'data:audio/wav;base64,UklGRhoAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQYAAAAA/P4A/P4A/P4A/P4A/P4A/P4A';

// URLs de Audio de Chat (rutas relativas para GitHub)
const OWN_MESSAGE_URL = 'single-sound-message-icq-ooh.mp3'; 
const OTHER_MESSAGE_URL = 'the-sound-of-knocking-on-the-door.mp3'; 


// --- ICONS (from Icons.tsx) ---
const Icons = {
    Home: `<svg class="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    Users: `<svg class="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    Hammer: `<svg class="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.373 8.373a2.49 2.49 0 1 1-3.52-3.52L11.5 8.5"></path><path d="m18 5 3 3"></path></svg>`,
    ShoppingCart: `<svg class="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`,
    CreditCard: `<svg class="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`,
    Bolt: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    Gem: `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9"></polygon></svg>`,
    Spinner: `<svg class="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,
    ChevronUp: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    ChevronDown: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    Send: `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    Shield: `<svg class="w-4 h-4 text-cyan-400" title="Protegido" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    ZapOff: `<svg class="w-4 h-4 text-blue-400" title="Congelado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12.41 6.75 13 2 10.57 4.92"></polyline><polyline points="18.57 12.91 21 10 15.66 10"></polyline><polyline points="8 8 3 14 12 14 11 22 16 16"></polyline><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    Flame: `<svg class="w-4 h-4 text-orange-400" title="Drenando" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.83-2.32-2.31-3.25C6.71 7.21 5 6 5 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2c0 3-1.71 4.21-3.69 5.75C13.83 9.68 13 10.62 13 12a2.5 2.5 0 0 0 2.5 2.5V23h-3.5V14.5z"></path></svg>`,
};

// Se elimina 'SETTINGS' de la navegación
const navItems = [
  { page: 'HOME', label: 'Home', icon: Icons.Home },
  { page: 'FRIENDS', label: 'Amigos', icon: Icons.Users },
  { page: 'BOOSTS', label: 'Boosts', icon: Icons.Bolt.replace('w-5 h-5', 'w-6 h-6 mb-1') },
  { page: 'CARDS', label: 'Cartas', icon: Icons.CreditCard },
  { page: 'MARKET', label: 'Market', icon: Icons.ShoppingCart },
  { page: 'AUCTIONS', label: 'Remates', icon: Icons.Hammer },
];

// --- AUDIO PLAYER (from utils/AudioPlayer.ts) ---
let audioContext = null;
const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  // Intenta reanudar el contexto si está suspendido (necesario después de interacción inicial)
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
};

// Función para reproducir sonidos cargados mediante URL (para archivos locales o externos)
const playUrlSound = async (url) => {
    try {
        const audio = new Audio(url);
        audio.preload = 'auto'; // Intentar cargar rápidamente
        await audio.play();
    } catch (error) {
        console.warn("Advertencia: Fallo al reproducir audio desde URL. Asegúrate de la ruta.", error);
    }
};

// Función de reproducción universal, soporta Base64 (para sonidos internos) y URLs (archivos de chat)
const playSound = async (source) => {
    // Si la fuente es Base64 (para sonidos internos como TAP, NAV, EMPTY, BLOCKED)
    if (source.startsWith('data:')) {
        const context = getAudioContext();
        if (!context) return;
        if (context.state === 'suspended') await context.resume();
        try {
            const base64Data = source.split(',')[1];
            const binaryString = window.atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
            const audioBuffer = await context.decodeAudioData(bytes.buffer);
            const sourceNode = context.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(context.destination);
            sourceNode.start(0);
        } catch (error) {
            console.error("Error playing Base64 sound:", error);
        }
    } else {
        // Si es una URL (para sonidos de chat externos o locales), usamos playUrlSound
        playUrlSound(source);
    }
};

const playMessageSound = (isOwnMessage, customSound) => {
    if (customSound) {
        // Si hay sonido personalizado (que es Base64 desde el backend), lo reproduce playSound.
        playSound(customSound);
        return;
    }
    
    // Usamos las URLs de mensaje locales
    const soundToPlay = isOwnMessage ? OWN_MESSAGE_URL : OTHER_MESSAGE_URL;
    playSound(soundToPlay);
};


// --- API SERVICE (from services/gameApi.ts) ---
const gameApi = {
    async fetchFromGas(method, params, attempt = 1) {
        const MAX_RETRIES = 3;
        const INITIAL_BACKOFF_MS = 300;
        
        try {
            let response;
            if (method === 'GET') {
                const url = new URL(GAS_URL);
                Object.keys(params).forEach(key => url.searchParams.append(key, String(params[key])));
                response = await fetch(url.toString());
            } else { // POST
                response = await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(params),
                    mode: 'cors',
                });
            }

            if (!response.ok) throw new Error(`Error de red: ${response.statusText} (Status: ${response.status})`);
            
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Ocurrió un error desconocido en el servidor.');

            return result.data;

        } catch (error) {
            console.warn(`Attempt ${attempt} failed: ${error.message}`);
            const isRetryable = error.message.includes('Error de red') || error.message.includes('Status: 5');

            if (isRetryable && attempt < MAX_RETRIES) {
                const delay = INITIAL_BACKOFF_MS * (2 ** (attempt - 1)) + Math.random() * 100;
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchFromGas(method, params, attempt + 1);
            } else {
                throw error;
            }
        }
    },
    async getGameState(playerId) {
        return this.fetchFromGas('GET', { playerId });
    },
    async registerPlayer(nickname) {
        return this.fetchFromGas('POST', { action: 'REGISTER_PLAYER', payload: { nickname } });
    },
    async dispatchAction(playerId, type, payload) {
        return this.fetchFromGas('POST', { action: type, payload: { ...payload, playerId } });
    }
};

// --- UTILITIES ---

/**
 * Calcula el tiempo restante de castigo y lo formatea.
 * @param {number} untilTimestamp El timestamp (ms) hasta el que está activo el efecto.
 * @returns {string | null} El tiempo restante en formato MM:SS, o null si ya expiró.
 */
function getRemainingTime(untilTimestamp) {
    if (!untilTimestamp || untilTimestamp <= Date.now()) {
        return null;
    }
    const remainingMs = untilTimestamp - Date.now();
    const remainingSeconds = Math.floor(remainingMs / 1000);
    
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    return `${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Calcula el tiempo restante de subasta y lo formatea.
 * @param {number} untilTimestamp El timestamp (ms) hasta el que está activo el efecto.
 * @returns {string} El tiempo restante en formato HH:MM:SS, o '00:00:00'.
 */
function formatTimeRemaining(endTime) {
    const totalSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}


// Función para animar la pérdida de monedas (Efecto regresivo)
let animationFrameId = null;

function animateCoinLoss(initialCoins, targetCoins, durationMs = 500) {
    const startTime = performance.now();
    const coinEl = getEl('coins-display'); 

    if (!coinEl) return;
    
    // Limpiar animación anterior si existe
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        
        // Interpolación lineal entre el valor inicial y el objetivo
        const currentCoins = initialCoins - (initialCoins - targetCoins) * progress;
        
        coinEl.textContent = Math.floor(currentCoins).toLocaleString();

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(step);
        } else {
            // Asegurar que el valor final sea exacto
            coinEl.textContent = Math.floor(targetCoins).toLocaleString();
            animationFrameId = null;
        }
    }

    animationFrameId = requestAnimationFrame(step);
}


// --- DOM MANIPULATION & RENDERING ---
function getEl(id) { return document.getElementById(id); }

function updateState(newState) {
    const oldMessagesCount = state.gameState?.messages?.length || 0;
    
    // Si viene un nuevo gameState
    if (newState.gameState) {
        newState.loadingAction = null;
        
        // 1. Manejo de la animación inicial de FLAME (pérdida del 5%)
        const oldPlayer = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
        const newPlayer = newState.gameState.players?.find(p => p.id === state.humanPlayerId);

        if (oldPlayer && newPlayer && newPlayer.isBurningUntil && !oldPlayer.isBurningUntil) {
             // Si el jugador acaba de empezar a arder (isBurningUntil pasa de 0 a >0)
             
             // NOTA: Usamos el oldPlayer.coins - newPlayer.coins (valor del backend) para determinar la pérdida inicial.
             const coinsDifference = oldPlayer.coins - newPlayer.coins;
             
             // Si la diferencia es mayor a 0 (hubo pérdida inicial del 5%)
             if (coinsDifference > 0) {
                 // El valor real ANTES de la pérdida es el nuevo valor + lo que se perdió.
                 const initialCoins = newPlayer.coins + coinsDifference; 
                 const targetCoins = newPlayer.coins;
                 
                 // Guardar valores para la animación
                 newState.coinsBeforeFlame = initialCoins;
                 newState.coinsTargetFlame = targetCoins;
             }
        } else if (newPlayer && !newPlayer.isBurningUntil) {
             // Limpiar si ya no está ardiendo
             newState.coinsBeforeFlame = null;
             newState.coinsTargetFlame = null;
        }
    }

    Object.assign(state, newState);
    render();
    
    // 2. Disparar la animación después del render para que el DOM esté listo
    if (state.coinsBeforeFlame !== null && state.coinsTargetFlame !== null) {
        animateCoinLoss(state.coinsBeforeFlame, state.coinsTargetFlame);
        // Limpiamos los valores temporales después de disparar la animación
        state.coinsBeforeFlame = null;
        state.coinsTargetFlame = null;
    }


    if (state.gameState?.messages && state.gameState.messages.length > oldMessagesCount) {
        const latestMessage = state.gameState.messages[state.gameState.messages.length - 1];
        const sender = state.gameState.players.find(p => p.id === latestMessage.playerId);
        // Llama a la función playMessageSound con el control de si es mensaje propio
        playMessageSound(latestMessage.playerId === state.humanPlayerId, sender?.customSoundSend);
        
        // Desplazar al último mensaje si el chat está abierto en la vista de amigos
        if (state.activePage === 'FRIENDS' && state.isChatOpen) {
            const chatMessagesEl = getEl('chat-messages');
            if (chatMessagesEl) {
                 // Usar un pequeño timeout para asegurar que el DOM se haya actualizado
                setTimeout(() => {
                    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
                }, 50); 
            }
        }
    }
}

function render() {
    // Control visibility of main sections
    const registrationScreen = getEl('screen-registration');
    const loadingScreen = getEl('screen-loading');
    const appNav = getEl('app-nav');
    const allScreens = document.querySelectorAll('.screen');
    const freezeOverlay = getEl('freeze-overlay');
    const flameOverlay = getEl('flame-overlay');

    const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
    
    // Estado de castigo
    const isFrozen = player && player.isFrozenUntil && player.isFrozenUntil > Date.now();
    const isBurning = player && player.isBurningUntil && player.isBurningUntil > Date.now();
    
    // 1. Manejo del overlay de congelamiento
    if (isFrozen) {
        freezeOverlay.classList.remove('hidden');
        if (flameOverlay) flameOverlay.classList.add('hidden'); // El Freeze anula el Flame
        // Iniciar el temporizador del overlay si no está corriendo
        if (!state.freezeTimerIntervalId) {
            state.freezeTimerIntervalId = setInterval(renderFreezeOverlay, 1000);
        }
    } else {
        freezeOverlay.classList.add('hidden');
        if (state.freezeTimerIntervalId) {
            clearInterval(state.freezeTimerIntervalId);
            state.freezeTimerIntervalId = null;
        }
    }
    
    // 2. Manejo del overlay de llama/drenaje
    if (isBurning && !isFrozen) {
        if (flameOverlay) flameOverlay.classList.remove('hidden');
        if (!state.flameTimerIntervalId) {
            state.flameTimerIntervalId = setInterval(renderFlameOverlay, 1000);
        }
    } else {
        if (flameOverlay) flameOverlay.classList.add('hidden');
        if (state.flameTimerIntervalId) {
            clearInterval(state.flameTimerIntervalId);
            state.flameTimerIntervalId = null;
        }
    }

    // Lógica de navegación y pantallas
    if (state.isLoading && !state.gameState) {
        registrationScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');
        appNav.classList.add('hidden');
    } else if (!state.humanPlayerId) {
        registrationScreen.classList.remove('hidden');
        loadingScreen.classList.add('hidden');
        appNav.classList.add('hidden');
    } else {
        registrationScreen.classList.add('hidden');
        loadingScreen.classList.add('hidden');
        appNav.classList.remove('hidden');

        // Mostrar u ocultar la pantalla activa
        allScreens.forEach(s => s.classList.add('hidden'));
        if(state.selectedCardForUse) {
            getEl(`screen-CARDS`).classList.remove('hidden');
            window.renderCARDSScreen(); 
        } else {
            const activeScreen = getEl(`screen-${state.activePage}`);
            if (activeScreen) activeScreen.classList.remove('hidden');
        }
    }

    // Render components
    if (state.humanPlayerId && state.gameState) {
        // La navegación se deshabilita solo si está congelado
        renderNav(isFrozen); 
        renderFooter();
        
        // Render current page
        const renderFunction = window[`render${state.activePage}Screen`];
        if (typeof renderFunction === 'function') {
            renderFunction();
        }
    }
    
    // Update error messages
    const regError = getEl('registration-error');
    if (regError) {
        regError.textContent = state.error;
        regError.classList.toggle('hidden', !state.error);
    }
}

// Función para el contador de la Llama
function renderFlameOverlay() {
    const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
    const flameTimerEl = getEl('flame-timer');

    if (!player || !player.isBurningUntil || player.isBurningUntil <= Date.now()) {
        if (flameTimerEl) flameTimerEl.textContent = '00:00';
        // Forzar recarga de estado para confirmar el fin del efecto
        if (player && !player.isBurningUntil) loadGameState(state.humanPlayerId); 
        return;
    }

    const remainingTime = getRemainingTime(player.isBurningUntil);
    if (flameTimerEl) {
        flameTimerEl.textContent = remainingTime;
    }
}


// Nueva función de renderizado para el overlay de congelamiento (Incluye Rescate)
function renderFreezeOverlay() {
    const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
    const freezeTimerEl = getEl('freeze-timer');
    const bailoutButton = getEl('freeze-bailout-button');
    const cost = FREEZE_BAILOUT_COST;

    if (!player || !player.isFrozenUntil || player.isFrozenUntil <= Date.now()) {
        if (freezeTimerEl) freezeTimerEl.textContent = '00:00';
        return;
    }

    const remainingTime = getRemainingTime(player.isFrozenUntil);
    if (freezeTimerEl) {
        freezeTimerEl.textContent = remainingTime;
    }
    
    // Lógica del botón de Rescate
    if (bailoutButton) {
        const canAfford = player.coins >= cost;
        const isLoading = state.loadingAction === 'bailout';
        
        bailoutButton.innerHTML = isLoading 
            ? `${Icons.Spinner.replace('w-5 h-5', 'w-4 h-4')} <span>Pagando Rescate...</span>`
            : `<span>Pagar Rescate (${cost.toLocaleString()})</span>`;
            
        bailoutButton.disabled = !canAfford || isLoading;
        bailoutButton.dataset.cost = cost;
        
        // Adjuntar listener (se podría mover a setupEventListeners para eficiencia)
        if (!bailoutButton.hasAttribute('data-listener-attached')) {
             bailoutButton.addEventListener('click', async () => {
                if (bailoutButton.disabled) {
                    playSound(BLOCKED_SOUND);
                    return;
                }
                
                // 1. Mostrar Loader
                updateState({ loadingAction: 'bailout' });
                
                // 2. Disparar acción de rescate
                try {
                    await dispatch('FREEZE_BAILOUT', { cost: cost });
                } catch (e) {
                    // El dispatch maneja la limpieza y el error
                }
            });
            bailoutButton.setAttribute('data-listener-attached', 'true');
        }
    }
    
    // Si el tiempo restante es nulo (expiró), forzamos un re-render completo
    if (!remainingTime) {
        loadGameState(state.humanPlayerId); 
    }
}


function renderNav(isFrozen) {
    const navContainer = getEl('app-nav');
    // Ajustamos la rejilla de navegación a 6 columnas (grid-cols-6)
    navContainer.className = 'flex-shrink-0 grid grid-cols-6 gap-1 p-2 bg-gray-900/50 border-t border-cyan-900';

    // Deshabilitar la navegación si está congelado
    const isDisabled = isFrozen ? 'disabled' : '';

    navContainer.innerHTML = navItems.map(({ page, label, icon }) => `
        <button data-page="${page}" class="nav-button flex flex-col items-center justify-center p-1 rounded-lg transition-colors ${state.activePage === page ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}" ${isDisabled}>
            ${icon}
            <span class="text-[9px] leading-tight font-semibold">${label}</span>
        </button>
    `).join('');
}

function renderFooter() {
    getEl('app-footer').textContent = state.humanPlayerId ? `Backend conectado. ID: ${state.humanPlayerId}` : 'Esperando registro...';
}

// --- SCREEN RENDERERS ---

window.renderHOMEScreen = () => {
    const player = state.gameState.players.find(p => p.id === state.humanPlayerId);
    if (!player) return;
    const xpPercentage = player.maxDailyGain > 0 ? (player.dailyGain / player.maxDailyGain) * 100 : 0;
    // La energía ahora se regenera incluso si está congelado
    const energyPercentage = player.maxEnergy > 0 ? (player.energy / player.maxEnergy) * 100 : 0; 
    
    // Determinar si el botón debe estar deshabilitado por falta de energía O por congelamiento
    const isFrozen = player.isFrozenUntil && player.isFrozenUntil > Date.now();
    const isBurning = player.isBurningUntil && player.isBurningUntil > Date.now();
    const isDisabled = player.energy <= 0 || isFrozen;
    const disabledClass = isDisabled ? 'disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed disabled:animate-none' : '';
    
    // Monedas a mostrar (usa el valor real del estado a menos que esté en animación)
    const coinsDisplayValue = Math.floor(player.coins).toLocaleString();

    getEl('screen-HOME').innerHTML = `
        <div class="flex flex-col h-full text-center">
            <div class="px-4 pt-2">
                <div class="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <div class="text-left mb-2">
                        <p class="font-orbitron text-lg font-bold leading-tight">${player.nickname}</p>
                        <p class="text-xs text-cyan-400">${player.status}</p>
                    </div>
                    <div>
                        <div class="flex justify-between items-center text-xs text-gray-300 mb-1">
                            <span class="font-bold">Nivel ${player.level}</span>
                            <span>${player.dailyGain.toLocaleString()} / ${player.maxDailyGain.toLocaleString()}</span>
                        </div>
                        <div class="w-full bg-gray-700 rounded-full h-3.5"><div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-3.5 rounded-full" style="width: ${xpPercentage}%"></div></div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-4 gap-2 px-4 my-3">
                <button disabled class="bg-cyan-900/70 text-white/70 p-2 rounded-lg text-xs font-semibold cursor-not-allowed">Lista de tareas</button>
                <button disabled class="bg-cyan-900/70 text-white/70 p-2 rounded-lg text-xs font-semibold cursor-not-allowed">Cifrado Diario</button>
                <button disabled class="bg-cyan-900/70 text-white/70 p-2 rounded-lg text-xs font-semibold cursor-not-allowed">Combo Diario</button>
                <button disabled class="bg-cyan-900/70 text-white/70 p-2 rounded-lg text-xs font-semibold cursor-not-allowed">Juego Diario</button>
            </div>
            <div class="my-2">
                <div class="flex items-center justify-center space-x-2">
                    <div class="w-8 h-8 text-yellow-300">${Icons.Gem.replace('w-4 h-4', 'w-8 h-8')}</div>
                    <h1 id="coins-display" class="font-orbitron text-4xl font-bold tracking-wider">${coinsDisplayValue}</h1>
                </div>
            </div>
            <div id="flexing-point" class="flex-grow flex items-center justify-center px-4">
                <button id="tap-button" ${isDisabled ? 'disabled' : ''} class="relative w-64 h-64 bg-gradient-to-br from-cyan-900 via-cyan-600 to-cyan-400 rounded-full shadow-lg border-4 border-cyan-400/50 active:scale-95 transition-transform duration-100 ${disabledClass} ${!isDisabled ? 'animate-pulse-glow' : ''}">
                    <div class="absolute inset-0 flex items-center justify-center"><span class="text-6xl font-orbitron drop-shadow-lg">TAP</span></div>
                    <div id="floating-numbers-container"></div>
                </button>
            </div>
            <div class="px-4 my-4">
                <div class="flex items-center space-x-2 text-yellow-400 mb-1">
                    ${Icons.Bolt}
                    <span class="font-bold">${Math.floor(player.energy)} / ${player.maxEnergy}</span>
                    ${isFrozen ? `<span class="text-xs text-blue-400 ml-2">(Congelado)</span>` : isBurning ? `<span class="text-xs text-orange-400 ml-2">(Drenando)</span>` : ''}
                </div>
                <div class="w-full bg-gray-700 rounded-full h-4 overflow-hidden border-2 border-gray-600"><div class="bg-gradient-to-r from-yellow-500 to-amber-400 h-full rounded-full transition-all duration-300" style="width: ${energyPercentage}%"></div></div>
            </div>
        </div>
    `;
};

window.renderFRIENDSScreen = () => {
    const player = state.gameState.players.find(p => p.id === state.humanPlayerId);
    if (!player) return;
    const container = getEl('screen-FRIENDS');
    const sortedPlayers = [...state.gameState.players].sort((a, b) => b.coins - a.coins);
    
    // Verificar si el jugador actual está congelado o drenando
    const isFrozen = player.isFrozenUntil && player.isFrozenUntil > Date.now();
    const chatDisabledClass = isFrozen ? 'opacity-50 pointer-events-none' : '';

    container.innerHTML = `
        <div class="flex flex-col h-full">
            <h2 class="font-orbitron text-2xl text-center mb-4 text-cyan-300">Ranking de Amigos</h2>
            <div id="player-list" class="flex-grow space-y-2 overflow-y-auto pr-2">
                ${sortedPlayers.map((p, index) => {
                    const rank = index + 1;
                    const isHuman = p.id === state.humanPlayerId;
                    const rankChange = p.previousRank ? p.previousRank - rank : 0;
                    const isPlayerFrozen = p.isFrozenUntil && p.isFrozenUntil > Date.now();
                    const isPlayerBurning = p.isBurningUntil && p.isBurningUntil > Date.now();
                    
                    let rankIndicator = `<span class="text-gray-500 w-8 text-center">-</span>`;
                    if (rankChange > 0) rankIndicator = `<span class="text-green-400 flex items-center justify-center w-8">${Icons.ChevronUp.replace('w-6 h-6', 'w-4 h-4')} ${rankChange}</span>`;
                    else if (rankChange < 0) rankIndicator = `<span class="text-red-400 flex items-center justify-center w-8">${Icons.ChevronDown.replace('w-6 h-6', 'w-4 h-4')} ${Math.abs(rankChange)}</span>`;

                    return `
                        <div class="flex items-center p-2 rounded-lg ${isHuman ? 'bg-cyan-900/50 border border-cyan-700' : 'bg-gray-800/50'}">
                            <div class="w-8 text-center font-bold text-lg">${rank}</div>
                            <div class="flex-grow mx-2">
                                <div class="flex items-center space-x-2">
                                    <p class="font-semibold truncate ${isHuman ? 'text-cyan-300' : 'text-white'}">${p.nickname} ${isHuman ? '(Tú)' : ''}</p>
                                    ${p.hasShield ? Icons.Shield : ''}
                                    ${isPlayerFrozen ? Icons.ZapOff : ''}
                                    ${isPlayerBurning ? Icons.Flame : ''}
                                </div>
                                <p class="text-xs text-gray-400">Nivel ${p.level} - ${p.status}</p>
                            </div>
                            <div class="flex items-center justify-center">${rankIndicator}</div>
                            <div class="text-right font-orbitron w-24 truncate"><p class="text-lg">${Math.floor(p.coins).toLocaleString()}</p></div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="mt-4 border-t border-cyan-800 pt-2 flex-shrink-0 ${chatDisabledClass}">
                <button id="toggle-chat-button" class="w-full flex justify-between items-center text-cyan-400 p-2 rounded-t-lg bg-gray-800/50 hover:bg-gray-700/50">
                    <span>Chat Global</span>
                    <span id="chat-chevron">${state.isChatOpen ? Icons.ChevronDown : Icons.ChevronUp}</span>
                </button>
                <div id="chat-container" class="${state.isChatOpen ? '' : 'hidden'} bg-gray-800/50 p-2 rounded-b-lg">
                    <!-- Contenedor de mensajes del chat con scroll -->
                    <div id="chat-messages" class="h-32 overflow-y-auto mb-2 flex flex-col-reverse border border-gray-700 rounded p-1 bg-black/20">
                        <div class="space-y-2 p-1">
                        ${[...state.gameState.messages].reverse().map(msg => `
                            <div class="text-sm break-words">
                                <span class="font-bold ${msg.playerId === state.humanPlayerId ? 'text-cyan-400' : 'text-yellow-400'}">${msg.nickname}: </span>
                                <span class="text-gray-300">${msg.text}</span>
                            </div>
                        `).join('')}
                        </div>
                    </div>
                    <form id="chat-form" class="flex space-x-2">
                        <input id="chat-input" type="text" placeholder="Escribe un mensaje..." class="flex-grow bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500" ${isFrozen ? 'disabled' : ''}/>
                        <button type="submit" class="bg-cyan-600 p-2 rounded hover:bg-cyan-500 flex-shrink-0" ${isFrozen ? 'disabled' : ''}>${Icons.Send}</button>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    // Función para mantener el scroll en la parte inferior al renderizar nuevos mensajes
    const chatMessagesEl = getEl('chat-messages');
    if (chatMessagesEl) {
        // Aseguramos que el scroll esté al final para ver el último mensaje
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
};

window.renderBOOSTSScreen = () => {
    const player = state.gameState.players.find(p => p.id === state.humanPlayerId);
    if (!player) return;
    const container = getEl('screen-BOOSTS');
    
    // Deshabilitar completamente la compra si está congelado
    const isFrozen = player.isFrozenUntil && player.isFrozenUntil > Date.now();

    const boosts = Object.values(BoostType).map(boostType => {
        const boostDef = BOOST_DEFINITIONS[boostType];
        const level = player.boosts[boostType];
        const cost = boostDef.getCost(level);
        const icon = boostType === BoostType.MULTITAP ? `<div class="w-8 h-8 mr-3 text-cyan-400">${Icons.Send.replace('w-4 h-4', 'w-8 h-8')}</div>` : `<div class="w-8 h-8 mr-3 text-yellow-400">${Icons.Bolt.replace('w-5 h-5', 'w-8 h-8')}</div>`;
        
        const isLoading = state.loadingAction === `boosts_${boostType}`;
        const isDisabled = isFrozen || isLoading || player.coins < cost;
        const buttonContent = isLoading 
            ? `${Icons.Spinner} <span>Mejorando...</span>`
            : `<span>Mejorar</span><span class="text-yellow-300">${Icons.Gem}</span><span>${cost.toLocaleString()}</span>`;

        return `
            <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-700 ${isFrozen ? 'opacity-70' : ''}">
                <div class="flex items-center mb-2">
                    ${icon}
                    <div>
                        <h3 class="font-orbitron text-lg">${boostDef.name}</h3>
                        <p class="text-sm text-gray-300">Nivel ${level}</p>
                    </div>
                </div>
                <p class="text-sm text-gray-400 mb-3">${boostDef.description(level)}</p>
                <button data-boost-type="${boostType}" class="buy-boost-button w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors" ${isDisabled ? 'disabled' : ''}>
                    ${buttonContent}
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div>
            <h2 class="font-orbitron text-2xl text-center mb-4 text-cyan-300">Potenciadores</h2>
            <div class="space-y-4">${boosts}</div>
        </div>
    `;
};

window.renderCARDSScreen = () => {
    const player = state.gameState.players.find(p => p.id === state.humanPlayerId);
    if (!player) return;
    const container = getEl('screen-CARDS');
    
    // Deshabilitar completamente la compra/uso si está congelado
    const isFrozen = player.isFrozenUntil && player.isFrozenUntil > Date.now();
    const frozenClass = isFrozen ? 'opacity-70 pointer-events-none' : '';

    if (state.selectedCardForUse) {
        const card = CARD_DEFINITIONS[state.selectedCardForUse];
        const opponents = state.gameState.players.filter(p => p.id !== state.humanPlayerId);
        container.innerHTML = `
             <div class="p-4 ${frozenClass}">
                <button id="back-to-cards-button" class="mb-4 text-cyan-400 hover:text-cyan-200" ${isFrozen ? 'disabled' : ''}>← Volver a Cartas</button>
                <h3 class="font-orbitron text-xl text-center mb-2">Usar "${card.name}"</h3>
                <p class="text-center text-sm text-gray-400 mb-4">Selecciona un objetivo:</p>
                <div class="space-y-2">
                    ${opponents.map(p => {
                        const loadingKey = `use_card_${p.id}`;
                        const isLoading = state.loadingAction === loadingKey;
                        const isDisabled = isFrozen || isLoading;
                        const buttonContent = isLoading 
                            ? `${Icons.Spinner} <span>Usando...</span>`
                            : `<p class="font-bold">${p.nickname}</p><p class="text-xs text-gray-400">Nivel: ${p.level} | Monedas: ${p.coins.toLocaleString()}</p>`;

                        return `
                            <button data-target-id="${p.id}" class="use-card-button w-full text-left p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 flex justify-between items-center" ${isDisabled ? 'disabled' : ''}>
                                ${buttonContent}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        return;
    }

    const cardsHtml = Object.values(CARD_DEFINITIONS).map(card => {
        const canAfford = player.coins >= card.cost;
        const cardCount = player.cards.filter(c => c === card.id).length;
        const canUse = card.isSingleUse && cardCount > 0;
        const isPassiveAndOwned = !card.isSingleUse && cardCount > 0;
        
        const isLoading = state.loadingAction === `cards_${card.id}`;
        const canBuy = canAfford && !isPassiveAndOwned && !isFrozen && !isLoading;
        const canUseNow = canUse && !isFrozen;

        const buyButtonContent = isLoading
            ? `${Icons.Spinner} <span>Comprando...</span>`
            : `<span>${isPassiveAndOwned ? 'Comprado' : 'Comprar'}</span>
               ${!isPassiveAndOwned ? `<span class="text-yellow-300">${Icons.Gem}</span><span>${card.cost.toLocaleString()}</span>` : ''}`;

        return `
            <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-700 ${isFrozen ? 'opacity-70' : ''}">
                <h3 class="font-orbitron text-lg">${card.name} ${cardCount > 0 ? `(x${cardCount})` : ''}</h3>
                <p class="text-sm text-gray-400 mb-3 h-10">${card.description}</p>
                <div class="flex space-x-2">
                    <button data-card-type="${card.id}" class="buy-card-button w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors" ${!canBuy ? 'disabled' : ''}>
                        ${buyButtonContent}
                    </button>
                    ${canUse ? `<button data-card-type-use="${card.id}" class="select-card-for-use-button w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 px-4 rounded-lg" ${!canUseNow ? 'disabled' : ''}>Usar</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div>
            <h2 class="font-orbitron text-2xl text-center mb-4 text-cyan-300">Tienda de Cartas</h2>
            <div class="space-y-4">${cardsHtml}</div>
        </div>
    `;
};

window.renderAUCTIONSScreen = () => {
    const player = state.gameState.players.find(p => p.id === state.humanPlayerId);
    const auction = state.gameState.auction || {};
    const arcaComun = state.gameState.arcaComun || 0;
    
    // Si no hay subasta, mostrar mensaje
    if (!auction.id) {
         getEl('screen-AUCTIONS').innerHTML = `
             <div class="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <h2 class="font-orbitron text-2xl mt-4">Remates (Arca Común)</h2>
                <p class="mt-2">La próxima subasta del Arca Común comenzará pronto.</p>
                <p>Pozo Actual: ${arcaComun.toLocaleString()}</p>
             </div>
         `;
         return;
    }
    
    const arcaComunCoinsEl = getEl('arca-comun-coins');
    if (arcaComunCoinsEl) arcaComunCoinsEl.textContent = arcaComun.toLocaleString();

    const auctionTimerEl = getEl('auction-timer');
    const auctionPotEl = getEl('auction-pot');
    const auctionBidEl = getEl('auction-bid');
    const auctionLeaderEl = getEl('auction-leader');
    const minBidDisplayEl = getEl('min-bid-display');
    const bidButton = getEl('bid-button');

    const remainingTime = formatTimeRemaining(auction.endTime);
    const currentHighestBid = auction.currentHighestBid || 0;
    const minBid = currentHighestBid + 100;
    const isLeading = auction.highestBidderId === player.id;
    const leaderNickname = isLeading ? 'Tú' : auction.highestBidderId;
    
    // Actualizar elementos
    if (auctionTimerEl) auctionTimerEl.textContent = remainingTime;
    if (auctionPotEl) auctionPotEl.textContent = auction.potCoins ? auction.potCoins.toLocaleString() : '0';
    if (auctionBidEl) auctionBidEl.textContent = currentHighestBid.toLocaleString();
    if (auctionLeaderEl) auctionLeaderEl.textContent = leaderNickname;
    if (minBidDisplayEl) minBidDisplayEl.textContent = minBid.toLocaleString();

    // Lógica del botón de puja
    const isFrozen = player.isFrozenUntil && player.isFrozenUntil > Date.now();
    const isLoading = state.loadingAction === 'bid_auction';
    const canBid = player.coins >= minBid && !isFrozen && !isLoading;
    
    bidButton.innerHTML = isLoading 
        ? `${Icons.Spinner.replace('w-5 h-5', 'w-4 h-4')} <span>Pujando...</span>`
        : `<span>Pujar</span>`;
    bidButton.disabled = !canBid;
    
    // Si el tiempo terminó, forzar actualización para ver resultados
    if (remainingTime === '00:00:00' && !isLoading) {
        // En un juego real, esto dispararía el fin de subasta y la carga del ganador.
        // Aquí forzamos una recarga para limpiar la subasta simulada.
         loadGameState(state.humanPlayerId);
    }
};

// --- ACTION DISPATCHER & GAME LOGIC ---
async function dispatch(type, payload) {
    const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
    
    // Simular regeneración de energía durante el FREEZE
    if (type === 'TAP' && player && player.isFrozenUntil && player.isFrozenUntil > Date.now()) {
        playSound(BLOCKED_SOUND); 
        return;
    }
    
    // Lógica para TAP (optimista, permite la animación de pérdida si está ardiendo)
    if (type === 'TAP') {
        const isFrozen = player && player.isFrozenUntil && player.isFrozenUntil > Date.now();

        if (player && player.energy > 0 && !isFrozen) {
            // El drenaje por quemadura se maneja en el backend durante SYNC_TAPS o BACKGROUND_SYNC
            player.coins += player.boosts.MULTITAP;
            player.energy -= 1;
            state.pendingTaps += 1;

            if (state.syncTimeoutId) clearTimeout(state.syncTimeoutId);

            if (state.pendingTaps >= TAP_SYNC_THRESHOLD) {
                syncTaps();
            } else {
                state.syncTimeoutId = setTimeout(syncTaps, TAP_SYNC_DEBOUNCE_MS);
            }
            // Optimistic UI update
            render(); 
        } else if (player && player.energy <= 0) {
            playSound(ENERGY_EMPTY_SOUND);
        }
        return;
    }
    
    // Para otras acciones (Boosts, Cards, Chat), verificar el congelamiento
    const isFrozen = player && player.isFrozenUntil && player.isFrozenUntil > Date.now();
    if (isFrozen && type !== 'SYNC_TAPS' && type !== 'FREEZE_BAILOUT') {
        // Bloqueamos cualquier acción no-TAP/SYNC/BAILOUT si está congelado.
        playSound(BLOCKED_SOUND);
        return;
    }
    
    // For other actions, sync taps first, then dispatch the new action.
    await syncTaps();

    try {
        const newState = await gameApi.dispatchAction(state.humanPlayerId, type, payload);
        
        // Simulación de FREEZE_BAILOUT (para UI instantánea)
        if (type === 'FREEZE_BAILOUT' && player) {
             if (player.coins >= FREEZE_BAILOUT_COST) {
                 // Esto es manejo optimista, el backend ya lo hizo
                 player.coins -= FREEZE_BAILOUT_COST;
                 player.isFrozenUntil = 0; 
             } else {
                 throw new Error("No tienes suficientes monedas para el rescate.");
             }
        }
        
        // Simulación de BID_AUCTION (para UI instantánea)
        if (type === 'BID_AUCTION' && state.gameState.auction && player) {
             const bidAmount = payload.bidAmount;
             // Validación básica para la simulación
             const minBid = state.gameState.auction.currentHighestBid + 100;
             if (bidAmount >= minBid && bidAmount <= player.coins) {
                 // Esto es manejo optimista. El backend tiene la verdad.
                 // NOTA: El backend solo deduce la diferencia si es una nueva puja, pero el cliente siempre deduce el monto total, lo cual es más seguro para el UX.
                 player.coins -= bidAmount;
                 state.gameState.auction.currentHighestBid = bidAmount;
                 state.gameState.auction.highestBidderId = player.id;
             }
        }


        updateState({ gameState: newState, error: null }); 
    } catch (e) {
        updateState({ error: e.message, loadingAction: null });
        loadGameState(state.humanPlayerId);
    }
}

async function syncTaps() {
    if (state.pendingTaps === 0 || !state.humanPlayerId) return;

    const tapsToSync = state.pendingTaps;
    state.pendingTaps = 0;
    if (state.syncTimeoutId) clearTimeout(state.syncTimeoutId);

    try {
        const newState = await gameApi.dispatchAction(state.humanPlayerId, 'SYNC_TAPS', { tapCount: tapsToSync });
        updateState({ gameState: newState, error: null });
    } catch (e) {
        updateState({ error: e.message });
        loadGameState(state.humanPlayerId);
    }
}

async function registerPlayer(nickname) {
    updateState({ isLoading: true, error: null });
    try {
        const { newPlayerId } = await gameApi.registerPlayer(nickname);
        localStorage.setItem(PLAYER_ID_KEY, newPlayerId);
        updateState({ humanPlayerId: newPlayerId, isLoading: false });
        initGameSession();
    } catch (e) {
        updateState({ error: e.message, isLoading: false });
    }
}

async function loadGameState(playerId) {
    updateState({ isLoading: true, error: null });
    try {
        let initialState = await gameApi.getGameState(playerId);
        
        // ** SIMULACIÓN DE DATOS INICIALES (Requerida si el backend no proporciona todo) **
        if (!initialState || !initialState.players || !initialState.messages) {
             const baseState = initialState || {};
             const simPlayerId = state.humanPlayerId || 'player-sim-001';
             
             // --- Simulación de Datos de Jugadores ---
             baseState.players = baseState.players || [{
                id: simPlayerId,
                nickname: 'SimPlayer',
                level: 1,
                status: 'online',
                coins: 50000,
                dailyGain: 0,
                maxDailyGain: 20,
                energy: 500,
                maxEnergy: 1000,
                boosts: { MULTITAP: 5, ENERGY_LIMIT: 1 },
                cards: [CardType.FREEZE, CardType.FLAME, CardType.SHIELD],
                isFrozenUntil: 0, 
                isBurningUntil: 0, 
                hasShield: false,
                isBot: false,
                previousRank: 0,
                lastOnline: Date.now(),
             },
             {
                id: 'player-victim-002',
                nickname: 'VictimBot',
                level: 1,
                status: 'online',
                coins: 100000,
                energy: 1000,
                maxEnergy: 1000,
                boosts: { MULTITAP: 1, ENERGY_LIMIT: 1 },
                cards: [],
                isFrozenUntil: 0,
                isBurningUntil: 0, 
                hasShield: false,
                isBot: true,
                previousRank: 1,
                dailyGain: 0,
                maxDailyGain: 20,
                lastOnline: Date.now(),
             }
             ]; 
             baseState.messages = baseState.messages || [];
             
             // --- Simulación de ArcaComun y Subasta ---
             baseState.arcaComun = baseState.arcaComun || 50000;
             baseState.auction = baseState.auction || {
                 id: 'daily_auction_20251016',
                 period: 'Diario',
                 endTime: Date.now() + (12 * 60 * 60 * 1000), // 12 horas desde el inicio
                 potCoins: 45000,
                 systemFee: 5000,
                 currentHighestBid: 15000,
                 highestBidderId: 'player-victim-002',
             };
             
             initialState = baseState;
        }

        updateState({ gameState: initialState, isLoading: false });
    } catch (e) {
        updateState({ error: e.message, isLoading: false });
    }
}

// Simulación de Regeneración de Energía
function regenerateEnergy(player) {
    if (!player) return;
    const REGEN_RATE = 10; // Energía por segundo (simulación)
    // Regenerar si la energía no está al máximo
    if (player.energy < player.maxEnergy) {
        // Asumiendo que BACKGROUND_SYNC_INTERVAL_MS es 5000ms (5s)
        player.energy = Math.min(player.maxEnergy, player.energy + (REGEN_RATE * (BACKGROUND_SYNC_INTERVAL_MS / 1000)));
    }
}


function initGameSession() {
    if (state.humanPlayerId) {
        loadGameState(state.humanPlayerId);
        if (state.backgroundSyncIntervalId) clearInterval(state.backgroundSyncIntervalId);
        state.backgroundSyncIntervalId = setInterval(() => {
            if (document.hidden) return;
            
            // Simulación de regeneración de energía en el cliente (para efectos visuales)
            const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
            if (player) {
                // Permitimos regeneración incluso si está congelado (Fairplay)
                regenerateEnergy(player);
            }
            
            gameApi.getGameState(state.humanPlayerId).then(gs => {
                // Mantener simulación de jugadores si el backend no los envía
                if (state.gameState && !gs.players) {
                     gs.players = state.gameState.players;
                     gs.messages = state.gameState.messages;
                     gs.arcaComun = state.gameState.arcaComun;
                     gs.auction = state.gameState.auction;
                }
                updateState({gameState: gs})
            }).catch(console.warn);
        }, BACKGROUND_SYNC_INTERVAL_MS);
    }
    render();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Registration
    const regForm = getEl('registration-form');
    regForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nickname = getEl('nickname-input').value.trim();
        if (nickname.length >= 3) {
            registerPlayer(nickname);
        }
    });

    // Navigation
    const nav = getEl('app-nav');
    nav.addEventListener('click', (e) => {
        const button = e.target.closest('.nav-button');
        if (button && !button.disabled) { // Añadir verificación de deshabilitado
            const page = button.dataset.page;
            playSound(NAV_SOUND);
            // Al cambiar de página, aseguramos que el chat se cierre por defecto
            updateState({ activePage: page, selectedCardForUse: null, isChatOpen: false });
        } else if (button && button.disabled) {
             playSound(BLOCKED_SOUND);
        }
    });
    
    // Nuevo listener en el overlay para el sonido de bloqueo al intentar interactuar
    const freezeOverlay = getEl('freeze-overlay');
    // NOTE: El botón de Rescate ya maneja su propio listener en renderFreezeOverlay,
    // pero este evita el sonido si el clic fue en el botón.
    freezeOverlay.addEventListener('click', (e) => {
        // Reproduce el sonido de bloqueo en cualquier tap sobre el overlay, 
        // excepto si el clic fue en el botón de rescate (bailout button)
        if (!e.target.closest('#freeze-bailout-button')) {
            playSound(BLOCKED_SOUND);
        }
    });


    // Main content area delegation for dynamic elements
    const mainContent = document.querySelector('main');
    mainContent.addEventListener('click', async (e) => {
        const target = e.target;
        const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
        const isFrozen = player && player.isFrozenUntil && player.isFrozenUntil > Date.now();
        
        // Home screen tap
        const tapButton = target.closest('#tap-button');
        if (tapButton) {
            if (!isFrozen && player && player.energy > 0) {
                 playSound(TAP_SOUND);
                 const tapValue = player.boosts.MULTITAP;
                 dispatch('TAP', {});
                
                 /* --- IMPLEMENTACIÓN DE LÓGICA DE ANIMACIÓN DEL USUARIO --- */
                 const plus = document.createElement("div");
                 plus.classList.add("floating-text");
                 plus.textContent = `+${tapValue}`; // Usamos el valor real del boost

                 // Posición donde hiciste click (coordenadas absolutas de la página)
                 plus.style.left = e.pageX + "px";
                 plus.style.top = e.pageY + "px";

                 // Añadir al body
                 document.body.appendChild(plus);

                 // Eliminar después de la animación
                 setTimeout(() => plus.remove(), 800); 
                 /* --- FIN IMPLEMENTACIÓN DE LÓGICA DE ANIMACIÓN DEL USUARIO --- */
            } else if (isFrozen) {
                playSound(BLOCKED_SOUND);
            } else {
                // Si no tiene energía, el dispatch ya reprodujo el ENERGY_EMPTY_SOUND.
            }
            return;
        }

        // Friends screen chat toggle
        if (target.closest('#toggle-chat-button')) {
            if (isFrozen) {
                 playSound(BLOCKED_SOUND);
                 return;
            }
            updateState({ isChatOpen: !state.isChatOpen });
            return;
        }
        
        // Boosts screen: Clic en "Mejorar"
        const buyBoostButton = target.closest('.buy-boost-button');
        if (buyBoostButton && !buyBoostButton.disabled) {
            const boostType = buyBoostButton.dataset.boostType;
            updateState({ loadingAction: `boosts_${boostType}` });
            
            try {
                await dispatch('BUY_BOOST', { boostType: boostType });
            } catch (error) {
                // El catch en dispatch ya limpia loadingAction.
            }
            return;
        }

        // Cards screen: Clic en "Comprar"
        const buyCardButton = target.closest('.buy-card-button');
        if (buyCardButton && !buyCardButton.disabled) {
            const cardType = buyCardButton.dataset.cardType;
            updateState({ loadingAction: `cards_${cardType}` });
            
            try {
                await dispatch('BUY_CARD', { cardType: cardType });
            } catch (error) {
                // El catch en dispatch ya limpia loadingAction.
            }
            return;
        }

        // Cards screen: Clic en "Usar" (Selección de carta)
        const selectCardButton = target.closest('.select-card-for-use-button');
        if (selectCardButton && !selectCardButton.disabled) {
            updateState({ selectedCardForUse: selectCardButton.dataset.cardTypeUse });
            return;
        }
        
        // Cards screen: Clic en "Volver a Cartas"
        if (target.closest('#back-to-cards-button')) {
            updateState({ selectedCardForUse: null });
            return;
        }
        
        // Cards screen: Clic en Oponente (Uso final de la carta)
        const useCardButton = target.closest('.use-card-button');
        if (useCardButton && !useCardButton.disabled) {
            const targetId = useCardButton.dataset.targetId;
            const loadingKey = `use_card_${targetId}`;

            updateState({ loadingAction: loadingKey });

            try {
                await dispatch('USE_CARD', { 
                    cardType: state.selectedCardForUse, 
                    targetId: targetId
                });
                
            } catch (error) {
                console.error("Error al usar la carta:", error);
            } finally {
                updateState({ selectedCardForUse: null }); 
            }
            return;
        }
        
    });
    
    // Form submissions
    mainContent.addEventListener('submit', async (e) => {
        if (e.target.id === 'chat-form') {
            e.preventDefault();
            const input = getEl('chat-input');
            const text = input.value.trim();
            const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
            const isFrozen = player && player.isFrozenUntil && player.isFrozenUntil > Date.now();
            
            if (isFrozen) {
                playSound(BLOCKED_SOUND);
                return;
            }
            
            if(text) {
                dispatch('SEND_MESSAGE', { text });
                input.value = '';
            }
        }
        
        if (e.target.id === 'auction-bid-form') {
            e.preventDefault();
            const bidInput = getEl('bid-input');
            const bidErrorEl = getEl('bid-error');
            const bidAmount = parseInt(bidInput.value, 10);
            
            // Ocultar errores previos
            bidErrorEl.classList.add('hidden');
            
            const player = state.gameState?.players?.find(p => p.id === state.humanPlayerId);
            const auction = state.gameState?.auction;

            // Verificación para evitar fallos si el estado no está cargado.
            if (!player || !auction) return;
            
            const minBid = auction.currentHighestBid + 100;
            
            if (bidAmount < minBid) {
                bidErrorEl.textContent = `La puja debe ser al menos ${minBid.toLocaleString()} monedas.`;
                bidErrorEl.classList.remove('hidden');
                return;
            }
            if (bidAmount > player.coins) {
                 bidErrorEl.textContent = `No tienes suficientes monedas para esta puja.`;
                bidErrorEl.classList.remove('hidden');
                return;
            }

            // 1. Mostrar Loader
            updateState({ loadingAction: 'bid_auction' });
            
            try {
                // 2. Despachar la acción de puja
                await dispatch('BID_AUCTION', { 
                    auctionId: auction.id, 
                    bidAmount: bidAmount 
                });
            } catch (e) {
                // El error ya se maneja en dispatch
            } finally {
                // El render final limpia el loader
            }
        }
    });


    window.addEventListener('beforeunload', () => {
        if (state.pendingTaps > 0) syncTaps();
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initGameSession();
    setupEventListeners();
});
