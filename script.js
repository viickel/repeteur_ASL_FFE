document.addEventListener('DOMContentLoaded', () => {

    // ========= VARIABLES GLOBALES =========
    let timerId;
    let matchTimeInSeconds = 180;
    let isTimerRunning = false;
    let isMedicalBreak = false;
    let currentMatchScoreLeft = 0;
    let currentMatchScoreRight = 0;

    let medicalTimerId;
    let medicalTimeInSeconds = 300;

    const medicalOverlay = document.getElementById('medicalOverlay');
    const medicalChronoDisplay = document.getElementById('medicalChrono');
    const closeMedicalBtn = document.getElementById('closeMedicalBtn');

    // Historique des actions pour l'annulation (état complet)
    const scoreHistory = [];
    const MAX_HISTORY_SIZE = 30;

    // Historique des sanctions
    const penalties = {
        left:  { group1: 0, group2: 0, group3: 0, group4: 0 },
        right: { group1: 0, group2: 0, group3: 0, group4: 0 }
    };

    // BroadcastChannel pour le cast TV (même origine uniquement)
    let broadcastChannel = null;
    try {
        broadcastChannel = new BroadcastChannel('asl_scoreboard');
    } catch(e) {
        console.warn('BroadcastChannel non supporté:', e);
    }

    // ========= SÉLECTION DES ÉLÉMENTS DU DOM =========
    const matchChronoDisplay = document.getElementById('matchChrono');
    const customTimeBtn      = document.getElementById('customTimeBtn');
    const quickTimer30s      = document.getElementById('quickTimer30s');
    const startStopButton    = document.getElementById('startStopButton');
    const resetBtn           = document.getElementById('resetBtn');
    const leftScoreDisplay   = document.getElementById('left_score');
    const rightScoreDisplay  = document.getElementById('right_score');
    const chronoControls     = document.getElementById('chronoControls');
    const medicalBreakBtn    = document.getElementById('medicalBreakBtn');
    const undoBtn            = document.getElementById('undoBtn');
    const faultButtons       = document.querySelectorAll('.fault-btn');
    const pointButtons       = document.querySelectorAll('.point-btn');
    const castBtn            = document.getElementById('castBtn');

    // ========= BROADCAST (CAST TV) =========
    function broadcastState() {
        if (!broadcastChannel) return;
        broadcastChannel.postMessage({
            type: 'state',
            left:  currentMatchScoreLeft,
            right: currentMatchScoreRight,
            time:  formatTime(matchTimeInSeconds),
            running: isTimerRunning,
            penalties: JSON.parse(JSON.stringify(penalties))
        });
    }

    // ========= FONCTIONS DE BASE =========
    function formatTime(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function setMatchTime(seconds) {
        clearInterval(timerId);
        isTimerRunning = false;
        matchTimeInSeconds = seconds;
        matchChronoDisplay.textContent = formatTime(matchTimeInSeconds);
        startStopButton.textContent = 'START';
        startStopButton.style.backgroundColor = 'green';
        broadcastState();
    }

    /**
     * Sauvegarde l'état COMPLET dans l'historique.
     * À appeler UNE SEULE FOIS par action utilisateur.
     */
    function saveStateToHistory() {
        if (scoreHistory.length >= MAX_HISTORY_SIZE) {
            scoreHistory.shift();
        }
        scoreHistory.push({
            left:      currentMatchScoreLeft,
            right:     currentMatchScoreRight,
            penalties: JSON.parse(JSON.stringify(penalties))
        });
    }

    function updateCardDisplay() {
        ['left', 'right'].forEach(player => {
            const p = penalties[player];
            let countWhite  = 0;
            let countYellow = 0;
            let countRed    = 0;
            let countBlack  = 0;

            if (p.group1 >= 1) countWhite = 1;
            if (p.group1 >= 2) countYellow += p.group1 - 1;

            if (p.group2 >= 1) countYellow += 1;
            if (p.group2 >= 2) countRed    += p.group2 - 1;

            if (p.group3 >= 1) countRed    += 1;
            if (p.group3 >= 2) countBlack  += 1;

            if (p.group4 >= 1) countBlack  += 1;

            const cards = { white: countWhite, yellow: countYellow, red: countRed, black: countBlack };

            for (const cardType in cards) {
                const el = document.getElementById(`${player}_card_${cardType}`);
                if (!el) continue;
                const count = cards[cardType];
                el.textContent = count;
                el.style.opacity = count > 0 ? '1' : '0.2';
            }
        });
    }

    /**
     * Met à jour le score SANS sauvegarder dans l'historique.
     * La sauvegarde est faite en amont par l'appelant.
     */
    function applyScore(player, points) {
        if (player === 'left') {
            currentMatchScoreLeft = Math.max(0, currentMatchScoreLeft + points);
            leftScoreDisplay.textContent = currentMatchScoreLeft;
        } else if (player === 'right') {
            currentMatchScoreRight = Math.max(0, currentMatchScoreRight + points);
            rightScoreDisplay.textContent = currentMatchScoreRight;
        }
    }

    /**
     * Annule la dernière action (UN SEUL pop = UN SEUL undo).
     */
    function undoLastAction() {
        if (scoreHistory.length === 0) {
            console.log('Historique vide.');
            return;
        }
        const prev = scoreHistory.pop();
        currentMatchScoreLeft  = prev.left;
        currentMatchScoreRight = prev.right;
        penalties.left  = { ...prev.penalties.left };
        penalties.right = { ...prev.penalties.right };

        leftScoreDisplay.textContent  = currentMatchScoreLeft;
        rightScoreDisplay.textContent = currentMatchScoreRight;
        updateCardDisplay();
        broadcastState();
        console.log('Dernière action annulée.');
    }

    // ========= CHRONOMÈTRE =========
    function startStopTimer() {
        if (isTimerRunning) {
            clearInterval(timerId);
            startStopButton.textContent = 'START';
            startStopButton.style.backgroundColor = 'green';
            isTimerRunning = false;
            resetBtn.style.display = 'block';
        } else {
            if (matchTimeInSeconds <= 0) return; // ne pas relancer si terminé
            timerId = setInterval(updateTimer, 1000);
            startStopButton.textContent = 'PAUSE';
            startStopButton.style.backgroundColor = 'red';
            isTimerRunning = true;
            resetBtn.style.display = 'none';
        }
        broadcastState();
    }

    function updateTimer() {
        if (matchTimeInSeconds > 0) {
            matchTimeInSeconds--;
            matchChronoDisplay.textContent = formatTime(matchTimeInSeconds);
            broadcastState();
        } else {
            clearInterval(timerId);
            isTimerRunning = false;
            startStopButton.textContent = 'FIN DU MATCH';
            startStopButton.style.backgroundColor = 'gray';
            resetBtn.style.display = 'block';
            broadcastState();
        }
    }

    function resetMatch() {
        if (!confirm('Réinitialiser le match ?')) return;
        clearInterval(timerId);
        clearInterval(medicalTimerId);
        isTimerRunning = false;
        isMedicalBreak = false;
        currentMatchScoreLeft  = 0;
        currentMatchScoreRight = 0;
        matchTimeInSeconds = 180;
        medicalTimeInSeconds = 300;

        penalties.left  = { group1: 0, group2: 0, group3: 0, group4: 0 };
        penalties.right = { group1: 0, group2: 0, group3: 0, group4: 0 };
        scoreHistory.length = 0;

        leftScoreDisplay.textContent  = '0';
        rightScoreDisplay.textContent = '0';
        matchChronoDisplay.textContent = '03:00';
        startStopButton.textContent = 'START';
        startStopButton.style.backgroundColor = 'green';
        resetBtn.style.display = 'none';

        medicalOverlay.classList.add('hidden');
        updateCardDisplay();
        broadcastState();
    }

    // ========= LOGIQUE FAUTES =========
    /**
     * FIX BUG PRINCIPAL : saveStateToHistory() est appelé UNE SEULE FOIS ici.
     * applyScore() ne sauvegarde plus dans l'historique.
     */
    function determineCardAndPoints(player, group) {
        // Sauvegarde unique AVANT toute modification
        saveStateToHistory();

        let card = '';
        let points = 0;
        let endsMatch = false;
        const opponent = player === 'left' ? 'right' : 'left';

        if (group !== 4) {
            penalties[player]['group' + group]++;
        }
        const faultLevel = penalties[player]['group' + group];

        switch (group) {
            case 1:
                if (faultLevel === 1) { card = 'white'; points = 0; }
                else                  { card = 'yellow'; points = 3; }
                break;
            case 2:
                if (faultLevel === 1) { card = 'yellow'; points = 3; }
                else                  { card = 'red'; points = 5; }
                break;
            case 3:
                if (faultLevel === 1) { card = 'red'; points = 5; }
                else                  { card = 'black'; endsMatch = true; }
                break;
            case 4:
                penalties[player]['group4']++; // groupe 4 s'incrémente quand même
                card = 'black';
                endsMatch = true;
                break;
            default:
                console.error('Groupe invalide:', group);
                return { card: '', points: 0, endsMatch: false };
        }

        if (points > 0) {
            applyScore(opponent, points);
        }

        updateCardDisplay();
        broadcastState();
        return { card, points, endsMatch };
    }

    function handleElimination(player) {
        if (isTimerRunning) {
            clearInterval(timerId);
            isTimerRunning = false;
        }
        startStopButton.textContent = 'MATCH TERMINÉ';
        startStopButton.style.backgroundColor = 'gray';
        resetBtn.style.display = 'block';

        const winner    = player === 'left' ? 'Combattant Vert (droite)' : 'Combattant Rouge (gauche)';
        const eliminated = player === 'left' ? 'Combattant Rouge (gauche)' : 'Combattant Vert (droite)';

        showNotification(`⬛ CARTON NOIR — ${eliminated} éliminé(e)\n🏆 Victoire de ${winner}`, 'black');
    }

    // ========= NOTIFICATION (remplace alert) =========
    function showNotification(message, color) {
        let overlay = document.getElementById('notifOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'notifOverlay';
            overlay.style.cssText = `
                position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(0,0,0,0.85); display:flex;
                justify-content:center; align-items:center; z-index:2000;
                cursor:pointer;
            `;
            overlay.addEventListener('click', () => overlay.remove());
            document.body.appendChild(overlay);
        }
        const colorMap = { black: '#111', red: '#ff004c', yellow: '#e4c700', white: '#f0f6fc' };
        const textColor = (color === 'white' || color === 'yellow') ? '#111' : '#fff';
        overlay.innerHTML = `
            <div style="
                background:${colorMap[color] || '#222'};
                color:${textColor};
                padding:2em 3em; border-radius:15px; text-align:center;
                font-size:1.5em; font-weight:bold; max-width:80%;
                border: 3px solid rgba(255,255,255,0.3);
                white-space: pre-line;
            ">
                ${message}
                <div style="margin-top:1em; font-size:0.6em; opacity:0.7;">Appuyez pour fermer</div>
            </div>
        `;
        overlay.style.display = 'flex';
    }

    // ========= PAUSE MÉDICALE =========
    function startMedicalBreak() {
        if (isMedicalBreak) return;
        if (isTimerRunning) {
            clearInterval(timerId);
            isTimerRunning = false;
            startStopButton.textContent = 'START';
            startStopButton.style.backgroundColor = 'green';
        }
        isMedicalBreak = true;
        medicalOverlay.classList.remove('hidden');

        let popupTime = 300;
        medicalChronoDisplay.textContent = formatTime(popupTime);

        medicalTimerId = setInterval(() => {
            popupTime--;
            medicalChronoDisplay.textContent = formatTime(popupTime);
            if (popupTime <= 0) endMedicalBreak();
        }, 1000);
    }

    function endMedicalBreak() {
        clearInterval(medicalTimerId);
        medicalOverlay.classList.add('hidden');
        isMedicalBreak = false;
        showNotification('Fin de la pause médicale !\nLe match reprend.', 'white');
        setTimeout(() => {
            document.getElementById('notifOverlay')?.remove();
            if (!isTimerRunning) startStopTimer();
        }, 2000);
    }

    // ========= TEMPS PERSONNALISÉ =========
    function promptForCustomTime() {
        const userInput = prompt('Entrez la durée du match (format MM:SS, ex: 05:00) :');
        if (!userInput) return;
        const match = userInput.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
            const m = parseInt(match[1], 10);
            const s = parseInt(match[2], 10);
            if (s >= 60) { alert('Les secondes doivent être < 60.'); return; }
            setMatchTime(m * 60 + s);
        } else {
            alert('Format invalide. Utilisez MM:SS (ex: 03:00).');
        }
    }

    // ========= CAST TV =========
    function openScoreboard() {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', 'tv');
        window.open(url.toString(), '_blank', 'noopener');
    }

    // ========= ÉCOUTEURS D'ÉVÉNEMENTS =========
    startStopButton.addEventListener('click', startStopTimer);
    resetBtn.addEventListener('click', resetMatch);
    undoBtn.addEventListener('click', undoLastAction);
    medicalBreakBtn.addEventListener('click', startMedicalBreak);
    closeMedicalBtn.addEventListener('click', endMedicalBreak);
    quickTimer30s.addEventListener('click', () => setMatchTime(30));
    customTimeBtn.addEventListener('click', promptForCustomTime);
    if (castBtn) castBtn.addEventListener('click', openScoreboard);

    matchChronoDisplay.addEventListener('click', () => {
        chronoControls.classList.toggle('force-hide');
    });

    pointButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            saveStateToHistory();
            applyScore(btn.dataset.player, parseInt(btn.dataset.points, 10));
            broadcastState();
        });
    });

    faultButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const player = btn.dataset.player;
            const group  = parseInt(btn.dataset.group, 10);
            const sanction = determineCardAndPoints(player, group);
            if (sanction.endsMatch) handleElimination(player);
            console.log(`${player} → ${sanction.card.toUpperCase()} (Grp ${group}), +${sanction.points} pts adversaire`);
        });
    });

    // ========= RACCOURCIS CLAVIER (UNIQUE listener) =========
    document.addEventListener('keydown', (event) => {
        if (event.repeat) return;

        const key  = event.key.toLowerCase();
        const code = event.code;

        // Touches bloquées pour éviter scroll/actions navigateur
        const blockedKeys = [' ', 'q', 'w', 'e', 'a', 'z', 'b', 'j', 'r', 'n'];
        if (blockedKeys.includes(key)) event.preventDefault();

        const noMod    = !event.shiftKey && !event.ctrlKey && !event.altKey;
        const shiftOnly = event.shiftKey && !event.ctrlKey && !event.altKey;
        const altOnly   = event.altKey && !event.shiftKey && !event.ctrlKey;

        // --- Points ---
        const pointMap = { 'KeyA': 1, 'KeyQ': 1, 'KeyZ': 3, 'KeyW': 3, 'KeyE': 5 };
        if (code in pointMap) {
            if (noMod)    { saveStateToHistory(); applyScore('left',  pointMap[code]); broadcastState(); return; }
            if (shiftOnly){ saveStateToHistory(); applyScore('right', pointMap[code]); broadcastState(); return; }
        }

        // --- Cartons ---
        const cardMap = { 'b': 1, 'j': 2, 'r': 3, 'n': 4 };
        if (key in cardMap && (noMod || altOnly)) {
            const player = noMod ? 'left' : 'right';
            const sanction = determineCardAndPoints(player, cardMap[key]);
            if (sanction.endsMatch) handleElimination(player);
            return;
        }

        // --- Commandes globales ---
        if (key === ' ')  { startStopTimer(); return; }
        if (key === 'z' && event.ctrlKey) { event.preventDefault(); undoLastAction(); return; }
        if (key === 'f5') { event.preventDefault(); resetMatch(); return; }
    });

    // ========= MODE TV (si ouvert depuis cast) =========
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'tv') {
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0; background:#0d1117; color:#c9d1d9; font-family:monospace; overflow:hidden;';
        document.body.innerHTML = `
            <div id="tv-view" style="
                width:100vw; height:100vh; display:flex; flex-direction:column;
                justify-content:center; align-items:center; gap:20px;
            ">
                <div style="display:flex; gap:60px; align-items:center;">
                    <div style="text-align:center;">
                        <div style="font-size:16px; color:#ff004c; letter-spacing:3px; margin-bottom:8px;">ROUGE</div>
                        <div id="tv-left" style="font-size:18vw; font-weight:bold; color:#ff004c; line-height:1;">0</div>
                        <div id="tv-cards-left" style="display:flex; gap:10px; justify-content:center; margin-top:10px;"></div>
                    </div>
                    <div style="text-align:center;">
                        <div id="tv-chrono" style="font-size:6vw; color:#c9d1d9; font-weight:bold;">03:00</div>
                        <div id="tv-status" style="font-size:2vw; color:#8b949e; margin-top:5px;">EN ATTENTE</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:16px; color:#0cc346; letter-spacing:3px; margin-bottom:8px;">VERT</div>
                        <div id="tv-right" style="font-size:18vw; font-weight:bold; color:#0cc346; line-height:1;">0</div>
                        <div id="tv-cards-right" style="display:flex; gap:10px; justify-content:center; margin-top:10px;"></div>
                    </div>
                </div>
            </div>
        `;

        const cardColors = { white: '#f0f6fc', yellow: '#e4c700', red: '#ff004c', black: '#111' };
        const cardText   = { white: '#111', yellow: '#111', red: '#fff', black: '#fff' };

        function renderCards(containerId, penalties) {
            const el = document.getElementById(containerId);
            if (!el) return;
            const p = penalties;
            let cards = [];
            if (p.group1 >= 1) cards.push('white');
            for (let i = 1; i < p.group1; i++) cards.push('yellow');
            if (p.group2 >= 1) cards.push('yellow');
            for (let i = 1; i < p.group2; i++) cards.push('red');
            if (p.group3 >= 1) cards.push('red');
            if (p.group3 >= 2) cards.push('black');
            if (p.group4 >= 1) cards.push('black');

            el.innerHTML = cards.map(c => `
                <div style="
                    width:40px; height:56px; background:${cardColors[c]}; color:${cardText[c]};
                    border-radius:5px; border:1px solid rgba(255,255,255,0.2);
                "></div>
            `).join('');
        }

        if (broadcastChannel) {
            // Demande l'état initial
            broadcastChannel.postMessage({ type: 'request_state' });
            broadcastChannel.onmessage = (event) => {
                const d = event.data;
                if (d.type !== 'state') return;
                document.getElementById('tv-left').textContent   = d.left;
                document.getElementById('tv-right').textContent  = d.right;
                document.getElementById('tv-chrono').textContent = d.time;
                document.getElementById('tv-status').textContent = d.running ? '▶ EN COURS' : '⏸ PAUSE';
                renderCards('tv-cards-left',  d.penalties.left);
                renderCards('tv-cards-right', d.penalties.right);
            };
        } else {
            document.getElementById('tv-status').textContent = 'BroadcastChannel non supporté — utilisez le même navigateur';
        }
        return; // Pas besoin d'initialiser le reste en mode TV
    }

    // Répondre aux demandes d'état depuis la TV
    if (broadcastChannel) {
        broadcastChannel.onmessage = (event) => {
            if (event.data.type === 'request_state') broadcastState();
        };
    }

    // Initialisation affichage
    updateCardDisplay();
    broadcastState();
});
