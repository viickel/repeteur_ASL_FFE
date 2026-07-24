document.addEventListener('DOMContentLoaded', () => {

    // ========= VARIABLES GLOBALES =========
    let timerId;
    let matchTimeInSeconds = 180;
    let isTimerRunning = false;
    let isMedicalBreak = false;
    let currentMatchScoreLeft = 0;
    let currentMatchScoreRight = 0;
    let medicalTimerId;
    //========= Variable pour le mode équipe =========
    let isTeamMode = false;
    let relayTouches = 0;
    let relayPauseTimerId;


    const scoreHistory = [];
    const MAX_HISTORY_SIZE = 30;

    const penalties = {
        left:  { group1: 0, group2: 0, group3: 0, group4: 0 },
        right: { group1: 0, group2: 0, group3: 0, group4: 0 }
    };

const teamPenaltiesE = {
    left: { group1: 0, group2: 0, white: 0, yellow: 0, group3: 0, red: 0 },
    right: { group1: 0, group2: 0, white: 0, yellow: 0, group3: 0, red: 0 }
};

    // ========= SÉLECTION DOM =========
    const matchChronoDisplay   = document.getElementById('matchChrono');
    const customTimeBtn        = document.getElementById('customTimeBtn');
    const quickTimer30s        = document.getElementById('quickTimer30s');
    const startStopButton      = document.getElementById('startStopButton');
    const resetBtn             = document.getElementById('resetBtn');
    const leftScoreDisplay     = document.getElementById('scoreLeft');
    const rightScoreDisplay    = document.getElementById('scoreRight');
    const chronoControls       = document.getElementById('chronoControls');
    const medicalOverlay       = document.getElementById('medicalOverlay');
    const medicalChronoDisplay = document.getElementById('medicalChrono');
    const closeMedicalBtn      = document.getElementById('closeMedicalBtn');
    const undoBtn              = document.getElementById('undoBtn');
    const faultButtons         = document.querySelectorAll('.fault-btn');
    const pointButtons         = document.querySelectorAll('.point-btn');
    const castBtn              = document.getElementById('castBtn');
    
    // Éléments Gamification & Reset
    const leftNameInput        = document.getElementById('leftName');
    const rightNameInput       = document.getElementById('rightName');
    const resetModal           = document.getElementById('resetModal');
    const yesResetBtn          = document.getElementById('yesResetBtn');
    const noResetBtn           = document.getElementById('noResetBtn');
    const shareCardBtn         = document.getElementById('shareCardBtn');

    // Sauvegarde des noms dans le localStorage
    if(leftNameInput && rightNameInput) {
        leftNameInput.value = localStorage.getItem('asl-leftName') || '';
        rightNameInput.value = localStorage.getItem('asl-rightName') || '';
        leftNameInput.addEventListener('input', () => localStorage.setItem('asl-leftName', leftNameInput.value));
        rightNameInput.addEventListener('input', () => localStorage.setItem('asl-rightName', rightNameInput.value));
    }

    // ========= PWA — Installation =========
    let deferredInstallPrompt = null;
    const installBanner = document.getElementById('pwaInstallBanner');
    const installBtn    = document.getElementById('pwaInstallBtn');
    const dismissBtn    = document.getElementById('pwaDismissBtn');

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.warn('[PWA] Erreur SW:', err));
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        setTimeout(() => {
            if (installBanner) installBanner.style.display = 'flex';
        }, 2000);
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            installBanner.style.display = 'none';
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
        });
    }

    if (dismissBtn) { dismissBtn.addEventListener('click', () => { installBanner.style.display = 'none'; }); }
    window.addEventListener('appinstalled', () => { if (installBanner) installBanner.style.display = 'none'; deferredInstallPrompt = null; });

    // ========= PEER.JS — CAST TV =========
    let peer = null;
    let tvConnection = null;
    let sessionCode = null;

    function generateSessionCode() { return 'ASL-' + Math.floor(1000 + Math.random() * 9000); }

    function initPeerAsController() {
        sessionCode = generateSessionCode();
        peer = new Peer(sessionCode, { debug: 0 });
        peer.on('open', (id) => updateCastStatus('waiting', sessionCode));
        peer.on('connection', (conn) => {
            tvConnection = conn;
            conn.on('open', () => { updateCastStatus('connected', sessionCode); broadcastState(); });
            conn.on('close', () => { tvConnection = null; updateCastStatus('waiting', sessionCode); });
        });
        peer.on('error', (e) => updateCastStatus('error', ''));
    }

    function initPeerAsTV(code) {
        showTVMode();
        updateTVStatus('connecting');
        const connectionTimeout = setTimeout(() => updateTVStatus('timeout'), 10000);
        try { peer = new Peer({ debug: 0 }); } catch(e) { clearTimeout(connectionTimeout); updateTVStatus('no-webrtc'); return; }

        peer.on('open', () => {
            const conn = peer.connect(code, { reliable: true });
            const peerConnTimeout = setTimeout(() => updateTVStatus('peer-timeout'), 8000);
            conn.on('open', () => {
                clearTimeout(connectionTimeout); clearTimeout(peerConnTimeout);
                updateTVStatus('connected');
            });
            conn.on('data', (data) => { if (data.type === 'state') renderTVState(data); });
            conn.on('close', () => updateTVStatus('disconnected'));
            conn.on('error', (e) => { clearTimeout(connectionTimeout); clearTimeout(peerConnTimeout); updateTVStatus('error'); });
        });
        peer.on('error', (e) => {
            clearTimeout(connectionTimeout);
            if (e.type === 'peer-unavailable') updateTVStatus('peer-unavailable');
            else if (e.type === 'network' || e.type === 'server-error') updateTVStatus('network-error');
            else updateTVStatus('error');
        });
    }

    function broadcastState() {
        if (!tvConnection || !tvConnection.open) return;
        try {
            tvConnection.send({
                type: 'state',
                left: currentMatchScoreLeft,
                right: currentMatchScoreRight,
                time: formatTime(matchTimeInSeconds),
                running: isTimerRunning,
                medical: isMedicalBreak,
                penalties: JSON.parse(JSON.stringify(penalties)),
                leftName: leftNameInput ? leftNameInput.value.trim() : 'ROUGE',
                rightName: rightNameInput ? rightNameInput.value.trim() : 'VERT',
                teamPenaltiesE: teamPenaltiesE,
                relayTouches: relayTouches,
                isTeamMode: isTeamMode
            });
        } catch(e) { console.warn('broadcast error:', e); }
    }

    function updateCastStatus(status, code) {
        const el = document.getElementById('castStatus');
        if (!el) return;
        const map = {
            idle: { text: '📺 CAST TV', bg: 'transparent', color: '#5af' },
            waiting: { text: `⏳ ${code}`, bg: '#e4a300', color: '#111' },
            connected: { text: `✅ ${code}`, bg: '#0cc346', color: '#0d1117' },
            error: { text: '❌ Erreur PeerJS', bg: '#ff004c', color: '#fff' },
        };
        const s = map[status] || map.idle;
        el.textContent = s.text;
        el.style.background = s.bg;
        el.style.color = s.color;
        el.style.padding = status !== 'idle' ? '2px 8px' : '';
        el.style.borderRadius = '6px';
    }

    function showTVMode() {
        document.body.innerHTML = `
        <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0d12;font-family:'Segoe UI',Arial,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column;}

        /* ── Barre de statut ── */
        #tv-bar{
            background:#0d1117;
            border-bottom:1px solid #1a1a2e;
            padding:5px 16px;
            font-size:11px;color:#444;
            display:flex;justify-content:space-between;align-items:center;
            flex-shrink:0;
        }
        #tv-bar .tv-bar-logo { color:#4df5d9; font-weight:700; letter-spacing:2px; font-size:12px; }
        #tv-conn{font-size:11px;padding:3px 8px;border-radius:6px;}
        #tv-clock{color:#555; font-size:11px;}

        /* ── Layout principal 3 colonnes ── */
        #tv-main{
            flex:1;
            display:grid;
            grid-template-columns:1fr auto 1fr;
            min-height:0;
        }

        /* ── Côtés gauche et droit ── */
        .tv-side{
            display:flex;flex-direction:column;
            min-height:0;
            overflow:hidden;
        }

        /* Bandeau nom — fond coloré comme l'image de référence */
        .tv-name-bar{
            padding:clamp(8px,2vh,18px) 20px;
            text-align:center;
            font-size:clamp(1.4rem,4vw,3rem);
            font-weight:900;
            letter-spacing:3px;
            text-transform:uppercase;
            color:#fff;
            flex-shrink:0;
        }
        .tv-name-bar.red-bar  { background:linear-gradient(135deg,#cc0038,#ff004c); text-shadow:0 2px 8px rgba(0,0,0,0.5); }
        .tv-name-bar.green-bar{ background:linear-gradient(135deg,#0a8f32,#0cc346); text-shadow:0 2px 8px rgba(0,0,0,0.5); }

        /* Zone score */
        .tv-score-area{
            flex:1;
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            padding:10px 20px;
        }

        .tv-score{
            font-size:clamp(4rem,20vw,18rem);
            font-weight:900;
            line-height:0.9;
            font-variant-numeric:tabular-nums;
        }
        .tv-lc{color:#ff004c; text-shadow:0 0 60px rgba(255,0,76,.4);}
        .tv-rc{color:#0cc346; text-shadow:0 0 60px rgba(12,195,70,.4);}

        /* Cartons classiques */
        .tv-cards{display:flex;gap:6px;margin-top:14px;min-height:36px;align-items:center;justify-content:center;}
        .tv-card{width:clamp(20px,2.5vw,36px);height:clamp(28px,3.5vw,50px);border-radius:4px;border:1px solid rgba(255,255,255,0.15);}
        .tv-card-white {background:#f0f6fc;}
        .tv-card-yellow{background:#e4c700;}
        .tv-card-red   {background:#ff004c;}
        .tv-card-black {background:#111;border-color:#555;}

        /* Cartons E (mode équipe) */
        .tv-cards-e{
            display:flex;gap:10px;margin-top:8px;min-height:24px;
            align-items:center;justify-content:center;
        }
        .tv-card-e-badge{
            font-size:clamp(0.7rem,1.5vw,1.1rem);
            font-weight:700;
            padding:3px 10px;
            border-radius:20px;
            letter-spacing:1px;
        }
        .tv-card-e-white { color:#0d1117; background:#f0f6fc; }
        .tv-card-e-yellow{ color:#0d1117; background:#e4c700; }

        /* ── Colonne centrale ── */
        #tv-center{
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            gap:12px;
            padding:10px 16px;
            border-left:1px solid #1a1a2e;
            border-right:1px solid #1a1a2e;
            min-width:clamp(140px,18vw,260px);
            background:#0d1117;
        }

        .tv-center-label{
            font-size:clamp(0.5rem,1vw,0.75rem);
            color:#333;
            letter-spacing:3px;
            text-transform:uppercase;
        }

        #tv-chrono{
            font-size:clamp(2rem,7vw,6rem);
            font-weight:900;
            color:#c9d1d9;
            letter-spacing:3px;
            font-variant-numeric:tabular-nums;
            text-align:center;
            padding:12px 16px;
            background:#111;
            border:2px solid #1a1a2e;
            border-radius:10px;
            width:100%;
            transition:color .3s,border-color .3s,box-shadow .3s;
        }
        #tv-chrono.running{
            border-color:#4df5d9;
            color:#4df5d9;
            box-shadow:0 0 20px rgba(77,245,217,0.2);
        }
        #tv-chrono.medical{
            border-color:#ff004c;
            color:#ff004c;
            animation:tvblink 1s infinite;
        }
        @keyframes tvblink{0%,100%{opacity:1}50%{opacity:0.4}}

        #tv-vs{
            font-size:clamp(0.7rem,1.5vw,1.2rem);
            color:#222;
            letter-spacing:6px;
            font-weight:700;
        }

        /* Touches relais (mode équipe) */
        #tv-relay{
            font-size:clamp(0.65rem,1.2vw,0.9rem);
            color:#e4c700;
            font-weight:700;
            letter-spacing:1px;
            text-align:center;
            padding:6px 12px;
            background:rgba(228,199,0,0.1);
            border:1px solid rgba(228,199,0,0.3);
            border-radius:8px;
            display:none;
        }
        #tv-relay.active{display:block;}

        </style>

        <div id="tv-bar">
            <span class="tv-bar-logo">ASL-FFE</span>
            <span id="tv-conn">⏳ En attente...</span>
            <span id="tv-clock"></span>
        </div>

        <div id="tv-main">

            <!-- Côté ROUGE -->
            <div class="tv-side">
                <div class="tv-name-bar red-bar" id="tv-left-name">ROUGE</div>
                <div class="tv-score-area">
                    <div class="tv-score tv-lc" id="tv-left">0</div>
                    <div class="tv-cards" id="tv-cards-left"></div>
                    <div class="tv-cards-e" id="tv-cards-e-left"></div>
                </div>
            </div>

            <!-- Centre : chrono -->
            <div id="tv-center">
                <div class="tv-center-label">TEMPS</div>
                <div id="tv-chrono">03:00</div>
                <div id="tv-vs">VS</div>
                <div id="tv-relay">⚡ 0 / 5 touches</div>
            </div>

            <!-- Côté VERT -->
            <div class="tv-side">
                <div class="tv-name-bar green-bar" id="tv-right-name">VERT</div>
                <div class="tv-score-area">
                    <div class="tv-score tv-rc" id="tv-right">0</div>
                    <div class="tv-cards" id="tv-cards-right"></div>
                    <div class="tv-cards-e" id="tv-cards-e-right"></div>
                </div>
            </div>

        </div>`;

        setInterval(() => { const el = document.getElementById('tv-clock'); if (el) el.textContent = new Date().toLocaleTimeString('fr-FR'); }, 1000);
    }

    function updateTVStatus(status) {
        const el = document.getElementById('tv-conn');
        if (!el) return;
        const map = {
            connecting: { text: '⏳ Connexion en cours…', color: '#e4a300' },
            connected: { text: '✅ Connecté', color: '#0cc346' },
            disconnected: { text: '❌ Déconnecté', color: '#ff004c' },
            error: { text: '⚠️ Erreur PeerJS', color: '#ff004c' },
            timeout: { text: '⏱ Timeout WebRTC', color: '#ff004c' },
            'no-webrtc': { text: '🚫 WebRTC non supporté', color: '#ff004c' },
            'peer-unavailable': { text: '❓ Code introuvable', color: '#e4a300' },
            'peer-timeout': { text: '⏱ Tablette ne répond pas', color: '#e4a300' },
            'network-error': { text: '🌐 Erreur réseau', color: '#e4a300' },
        };
        if(map[status]) { el.innerHTML = map[status].text; el.style.color = map[status].color; }
    }

