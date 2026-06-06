/**
 * Trust Nobody - Frontend Client Handler
 */

// Initialize Socket.io connection
const socket = io();

// Local player state
let myName = '';
let selectedAvatar = '';
let currentRole = '';
let currentMissionText = '';
let currentRoomCode = '';
let currentPlayers = [];
let lastPlayersLength = 0;
let onboardingCountdownInterval = null;
let currentEvent = null;        // Random event for this round
let eventBannerInterval = null; // Countdown interval for event banner


// Onboarding page state
let currentManualPage = 1;
const maxManualPages = 3;

// --- Web Audio Retro Sound Synth Engine ---
class RetroSound {
    static init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    static playTone(freq, type, duration, delay = 0) {
        try {
            this.init();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type; // 'square', 'sawtooth', 'triangle', 'sine'
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
            
            gain.gain.setValueAtTime(0.05, this.ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + delay + duration);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(this.ctx.currentTime + delay);
            osc.stop(this.ctx.currentTime + delay + duration);
        } catch (e) {
            console.warn('Audio Context error: ', e);
        }
    }

    static playClick() {
        this.playTone(523.25, 'square', 0.08); // C5
    }

    static playHover() {
        this.playTone(783.99, 'sine', 0.02); // G5
    }

    static playJoin() {
        this.playTone(293.66, 'square', 0.1); // D4
        this.playTone(587.33, 'square', 0.12, 0.08); // D5
    }

    static playStart() {
        // C Major triad fast arpeggio
        this.playTone(261.63, 'square', 0.12); // C4
        this.playTone(329.63, 'square', 0.12, 0.08); // E4
        this.playTone(392.00, 'square', 0.12, 0.16); // G4
        this.playTone(523.25, 'square', 0.25, 0.24); // C5
    }

    static playReveal(isAgent) {
        if (isAgent) {
            // Uplifting melody
            this.playTone(392.00, 'triangle', 0.15); // G4
            this.playTone(523.25, 'triangle', 0.15, 0.1); // C5
            this.playTone(659.25, 'triangle', 0.15, 0.2); // E5
            this.playTone(783.99, 'triangle', 0.35, 0.3); // G5
        } else {
            // Suspenseful / mysterious descending alarm
            this.playTone(220.00, 'sawtooth', 0.2); // A3
            this.playTone(207.65, 'sawtooth', 0.2, 0.15); // G#3
            this.playTone(196.00, 'sawtooth', 0.35, 0.3); // G3
        }
    }

    static playWarning() {
        this.playTone(880.00, 'square', 0.15); // A5 high beep
    }

    static playVote() {
        this.playTone(392.00, 'triangle', 0.06); // G4
    }

    static playVictory() {
        // Classic victory fanfare
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
            this.playTone(f, 'square', 0.15, i * 0.12);
        });
        this.playTone(1046.50, 'square', 0.5, 0.48);
    }

    static playDefeat() {
        // Dramatic explosion boom sound
        this.playTone(120.00, 'sawtooth', 0.4);
        this.playTone(80.00, 'sawtooth', 0.7, 0.15);
    }
}

// Ambient Music disabled to keep simplified focus

// Global click & hover sound interceptors
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.matches('button, .btn, .vote-btn, .avatar-select-btn, .reaction-btn, select, input')) {
        RetroSound.playClick();
    }
});
document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (target.matches('button, .btn, .vote-btn, .avatar-select-btn, .reaction-btn, select')) {
        RetroSound.playHover();
    }
});

function logToTerminal(text) {
    console.log(`[Trust Nobody] ${text}`);
}

