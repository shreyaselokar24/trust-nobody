/**
 * Trust Nobody - Server Manager
 * 
 * Coordinates lobby creation, client connections, private role assignments,
 * synchronized round timers, and live room chat rooms.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs   = require('fs');

// ── Leaderboard Persistence ───────────────────────────────────────────────────
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
let leaderboardData = {};

function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
            leaderboardData = JSON.parse(raw);
            console.log(`Leaderboard loaded: ${Object.keys(leaderboardData).length} player(s) tracked`);
        }
    } catch (e) {
        console.error('Failed to load leaderboard:', e.message);
        leaderboardData = {};
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardData, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save leaderboard:', e.message);
    }
}

function getRank(points) {
    if (points < 100)  return { name: 'Rookie',       icon: '🔰' };
    if (points < 250)  return { name: 'Informant',    icon: '📋' };
    if (points < 500)  return { name: 'Detective',    icon: '🔍' };
    if (points < 800)  return { name: 'Agent',        icon: '🕵️' };
    if (points < 1200) return { name: 'Master Agent', icon: '⭐' };
    return                    { name: 'Mafia Boss',   icon: '👑' };
}

loadLeaderboard();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static frontend files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory database of active game rooms
const rooms = {};

/// --- Unified Brainrot Mission System Databases ---
const NORMAL_MISSIONS = [
    {
        id: 'food',
        text: 'Mention food once (e.g. pizza, burger, eat, biryani)',
        check: (text) => {
            const keywords = ['pizza', 'burger', 'food', 'eat', 'eating', 'biryani', 'maggi', 'momo', 'paneer', 'chicken', 'lunch', 'dinner', 'snack', 'chocolate', 'fruit', 'apple', 'banana', 'hungry', 'restaurant', 'fries', 'taco', 'pasta', 'salad', 'bread', 'rice'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'question',
        text: 'Ask a question in chat (use "?")',
        check: (text) => text.includes('?')
    },
    {
        id: 'bro',
        text: 'Say "bro", "bruh", "brother", or "buddy"',
        check: (text) => {
            const words = text.toLowerCase().split(/\s+/);
            return words.some(w => w === 'bro' || w === 'bruh' || w === 'brother' || w === 'buddy');
        }
    },
    {
        id: 'skull',
        text: 'Use the skull emoji 💀 once',
        check: (text) => text.includes('💀')
    },
    {
        id: 'movies',
        text: 'Mention movies or shows (e.g. movie, film, netflix, watch)',
        check: (text) => {
            const keywords = ['movie', 'movies', 'film', 'films', 'cinema', 'watch', 'watching', 'netflix', 'show', 'shows', 'series', 'actor', 'director', 'hollywood', 'bollywood', 'anime'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'games',
        text: 'Mention games or gaming (e.g. game, play, minecraft, steam)',
        check: (text) => {
            const keywords = ['game', 'games', 'gaming', 'play', 'playing', 'xbox', 'playstation', 'ps5', 'pc', 'nintendo', 'steam', 'minecraft', 'fortnite', 'roblox', 'valorant', 'gta', 'chess'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'music',
        text: 'Mention music or songs (e.g. song, music, spotify, singer)',
        check: (text) => {
            const keywords = ['music', 'song', 'songs', 'listen', 'listening', 'spotify', 'singer', 'band', 'guitar', 'piano', 'beat', 'track', 'concert', 'album'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'weather',
        text: 'Mention weather or seasons (e.g. rain, hot, cold, summer)',
        check: (text) => {
            const keywords = ['weather', 'rain', 'raining', 'hot', 'cold', 'sunny', 'snow', 'summer', 'winter', 'spring', 'autumn', 'windy', 'cloudy', 'temperature', 'degree', 'heat', 'forecast'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'sleep',
        text: 'Mention sleep or rest (e.g. sleep, tired, bed, nap)',
        check: (text) => {
            const keywords = ['sleep', 'tired', 'bed', 'dream', 'awake', 'night', 'nap', 'sleeping', 'exhausted', 'rest', 'asleep', 'wake'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'animal',
        text: 'Mention an animal or pet (e.g. dog, cat, bird, pet)',
        check: (text) => {
            const keywords = ['dog', 'cat', 'pet', 'pets', 'bird', 'animal', 'animals', 'fish', 'puppy', 'kitten', 'lion', 'tiger', 'rabbit', 'hamster', 'monkey', 'cow', 'horse'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'emoji',
        text: 'Use any emoji in your message',
        check: (text) => {
            const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
            return emojiRegex.test(text);
        }
    },
    {
        id: 'cool',
        text: 'Say "cool", "awesome", "great", or "nice"',
        check: (text) => {
            const words = text.toLowerCase().split(/\s+/);
            return words.some(w => w === 'cool' || w === 'awesome' || w === 'great' || w === 'nice');
        }
    },
    {
        id: 'greeting',
        text: 'Say hello or greet someone (e.g. hi, hey, yo, sup)',
        check: (text) => {
            const keywords = ['hello', 'hi', 'hey', 'yo', 'sup', 'morning', 'afternoon', 'evening', 'greetings', 'welcome'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'color',
        text: 'Mention a color (e.g. red, blue, green, black)',
        check: (text) => {
            const keywords = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'orange', 'pink', 'brown', 'gray', 'grey'];
            return keywords.some(kw => text.toLowerCase().includes(kw));
        }
    },
    {
        id: 'agree',
        text: 'Say "yes", "yeah", "no", or "nope"',
        check: (text) => {
            const words = text.toLowerCase().split(/\s+/);
            return words.some(w => w === 'yes' || w === 'yeah' || w === 'no' || w === 'nope' || w === 'yep' || w === 'nah');
        }
    }
];

const BRAINROT_WORDS = [
    'sigma', 'rizz', 'skibidi', 'gyatt', 'fanum', 'ohio',
    'mewing', 'looksmax', 'baby gronk', 'grimace', 'hawk tuah',
    'blud', 'yapping', 'aura', 'delulu', 'cringe'
];

const AVATARS = [
    '🧙', '🥷', '🏴‍☠️', '🤖', '👽', '🐸', '🐼', '🦊', '👻', '🕵️',
    '🐱', '🐧', '🐙', '🦈', '🦝', '🐵', '🦄', '👑', '🧟', '👨‍🚀'
];

// Funny Random Events — one is chosen each round
const RANDOM_EVENTS = [
    {
        id: 'ceo_talk',
        icon: '💼',
        title: 'CORPORATE MODE',
        description: 'Everyone must talk like a CEO for 30 seconds. Use buzzwords like "synergy", "pivot", and "KPIs".',
        durationSeconds: 30
    },
    {
        id: 'no_e',
        icon: '🚫',
        title: 'NO LETTER E',
        description: 'Nobody can use the letter E in any message for 30 seconds. Any slip is sus.',
        durationSeconds: 30
    },
    {
        id: 'food_mention',
        icon: '🍕',
        title: 'HUNGRY HOUR',
        description: 'Everyone must mention food at least once this round. Failing to do so is suspicious.',
        durationSeconds: 60
    },
    {
        id: 'answer_question',
        icon: '❓',
        title: 'QUESTION ONLY',
        description: 'Answer every question with another question for 30 seconds. Statements are forbidden.',
        durationSeconds: 30
    },
    {
        id: 'three_words',
        icon: '✌️',
        title: 'THREE WORDS ONLY',
        description: 'Use only 3-word sentences for 30 seconds. Short. And. Sweet.',
        durationSeconds: 30
    },
    {
        id: 'brainrot_speak',
        icon: '💀',
        title: 'BRAINROT ACTIVATED',
        description: 'Everyone must say at least one brainrot word (sigma, rizz, skibidi, gyatt, ohio...) this round.',
        durationSeconds: 60
    },
    {
        id: 'pirate_mode',
        icon: '🏴‍☠️',
        title: 'PIRATE MODE',
        description: 'Talk like a pirate for 20 seconds. Arr! Say "matey", "arrr", or "shiver me timbers".',
        durationSeconds: 20
    },
    {
        id: 'no_i',
        icon: '🙈',
        title: 'NO "I" ALLOWED',
        description: 'No player can use the word "I" for 40 seconds. Refer to yourself in 3rd person.',
        durationSeconds: 40
    }
];

// Assign a unique avatar within a room
function getUniqueAvatar(room, preferredAvatar) {
    const takenAvatars = room.players ? room.players.map(p => p.avatar) : [];
    
    // If preferred is selected and available, use it
    if (preferredAvatar && AVATARS.includes(preferredAvatar) && !takenAvatars.includes(preferredAvatar)) {
        return preferredAvatar;
    }
    
    // Else prefer unused ones
    const available = AVATARS.filter(a => !takenAvatars.includes(a));
    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }
    
    // Fallback
    return preferredAvatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

// Transition game to actual gameplay and start the countdown timer
function beginRound(code) {
    const room = rooms[code];
    if (!room || room.state !== 'onboarding') return;
    
    // Clear safety timeout
    if (room.onboardingTimeout) {
        clearTimeout(room.onboardingTimeout);
        room.onboardingTimeout = null;
    }
    
    room.state = 'playing';

    // Reset per-round stats
    room.roundStats = {
        messageCounts: {},     // playerId -> count
        voteTimestamps: {},    // playerId -> Date.now() when they voted
        roundStartTime: Date.now()
    };
    room.players.forEach(p => {
        room.roundStats.messageCounts[p.id] = 0;
    });

    io.to(code).emit('round-begins', { event: room.currentEvent || null });
    
    room.timer = room.timerSetting || 180;
    
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
    }
    
    room.timerInterval = setInterval(() => {
        room.timer--;
        io.to(code).emit('timer-update', { timeLeft: room.timer });
        
        if (room.timer <= 0) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;
            
            // Transition to voting state
            room.state = 'voting';
            room.votes = {};
            
            io.to(code).emit('voting-started', {
                players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
            });
            console.log(`Voting started for room ${code}`);
        }
    }, 1000);
}

// Compute end-of-round awards from stats and vote data
function computeAwards(room, voteCounts, hiddenAgent, mafiaVotedOut) {
    const awards = [];
    const stats = room.roundStats || {};
    const msgCounts = stats.messageCounts || {};
    const voteTimes = stats.voteTimestamps || {};

    // 🗣️ Biggest Yapper — most messages
    const yappers = room.players
        .map(p => ({ name: p.name, avatar: p.avatar, count: msgCounts[p.id] || 0 }))
        .sort((a, b) => b.count - a.count);
    if (yappers.length > 0 && yappers[0].count > 0) {
        awards.push({
            icon: '🗣️', name: 'BIGGEST YAPPER',
            winner: yappers[0].name, avatar: yappers[0].avatar,
            detail: `${yappers[0].count} messages`
        });
    }

    // 🕵️ Most Suspicious — most votes received
    const suspiciousPlayers = room.players
        .map(p => ({ name: p.name, avatar: p.avatar, votes: voteCounts[p.id] || 0 }))
        .sort((a, b) => b.votes - a.votes);
    if (suspiciousPlayers.length > 0 && suspiciousPlayers[0].votes > 0) {
        awards.push({
            icon: '🤨', name: 'MOST SUSPICIOUS',
            winner: suspiciousPlayers[0].name, avatar: suspiciousPlayers[0].avatar,
            detail: `${suspiciousPlayers[0].votes} votes`
        });
    }

    // ⚡ Fastest Voter — first to submit vote
    if (Object.keys(voteTimes).length > 0) {
        const fastest = Object.entries(voteTimes).sort((a, b) => a[1] - b[1])[0];
        const fastestPlayer = room.players.find(p => p.id === fastest[0]);
        if (fastestPlayer) {
            const elapsed = Math.round((fastest[1] - (stats.votePhaseStart || fastest[1])) / 1000);
            awards.push({
                icon: '⚡', name: 'FASTEST VOTER',
                winner: fastestPlayer.name, avatar: fastestPlayer.avatar,
                detail: elapsed > 0 ? `in ${elapsed}s` : 'first click'
            });
        }
    }

    // 🎯 Mission Master — first normal player to complete mission
    const missionCompletedPlayers = room.players.filter(
        p => p.role === 'Player' && p.mission && p.mission.completed
    );
    if (missionCompletedPlayers.length > 0) {
        // Pick random one since we don't track order precisely
        const mp = missionCompletedPlayers[0];
        awards.push({
            icon: '🎯', name: 'MISSION MASTER',
            winner: mp.name, avatar: mp.avatar,
            detail: 'completed mission'
        });
    }

    // 😈 Master Manipulator — Mafia if they completed their mission
    if (hiddenAgent && hiddenAgent.mission && hiddenAgent.mission.completed) {
        awards.push({
            icon: '😈', name: 'MASTER MANIPULATOR',
            winner: hiddenAgent.name, avatar: hiddenAgent.avatar,
            detail: 'mission accomplished'
        });
    }

    // 🏆 Detective of the Round — players who correctly voted for Mafia
    if (hiddenAgent && mafiaVotedOut) {
        const detectives = Object.entries(room.votes)
            .filter(([voterId, votedId]) => votedId === hiddenAgent.id)
            .map(([voterId]) => room.players.find(p => p.id === voterId))
            .filter(Boolean);
        if (detectives.length > 0) {
            awards.push({
                icon: '🏆', name: 'DETECTIVE OF THE ROUND',
                winner: detectives.map(d => d.name).join(' & '), avatar: detectives[0].avatar,
                detail: 'exposed the mafia'
            });
        }
    }

    // 💀 Silent Suspect — fewest messages among active players (silent but present)
    const quietPlayers = room.players
        .filter(p => p.role !== 'Mafia')
        .map(p => ({ name: p.name, avatar: p.avatar, count: msgCounts[p.id] || 0 }))
        .sort((a, b) => a.count - b.count);
    if (quietPlayers.length > 0) {
        awards.push({
            icon: '🤫', name: 'SILENT SUSPECT',
            winner: quietPlayers[0].name, avatar: quietPlayers[0].avatar,
            detail: `only ${quietPlayers[0].count} message${quietPlayers[0].count !== 1 ? 's' : ''}`
        });
    }

    return awards;
}

// Compute per-player point awards for the round
function computePointAwards(room, voteCounts, hiddenAgent, mafiaVotedOut, winnerSide, awards) {
    const pointsMap = {};
    room.players.forEach(p => {
        pointsMap[p.id] = { name: p.name, points: 0, breakdown: [] };
    });

    const agentsWon = winnerSide === 'Agents';

    // ── Mafia points ──
    if (hiddenAgent && pointsMap[hiddenAgent.id]) {
        const mp = pointsMap[hiddenAgent.id];
        if (!agentsWon) {
            mp.points += 100; mp.breakdown.push({ label: 'Mafia Victory', amount: 100 });
        }
        if (hiddenAgent.mission && hiddenAgent.mission.completed) {
            mp.points += 40;  mp.breakdown.push({ label: 'Mission Complete', amount: 40 });
        }
        if (!mafiaVotedOut) {
            mp.points += 30;  mp.breakdown.push({ label: 'Survived Voting', amount: 30 });
        }
        if ((voteCounts[hiddenAgent.id] || 0) === 0) {
            mp.points += 50;  mp.breakdown.push({ label: 'Zero Votes Received', amount: 50 });
        }
    }

    // ── Agent points ──
    room.players.forEach(p => {
        if (p.role !== 'Mafia') {
            const pp = pointsMap[p.id];
            if (agentsWon) {
                pp.points += 50; pp.breakdown.push({ label: 'Team Victory', amount: 50 });
            }
            if (hiddenAgent && room.votes && room.votes[p.id] === hiddenAgent.id) {
                pp.points += 40; pp.breakdown.push({ label: 'Correct Vote', amount: 40 });
            }
            if (p.mission && p.mission.completed) {
                pp.points += 25; pp.breakdown.push({ label: 'Mission Complete', amount: 25 });
            }
        }
    });

    // ── Award bonuses ──
    const AWARD_BONUSES = {
        'BIGGEST YAPPER':         { amount: 10, label: 'Biggest Yapper Award'      },
        'FASTEST VOTER':          { amount: 10, label: 'Fastest Voter Award'        },
        'MISSION MASTER':         { amount: 15, label: 'Mission Master Award'       },
        'DETECTIVE OF THE ROUND': { amount: 20, label: 'Detective of the Round'    },
    };
    if (awards) {
        awards.forEach(award => {
            const bonus = AWARD_BONUSES[award.name];
            if (bonus) {
                award.winner.split(' & ').forEach(wName => {
                    const player = room.players.find(p => p.name === wName.trim());
                    if (player && pointsMap[player.id]) {
                        pointsMap[player.id].points += bonus.amount;
                        pointsMap[player.id].breakdown.push({ label: bonus.label, amount: bonus.amount });
                    }
                });
            }
        });
    }

    return pointsMap;
}

// Helper to evaluate voting outcomes and trigger the game-over state
function evaluateGameResults(code) {
    const room = rooms[code];
    if (!room) return;

    room.state = 'results';

    const voteCounts = {};
    room.players.forEach(p => {
        voteCounts[p.id] = 0;
    });

    Object.entries(room.votes).forEach(([voterId, votedId]) => {
        if (votedId !== 'skip' && voteCounts[votedId] !== undefined) {
            voteCounts[votedId]++;
        }
    });

    let maxVotes = -1;
    let votedOutList = [];

    Object.entries(voteCounts).forEach(([pid, count]) => {
        if (count > maxVotes) {
            maxVotes = count;
            votedOutList = [pid];
        } else if (count === maxVotes) {
            votedOutList.push(pid);
        }
    });

    const hiddenAgent = room.players.find(p => p.role === 'Mafia');
    let mafiaVotedOut = false;
    let votedOutId = null;

    if (votedOutList.length === 1 && maxVotes > 0) {
        votedOutId = votedOutList[0];
        if (hiddenAgent && votedOutId === hiddenAgent.id) {
            mafiaVotedOut = true;
        }
    }

    const hiddenAgentMissionCompleted = hiddenAgent ? hiddenAgent.mission.completed : false;
    const hiddenAgentWon = hiddenAgentMissionCompleted && !mafiaVotedOut;
    const winnerSide = hiddenAgentWon ? 'Mafia' : 'Agents';

    const voteBreakdown = room.players.map(p => {
        const votedId = room.votes[p.id];
        let votedName = 'Skip';
        if (votedId && votedId !== 'skip') {
            const pv = room.players.find(v => v.id === votedId);
            if (pv) votedName = pv.name;
        }
        return { voter: p.name, votedFor: votedName };
    });

    const playersMissions = room.players.map(p => ({
        name: p.name,
        role: p.role,
        avatar: p.avatar,
        missionText: p.mission ? p.mission.text : 'None',
        completed: p.mission ? p.mission.completed : false
    }));

    const votedOutPlayer = votedOutId ? room.players.find(p => p.id === votedOutId) : null;

    // Compute end-of-round awards
    const awards = computeAwards(room, voteCounts, hiddenAgent, mafiaVotedOut);

    // ── Compute per-player point awards ──
    const pointsMap = computePointAwards(room, voteCounts, hiddenAgent, mafiaVotedOut, winnerSide, awards);

    // ── Update persistent leaderboard ──
    Object.entries(pointsMap).forEach(([playerId, pData]) => {
        const name = pData.name;
        if (!leaderboardData[name]) {
            leaderboardData[name] = { points: 0, gamesPlayed: 0, mafiaWins: 0, agentWins: 0, missionsCompleted: 0, correctVotes: 0 };
        }
        const lb = leaderboardData[name];
        const player = room.players.find(p => p.id === playerId);
        lb.points      += pData.points;
        lb.gamesPlayed += 1;
        if (player) {
            if (player.role === 'Mafia' && !mafiaVotedOut && hiddenAgent && hiddenAgent.mission.completed) lb.mafiaWins++;
            if (player.role !== 'Mafia' && winnerSide === 'Agents') lb.agentWins++;
            if (player.mission && player.mission.completed) lb.missionsCompleted++;
            if (player.role !== 'Mafia' && hiddenAgent && room.votes && room.votes[player.id] === hiddenAgent.id) lb.correctVotes++;
        }
    });
    saveLeaderboard();

    // ── Build per-player point breakdown for the client ──
    const pointBreakdown = Object.entries(pointsMap).map(([playerId, pData]) => {
        const name = pData.name;
        const newTotal = leaderboardData[name] ? leaderboardData[name].points : pData.points;
        return {
            playerId,
            name,
            pointsEarned: pData.points,
            breakdown: pData.breakdown,
            newTotal,
            rank: getRank(newTotal)
        };
    });

    io.to(code).emit('game-over', {
        hiddenAgentName: hiddenAgent ? hiddenAgent.name : 'Unknown',
        hiddenAgentAvatar: hiddenAgent ? hiddenAgent.avatar : '',
        secretMission: hiddenAgent ? hiddenAgent.mission.text : 'None',
        missionCompleted: hiddenAgentMissionCompleted,
        voteBreakdown: voteBreakdown,
        winnerSide: winnerSide,
        votedOutName: votedOutPlayer ? votedOutPlayer.name : 'Nobody',
        votedOutAvatar: votedOutPlayer ? votedOutPlayer.avatar : '',
        playersMissions: playersMissions,
        awards: awards,
        pointBreakdown: pointBreakdown
    });
}


// Helper function to generate a random 4-character room code
function generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    // Make sure the room code is unique
    if (rooms[code]) {
        return generateRoomCode();
    }
    return code;
}

// Socket.io Real-Time Connection Handler
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- 1. CREATE ROOM EVENT ---
    socket.on('create-room', ({ playerName, avatar }) => {
        if (!playerName || playerName.trim() === '') {
            socket.emit('error-msg', 'Please enter a valid player name.');
            return;
        }

        const cleanName = playerName.trim();
        const code = generateRoomCode();

        const newRoom = {
            code: code,
            state: 'lobby', // 'lobby' or 'playing'
            players: [],
            timerSetting: 180, // 3 minutes default
            timer: 180,
            timerInterval: null,
            readyPlayers: {}
        };
        rooms[code] = newRoom;

        const uniqueAvatar = getUniqueAvatar(newRoom, avatar);
        const hostPlayer = {
            id: socket.id,
            name: cleanName,
            isHost: true,
            role: null,
            avatar: uniqueAvatar
        };
        newRoom.players.push(hostPlayer);

        socket.roomCode = code;
        socket.playerName = cleanName;
        socket.join(code);

        socket.emit('room-created', {
            roomCode: code,
            players: newRoom.players,
            timerSetting: newRoom.timerSetting
        });

        console.log(`Room created: ${code} by Host: ${cleanName} with avatar: ${uniqueAvatar}`);
    });

    // --- 2. JOIN ROOM EVENT ---
    socket.on('join-room', ({ playerName, roomCode, avatar }) => {
        if (!playerName || playerName.trim() === '') {
            socket.emit('error-msg', 'Please enter a valid name.');
            return;
        }
        if (!roomCode || roomCode.trim() === '') {
            socket.emit('error-msg', 'Please enter a room code.');
            return;
        }

        const cleanName = playerName.trim();
        const cleanCode = roomCode.trim().toUpperCase();
        const room = rooms[cleanCode];

        // Validation A: Check if room exists
        if (!room) {
            socket.emit('error-msg', `Room ${cleanCode} does not exist.`);
            return;
        }

        // Validation B: Check if game is already in progress
        if (room.state !== 'lobby') {
            socket.emit('error-msg', `Game is already in progress in room ${cleanCode}.`);
            return;
        }

        // Validation C: Check if room is full
        if (room.players.length >= 10) {
            socket.emit('error-msg', 'This room is full (Max 10 players).');
            return;
        }

        // Validation D: Check if player name is already taken
        const nameExists = room.players.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
        if (nameExists) {
            socket.emit('error-msg', `The name "${cleanName}" is already taken in this room.`);
            return;
        }

        const uniqueAvatar = getUniqueAvatar(room, avatar);
        const newPlayer = {
            id: socket.id,
            name: cleanName,
            isHost: false,
            role: null,
            avatar: uniqueAvatar
        };
        room.players.push(newPlayer);

        socket.roomCode = cleanCode;
        socket.playerName = cleanName;
        socket.join(cleanCode);

        // Broadcast updated room state to all clients in this room
        io.to(cleanCode).emit('room-state', {
            roomCode: cleanCode,
            players: room.players,
            timerSetting: room.timerSetting
        });

        console.log(`Player ${cleanName} joined room ${cleanCode} with avatar: ${uniqueAvatar}`);
    });

    // --- 3. START GAME EVENT (Transitions to onboarding screen, assigns private roles & missions) ---
    socket.on('start-game', () => {
        const code = socket.roomCode;
        const name = socket.playerName;

        if (!code || !rooms[code]) return;

        const room = rooms[code];
        const player = room.players.find(p => p.id === socket.id);

        // Verify the sender is the room host and room is in lobby
        if (player && player.isHost && room.state === 'lobby') {
            console.log(`Host ${name} is starting onboarding in room ${code}`);
            
            // Set room state to onboarding
            room.state = 'onboarding';
            room.votes = {};
            room.readyPlayers = {};

            // Pick a random event for this round
            room.currentEvent = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
            console.log(`[ROOM ${code}] Random event: ${room.currentEvent.title}`);

            // Pick a random brainrot word for the Mafia
            const brainrotWord = BRAINROT_WORDS[Math.floor(Math.random() * BRAINROT_WORDS.length)];

            // Randomly assign exactly 1 Mafia
            const hiddenAgentIndex = Math.floor(Math.random() * room.players.length);
            
            // Shuffle normal missions pool
            const shuffledMissions = [...NORMAL_MISSIONS].sort(() => 0.5 - Math.random());
            let missionIdx = 0;

            room.players.forEach((p, idx) => {
                if (idx === hiddenAgentIndex) {
                    p.role = 'Mafia';
                    p.mission = {
                        id: 'mafia',
                        text: `Get 2 different players to say "${brainrotWord}" (0/2)`,
                        targetWord: brainrotWord,
                        saidByPlayers: [], // Track list of player IDs who said the target word
                        completed: false
                    };
                } else {
                    p.role = 'Player';
                    const randMission = shuffledMissions[missionIdx % shuffledMissions.length];
                    missionIdx++;
                    p.mission = {
                        id: randMission.id,
                        text: randMission.text,
                        completed: false
                    };
                }
            });

            // Sanitize players array (include avatar!)
            const sanitizedPlayers = room.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                isHost: p.isHost
            }));

            // Privately emit role and mission to each player
            room.players.forEach(p => {
                io.to(p.id).emit('game-started', {
                    role: p.role,
                    missionText: p.mission.text,
                    roomCode: code,
                    players: sanitizedPlayers,
                    timerSetting: room.timerSetting || 180,
                    currentEvent: room.currentEvent || null
                });
            });

            // Broadcast initial ready update (0 of N ready)
            io.to(code).emit('ready-update', {
                readyCount: 0,
                totalCount: room.players.length
            });

            // Set backup onboarding safety timeout (15 seconds)
            if (room.onboardingTimeout) {
                clearTimeout(room.onboardingTimeout);
            }
            room.onboardingTimeout = setTimeout(() => {
                beginRound(code);
            }, 15000);

        } else {
            socket.emit('error-msg', 'Only the room host can start the game.');
        }
    });

    // --- 3a. PLAYER READY EVENT (Onboarding screen) ---
    socket.on('player-ready', () => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;

        const room = rooms[code];
        if (room.state !== 'onboarding') return;

        // Mark sender as ready
        room.readyPlayers[socket.id] = true;

        const readyCount = Object.keys(room.readyPlayers).length;
        const totalCount = room.players.length;

        // Broadcast updated ready count to all room players
        io.to(code).emit('ready-update', {
            readyCount,
            totalCount
        });

        // If all players are ready, begin the gameplay round early
        if (readyCount >= totalCount) {
            beginRound(code);
        }
    });

    // --- 3b. SET TIMER CONFIG EVENT (Lobby Settings) ---
    socket.on('set-timer', (timerValue) => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;

        const room = rooms[code];
        const player = room.players.find(p => p.id === socket.id);

        // Verify player is host and state is lobby
        if (player && player.isHost && room.state === 'lobby') {
            const val = parseInt(timerValue, 10);
            if ([120, 180, 240, 300].includes(val)) {
                room.timerSetting = val;
                // Broadcast updated room state to sync values
                io.to(code).emit('room-state', {
                    roomCode: code,
                    players: room.players,
                    timerSetting: room.timerSetting
                });
                console.log(`[ROOM ${code}] Timer setting updated to ${val}s by host ${player.name}`);
            }
        }
    });

    // --- 4. CHAT SYSTEM (Phase 2 & 3 with Automatic Mission Detection) ---
    socket.on('typing', () => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;
        const room = rooms[code];
        const sender = room.players.find(p => p.id === socket.id);
        if (sender) {
            socket.to(code).emit('player-typing', { name: sender.name, avatar: sender.avatar });
        }
    });

    socket.on('send-message', (messageText) => {

        const code = socket.roomCode;
        const name = socket.playerName;

        if (!code || !rooms[code] || !messageText || messageText.trim() === '') return;

        const room = rooms[code];
        
        // Ensure players can only chat while playing
        if (room.state !== 'playing') {
            socket.emit('error-msg', 'You can only chat during the game round.');
            return;
        }

        const cleanText = messageText.trim();

        // Track message count for awards
        if (room.roundStats && room.roundStats.messageCounts) {
            room.roundStats.messageCounts[socket.id] = (room.roundStats.messageCounts[socket.id] || 0) + 1;
        }

        // Broadcast chat to all players in the room (including sender)
        io.to(code).emit('new-message', {
            sender: name,
            text: cleanText,
            isSystem: false
        });

        // Evaluate mission completion silently on the server
        const sender = room.players.find(p => p.id === socket.id);
        if (sender && room.state === 'playing') {
            // A. Evaluate the sender's own mission (if they are a normal player)
            if (sender.role === 'Player' && sender.mission && !sender.mission.completed) {
                const missionDef = NORMAL_MISSIONS.find(m => m.id === sender.mission.id);
                if (missionDef && missionDef.check(cleanText)) {
                    sender.mission.completed = true;
                    // Privately notify player
                    socket.emit('mission-updated', {
                        completed: true,
                        text: sender.mission.text
                    });
                    console.log(`[ROOM ${code}] Player ${sender.name} completed mission: ${sender.mission.text}`);
                }
            }

            // B. Evaluate if the message satisfies the Mafia's target word
            const hiddenAgent = room.players.find(p => p.role === 'Mafia');
            if (hiddenAgent && hiddenAgent.mission && !hiddenAgent.mission.completed) {
                // The sender must NOT be the Mafia
                if (sender.id !== hiddenAgent.id) {
                    const targetWord = hiddenAgent.mission.targetWord.toLowerCase();
                    const messageLower = cleanText.toLowerCase();

                    if (messageLower.includes(targetWord)) {
                        if (!hiddenAgent.mission.saidByPlayers.includes(sender.id)) {
                            hiddenAgent.mission.saidByPlayers.push(sender.id);
                            
                            const count = hiddenAgent.mission.saidByPlayers.length;
                            hiddenAgent.mission.text = `Get 2 different players to say "${hiddenAgent.mission.targetWord}" (${count}/2)`;
                            
                            if (count >= 2) {
                                hiddenAgent.mission.completed = true;
                                io.to(hiddenAgent.id).emit('mission-updated', {
                                    completed: true,
                                    text: hiddenAgent.mission.text
                                });
                                console.log(`[ROOM ${code}] Mafia completed mission: ${hiddenAgent.mission.text}`);
                            } else {
                                io.to(hiddenAgent.id).emit('mission-updated', {
                                    completed: false,
                                    text: hiddenAgent.mission.text
                                });
                                console.log(`[ROOM ${code}] Mafia progress: ${count}/2`);
                            }
                        }
                    }
                }
            }
        }
    });

    // --- 4a. SUBMIT VOTE EVENT (Phase 3) ---
    socket.on('submit-vote', (votedPlayerId) => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;

        const room = rooms[code];
        if (room.state !== 'voting') {
            socket.emit('error-msg', 'Voting is not active.');
            return;
        }

        const playerExists = room.players.some(p => p.id === socket.id);
        if (!playerExists) return;

        // Record vote and timestamp for awards
        room.votes[socket.id] = votedPlayerId;
        if (room.roundStats) {
            if (!room.roundStats.votePhaseStart) {
                room.roundStats.votePhaseStart = Date.now();
            }
            room.roundStats.voteTimestamps[socket.id] = Date.now();
        }

        const votesCount = Object.keys(room.votes).length;
        const totalPlayers = room.players.length;

        // Broadcast update to players
        io.to(code).emit('vote-updated', {
            votesCount,
            totalPlayers
        });

        // Trigger evaluation if all active players voted
        if (votesCount >= totalPlayers) {
            evaluateGameResults(code);
        }
    });

    // --- 4b. PLAY AGAIN EVENT (Phase 3) ---
    socket.on('play-again', () => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;

        const room = rooms[code];
        const player = room.players.find(p => p.id === socket.id);

        if (player && player.isHost) {
            console.log(`Host ${socket.playerName} restarted the game in room ${code}`);
            
            // Reset room fields
            room.state = 'lobby';
            room.votes = {};
            room.mission = null;
            room.readyPlayers = {}; // reset onboarding ready list
            room.timer = room.timerSetting || 180;
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }
            if (room.onboardingTimeout) {
                clearTimeout(room.onboardingTimeout);
                room.onboardingTimeout = null;
            }

            // Reset player roles
            room.players.forEach(p => {
                p.role = null;
            });

            // Transition all players back to lobby
            io.to(code).emit('room-state', {
                roomCode: code,
                players: room.players,
                timerSetting: room.timerSetting
            });
        }
    });

    // --- 6. LEADERBOARD EVENT ---
    socket.on('get-leaderboard', () => {
        const top10 = Object.entries(leaderboardData)
            .map(([name, stats]) => ({ name, ...stats, rank: getRank(stats.points) }))
            .sort((a, b) => b.points - a.points)
            .slice(0, 10);
        socket.emit('leaderboard-data', top10);
    });

    // --- 5. DISCONNECT EVENT (Phase 2 & 3 Update) ---
    socket.on('disconnect', () => {
        const code = socket.roomCode;
        const name = socket.playerName;

        if (code && rooms[code]) {
            const room = rooms[code];
            
            // Remove player from the list
            room.players = room.players.filter(p => p.id !== socket.id);
            console.log(`Player ${name} left room ${code}`);

            // Remove their vote if we are in the voting phase
            if (room.state === 'voting' && room.votes) {
                delete room.votes[socket.id];
            }

            // If player leaves during onboarding phase, adjust ready count
            if (room.state === 'onboarding' && room.readyPlayers) {
                delete room.readyPlayers[socket.id];
                
                if (room.players.length > 0) {
                    const readyCount = Object.keys(room.readyPlayers).length;
                    const totalCount = room.players.length;

                    // Emit ready count update
                    io.to(code).emit('ready-update', {
                        readyCount,
                        totalCount
                    });

                    // Check if remaining players are all ready
                    if (readyCount >= totalCount) {
                        beginRound(code);
                    }
                }
            }

            // If no players left, clean up the room and stop the timer
            if (room.players.length === 0) {
                if (room.timerInterval) {
                    clearInterval(room.timerInterval);
                }
                if (room.onboardingTimeout) {
                    clearTimeout(room.onboardingTimeout);
                }
                delete rooms[code];
                console.log(`Room ${code} is empty, closing room.`);
            } else {
                // If the player who left was the host, assign host role to the next player
                const wasHost = !room.players.some(p => p.isHost);
                if (wasHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                    console.log(`Host left. New host assigned: ${room.players[0].name}`);
                }

                // If in voting phase, check if we can now evaluate because of this player's exit
                if (room.state === 'voting') {
                    const votesCount = Object.keys(room.votes).length;
                    const totalPlayers = room.players.length;
                    
                    io.to(code).emit('vote-updated', {
                        votesCount,
                        totalPlayers
                    });
                    
                    if (votesCount >= totalPlayers && totalPlayers > 0) {
                        evaluateGameResults(code);
                    }
                }

                // Broadcast updated room state to remaining players
                io.to(code).emit('room-state', {
                    roomCode: code,
                    players: room.players,
                    timerSetting: room.timerSetting
                });
            }
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start listening
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