function renderTVState(data) {
    const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    set('tv-left',  data.left);
    set('tv-right', data.right);
    set('tv-chrono', data.time);
    set('tv-left-name',  data.leftName  || 'ROUGE');
    set('tv-right-name', data.rightName || 'VERT');

    // Chrono : état visuel
    const ch = document.getElementById('tv-chrono');
    if (ch) ch.className = data.medical ? 'medical' : (data.running ? 'running' : '');

    // Cartons classiques
    renderTVCards('tv-cards-left',  data.penalties.left);
    renderTVCards('tv-cards-right', data.penalties.right);

    // Cartons E — badges compacts
    renderTVCardsE('tv-cards-e-left',  data.teamPenaltiesE ? data.teamPenaltiesE.left  : null);
    renderTVCardsE('tv-cards-e-right', data.teamPenaltiesE ? data.teamPenaltiesE.right : null);

    // Touches relais
    const relayEl = document.getElementById('tv-relay');
    if (relayEl) {
        if (data.relayTouches !== undefined && data.isTeamMode) {
            relayEl.textContent = `⚡ ${data.relayTouches} / 5 touches`;
            relayEl.classList.add('active');
        } else {
            relayEl.classList.remove('active');
        }
    }
}

function renderTVCardsE(containerId, p) {
    const el = document.getElementById(containerId);
    if (!el || !p) { if (el) el.innerHTML = ''; return; }
    let html = '';
    if (p.white  > 0) html += `<span class="tv-card-e-badge tv-card-e-white">Blanc E ×${p.white}</span>`;
    if (p.yellow > 0) html += `<span class="tv-card-e-badge tv-card-e-yellow">Jaune E ×${p.yellow}</span>`;
    el.innerHTML = html;
}

    function renderTVCards(containerId, p) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const cards = [];
        if (p.group1 >= 1) cards.push('white');
        for (let i = 1; i < p.group1; i++) cards.push('yellow');
        if (p.group2 >= 1) cards.push('yellow');
        for (let i = 1; i < p.group2; i++) cards.push('red');
        if (p.group3 >= 1) cards.push('red');
        if (p.group3 >= 2) cards.push('black');
        if (p.group4 >= 1) cards.push('black');
        el.innerHTML = cards.map(c => `<div class="tv-card tv-card-${c}"></div>`).join('');
    }

    function showCastModal() {
        let modal = document.getElementById('castModal');
        if (modal) { modal.style.display = 'flex'; return; }
        modal = document.createElement('div');
        modal.id = 'castModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);display:flex;justify-content:center;align-items:center;z-index:3000;';
        modal.innerHTML = `
        <div style="background:#161b22;border:2px solid #30363d;border-radius:16px;padding:2em;max-width:420px;width:90%;color:#c9d1d9;text-align:center;">
            <h2 style="margin:0 0 1em;">📺 CAST TV</h2>
            <button id="castStartBtn" style="background:#007bff;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:16px;font-weight:bold;cursor:pointer;width:100%;margin-bottom:15px;">📡 Générer le Code</button>
            <div id="castCodeDisplay" style="display:none;font-size:2.2em;font-weight:bold;letter-spacing:8px;color:#e4c700;padding:12px;background:#0d1117;border-radius:8px;border:1px solid #30363d;"></div>
            <hr style="border-color:#30363d;margin:1.5em 0;">
            <input id="castCodeInput" type="text" placeholder="ASL-XXXX" style="width:100%;background:#0d1117;border:2px solid #30363d;border-radius:8px;padding:10px;color:#c9d1d9;font-size:18px;text-align:center;font-weight:bold;text-transform:uppercase;margin-bottom:10px;">
            <button id="castConnectBtn" style="background:#0cc346;color:#0d1117;border:none;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:bold;cursor:pointer;width:100%;">MODE TV</button>
            <button id="castCloseBtn" style="margin-top:1.5em;background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:8px;padding:8px 20px;cursor:pointer;">Fermer</button>
        </div>`;
        document.body.appendChild(modal);

        document.getElementById('castStartBtn').addEventListener('click', () => {
            if (peer) { peer.destroy(); peer = null; sessionCode = null; }
            initPeerAsController();
            document.getElementById('castCodeDisplay').style.display = 'block';
            document.getElementById('castCodeDisplay').textContent = '⏳...';
            const wait = setInterval(() => { if (sessionCode) { clearInterval(wait); document.getElementById('castCodeDisplay').textContent = sessionCode; } }, 300);
        });

        document.getElementById('castConnectBtn').addEventListener('click', () => {
            const code = document.getElementById('castCodeInput').value.trim().toUpperCase();
            if (!code.match(/^ASL-\d{4}$/)) { alert('Code invalide.'); return; }
            modal.style.display = 'none'; initPeerAsTV(code);
        });

        document.getElementById('castCloseBtn').addEventListener('click', () => modal.style.display = 'none');
    }

    // ========= UTILITAIRES =========
    function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }

    window.adjustScore = function(player, points) { // Rendue globale pour oncontextmenu
        saveStateToHistory();
        applyScore(player, points);
        broadcastState();
    }

    function saveStateToHistory() {
        if (scoreHistory.length >= MAX_HISTORY_SIZE) scoreHistory.shift();
        scoreHistory.push({ 
            left: currentMatchScoreLeft, 
            right: currentMatchScoreRight, 
            penalties: JSON.parse(JSON.stringify(penalties)),
            touches: relayTouches, // Sauvegarde des touches
            teamPenaltiesE: JSON.parse(JSON.stringify(teamPenaltiesE)) // Sauvegarde carton E
        });
    }

    function updateCardDisplay() {
        ['left','right'].forEach(player => {
            const p = penalties[player]; let w=0,y=0,r=0,b=0;
            if (p.group1>=1) w=1;
            if (p.group1>=2) y+=p.group1-1;
            if (p.group2>=1) y+=1;
            if (p.group2>=2) r+=p.group2-1;
            if (p.group3>=1) r+=1;
            if (p.group3>=2) b+=1;
            if (p.group4>=1) b+=1;
            [['white',w],['yellow',y],['red',r],['black',b]].forEach(([c,n]) => {
                const el = document.getElementById(`${player}_card_${c}`);
                if (!el) return; el.textContent = n; el.style.opacity = n > 0 ? '1' : '0.2';
            });
        });
    }

    function applyScore(player, points) {
        if (player === 'left') { currentMatchScoreLeft = Math.max(0, currentMatchScoreLeft + points); leftScoreDisplay.textContent = currentMatchScoreLeft; } 
        else { currentMatchScoreRight = Math.max(0, currentMatchScoreRight + points); rightScoreDisplay.textContent = currentMatchScoreRight; }
    }

   function undoLastAction() {
    if (scoreHistory.length === 0) return;
    const prev = scoreHistory.pop();
    
    currentMatchScoreLeft = prev.left; 
    currentMatchScoreRight = prev.right;
    
    // Restauration propre en modifiant les propriétés (Garde la référence intacte)
    ['left', 'right'].forEach(p => {
        penalties[p].group1 = prev.penalties[p].group1 || 0;
        penalties[p].group2 = prev.penalties[p].group2 || 0;
        penalties[p].group3 = prev.penalties[p].group3 || 0;
        penalties[p].group4 = prev.penalties[p].group4 || 0;

        if (prev.teamPenaltiesE && prev.teamPenaltiesE[p]) {
            teamPenaltiesE[p].group1 = prev.teamPenaltiesE[p].group1 || 0;
            teamPenaltiesE[p].group2 = prev.teamPenaltiesE[p].group2 || 0;
            teamPenaltiesE[p].group3 = prev.teamPenaltiesE[p].group3 || 0; 
            teamPenaltiesE[p].white = prev.teamPenaltiesE[p].white || 0;
            teamPenaltiesE[p].yellow = prev.teamPenaltiesE[p].yellow || 0;
            teamPenaltiesE[p].red = prev.teamPenaltiesE[p].red || 0; 
        } else {
            teamPenaltiesE[p].group1 = 0; 
            teamPenaltiesE[p].group2 = 0; 
            teamPenaltiesE[p].group3 = 0; 
            teamPenaltiesE[p].white = 0; 
            teamPenaltiesE[p].yellow = 0; 
            teamPenaltiesE[p].red = 0; 
        }
    });
    
    relayTouches = prev.touches || 0;
    
    // Mise à jour de l'UI
    leftScoreDisplay.textContent = currentMatchScoreLeft; 
    rightScoreDisplay.textContent = currentMatchScoreRight;
    updateCardDisplay(); 
    updateRelayUI(); 
    updateTeamCardEDisplay(); 
    broadcastState();
}

    function setMatchTime(seconds) {
        clearInterval(timerId); isTimerRunning = false; matchTimeInSeconds = seconds;
        matchChronoDisplay.textContent = formatTime(seconds);
        startStopButton.textContent = 'START'; startStopButton.style.backgroundColor = 'green';
        broadcastState();
    }

    function startStopTimer() {
        if (isTimerRunning) { clearInterval(timerId); startStopButton.textContent = 'START'; startStopButton.style.backgroundColor = 'green'; isTimerRunning = false; resetBtn.style.display = 'block'; } 
        else { if (matchTimeInSeconds <= 0) return; timerId = setInterval(updateTimer, 1000); startStopButton.textContent = 'PAUSE'; startStopButton.style.backgroundColor = 'red'; isTimerRunning = true; resetBtn.style.display = 'none'; }
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
            matchChronoDisplay.textContent = '00:00'; 
            
            if (isTeamMode) {
                triggerRelayPause(); // Fin du temps = Fin du relais 
            } else {
                startStopButton.textContent = 'FIN DU MATCH'; 
                startStopButton.style.backgroundColor = 'gray'; 
                resetBtn.style.display = 'block'; 
            }
            broadcastState(); 
        }
    }

    // ========= GAMIFICATION : RESET MODAL & PARTAGE =========
    function showResetModal() {
        document.getElementById('mcLeftName').textContent = leftNameInput.value.trim() || 'ROUGE';
        document.getElementById('mcRightName').textContent = rightNameInput.value.trim() || 'VERT';
        document.getElementById('mcLeftScore').textContent = currentMatchScoreLeft;
        document.getElementById('mcRightScore').textContent = currentMatchScoreRight;
        resetModal.classList.remove('hidden');
    }

    function performReset() {
        clearInterval(timerId); clearInterval(medicalTimerId);
        isTimerRunning = false; isMedicalBreak = false;
        currentMatchScoreLeft = 0; currentMatchScoreRight = 0; matchTimeInSeconds = 180;
        
        // Reset propre des sanctions
        ['left', 'right'].forEach(p => {
            penalties[p].group1 = 0;
            penalties[p].group2 = 0;
            penalties[p].group3 = 0;
            penalties[p].group4 = 0;
            
            teamPenaltiesE[p].group1 = 0;
            teamPenaltiesE[p].group2 = 0;
            teamPenaltiesE[p].group3 = 0;
            teamPenaltiesE[p].white = 0;
            teamPenaltiesE[p].yellow = 0;
            teamPenaltiesE[p].red = 0; 
        });
        
        scoreHistory.length = 0;
        leftScoreDisplay.textContent = '0'; rightScoreDisplay.textContent = '0';
        matchChronoDisplay.textContent = '03:00';
        startStopButton.textContent = 'START'; startStopButton.style.backgroundColor = 'green';
        resetBtn.style.display = 'none'; medicalOverlay.classList.add('hidden');
        resetModal.classList.add('hidden');
        
        // Rafraîchissement des visuels
        updateCardDisplay(); 
        updateTeamCardEDisplay();
        broadcastState();
    }



    yesResetBtn.addEventListener('click', performReset);
    noResetBtn.addEventListener('click', () => resetModal.classList.add('hidden'));

    shareCardBtn.addEventListener('click', async () => {
        const originalText = shareCardBtn.innerHTML;
        shareCardBtn.innerHTML = "⏳ Génération..."; shareCardBtn.disabled = true;
        const card = document.getElementById('matchCard');
        try {
            const canvas = await html2canvas(card, { backgroundColor: '#050505', scale: 2 });
            canvas.toBlob(async (blob) => {
                const file = new File([blob], `Resultat_ASL.png`, { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ title: 'Résultat ASL', text: 'Résultat du match !', files: [file] }); } 
                    catch (err) { console.log("Partage annulé"); }
                } else {
                    const link = document.createElement('a');
                    link.download = `Match_${document.getElementById('mcLeftName').textContent}_VS_${document.getElementById('mcRightName').textContent}.png`;
                    link.href = canvas.toDataURL('image/png'); link.click();
                }
                shareCardBtn.innerHTML = originalText; shareCardBtn.disabled = false;
            });
        } catch (err) { console.error(err); alert("Erreur d'image"); shareCardBtn.innerHTML = originalText; shareCardBtn.disabled = false; }
    });