// DOM Selection - Screens
const homeScreen = document.getElementById('home-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const onboardingScreen = document.getElementById('onboarding-screen');
const gameplayScreen = document.getElementById('gameplay-screen');
const votingScreen = document.getElementById('voting-screen');
const resultsScreen = document.getElementById('results-screen');

// DOM Selection - Home Page Form Elements
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const errorDisplay = document.getElementById('error-display');

// DOM Selection - Onboarding Elements
const readyBtn = document.getElementById('ready-btn');
const readyStatusText = document.getElementById('ready-status-text');
const onboardingTimeoutVal = document.getElementById('onboarding-timeout-val');

// DOM Selection - Lobby Settings Elements
const lobbyTimerSelect = document.getElementById('lobby-timer-select');
const lobbyTimerVal = document.getElementById('lobby-timer-val');

// DOM Selection - Lobby Elements
const roomCodeDisplay = document.getElementById('room-code-display');
const playerCountDisplay = document.getElementById('player-count');
const playersListContainer = document.getElementById('players-list');
const lobbyStatusMsg = document.getElementById('lobby-status-msg');
const startGameBtn = document.getElementById('start-game-btn');

// DOM Selection - Gameplay Elements
const gameRoomCodeDisplay = document.getElementById('game-room-code');
const gameTimerDisplay = document.getElementById('game-timer');
const roleDisplay = document.getElementById('role-display');
const roleInstruction = document.getElementById('role-instruction');
const gameplayMissionBox = document.getElementById('gameplay-mission-box');
const gameplayMissionText = document.getElementById('gameplay-mission-text');
const gamePlayersListContainer = document.getElementById('game-players-list');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');

// DOM Selection - Voting Elements
const votingGrid = document.getElementById('voting-grid');
const votingProgress = document.getElementById('voting-progress');
const skipVoteBtn = document.getElementById('skip-vote-btn');
const voteLockMsg = document.getElementById('vote-lock-msg');

// DOM Selection - Results Elements
const outcomeBanner = document.getElementById('outcome-banner');
const resultsHiddenAgentName = document.getElementById('results-hidden-agent-name');
const resultsMissionStatus = document.getElementById('results-mission-status');
const resultsMissionText = document.getElementById('results-mission-text');
const votesBreakdownList = document.getElementById('votes-breakdown-list');
const playAgainBtn = document.getElementById('play-again-btn');
const playAgainStatus = document.getElementById('play-again-status');

// Avatar collection with descriptive RPG/indie metadata names
const AVATAR_METADATA = [
    { char: '🧙', name: 'WIZARD' },
    { char: '🥷', name: 'NINJA' },
    { char: '🏴‍☠️', name: 'PIRATE' },
    { char: '🤖', name: 'ROBOT' },
    { char: '👽', name: 'ALIEN' },
    { char: '🐸', name: 'FROG' },
    { char: '🐼', name: 'PANDA' },
    { char: '🦊', name: 'FOX' },
    { char: '👻', name: 'GHOST' },
    { char: '🕵️', name: 'DETECTIVE' },
    { char: '🐱', name: 'CAT' },
    { char: '🐧', name: 'PENGUIN' },
    { char: '🐙', name: 'OCTOPUS' },
    { char: '🦈', name: 'SHARK' },
    { char: '🦝', name: 'RACCOON' },
    { char: '🐵', name: 'MONKEY' },
    { char: '🦄', name: 'UNICORN' },
    { char: '👑', name: 'KING' },
    { char: '🧟', name: 'ZOMBIE' },
    { char: '👨‍🚀', name: 'EXPLORER' }
];

const AVATARS = AVATAR_METADATA.map(a => a.char);

// Render avatar as a high-quality pixel card for the 4 mascots, or framed emoji cards
function getAvatarHTML(char, className = '') {
    const mapped = AVATAR_METADATA.find(a => a.char === char);
    if (mapped && ['🐱', '🤖', '🐸', '👻'].includes(char)) {
        let src = '';
        if (char === '🐱') src = '/assets/avatars/detective_cat.png';
        if (char === '🤖') src = '/assets/avatars/robot_agent.png';
        if (char === '🐸') src = '/assets/avatars/chaos_frog.png';
        if (char === '👻') src = '/assets/avatars/ghost_spy.png';
        return `<img src="${src}" class="mascot-img-card ${className}" alt="${mapped.name}">`;
    }
    return `<div class="emoji-avatar-frame ${className}"><span>${char || '🕵️'}</span></div>`;
}

// --- Helper Functions ---

// Switch active view screens
function showScreen(screenToShow) {
    homeScreen.classList.remove('active');
    lobbyScreen.classList.remove('active');
    onboardingScreen.classList.remove('active');
    gameplayScreen.classList.remove('active');
    votingScreen.classList.remove('active');
    resultsScreen.classList.remove('active');

    setTimeout(() => {
        screenToShow.classList.add('active');
    }, 50);
}

// Display error messages
function showError(message) {
    if (message) {
        errorDisplay.innerText = message;
        errorDisplay.style.display = 'block';
    } else {
        errorDisplay.style.display = 'none';
    }
}

// Render player list cards into the lobby grid
function renderLobbyPlayers(players) {
    playersListContainer.innerHTML = '';
    
    // Play join sound when player list grows
    if (players.length > lastPlayersLength && lastPlayersLength !== 0) {
        RetroSound.playJoin();
        logToTerminal(`A new node player connected to the local cluster.`);
    }
    lastPlayersLength = players.length;
    
    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';

        const nameText = document.createElement('span');
        nameText.className = 'player-name-text';
        nameText.innerHTML = `${getAvatarHTML(player.avatar, 'lobby-avatar')} <span class="card-name-label">${player.name}</span>`;
        card.appendChild(nameText);

        if (player.isHost) {
            const hostBadge = document.createElement('span');
            hostBadge.className = 'host-badge';
            hostBadge.textContent = '👑 HOST';
            card.appendChild(hostBadge);
        }

        playersListContainer.appendChild(card);
    });

    playerCountDisplay.textContent = players.length;

    const myPlayer = players.find(p => p.id === socket.id);
    const hostControl = document.getElementById('host-timer-control');
    const clientDisplay = document.getElementById('client-timer-display');

    if (myPlayer && myPlayer.isHost) {
        startGameBtn.style.display = 'block';
        lobbyStatusMsg.textContent = 'You are the host. Click Start Game when ready!';
        if (hostControl) hostControl.style.display = 'block';
        if (clientDisplay) clientDisplay.style.display = 'none';
    } else {
        startGameBtn.style.display = 'none';
        lobbyStatusMsg.textContent = 'Waiting for host to start the game...';
        if (hostControl) hostControl.style.display = 'none';
        if (clientDisplay) clientDisplay.style.display = 'block';
    }
    
    // Update local avatar choice if auto-resolved by server to prevent conflicts
    if (myPlayer && myPlayer.avatar) {
        selectedAvatar = myPlayer.avatar;
    }
}

// Render player list items inside the gameplay sidebar
function renderGameplayPlayers(players) {
    gamePlayersListContainer.innerHTML = '';

    players.forEach(player => {
        const li = document.createElement('li');
        
        const nameText = document.createElement('span');
        nameText.className = 'sidebar-player-item';
        nameText.innerHTML = `${getAvatarHTML(player.avatar, 'sidebar-avatar')} <span class="sidebar-name-label">${player.name}</span>`;
        li.appendChild(nameText);

        if (player.isHost) {
            const hostIndicator = document.createElement('span');
            hostIndicator.style.color = '#ef4444';
            hostIndicator.textContent = ' 👑';
            li.appendChild(hostIndicator);
        }

        gamePlayersListContainer.appendChild(li);
    });
}

