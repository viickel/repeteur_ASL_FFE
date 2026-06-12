document.addEventListener('DOMContentLoaded', () => {

    // ========= VARIABLES GLOBALES =========
    let timerId;
    let matchTimeInSeconds = 180;
    let isTimerRunning = false;
    let isMedicalBreak = false;
    let currentMatchScoreLeft = 0;
    let currentMatchScoreRight = 0;
    let medicalTimerId;

    const scoreHistory = [];
    const MAX_HISTORY_SIZE = 30;

    const penalties = {
        left:  { group1: 0, group2: 0, group3: 0, group4: 0 },
        right: { group1: 0, group2: 0, group3: 0, group4: 0 }
    };

    // ========= PWA — Installation =========
    let deferredInstallPrompt = null;
    const installBanner = document.getElementById('pwaInstallBanner');
    const installBtn    = document.getElementById('pwaInstallBtn');
    const dismissBtn    = document.getElementById('pwaDismissBtn');

    // Enregistrement du Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[PWA] Service Worker enregistré:', reg.scope))
            .catch(err => console.warn('[PWA] Erreur SW:', err));
    }

    // Capture de l'événement d'installation natif (Chrome/Edge/Android)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // Empêche le mini-prompt automatique
        deferredInstallPrompt = e;
        // Affiche notre bannière personnalisée après 2 secondes
        setTimeout(() => {
            if (installBanner) installBanner.style.display = 'flex';
        }, 2000);
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            installBanner.style.display = 'none';
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log('[PWA] Choix utilisateur:', outcome);
            deferredInstallPrompt = null;
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            installBanner.style.display = 'none';
        });
    }

    // Quand l'app est installée, cacher la bannière
    window.addEventListener('appinstalled', () => {
        if (installBanner) installBanner.style.display = 'none';
        deferredInstallPrompt = null;
        console.log('[PWA] Application installée !');
    });

    // ========= PEER.JS — CAST TV =========
    let peer = null;
    let tvConnection = null;
    let sessionCode = null;

    function generateSessionCode() {
        return 'ASL-' + Math.floor(1000 + Math.random() * 9000);
    }

    function initPeerAsController() {
        sessionCode = generateSessionCode();
        peer = new Peer(sessionCode, { debug: 0 });

        peer.on('open', (id) => {
            console.log('Contrôleur PeerJS prêt, code:', id);
            updateCastStatus('waiting', sessionCode);
        });

        peer.on('connection', (conn) => {
            tvConnection = conn;
            conn.on('open', () => {
                updateCastStatus('connected', sessionCode);
                broadcastState();
            });
            conn.on('close', () => {
                tvConnection = null;
                updateCastStatus('waiting', sessionCode);
            });
            conn.on('error', (e) => console.warn('conn error:', e));
        });

        peer.on('error', (e) => {
            console.warn('PeerJS error:', e);
            updateCastStatus('error', '');
        });
    }

    function initPeerAsTV(code) {
        // ── ÉTAPE 1 : affiche l'interface TV IMMÉDIATEMENT ──────────────
        // La TV a toujours un écran utile, même si PeerJS échoue (WebOS LG, etc.)
        showTVMode();
        updateTVStatus('connecting');

        // ── ÉTAPE 2 : timeout global 10 s ───────────────────────────────
        // Si WebRTC est bloqué (LG WebOS, vieux firmware) on informe l'utilisateur
        const connectionTimeout = setTimeout(() => {
            console.warn('[PeerJS] Timeout — WebRTC non supporté ou bloqué');
            updateTVStatus('timeout');
        }, 10000);

        // ── ÉTAPE 3 : tentative PeerJS en arrière-plan ──────────────────
        try {
            peer = new Peer({ debug: 0 });
        } catch(e) {
            clearTimeout(connectionTimeout);
            console.warn('[PeerJS] WebRTC non disponible:', e);
            updateTVStatus('no-webrtc');
            return;
        }

        peer.on('open', () => {
            const conn = peer.connect(code, { reliable: true });

            const peerConnTimeout = setTimeout(() => {
                updateTVStatus('peer-timeout');
            }, 8000);

            conn.on('open', () => {
                clearTimeout(connectionTimeout);
                clearTimeout(peerConnTimeout);
                console.log('[PeerJS] TV connectée au contrôleur:', code);
                updateTVStatus('connected');
            });
            conn.on('data', (data) => {
                if (data.type === 'state') renderTVState(data);
            });
            conn.on('close', () => updateTVStatus('disconnected'));
            conn.on('error', (e) => {
                clearTimeout(connectionTimeout);
                clearTimeout(peerConnTimeout);
                console.warn('[PeerJS] Erreur connexion:', e);
                updateTVStatus('error');
            });
        });

        peer.on('error', (e) => {
            clearTimeout(connectionTimeout);
            console.warn('[PeerJS] Erreur peer:', e.type, e);
            if (e.type === 'peer-unavailable') {
                updateTVStatus('peer-unavailable');
            } else if (e.type === 'network' || e.type === 'server-error') {
                updateTVStatus('network-error');
            } else {
                updateTVStatus('error');
            }
        });
    }

    function broadcastState() {
        if (!tvConnection || !tvConnection.open) return;
        try {
            tvConnection.send({
                type: 'state',
                left:      currentMatchScoreLeft,
                right:     currentMatchScoreRight,
                time:      formatTime(matchTimeInSeconds),
                running:   isTimerRunning,
                medical:   isMedicalBreak,
                penalties: JSON.parse(JSON.stringify(penalties))
            });
        } catch(e) { console.warn('broadcast error:', e); }
    }

    function updateCastStatus(status, code) {
        const el = document.getElementById('castStatus');
        if (!el) return;
        const map = {
            idle:      { text: '📺 CAST TV',       bg: 'transparent', color: '#5af' },
            waiting:   { text: `⏳ ${code}`,        bg: '#e4a300',     color: '#111' },
            connected: { text: `✅ ${code}`,        bg: '#0cc346',     color: '#0d1117' },
            error:     { text: '❌ Erreur PeerJS',  bg: '#ff004c',     color: '#fff' },
        };
        const s = map[status] || map.idle;
        el.textContent    = s.text;
        el.style.background = s.bg;
        el.style.color    = s.color;
        el.style.padding  = status !== 'idle' ? '2px 8px' : '';
        el.style.borderRadius = '6px';
    }

    // =========  MODE TV  =========
    function showTVMode() {
        document.body.innerHTML = `
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{background:#0a0d12;font-family:'Courier New',monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column;}
            #tv-bar{background:#111;padding:6px 20px;font-size:13px;color:#444;display:flex;justify-content:space-between;align-items:center;}
            #tv-main{flex:1;display:flex;align-items:center;justify-content:center;}
            .tv-side{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;}
            .tv-side-l{border-right:2px solid #1a1a2e;}
            .tv-side-r{border-left:2px solid #1a1a2e;}
            .tv-label{font-size:2vw;letter-spacing:6px;font-weight:bold;margin-bottom:10px;text-transform:uppercase;}
            .tv-score{font-size:30vw;font-weight:900;line-height:.85;font-variant-numeric:tabular-nums;}
            .tv-lc{color:#ff004c;text-shadow:0 0 50px rgba(255,0,76,.5);}
            .tv-rc{color:#0cc346;text-shadow:0 0 50px rgba(12,195,70,.5);}
            .tv-cards{display:flex;gap:8px;margin-top:18px;min-height:52px;align-items:center;}
            .tv-card{width:34px;height:48px;border-radius:5px;border:1px solid rgba(255,255,255,.15);box-shadow:0 2px 8px rgba(0,0,0,.5);}
            .tv-card-white{background:#f0f6fc;}
            .tv-card-yellow{background:#e4c700;}
            .tv-card-red{background:#ff004c;}
            .tv-card-black{background:#111;border-color:#555;}
            #tv-center{width:200px;display:flex;flex-direction:column;align-items:center;gap:14px;flex-shrink:0;}
            #tv-chrono{font-size:5.5vw;font-weight:bold;color:#c9d1d9;letter-spacing:4px;padding:12px 20px;border:2px solid #222;border-radius:12px;background:#111;min-width:170px;text-align:center;transition:color .3s,border-color .3s;}
            #tv-chrono.running{border-color:#0cc346;color:#0cc346;}
            #tv-chrono.medical{border-color:#ff004c;color:#ff004c;animation:blink 1s infinite;}
            #tv-vs{font-size:1.4vw;color:#2a2a2a;letter-spacing:4px;}
            #tv-conn{font-size:12px;padding:4px 10px;border-radius:8px;line-height:1.5;text-align:right;max-width:300px;}
            @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        </style>
        <div id="tv-bar">
            <span style="display:flex;align-items:center;gap:8px;">
                <img src="icons/icon-72x72.png" width="24" height="24" style="border-radius:5px;" onerror="this.style.display='none'">
                ASL-FFE — Répéteur Escrime
            </span>
            <span id="tv-conn" style="color:#e4a300">⏳ En attente...</span>
            <span id="tv-clock"></span>
        </div>
        <div id="tv-main">
            <div class="tv-side tv-side-l">
                <div class="tv-label tv-lc">● Rouge</div>
                <div class="tv-score tv-lc" id="tv-left">0</div>
                <div class="tv-cards" id="tv-cards-left"></div>
            </div>
            <div id="tv-center">
                <div style="font-size:11px;color:#333;letter-spacing:2px;">TEMPS</div>
                <div id="tv-chrono">03:00</div>
                <div id="tv-vs">VS</div>
            </div>
            <div class="tv-side tv-side-r">
                <div class="tv-label tv-rc">● Vert</div>
                <div class="tv-score tv-rc" id="tv-right">0</div>
                <div class="tv-cards" id="tv-cards-right"></div>
            </div>
        </div>`;

        setInterval(() => {
            const el = document.getElementById('tv-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('fr-FR');
        }, 1000);
    }

    function updateTVStatus(status) {
        const el = document.getElementById('tv-conn');
        if (!el) return;
        const map = {
            connecting:      { text: '⏳ Connexion en cours…',            color: '#e4a300' },
            connected:       { text: '✅ Connecté',                       color: '#0cc346' },
            disconnected:    { text: '❌ Déconnecté — tablette éteinte ?', color: '#ff004c' },
            error:           { text: '⚠️ Erreur PeerJS',                  color: '#ff004c' },
            timeout:         { text: '⏱ Timeout — WebRTC bloqué\nEssaie de recharger la page', color: '#ff004c' },
            'no-webrtc':     { text: '🚫 WebRTC non supporté par ce navigateur TV', color: '#ff004c' },
            'peer-unavailable': { text: '❓ Code introuvable — tablette prête ?', color: '#e4a300' },
            'peer-timeout':  { text: '⏱ La tablette ne répond pas — code correct ?', color: '#e4a300' },
            'network-error': { text: '🌐 Erreur réseau — même WiFi ?',    color: '#e4a300' },
        };
        const s = map[status];
        if (!s) return;
        el.innerHTML = s.text.replace('\n', '<br>');
        el.style.color = s.color;
    }

    function renderTVState(data) {
        const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
        set('tv-left',  data.left);
        set('tv-right', data.right);
        set('tv-chrono',data.time);
        const ch = document.getElementById('tv-chrono');
        if (ch) ch.className = data.medical ? 'medical' : (data.running ? 'running' : '');
        renderTVCards('tv-cards-left',  data.penalties.left);
        renderTVCards('tv-cards-right', data.penalties.right);
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

    // ========= MODALE CAST =========
    function showCastModal() {
        let modal = document.getElementById('castModal');
        if (modal) { modal.style.display = 'flex'; return; }

        modal = document.createElement('div');
        modal.id = 'castModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);display:flex;justify-content:center;align-items:center;z-index:3000;';
        modal.innerHTML = `
        <div style="background:#161b22;border:2px solid #30363d;border-radius:16px;padding:2em;max-width:420px;width:90%;color:#c9d1d9;text-align:center;">
            <h2 style="margin:0 0 1em;">📺 CAST TV via PeerJS</h2>

            <div style="margin-bottom:1.5em;">
                <p style="color:#8b949e;font-size:14px;margin-bottom:12px;">
                    Sur la <strong>tablette arbitre</strong> : génère un code, puis entre-le sur l'écran TV.
                </p>
                <button id="castStartBtn" style="background:#007bff;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:16px;font-weight:bold;cursor:pointer;width:100%;">
                    📡 Mode CONTRÔLEUR (tablette)
                </button>
                <div id="castCodeDisplay" style="display:none;margin-top:14px;font-size:2.2em;font-weight:bold;letter-spacing:8px;color:#e4c700;padding:12px;background:#0d1117;border-radius:8px;border:1px solid #30363d;"></div>
                <div id="castCodeHint" style="display:none;color:#555;font-size:12px;margin-top:6px;">Entre ce code sur l'écran TV ci-dessous</div>
            </div>

            <hr style="border-color:#30363d;margin:1em 0;">

            <div>
                <p style="color:#8b949e;font-size:14px;margin-bottom:12px;">
                    Sur la <strong>TV / grand écran</strong> : entre le code de la tablette.
                </p>
                <div style="display:flex;gap:8px;">
                    <input id="castCodeInput" type="text" placeholder="ASL-XXXX"
                        style="flex:1;background:#0d1117;border:2px solid #30363d;border-radius:8px;padding:10px;color:#c9d1d9;font-size:18px;letter-spacing:4px;text-align:center;font-weight:bold;text-transform:uppercase;">
                    <button id="castConnectBtn" style="background:#0cc346;color:#0d1117;border:none;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:bold;cursor:pointer;">
                        MODE TV →
                    </button>
                </div>
            </div>

            <button id="castCloseBtn" style="margin-top:1.5em;background:transparent;border:1px solid #30363d;color:#8b949e;border-radius:8px;padding:8px 20px;cursor:pointer;">Fermer</button>
        </div>`;
        document.body.appendChild(modal);

        document.getElementById('castStartBtn').addEventListener('click', () => {
            if (peer) { peer.destroy(); peer = null; sessionCode = null; }
            initPeerAsController();
            document.getElementById('castCodeDisplay').style.display = 'block';
            document.getElementById('castCodeHint').style.display    = 'block';
            document.getElementById('castCodeDisplay').textContent    = '⏳...';
            const wait = setInterval(() => {
                if (sessionCode) {
                    clearInterval(wait);
                    document.getElementById('castCodeDisplay').textContent = sessionCode;
                }
            }, 300);
        });

        document.getElementById('castConnectBtn').addEventListener('click', () => {
            const code = document.getElementById('castCodeInput').value.trim().toUpperCase();
            if (!code.match(/^ASL-\d{4}$/)) {
                alert('Code invalide. Format attendu : ASL-XXXX (ex: ASL-4823)');
                return;
            }
            modal.style.display = 'none';
            initPeerAsTV(code);
        });

        document.getElementById('castCloseBtn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Fermer en cliquant en dehors
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // ========= SÉLECTION DOM =========
    const matchChronoDisplay   = document.getElementById('matchChrono');
    const customTimeBtn        = document.getElementById('customTimeBtn');
    const quickTimer30s        = document.getElementById('quickTimer30s');
    const startStopButton      = document.getElementById('startStopButton');
    const resetBtn             = document.getElementById('resetBtn');
    const leftScoreDisplay     = document.getElementById('left_score');
    const rightScoreDisplay    = document.getElementById('right_score');
    const chronoControls       = document.getElementById('chronoControls');
    const medicalOverlay       = document.getElementById('medicalOverlay');
    const medicalChronoDisplay = document.getElementById('medicalChrono');
    const closeMedicalBtn      = document.getElementById('closeMedicalBtn');
    const undoBtn              = document.getElementById('undoBtn');
    const faultButtons         = document.querySelectorAll('.fault-btn');
    const pointButtons         = document.querySelectorAll('.point-btn');
    const castBtn              = document.getElementById('castBtn');

    // ========= UTILITAIRES =========
    function formatTime(s) {
        return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    }

    // Sauvegarde l'état COMPLET — appelée UNE SEULE FOIS par action utilisateur
    function saveStateToHistory() {
        if (scoreHistory.length >= MAX_HISTORY_SIZE) scoreHistory.shift();
        scoreHistory.push({
            left:      currentMatchScoreLeft,
            right:     currentMatchScoreRight,
            penalties: JSON.parse(JSON.stringify(penalties))
        });
    }

    function updateCardDisplay() {
        ['left','right'].forEach(player => {
            const p = penalties[player];
            let w=0,y=0,r=0,b=0;
            if (p.group1>=1) w=1;
            if (p.group1>=2) y+=p.group1-1;
            if (p.group2>=1) y+=1;
            if (p.group2>=2) r+=p.group2-1;
            if (p.group3>=1) r+=1;
            if (p.group3>=2) b+=1;
            if (p.group4>=1) b+=1;
            [['white',w],['yellow',y],['red',r],['black',b]].forEach(([c,n]) => {
                const el = document.getElementById(`${player}_card_${c}`);
                if (!el) return;
                el.textContent  = n;
                el.style.opacity = n > 0 ? '1' : '0.2';
            });
        });
    }

    // Applique score SANS sauvegarder (la sauvegarde est faite en amont)
    function applyScore(player, points) {
        if (player === 'left') {
            currentMatchScoreLeft = Math.max(0, currentMatchScoreLeft + points);
            leftScoreDisplay.textContent = currentMatchScoreLeft;
        } else {
            currentMatchScoreRight = Math.max(0, currentMatchScoreRight + points);
            rightScoreDisplay.textContent = currentMatchScoreRight;
        }
    }

    function undoLastAction() {
        if (scoreHistory.length === 0) return;
        const prev = scoreHistory.pop();
        currentMatchScoreLeft  = prev.left;
        currentMatchScoreRight = prev.right;
        penalties.left  = { ...prev.penalties.left };
        penalties.right = { ...prev.penalties.right };
        leftScoreDisplay.textContent  = currentMatchScoreLeft;
        rightScoreDisplay.textContent = currentMatchScoreRight;
        updateCardDisplay();
        broadcastState();
    }

    function setMatchTime(seconds) {
        clearInterval(timerId);
        isTimerRunning = false;
        matchTimeInSeconds = seconds;
        matchChronoDisplay.textContent = formatTime(seconds);
        startStopButton.textContent = 'START';
        startStopButton.style.backgroundColor = 'green';
        broadcastState();
    }

    function startStopTimer() {
        if (isTimerRunning) {
            clearInterval(timerId);
            startStopButton.textContent = 'START';
            startStopButton.style.backgroundColor = 'green';
            isTimerRunning = false;
            resetBtn.style.display = 'block';
        } else {
            if (matchTimeInSeconds <= 0) return;
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
            matchChronoDisplay.textContent = '00:00';
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
        penalties.left  = { group1:0, group2:0, group3:0, group4:0 };
        penalties.right = { group1:0, group2:0, group3:0, group4:0 };
        scoreHistory.length = 0;
        leftScoreDisplay.textContent   = '0';
        rightScoreDisplay.textContent  = '0';
        matchChronoDisplay.textContent = '03:00';
        startStopButton.textContent    = 'START';
        startStopButton.style.backgroundColor = 'green';
        resetBtn.style.display = 'none';
        medicalOverlay.classList.add('hidden');
        updateCardDisplay();
        broadcastState();
    }

    // FIX BUG PRINCIPAL : saveStateToHistory appelée UNE SEULE FOIS
    function determineCardAndPoints(player, group) {
        saveStateToHistory();

        let card='', points=0, endsMatch=false;
        const opponent = player==='left' ? 'right' : 'left';

        penalties[player]['group'+group]++;
        const lvl = penalties[player]['group'+group];

        switch(group) {
            case 1: card=lvl===1?'white':'yellow'; points=lvl===1?0:3; break;
            case 2: card=lvl===1?'yellow':'red';   points=lvl===1?3:5; break;
            case 3:
                if (lvl===1) { card='red';   points=5; }
                else         { card='black'; endsMatch=true; }
                break;
            case 4: card='black'; endsMatch=true; break;
            default: return {card:'',points:0,endsMatch:false};
        }
        if (points > 0) applyScore(opponent, points);
        updateCardDisplay();
        broadcastState();
        return {card, points, endsMatch};
    }

    function handleElimination(player) {
        if (isTimerRunning) { clearInterval(timerId); isTimerRunning = false; }
        startStopButton.textContent = 'MATCH TERMINÉ';
        startStopButton.style.backgroundColor = 'gray';
        resetBtn.style.display = 'block';
        const winner = player==='left' ? 'Combattant Vert' : 'Combattant Rouge';
        const loser  = player==='left' ? 'Combattant Rouge' : 'Combattant Vert';
        showNotification(`⬛ CARTON NOIR\n${loser} éliminé(e)\n🏆 Victoire de ${winner}`, 'black');
        broadcastState();
    }

    function showNotification(message, color) {
        let el = document.getElementById('notifOverlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'notifOverlay';
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:2000;cursor:pointer;';
            el.addEventListener('click', () => el.remove());
            document.body.appendChild(el);
        }
        const bg={black:'#111',red:'#ff004c',yellow:'#e4c700',white:'#f0f6fc'}[color]||'#222';
        const fg=(color==='white'||color==='yellow')?'#111':'#fff';
        el.innerHTML = `<div style="background:${bg};color:${fg};padding:2em 3em;border-radius:15px;text-align:center;font-size:1.5em;font-weight:bold;max-width:80%;border:3px solid rgba(255,255,255,0.2);white-space:pre-line;">${message}<div style="margin-top:1em;font-size:.6em;opacity:.7;">Appuyer pour fermer</div></div>`;
        el.style.display = 'flex';
    }

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
        let t = 300;
        medicalChronoDisplay.textContent = formatTime(t);
        medicalTimerId = setInterval(() => {
            t--;
            medicalChronoDisplay.textContent = formatTime(t);
            broadcastState();
            if (t <= 0) endMedicalBreak();
        }, 1000);
        broadcastState();
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
        broadcastState();
    }

    function promptForCustomTime() {
        const input = prompt('Durée du match (MM:SS, ex: 03:00) :');
        if (!input) return;
        const m = input.match(/^(\d{1,2}):(\d{2})$/);
        if (!m || parseInt(m[2]) >= 60) { alert('Format invalide (ex: 03:00)'); return; }
        setMatchTime(parseInt(m[1])*60 + parseInt(m[2]));
    }

    // ========= ÉCOUTEURS =========
    startStopButton.addEventListener('click', startStopTimer);
    resetBtn.addEventListener('click', resetMatch);
    undoBtn.addEventListener('click', undoLastAction);
    closeMedicalBtn.addEventListener('click', endMedicalBreak);
    quickTimer30s.addEventListener('click', () => setMatchTime(30));
    customTimeBtn.addEventListener('click', promptForCustomTime);
    document.getElementById('medicalBreakBtn').addEventListener('click', startMedicalBreak);
    if (castBtn) castBtn.addEventListener('click', showCastModal);

    matchChronoDisplay.addEventListener('click', () => {
        chronoControls.classList.toggle('force-hide');
    });

    pointButtons.forEach(btn => btn.addEventListener('click', () => {
        saveStateToHistory();
        applyScore(btn.dataset.player, parseInt(btn.dataset.points, 10));
        broadcastState();
    }));

    faultButtons.forEach(btn => btn.addEventListener('click', () => {
        const s = determineCardAndPoints(btn.dataset.player, parseInt(btn.dataset.group, 10));
        if (s.endsMatch) handleElimination(btn.dataset.player);
    }));

    // ========= RACCOURCIS CLAVIER =========
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        // Désactive les raccourcis quand un champ texte a le focus (ex: saisie code ASL-XXXX)
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        const key  = e.key.toLowerCase();
        const code = e.code;
        const noMod     = !e.shiftKey && !e.ctrlKey && !e.altKey;
        const shiftOnly = e.shiftKey  && !e.ctrlKey && !e.altKey;
        const altOnly   = e.altKey   && !e.shiftKey && !e.ctrlKey;

        // Points gauche/droite
        const pm = { 'KeyA':1,'KeyQ':1,'KeyZ':3,'KeyW':3,'KeyE':5 };
        if (code in pm) {
            if (noMod)     { e.preventDefault(); saveStateToHistory(); applyScore('left',  pm[code]); broadcastState(); return; }
            if (shiftOnly) { e.preventDefault(); saveStateToHistory(); applyScore('right', pm[code]); broadcastState(); return; }
        }
        // Cartons
        const cm = { 'b':1,'j':2,'r':3,'n':4 };
        if (key in cm && !e.ctrlKey && (noMod||altOnly)) {
            e.preventDefault();
            const s = determineCardAndPoints(noMod?'left':'right', cm[key]);
            if (s.endsMatch) handleElimination(noMod?'left':'right');
            return;
        }
        // Globaux
        if (key===' ')                   { e.preventDefault(); startStopTimer(); }
        if (key==='z' && e.ctrlKey)      { e.preventDefault(); undoLastAction(); }
        if (e.key==='F5')                { e.preventDefault(); resetMatch(); }
    });

    // ========= INIT =========
    updateCardDisplay();
});