// ========= MODE ÉQUIPE =========
    const teamModeBtn = document.getElementById('teamModeBtn');
    const teamTouchesDisplay = document.getElementById('teamTouchesDisplay');
    const teamTouchesCount = document.getElementById('teamTouchesCount');
    const relayOverlay = document.getElementById('relayOverlay');
    const relayTimerDisplay = document.getElementById('relayTimer');
    const nextRelayBtn = document.getElementById('nextRelayBtn');

    teamModeBtn.addEventListener('click', () => {
        isTeamMode = !isTeamMode;
        teamModeBtn.style.backgroundColor = isTeamMode ? '#007bff' : 'transparent';
        teamModeBtn.style.color = isTeamMode ? 'white' : '#007bff';
        
        // Sélectionne tous les éléments de l'interface Équipe
        const teamElements = document.querySelectorAll('.team-E-ui');
        
        if(isTeamMode) {
            teamTouchesDisplay.classList.remove('hidden');
            teamElements.forEach(el => el.classList.remove('hidden'));
            relayTouches = 0;
            updateRelayUI();
            updateTeamCardEDisplay();
        } else {
            teamTouchesDisplay.classList.add('hidden');
            teamElements.forEach(el => el.classList.add('hidden'));
        }
    });

    function updateRelayUI() {
        if(teamTouchesCount) teamTouchesCount.textContent = relayTouches;
    }

    // Fonction centralisée pour marquer un point et compter la touche
    function handlePointScored(player, points) {
        saveStateToHistory();
        applyScore(player, points);
        
        if (isTeamMode) {
            relayTouches++;
            updateRelayUI();
            // Le relais s'arrête à 5 touches maximum 
            if (relayTouches >= 5) {
                setTimeout(triggerRelayPause, 200); // Léger délai pour voir le score monter
            }
        }
        broadcastState();
    }

    function triggerRelayPause() {
        // Met le chrono principal en pause
        if (isTimerRunning) { clearInterval(timerId); isTimerRunning = false; startStopButton.textContent = 'START'; startStopButton.style.backgroundColor = 'green'; }
        
        relayOverlay.classList.remove('hidden');
        let t = 60; // 1 minute de réflexion [cite: 27]
        relayTimerDisplay.textContent = formatTime(t);
        
        relayPauseTimerId = setInterval(() => {
            t--;
            relayTimerDisplay.textContent = formatTime(t);
            if (t <= 0) {
                clearInterval(relayPauseTimerId);
                // Optionnel : Ajouter un son ici
            }
        }, 1000);
    }

    nextRelayBtn.addEventListener('click', () => {
        clearInterval(relayPauseTimerId);
        relayOverlay.classList.add('hidden');
        relayTouches = 0;
        updateRelayUI();
        
        // IMPORTANT : Remise à zéro propre pour le nouveau relais
        ['left', 'right'].forEach(p => {
            penalties[p].group1 = 0;
            penalties[p].group2 = 0;
            penalties[p].group3 = 0;
            penalties[p].group4 = 0;
        });
        
        updateCardDisplay(); 
        setMatchTime(180); 
    });