// Format seconds into MM:SS display format
function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Append a new chat message bubble
function appendChatMessage({ sender, text, isSystem }) {
    const bubble = document.createElement('div');
    
    if (isSystem) {
        bubble.className = 'message-bubble system-msg';
        bubble.innerHTML = `<span>${text}</span>`;
    } else {
        bubble.className = 'message-bubble';
        
        if (sender.toLowerCase() === myName.toLowerCase()) {
            bubble.classList.add('self');
        } else {
            bubble.classList.add('other');
        }

        const senderTag = document.createElement('span');
        senderTag.className = 'message-sender';
        
        // Find avatar image in players cache
        const pObj = currentPlayers.find(p => p.name.toLowerCase() === sender.toLowerCase());
        const avHTML = pObj ? getAvatarHTML(pObj.avatar, 'chat-avatar') : '';
        senderTag.innerHTML = `${avHTML} <span class="chat-sender-name">${sender}</span>`;
        bubble.appendChild(senderTag);

        const textSpan = document.createElement('span');
        textSpan.className = 'chat-message-content';
        textSpan.textContent = text;
        bubble.appendChild(textSpan);

        const reactionContainer = document.createElement('div');
        reactionContainer.className = 'reaction-container';

        const emojis = ['🤫', '😂', '🤨', '💀'];
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'reaction-btn';
            btn.type = 'button';
            btn.innerHTML = `<span class="emoji">${emoji}</span><span class="reaction-count">0</span>`;
            
            let count = 0;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                count++;
                btn.querySelector('.reaction-count').textContent = count;
                spawnFloatingEmoji(emoji, e.clientX, e.clientY);
                RetroSound.playClick();
            });
            reactionContainer.appendChild(btn);
        });

        bubble.appendChild(reactionContainer);
    }

    chatMessagesContainer.appendChild(bubble);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Spawns a floating emoji micro-particle at absolute viewport coordinates
function spawnFloatingEmoji(emoji, x, y) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);

    setTimeout(() => {
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }, 1000);
}

// Spawns a success toast layout on screen
function showSuccessToast(message) {
    let toast = document.querySelector('.success-toast');
    if (toast) toast.remove();

    toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.innerHTML = `<span>🎉</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3500);
}

// Onboarding booklet page controls
function showManualPage(page) {
    currentManualPage = page;
    for (let i = 1; i <= maxManualPages; i++) {
        const pgEl = document.getElementById(`onboarding-page-${i}`);
        if (pgEl) {
            pgEl.style.display = (i === page) ? 'block' : 'none';
        }
    }
    document.getElementById('manual-page-indicator').textContent = `${page} / ${maxManualPages}`;
    document.getElementById('manual-prev-btn').disabled = (page === 1);
    document.getElementById('manual-next-btn').disabled = (page === maxManualPages);
}



// Retro particle confetti burst on results screen
function spawnConfetti() {
    const symbols = ['⭐', '✨', '💖', '🎉', '🟩', '🟦', '🟥'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'retro-confetti';
            el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            el.style.left = `${Math.random() * 100}vw`;
            el.style.top = `-20px`;
            el.style.fontSize = `${Math.floor(Math.random() * 15) + 12}px`;
            document.body.appendChild(el);
            
            const duration = Math.random() * 2000 + 1500;
            const drift = (Math.random() - 0.5) * 200;
            
            el.animate([
                { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                { transform: `translateY(105vh) translateX(${drift}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
            ], {
                duration: duration,
                easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
            });
            
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, duration + 100);
        }, i * 40);
    }
}

// --- 1. Client Click Actions ---

// Create Room Action
createRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name === '') {
        showError('Please enter a username before creating a room.');
        return;
    }
    showError(null);
    myName = name;
    socket.emit('create-room', { playerName: name, avatar: selectedAvatar });
});

// Join Room Action
joinRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();

    if (name === '') {
        showError('Please enter a username before joining.');
        return;
    }
    if (code === '') {
        showError('Please enter a valid 4-character room code.');
        return;
    }
    showError(null);
    myName = name;
    socket.emit('join-room', { playerName: name, roomCode: code, avatar: selectedAvatar });
});

// Start Game Trigger (Host Click)
startGameBtn.addEventListener('click', () => {
    socket.emit('start-game');
});

// Send Chat Message Action
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text === '') return;

    socket.emit('send-message', text);
    chatInput.value = '';
    chatInput.focus();
});

// Chat typing transmission logic
let lastTypingTime = 0;
chatInput.addEventListener('input', () => {
    const now = Date.now();
    if (now - lastTypingTime > 1500) {
        socket.emit('typing');
        lastTypingTime = now;
    }
});

// --- 2. Socket Server Listeners ---

// Update synchronized timer visuals in the lobby
function updateLobbyTimerUI(timerSetting) {
    const val = timerSetting || 180;
    if (lobbyTimerSelect) {
        lobbyTimerSelect.value = val;
    }
    if (lobbyTimerVal) {
        const text = val === 120 ? '2 Minutes (120s)' : val === 240 ? '4 Minutes (240s)' : val === 300 ? '5 Minutes (300s)' : '3 Minutes (180s)';
        lobbyTimerVal.textContent = text;
    }
}

// Handle Room Created successfully
socket.on('room-created', ({ roomCode, players, timerSetting }) => {
    roomCodeDisplay.textContent = roomCode;
    updateLobbyTimerUI(timerSetting);
    renderLobbyPlayers(players);
    showScreen(lobbyScreen);
    logToTerminal(`Room cluster created. Code ID: ${roomCode}`);
});