// Gestion des clics sur les boutons Carton E
    document.querySelectorAll('.team-E-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const player = btn.dataset.player;
            const type = btn.dataset.type;
            applyTeamCardE(player, type);
        });
    });

function applyTeamCardE(player, type) {
        saveStateToHistory();
        
        // Convertir le type cliqué ('white' ou 'yellow') en numéro de groupe
        let group = (type === 'white') ? 1 : (type === 'yellow' ? 2 : 3);
        // Si plus tard vous ajoutez data-type="red" dans le HTML, changez la ligne ci-dessus par :
        // let group = (type === 'white') ? 1 : (type === 'yellow' ? 2 : 3);
        
        teamPenaltiesE[player]['group'+group]++; 
        const lvl = teamPenaltiesE[player]['group'+group];
        const opponent = player === 'left' ? 'right' : 'left';
        
        let points = 0;

        switch(group) {
            case 1: // Bouton Blanc E = 1er groupe (1er = Blanc [0pt], suivants = Jaune [+3pts])
                points = (lvl === 1) ? 0 : 3;
                break;
            case 2: // Bouton Jaune E = 2ème groupe (1er = Jaune [+3pts], suivants = Rouge [+5pts])
                points = (lvl === 1) ? 3 : 5;
                break;
            
            case 3: // Bouton Rouge E = 3ème groupe (Rouge direct)
                points = 5;
                break;
            
        }

        if (points > 0) applyScore(opponent, points);
        
        updateTeamCardEDisplay();
        broadcastState();
    }

function updateTeamCardEDisplay() {
        ['left', 'right'].forEach(player => {
            const p = teamPenaltiesE[player];
            let w = 0, y = 0, r = 0;

            // Logique des groupes E
            if (p.group1 >= 1) w = 1;
            if (p.group1 >= 2) y += p.group1 - 1;
            if (p.group2 >= 1) y += 1;
            if (p.group2 >= 2) r += p.group2 - 1;
            if (p.group3 >= 1) r += 1;

            // Sauvegarde pour broadcastState
            p.white = w; p.yellow = y; p.red = r;

            // Compteur blanc E — visible seulement si > 0
            const elW = document.getElementById(`${player}_card_E_white`);
            if (elW) {
                elW.textContent = w;
                w > 0 ? elW.classList.remove('hidden') : elW.classList.add('hidden');
            }
            // Compteur jaune E — visible seulement si > 0
            const elY = document.getElementById(`${player}_card_E_yellow`);
            if (elY) {
                elY.textContent = y;
                y > 0 ? elY.classList.remove('hidden') : elY.classList.add('hidden');
            }
        });
    }



    // ========= ÉVÉNEMENTS =========
    function determineCardAndPoints(player, group) {
        saveStateToHistory();
        let card='', points=0, endsMatch=false; const opponent = player==='left' ? 'right' : 'left';
        penalties[player]['group'+group]++; const lvl = penalties[player]['group'+group];
        switch(group) {
            case 1: card=lvl===1?'white':'yellow'; points=lvl===1?0:3; break;
            case 2: card=lvl===1?'yellow':'red'; points=lvl===1?3:5; break;
            case 3: if (lvl===1) { card='red'; points=5; } else { card='black'; endsMatch=true; } break;
            case 4: card='black'; endsMatch=true; break;
            default: return {card:'',points:0,endsMatch:false};
        }
        if (points > 0) applyScore(opponent, points);
        updateCardDisplay(); broadcastState();
        return {card, points, endsMatch};
    }

    function handleElimination(player) {
        if (isTimerRunning) { clearInterval(timerId); isTimerRunning = false; }
        startStopButton.textContent = 'MATCH TERMINÉ'; startStopButton.style.backgroundColor = 'gray'; resetBtn.style.display = 'block';
        const winner = player==='left' ? 'Combattant Vert' : 'Combattant Rouge'; const loser = player==='left' ? 'Combattant Rouge' : 'Combattant Vert';
        showNotification(`⬛ CARTON NOIR\n${loser} éliminé(e)\n🏆 Victoire de ${winner}`, 'black'); broadcastState();
    }

    function showNotification(message, color) {
        let el = document.getElementById('notifOverlay');
        if (!el) {
            el = document.createElement('div'); el.id = 'notifOverlay';
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:2000;cursor:pointer;';
            el.addEventListener('click', () => el.remove()); document.body.appendChild(el);
        }
        const bg={black:'#111',red:'#ff004c',yellow:'#e4c700',white:'#f0f6fc'}[color]||'#222';
        const fg=(color==='white'||color==='yellow')?'#111':'#fff';
        el.innerHTML = `<div style="background:${bg};color:${fg};padding:2em 3em;border-radius:15px;text-align:center;font-size:1.5em;font-weight:bold;max-width:80%;border:3px solid rgba(255,255,255,0.2);white-space:pre-line;">${message}<div style="margin-top:1em;font-size:.6em;opacity:.7;">Appuyer pour fermer</div></div>`;
        el.style.display = 'flex';
    }

    function startMedicalBreak() {
        if (isMedicalBreak) return;
        if (isTimerRunning) { clearInterval(timerId); isTimerRunning = false; startStopButton.textContent = 'START'; startStopButton.style.backgroundColor = 'green'; }
        isMedicalBreak = true; medicalOverlay.classList.remove('hidden');
        let t = 300; medicalChronoDisplay.textContent = formatTime(t);
        medicalTimerId = setInterval(() => { t--; medicalChronoDisplay.textContent = formatTime(t); broadcastState(); if (t <= 0) endMedicalBreak(); }, 1000);
        broadcastState();
    }

    function endMedicalBreak() {
        clearInterval(medicalTimerId); medicalOverlay.classList.add('hidden'); isMedicalBreak = false;
        showNotification('Fin de la pause médicale !\nLe match reprend.', 'white');
        setTimeout(() => { document.getElementById('notifOverlay')?.remove(); if (!isTimerRunning) startStopTimer(); }, 2000); broadcastState();
    }

    startStopButton.addEventListener('click', startStopTimer);
    resetBtn.addEventListener('click', showResetModal); // Ouvre la popup au lieu de reset direct
    undoBtn.addEventListener('click', undoLastAction);
    closeMedicalBtn.addEventListener('click', endMedicalBreak);
    quickTimer30s.addEventListener('click', () => setMatchTime(30));