// Handle updates to the Room State (new player joins/leaves)
socket.on('room-state', ({ roomCode, players, timerSetting }) => {
    document.body.classList.remove('hidden-agent-theme');
    document.body.classList.remove('critical-timer');
    const toast = document.querySelector('.success-toast');
    if (toast) toast.remove();

    roomCodeDisplay.textContent = roomCode;
    updateLobbyTimerUI(timerSetting);
    renderLobbyPlayers(players);
    showScreen(lobbyScreen);
});

// Handle Server-Side Validation Errors
socket.on('error-msg', (message) => {
    showError(message);
});

// Handle Game Start event (Transitions to How To Play onboarding screen first)
socket.on('game-started', ({ role, missionText, roomCode, players, timerSetting, currentEvent: evt }) => {
    currentRole = role;
    currentMissionText = missionText;
    currentRoomCode = roomCode;
    currentPlayers = players;
    currentEvent = evt || null;  // Store event for use when round begins

    // Reset onboarding visuals
    readyBtn.disabled = false;
    readyBtn.classList.remove('selected');
    readyBtn.textContent = 'I AM READY';

    document.body.classList.remove('critical-timer');

    // Display first instruction manual page
    showManualPage(1);

    // Show onboarding screen
    showScreen(onboardingScreen);

    // Play startup arpeggio sound
    RetroSound.playStart();
    logToTerminal(`Game cycle started. Loading local manuals.`);

    // Start local visual onboarding countdown (15s backup)
    let timeLeftOnboarding = 15;
    onboardingTimeoutVal.textContent = timeLeftOnboarding;
    
    if (onboardingCountdownInterval) {
        clearInterval(onboardingCountdownInterval);
    }
    
    onboardingCountdownInterval = setInterval(() => {
        timeLeftOnboarding--;
        onboardingTimeoutVal.textContent = timeLeftOnboarding;
        if (timeLeftOnboarding <= 0) {
            clearInterval(onboardingCountdownInterval);
        }
    }, 1000);
});

// Listen to player ready count updates
socket.on('ready-update', ({ readyCount, totalCount }) => {
    readyStatusText.textContent = `${readyCount} of ${totalCount} players ready`;
});

// Listen to Round Begins event (Fires after onboarding is finished and timer officially starts)
socket.on('round-begins', ({ event } = {}) => {
    if (onboardingCountdownInterval) {
        clearInterval(onboardingCountdownInterval);
        onboardingCountdownInterval = null;
    }

    gameRoomCodeDisplay.textContent = currentRoomCode;
    renderGameplayPlayers(currentPlayers);

    roleDisplay.textContent = currentRole;
    roleDisplay.className = 'role-value';

    let instructions = '';
    if (currentRole === 'Mafia') {
        document.body.classList.add('hidden-agent-theme');
        roleDisplay.classList.add('hidden-agent');
        instructions = 'You are the MAFIA. Blend in and trick players into saying your target word!';
    } else {
        document.body.classList.remove('hidden-agent-theme');
        roleDisplay.classList.add('observer');
        instructions = 'You are an AGENT. Chat naturally and expose the Mafia!';
    }
    roleInstruction.textContent = instructions;

    // Show secret mission box
    gameplayMissionBox.style.display = 'block';
    gameplayMissionText.textContent = currentMissionText || '';
    gameplayMissionText.className = 'role-instruction';

    // Reset chat
    chatInput.disabled = false;
    sendMsgBtn.disabled = false;
    chatInput.placeholder = 'Type a message...';
    chatMessagesContainer.innerHTML = '';
    appendChatMessage({ sender: 'System', text: '🕵️‍♂️ The round has started! Discussions are now active.', isSystem: true });

    // Show random event banner if there is an event
    const activeEvent = event || currentEvent;
    showEventBanner(activeEvent);

    showScreen(gameplayScreen);
    logToTerminal(`Round active. Monitoring message frequencies.`);

    // === DRAMATIC 3-PHASE ROLE REVEAL ===
    triggerRoleReveal(currentRole, instructions, currentMissionText);
});

/** Shows the random event banner at the top of the chat panel */
function showEventBanner(event) {
    const banner       = document.getElementById('random-event-banner');
    const bannerIcon   = document.getElementById('event-banner-icon');
    const bannerTitle  = document.getElementById('event-banner-title');
    const bannerDesc   = document.getElementById('event-banner-desc');
    const bannerTimer  = document.getElementById('event-banner-timer');

    if (!banner || !event) {
        if (banner) banner.style.display = 'none';
        return;
    }

    // Clear previous interval
    if (eventBannerInterval) {
        clearInterval(eventBannerInterval);
        eventBannerInterval = null;
    }

    bannerIcon.textContent  = event.icon || '🎲';
    bannerTitle.textContent = event.title || 'ROUND EVENT';
    bannerDesc.textContent  = event.description || '';
    banner.style.display    = 'block';

    // Show countdown if event has a limited duration
    if (event.durationSeconds) {
        let timeLeft = event.durationSeconds;
        bannerTimer.textContent = `${timeLeft}s`;

        eventBannerInterval = setInterval(() => {
            timeLeft--;
            bannerTimer.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(eventBannerInterval);
                eventBannerInterval = null;
                banner.style.opacity = '0.45';
                bannerTitle.textContent += ' ✓ DONE';
                bannerTimer.textContent = '';
            }
        }, 1000);
    } else {
        bannerTimer.textContent = 'Full Round';
    }

    // Add a system chat message announcing the event
    setTimeout(() => {
        appendChatMessage({
            sender: 'System',
            text: `${event.icon} ROUND EVENT: ${event.title} — ${event.description}`,
            isSystem: true
        });
    }, 1200); // after role reveal starts
}