//----------Bouton custom----------------------


    // Sélection des nouveaux éléments
    const timeModal = document.getElementById('timeModal');
    const confirmTimeBtn = document.getElementById('confirmTimeBtn');
    const inputMin = document.getElementById('inputMin');
    const inputSec = document.getElementById('inputSec');

    // Action pour ouvrir la popup
    customTimeBtn.addEventListener('click', () => {
        timeModal.classList.remove('hidden');
    });

    // Action pour valider le temps
    confirmTimeBtn.addEventListener('click', () => {
        const m = parseInt(inputMin.value) || 0;
        const s = parseInt(inputSec.value) || 0;
        setMatchTime(m * 60 + s);
        timeModal.classList.add('hidden');
    });



    document.getElementById('medicalBreakBtn').addEventListener('click', startMedicalBreak);
    if (castBtn) castBtn.addEventListener('click', showCastModal);
    matchChronoDisplay.addEventListener('click', () => chronoControls.classList.toggle('force-hide'));

    pointButtons.forEach(btn => btn.addEventListener('click', () => { 
        handlePointScored(btn.dataset.player, parseInt(btn.dataset.points, 10)); 
    }));
   
    faultButtons.forEach(btn => btn.addEventListener('click', () => { if (!btn.dataset.group) return; // Ignore les boutons Équipe E qui n'ont pas de data-group
    const s = determineCardAndPoints(btn.dataset.player, parseInt(btn.dataset.group, 10)); 
        if (s.endsMatch) handleElimination(btn.dataset.player); 
            }));
    document.addEventListener('keydown', (e) => {
        if (e.repeat || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
        const key = e.key.toLowerCase(); const code = e.code;
        const noMod = !e.shiftKey && !e.ctrlKey && !e.altKey; const shiftOnly = e.shiftKey && !e.ctrlKey && !e.altKey; const altOnly = e.altKey && !e.shiftKey && !e.ctrlKey;
        const pm = { 'KeyA':1,'KeyQ':1,'KeyZ':3,'KeyW':3,'KeyE':5 };
        if (code in pm) { if (noMod) { e.preventDefault(); saveStateToHistory(); applyScore('left', pm[code]); broadcastState(); return; } if (shiftOnly) { e.preventDefault(); saveStateToHistory(); applyScore('right', pm[code]); broadcastState(); return; } }
        const cm = { 'b':1,'j':2,'r':3,'n':4 };
        if (key in cm && !e.ctrlKey && (noMod||altOnly)) { e.preventDefault(); const s = determineCardAndPoints(noMod?'left':'right', cm[key]); if (s.endsMatch) handleElimination(noMod?'left':'right'); return; }
        if (key===' ') { e.preventDefault(); startStopTimer(); }
        if (key==='z' && e.ctrlKey) { e.preventDefault(); undoLastAction(); }
        if (e.key==='F5') { e.preventDefault(); showResetModal(); }
        if (code in pm) { 
        if (noMod) { e.preventDefault(); handlePointScored('left', pm[code]); return; } 
        if (shiftOnly) { e.preventDefault(); handlePointScored('right', pm[code]); return; } 
    }
    });

    updateCardDisplay();
});