/**
 * Orchestrates the 3-phase role reveal sequence:
 *   Phase 1 (0–0.8s)  – "Incoming Transmission" banner
 *   Phase 2 (0.8–2.2s) – Card appears, flips to reveal role
 *   Phase 3 (2.2–2.8s) – Mission document slides up
 *   Countdown (2.8–5.8s) – 3-second count before auto-dismiss
 */
function triggerRoleReveal(role, instructions, missionText) {
    const overlay          = document.getElementById('role-reveal-overlay');
    const phaseIncoming    = document.getElementById('reveal-phase-incoming');
    const cardWrapper      = document.getElementById('reveal-card-wrapper');
    const flipCard         = document.getElementById('reveal-flip-card');
    const cardFront        = flipCard.querySelector('.reveal-card-front');
    const mascotContainer  = document.getElementById('reveal-mascot-container');
    const roleValueEl      = document.getElementById('reveal-role-value');
    const roleInstrEl      = document.getElementById('reveal-role-instruction');
    const dossierNum       = document.getElementById('reveal-dossier-num');
    const missionDoc       = document.getElementById('reveal-mission-doc');
    const missionTextEl    = document.getElementById('reveal-mission-text');
    const footer           = document.getElementById('reveal-overlay-footer');
    const timerSec         = document.getElementById('reveal-timer-sec');

    const isHiddenAgent = role === 'Mafia';

    // ── Reset state ──
    overlay.className = 'role-reveal-overlay';
    phaseIncoming.style.display = 'block';
    cardWrapper.style.display   = 'none';
    missionDoc.style.display    = 'none';
    footer.style.display        = 'none';
    flipCard.classList.remove('flipped');
    cardFront.className = 'reveal-card-face reveal-card-front';

    // ── Populate card front ──
    dossierNum.textContent = Math.floor(Math.random() * 9000) + 1000;
    roleValueEl.textContent = role.toUpperCase();
    roleInstrEl.textContent = instructions;

    // Role-specific mascot
    if (isHiddenAgent) {
        mascotContainer.innerHTML = `<img src="/assets/avatars/ghost_spy.png" class="reveal-mascot-img" alt="Ghost Spy">`;
        cardFront.classList.add('hidden-agent-front');
        overlay.classList.add('hidden-agent-reveal');
    } else {
        mascotContainer.innerHTML = `<img src="/assets/avatars/detective_cat.png" class="reveal-mascot-img" alt="Detective Cat">`;
        cardFront.classList.add('agent-front');
        overlay.classList.add('agent-reveal');
    }

    // ── Mission doc content ──
    missionTextEl.textContent = missionText || 'No mission assigned.';

    // ── Show overlay ──
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    // ── Play sound: initial transmission ping ──
    RetroSound.playTone(isHiddenAgent ? 220 : 440, 'sine', 0.3);
    RetroSound.playTone(isHiddenAgent ? 180 : 520, 'triangle', 0.15, 0.15);

    // ── Phase 1 → Phase 2 (0.8s later) ──
    setTimeout(() => {
        phaseIncoming.style.display = 'none';
        cardWrapper.style.display = 'block';

        // After card enters, flip it
        setTimeout(() => {
            flipCard.classList.add('flipped');

            // Play reveal sound on flip
            RetroSound.playReveal(!isHiddenAgent);

            // Phase 3: mission doc (after flip completes = 0.7s)
            setTimeout(() => {
                missionDoc.style.display = 'block';

                // Play mission chime
                RetroSound.playTone(isHiddenAgent ? 196 : 523, 'triangle', 0.25);
                RetroSound.playTone(isHiddenAgent ? 147 : 659, 'triangle', 0.2, 0.2);

                // Show countdown footer after mission doc
                setTimeout(() => {
                    footer.style.display = 'block';
                    let timeLeft = 3;
                    timerSec.textContent = timeLeft;

                    const countInterval = setInterval(() => {
                        timeLeft--;
                        timerSec.textContent = timeLeft;

                        if (timeLeft <= 0) {
                            clearInterval(countInterval);
                            // Fade out overlay
                            overlay.classList.add('reveal-fade-out');
                            setTimeout(() => {
                                overlay.style.display = 'none';
                                overlay.classList.remove('reveal-fade-out');
                                overlay.style.opacity = '1';
                                chatInput.focus();
                            }, 600);
                        }
                    }, 1000);

                }, 500);

            }, 750); // after flip animation
        }, 500); // card entrance delay before flip

    }, 800); // Phase 1 display time
}


// Sync countdown timer from server tick
socket.on('timer-update', ({ timeLeft }) => {
    gameTimerDisplay.textContent = formatTime(timeLeft);
    if (timeLeft <= 10 && timeLeft > 0) {
        document.body.classList.add('critical-timer');
        RetroSound.playWarning();
    } else {
        document.body.classList.remove('critical-timer');
    }
});

// Handle round timer expiration (disables chat input)
socket.on('timer-ended', () => {
    document.body.classList.remove('critical-timer');
    appendChatMessage({
        sender: 'System',
        text: '⏱️ Time is up! The round has ended.',
        isSystem: true
    });

    chatInput.disabled = true;
    sendMsgBtn.disabled = true;
    chatInput.placeholder = 'Round ended. Chat is closed.';
});

// Receive typing notification
let typingTimer = null;
socket.on('player-typing', ({ name, avatar }) => {
    const indicator = document.getElementById('chat-typing-indicator');
    if (!indicator) return;
    indicator.textContent = `${avatar || '🕵️'} ${name} is typing...`;
    indicator.style.display = 'block';
    
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        indicator.style.display = 'none';
    }, 2000);
});

// Receive a new chat message from the server
socket.on('new-message', ({ sender, text, isSystem }) => {
    const indicator = document.getElementById('chat-typing-indicator');
    if (indicator) indicator.style.display = 'none';
    if (typingTimer) clearTimeout(typingTimer);

    appendChatMessage({ sender, text, isSystem });
});

// Private mission update notification
socket.on('mission-updated', ({ completed, text }) => {
    if (completed && !gameplayMissionText.classList.contains('text-success')) {
        showSuccessToast('🎯 Mission Accomplished! Keep acting normal.');
        RetroSound.playVictory();
        logToTerminal(`Signal confirmation: player mission completed.`);
    }

    gameplayMissionText.textContent = text;
    if (completed) {
        gameplayMissionText.classList.add('text-success');
        if (!gameplayMissionText.textContent.includes('✓')) {
            gameplayMissionText.textContent += ' ✓';
        }
    } else {
        gameplayMissionText.classList.remove('text-success');
    }
});

// --- 3. Voting Phase Event Listeners ---

// Handle transition to Voting Phase
socket.on('voting-started', ({ players }) => {
    document.body.classList.remove('critical-timer');

    // Hide event banner when voting begins
    const evtBanner = document.getElementById('random-event-banner');
    if (evtBanner) evtBanner.style.display = 'none';
    if (eventBannerInterval) { clearInterval(eventBannerInterval); eventBannerInterval = null; }

    votingGrid.innerHTML = '';
    voteLockMsg.style.display = 'none';
    skipVoteBtn.disabled = false;
    skipVoteBtn.classList.remove('selected');
    votingProgress.textContent = `0 of ${players.length} players voted`;

    const candidates = players.filter(p => p.id !== socket.id);

    candidates.forEach(cand => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.innerHTML = `${getAvatarHTML(cand.avatar, 'vote-avatar')} <span class="vote-name">${cand.name}</span>`;
        btn.dataset.id = cand.id;
        
        btn.addEventListener('click', () => {
            const btns = votingGrid.querySelectorAll('.vote-btn');
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            
            RetroSound.playVote();
            submitVote(cand.id);
        });

        votingGrid.appendChild(btn);
    });

    showScreen(votingScreen);
    logToTerminal(`Exposing vote matrix channels.`);
});

// Helper function to submit vote and lock inputs
function submitVote(choice) {
    const btns = votingGrid.querySelectorAll('.vote-btn');
    btns.forEach(b => b.disabled = true);
    skipVoteBtn.disabled = true;
    
    if (choice === 'skip') {
        skipVoteBtn.classList.add('selected');
    }

    voteLockMsg.style.display = 'block';
    socket.emit('submit-vote', choice);
}

// Skip vote action
skipVoteBtn.addEventListener('click', () => {
    submitVote('skip');
});

// Update voting progress
socket.on('vote-updated', ({ votesCount, totalPlayers }) => {
    votingProgress.textContent = `${votesCount} of ${totalPlayers} players voted`;
});

// --- 4. Results Phase Event Listeners ---

socket.on('game-over', ({ hiddenAgentName, hiddenAgentAvatar, secretMission, missionCompleted, voteBreakdown, winnerSide, votedOutName, votedOutAvatar, playersMissions, awards, pointBreakdown }) => {

    document.body.classList.remove('critical-timer');

    // Play victory or defeat sound
    const playerWon = (winnerSide === 'Mafia' && currentRole === 'Mafia') || 
                      (winnerSide === 'Agents' && currentRole !== 'Mafia');
    
    if (playerWon) {
        RetroSound.playVictory();
        spawnConfetti();
    } else {
        RetroSound.playDefeat();
    }

    // Set outcome text and style
    outcomeBanner.textContent = winnerSide === 'Mafia' ? 'MAFIA WINS' : 'AGENTS WIN';
    outcomeBanner.className = 'outcome-banner';
    
    if (winnerSide === 'Mafia') {
        outcomeBanner.classList.add('hidden-agent-win');
    } else {
        outcomeBanner.classList.add('observers-win');
    }

    resultsHiddenAgentName.innerHTML = `${getAvatarHTML(hiddenAgentAvatar, 'results-avatar')} <span>${hiddenAgentName}</span>`;
    
    resultsMissionStatus.textContent = missionCompleted ? 'Success' : 'Failed';
    resultsMissionStatus.className = 'detail-value';
    if (missionCompleted) {
        resultsMissionStatus.classList.add('text-success');
    } else {
        resultsMissionStatus.classList.add('text-danger');
    }

    resultsMissionText.textContent = `"${secretMission}"`;

    // Render win outcome mascot in results screen
    const resultsMascotContainer = document.getElementById('results-mascot-container');
    if (resultsMascotContainer) {
        if (winnerSide === 'Mafia') {
            resultsMascotContainer.innerHTML = `
                <div style="text-align: center;">
                    <img src="/assets/avatars/ghost_spy.png" class="results-won-mascot-pic" alt="Ghost Spy">
                    <p style="font-family: var(--font-body); font-size: 1.25rem; font-weight: 700; color: var(--accent-red); margin-top: 5px;">GHOST SPY SURVIVED!</p>
                </div>
            `;
        } else {
            resultsMascotContainer.innerHTML = `
                <div style="text-align: center;">
                    <img src="/assets/avatars/detective_cat.png" class="results-won-mascot-pic" alt="Detective Cat">
                    <p style="font-family: var(--font-body); font-size: 1.25rem; font-weight: 700; color: var(--accent-green); margin-top: 5px;">DETECTIVE CAT SOLVED IT!</p>
                </div>
            `;
        }
    }

    // Populate vote breakdown rows
    votesBreakdownList.innerHTML = '';
    voteBreakdown.forEach(row => {
        const div = document.createElement('div');
        div.className = 'vote-row';

        const voter = document.createElement('span');
        voter.className = 'voter-name';
        voter.textContent = row.voter;

        const voted = document.createElement('span');
        voted.className = 'voted-target-name';
        voted.textContent = row.votedFor;
        if (row.votedFor === 'Skip') {
            voted.classList.add('skip');
        }

        div.appendChild(voter);
        div.appendChild(voted);
        votesBreakdownList.appendChild(div);
    });

    // Calculate MVP Detectives
    const mvpDetectivesList = document.getElementById('mvp-detectives-list');
    const mvpBox = document.querySelector('.mvp-box');
    if (mvpDetectivesList) {
        mvpDetectivesList.innerHTML = '';
        const detectives = [];
        
        voteBreakdown.forEach(row => {
            if (row.votedFor === hiddenAgentName && row.voter !== hiddenAgentName) {
                detectives.push(row.voter);
            }
        });
        
        if (detectives.length > 0) {
            if (mvpBox) mvpBox.style.display = 'block';
            detectives.forEach(detName => {
                const div = document.createElement('div');
                div.className = 'vote-row mvp-row';
                div.innerHTML = `<span class="voter-name">👑 ${detName}</span><span class="voted-target-name text-success">EXPOSED DETECTIVE</span>`;
                mvpDetectivesList.appendChild(div);
            });
        } else {
            if (mvpBox) mvpBox.style.display = 'none';
        }
    }

    // Populate missions breakdown rows
    const missionsBreakdownList = document.getElementById('missions-breakdown-list');
    if (missionsBreakdownList && playersMissions) {
        missionsBreakdownList.innerHTML = '';
        playersMissions.forEach(row => {
            const div = document.createElement('div');
            div.className = 'vote-row';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'voter-name';
            nameSpan.innerHTML = `${getAvatarHTML(row.avatar, 'results-breakdown-avatar')} <span class="res-player-label">${row.name} (${row.role === 'Mafia' ? 'Mafia' : 'Agent'})</span>`;

            const missionSpan = document.createElement('span');
            missionSpan.className = 'voted-target-name';
            missionSpan.textContent = `${row.missionText} - ${row.completed ? '✓ Success' : '✗ Failed'}`;
            if (row.completed) {
                missionSpan.classList.add('text-success');
            } else {
                missionSpan.classList.add('text-danger');
            }

            div.appendChild(nameSpan);
            div.appendChild(missionSpan);
            missionsBreakdownList.appendChild(div);
        });
    }

    // Render End-of-Round Awards
    const awardsSection = document.getElementById('awards-section');
    const awardsGrid    = document.getElementById('awards-grid');
    if (awardsSection && awardsGrid && awards && awards.length > 0) {
        awardsGrid.innerHTML = '';
        awardsSection.style.display = 'block';
        awards.forEach((award, idx) => {
            const card = document.createElement('div');
            card.className = 'award-card';
            card.style.animationDelay = `${idx * 0.08}s`;
            card.innerHTML = `
                <span class="award-icon">${award.icon}</span>
                <span class="award-name">${award.name}</span>
                <span class="award-winner">${award.winner}</span>
                <span style="font-family:var(--font-body);font-size:1.1rem;color:#6b7280;">${award.detail || ''}</span>
            `;
            awardsGrid.appendChild(card);
        });
    } else if (awardsSection) {
        awardsSection.style.display = 'none';
    }

    if (startGameBtn.style.display === 'block') {
        playAgainBtn.style.display = 'block';
        playAgainStatus.style.display = 'none';
    } else {
        playAgainBtn.style.display = 'none';
        playAgainStatus.style.display = 'block';
    }

    // ── Render Points Earned section ──
    const pointsSection    = document.getElementById('points-earned-section');
    const breakdownList    = document.getElementById('points-breakdown-list');
    const pointsTotalVal   = document.getElementById('points-total-val');
    const rankDisplay      = document.getElementById('current-rank-display');
    const totalPtsDisplay  = document.getElementById('total-points-display');

    const myEntry = pointBreakdown && pointBreakdown.find(p => p.playerId === socket.id);
    if (myEntry && pointsSection) {
        if (breakdownList) {
            breakdownList.innerHTML = '';
            myEntry.breakdown.forEach(item => {
                const row = document.createElement('div');
                row.className = 'points-row';
                row.innerHTML = `<span class="points-label">${item.label}</span><span class="points-amount">+${item.amount}</span>`;
                breakdownList.appendChild(row);
            });
        }
        if (pointsTotalVal)  pointsTotalVal.textContent  = `+${myEntry.pointsEarned}`;
        if (rankDisplay && myEntry.rank) rankDisplay.textContent = `${myEntry.rank.icon} ${myEntry.rank.name}`;
        if (totalPtsDisplay) totalPtsDisplay.textContent = myEntry.newTotal;
        pointsSection.style.display = 'block';
    } else if (pointsSection) {
        pointsSection.style.display = 'none';
    }

    showScreen(resultsScreen);
    logToTerminal(`Round finalized. Awaiting client reset triggers.`);
});

// Play Again Button click handler
playAgainBtn.addEventListener('click', () => {
    socket.emit('play-again');
});

// Avatar selection helper functions
function initAvatarSelector() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    AVATAR_METADATA.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'avatar-select-btn';
        btn.innerHTML = getAvatarHTML(item.char, 'card-avatar');
        
        btn.addEventListener('mouseenter', () => {
            document.getElementById('selected-avatar-name').textContent = item.name;
        });
        
        btn.addEventListener('mouseleave', () => {
            const activeObj = AVATAR_METADATA.find(a => a.char === selectedAvatar);
            document.getElementById('selected-avatar-name').textContent = activeObj ? activeObj.name : 'CHOOSE CHAR';
        });
        
        btn.addEventListener('click', () => {
            const btns = grid.querySelectorAll('.avatar-select-btn');
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedAvatar = item.char;
            document.getElementById('selected-avatar-name').textContent = item.name;
        });
        
        grid.appendChild(btn);
    });
    
    selectRandomAvatar();
}

function selectRandomAvatar() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    
    const btns = grid.querySelectorAll('.avatar-select-btn');
    if (btns.length > 0) {
        const randIdx = Math.floor(Math.random() * btns.length);
        btns[randIdx].click();
    }
}

// Onboarding Screen Booklet Navigation Buttons click logic
document.getElementById('manual-prev-btn').addEventListener('click', () => {
    if (currentManualPage > 1) {
        showManualPage(currentManualPage - 1);
    }
});

document.getElementById('manual-next-btn').addEventListener('click', () => {
    if (currentManualPage < maxManualPages) {
        showManualPage(currentManualPage + 1);
    }
});

// Onboarding Screen Ready Action
readyBtn.addEventListener('click', () => {
    readyBtn.disabled = true;
    readyBtn.classList.add('selected');
    readyBtn.textContent = 'READY LOCKED';
    socket.emit('player-ready');
});

// Timer Selector change handler (host only)
lobbyTimerSelect.addEventListener('change', () => {
    socket.emit('set-timer', lobbyTimerSelect.value);
});

// ── Leaderboard Modal ──────────────────────────────────────────────────────────
const leaderboardBtn    = document.getElementById('leaderboard-btn');
const leaderboardModal  = document.getElementById('leaderboard-modal');
const closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');

if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
        socket.emit('get-leaderboard');
    });
}

if (closeLeaderboardBtn) {
    closeLeaderboardBtn.addEventListener('click', () => {
        if (leaderboardModal) leaderboardModal.style.display = 'none';
    });
}

// Close modal on backdrop click
if (leaderboardModal) {
    leaderboardModal.addEventListener('click', (e) => {
        if (e.target === leaderboardModal) leaderboardModal.style.display = 'none';
    });
}

socket.on('leaderboard-data', (players) => {
    const list = document.getElementById('leaderboard-list');
    if (!list || !leaderboardModal) return;

    list.innerHTML = '';
    if (players.length === 0) {
        list.innerHTML = '<div class="leaderboard-empty">No games played yet!<br>Play a round to appear here.</div>';
    } else {
        players.forEach((player, idx) => {
            const row = document.createElement('div');
            const posClass = idx < 3 ? ` top-${idx + 1}` : '';
            row.className = `leaderboard-row${posClass}`;
            row.innerHTML = [
                `<span class="lb-position">#${idx + 1}</span>`,
                `<span class="lb-rank-icon">${player.rank.icon}</span>`,
                `<span class="lb-name">${player.name}</span>`,
                `<span class="lb-rank-name">${player.rank.name}</span>`,
                `<span class="lb-points">${player.points}</span>`
            ].join('');
            list.appendChild(row);
        });
    }
    leaderboardModal.style.display = 'flex';
});

// Initialize elements on load
initAvatarSelector();
const randomAvatarBtn = document.getElementById('random-avatar-btn');
if (randomAvatarBtn) {
    randomAvatarBtn.addEventListener('click', () => {
        selectRandomAvatar();
    });
}

// --- Living Starfield Background Animation ---
function initStarfield() {
    const canvas = document.createElement('canvas');
    canvas.id = 'starfield-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const stars = [];
    const numStars = 60;

    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 1,
            speed: Math.random() * 0.2 + 0.1,
            twinkle: Math.random()
        });
    }

    const particles = [];
    function spawnParticle() {
        if (particles.length < 35) {
            particles.push({
                x: Math.random() * width,
                y: height + 10,
                size: Math.random() * 3 + 2,
                speedY: -(Math.random() * 0.4 + 0.1),
                speedX: (Math.random() - 0.5) * 0.15,
                opacity: Math.random() * 0.4 + 0.2,
                color: Math.random() > 0.5 ? '#db2777' : '#2563eb' // Pink or Blue accents
            });
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Twinkling stars
        stars.forEach(star => {
            star.twinkle += 0.015;
            const alpha = 0.25 + Math.abs(Math.sin(star.twinkle)) * 0.65;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(star.x, star.y, star.size, star.size);
            star.y -= star.speed;
            if (star.y < 0) {
                star.y = height;
                star.x = Math.random() * width;
            }
        });

        // Floating ambient dust particles
        if (Math.random() > 0.94) spawnParticle();

        particles.forEach((p, idx) => {
            p.y += p.speedY;
            p.x += p.speedX;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            
            p.opacity -= 0.0015;
            if (p.y < -10 || p.opacity <= 0) {
                particles.splice(idx, 1);
            }
        });
        ctx.globalAlpha = 1.0;

        requestAnimationFrame(animate);
    }
    animate();
}

initStarfield();
