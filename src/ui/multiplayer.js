// v2.99.0 multiplayer: pair-level silent Ultimo settlement and privacy-safe 100-event log.
const app = document.querySelector('#app');
const storageKey = 'illusztralt-tarokk-multiplayer-session-v2912';
let session = null;
let socket = null;
let socketAuthenticated = false;
let socketAuthFailed = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let state = null;
let lobby = null;
let selectedSkart = new Set();
let notice = '';
let lobbyRefreshTimer = null;
let lobbyRefreshInFlight = false;
let revealTrick = null;
let revealUntil = 0;
let revealTimer = null;

function playerName(playerId) {
  const seat = lobby?.seats?.find(s => s.playerId === playerId);
  const p = state?.players?.find(x => x.id === playerId);
  return seat?.displayName || p?.displayName || playerId || '—';
}
function startTrickReveal(snapshot, message, previousState = null) {
  const completed = message?.completedTrick || (snapshot?.game?.completedTricks?.length > (previousState?.game?.completedTricks?.length ?? 0) ? snapshot.game.completedTricks.at(-1) : null);
  if (!completed) return;
  const number = Number(message?.completedTrick?.number || snapshot?.game?.completedTricks?.length || (previousState?.game?.completedTricks?.length ?? 0) + 1);
  revealTrick = { ...completed, number };
  revealUntil = Date.now() + 5000;
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => { revealTrick = null; revealUntil = 0; render(); }, 5000);
}
function displayedTrick() { return revealTrick && revealUntil > Date.now() ? revealTrick : state?.game?.trick; }
function settlementLineLabel(line, declarations = []) {
  const base = labels[line.type] || line.type || 'Játék';
  const explicit = declarations.some(d => d.type === line.type && d.status !== 'failed');
  const derivedSilent = (line.type === 'doubleGame' || line.type === 'volat') && !explicit;
  return (line.silent || derivedSilent) ? `Csendes ${base}` : base;
}
function settlementSide(line) { return line.positiveForTakerPair ? 'felvevőpár' : 'ellenpár'; }

import { cardDisplayName, cardImageSrc } from './cardAssets.js';

const apiBase = new URLSearchParams(location.search).get('server') || `${location.protocol}//${location.host}`;
const wsBase = apiBase.replace(/^http/, 'ws');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {
  three:'Hármas', two:'Kettes', one:'Egyes', solo:'Szóló', pass:'Passz',
  tarokk8:'8 tarokk', tarokk9:'9 tarokk', tuletroa:'Trull', fourKings:'Négykirály',
  doubleGame:'Duplajáték', volat:'Volát', xxiFogas:'XXI-fogás', centrum:'Centrum',
  kismadar:'Kismadár', nagymadar:'Nagymadár', pagatUltimo:'Pagát ultimó', pagatUhu:'Pagát uhu',
  sasUltimo:'Sas ultimó', sasUhu:'Sas uhu', kingUltimo:'Király ultimó', kingUhu:'Király uhu'
};
function cardName(c) { return cardDisplayName(c); }
function playedCardHtml(player, card) { return `<div class="played played-illustrated"><b>${esc(playerName(player))}</b><img class="played-face" src="${esc(cardImageSrc(card))}" alt="${esc(cardName(card))}" title="${esc(cardName(card))}" loading="lazy" decoding="async"></div>`; }
function smallCardHtml(card) { return `<img class="inline-card-face" src="${esc(cardImageSrc(card))}" alt="${esc(cardName(card))}" title="${esc(cardName(card))}" loading="lazy" decoding="async">`; }
function phaseLabel(p) { return ({auction:'Licit','skart':'Fektetés','skart-announcement':'Fektetés közlése','partner-call':'Bemondás',declarations:'Bemondás',play:'Lejátszás',scoring:'Elszámolás',complete:'Lezárva', 'match-complete':'Mérkőzés vége'})[p] ?? p; }
function saveSession() { try { sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch {} }
function loadSession() { try { const raw = sessionStorage.getItem(storageKey); if(raw) session = JSON.parse(raw); } catch {} }
function clearSession() { try { sessionStorage.removeItem(storageKey); } catch {} if(lobbyRefreshTimer){ clearInterval(lobbyRefreshTimer); lobbyRefreshTimer=null; } session = null; state = null; lobby = null; socketAuthFailed = false; disconnectSocket(false); render(); }
async function jsonFetch(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, { ...options, headers: {'content-type':'application/json', ...(options.headers || {})} });
  const body = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function syncNow() {
  if (!session || lobbyRefreshInFlight) return;
  lobbyRefreshInFlight = true;
  try {
    const [status, snapshot] = await Promise.all([
      jsonFetch(`/lobby/rooms/${encodeURIComponent(session.roomId)}`),
      jsonFetch(`/rooms/${encodeURIComponent(session.roomId)}?playerId=${encodeURIComponent(session.playerId)}&token=${encodeURIComponent(session.token)}`),
    ]);
    lobby = status;
    state = snapshot;
    selectedSkart.clear();
    notice = 'Állapot szinkronizálva.';
    if (!socketAuthenticated) {
      // An OPEN WebSocket is not proof that the server accepted the player's hello.
      // Reopen the transport so the server receives a clean authentication handshake.
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      const previousSocket = socket;
      socket = null;
      socketAuthenticated = false;
      socketAuthFailed = false;
      try { previousSocket?.close(1000, 'Újrahitelesítés szinkronizálás után.'); } catch {}
      connectSocket();
    } else if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type:'resync', since:state.sequence }));
    }
    render();
  } catch (e) {
    notice = e instanceof Error ? e.message : 'A szinkronizálás sikertelen.';
    render();
  } finally {
    lobbyRefreshInFlight = false;
  }
}
async function refreshLobbyStatus() {
  if (!session || lobbyRefreshInFlight) return;
  lobbyRefreshInFlight = true;
  try {
    const next = await jsonFetch(`/lobby/rooms/${encodeURIComponent(session.roomId)}`);
    lobby = next;
    render();
  } catch {} finally {
    lobbyRefreshInFlight = false;
  }
}
function ensureLobbyRefreshPolling() {
  if (lobbyRefreshTimer || !session) return;
  lobbyRefreshTimer = setInterval(() => {
    if (!session) return;
    if (!lobby?.ready || !socket || socket.readyState !== WebSocket.OPEN || !socketAuthenticated) refreshLobbyStatus();
  }, 2000);
}
function connectSocket() {
  if(!session || socket || reconnectTimer || socketAuthFailed) return;
  let ws;
  try { ws = new WebSocket(`${wsBase}/ws`); } catch(e) { scheduleReconnect(); return; }
  socket = ws;
  socketAuthenticated = false;
  ws.addEventListener('open', () => {
    if (socket !== ws || !session) return;
    reconnectAttempt = 0;
    ws.send(JSON.stringify({ type:'hello', roomId:session.roomId, playerId:session.playerId, token:session.token, since:state?.sequence ?? 0 }));
    render();
  });
  ws.addEventListener('message', event => {
    if (socket !== ws) return;
    try { handleServerMessage(JSON.parse(event.data)); } catch { notice = 'Érvénytelen szerverüzenet.'; render(); }
  });
  ws.addEventListener('error', () => { if (socket !== ws) return; notice = 'A real-time kapcsolat hibát jelzett.'; render(); });
  ws.addEventListener('close', () => {
    // Ignore late close events from a socket replaced during manual resync/reconnect.
    if (socket !== ws) return;
    socket = null;
    socketAuthenticated = false;
    if(session) scheduleReconnect();
    render();
  });
}
function disconnectSocket(schedule = true) {
  if(reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const oldSocket = socket;
  socket = null;
  socketAuthenticated = false;
  if(oldSocket) { try { oldSocket.close(1000); } catch {} }
  if(schedule && session) scheduleReconnect();
}
function scheduleReconnect() {
  if(!session || reconnectTimer || socketAuthFailed) return;
  const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempt++));
  notice = `Kapcsolat megszakadt; újracsatlakozás ${Math.ceil(delay / 1000)} mp múlva.`;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSocket(); }, delay);
  render();
}
function handleServerMessage(msg) {
  if(msg.type === 'welcome' || msg.type === 'resync') { socketAuthenticated = true; socketAuthFailed = false; state = msg.snapshot; lobby = msg.status || lobby; notice = msg.resyncRequired ? 'Teljes állapotfrissítés történt.' : 'Kapcsolat létrejött.'; selectedSkart.clear(); render(); return; }
  if(msg.type === 'event') {
    const previous = state;
    if(msg.event?.actionType === 'skart' && msg.event?.playerId === session?.playerId) selectedSkart.clear();
    state = msg.snapshot; lobby = msg.lobby || lobby; notice = msg.event?.message || '';
    startTrickReveal(state, msg.event, previous);
    render(); return;
  }
  if(msg.type === 'action-accepted') {
    const previous = state;
    if(msg.actionType === 'skart' && msg.playerId === session?.playerId) selectedSkart.clear();
    state = msg.snapshot; notice = msg.message || 'Akció elfogadva.';
    startTrickReveal(state, msg, previous);
    render(); return;
  }
  if(msg.type === 'action-rejected') { state = msg.snapshot || state; notice = msg.message || 'Az akciót a szerver elutasította.'; render(); return; }
  if(msg.type === 'lobby') { lobby = msg.status; render(); return; }
  if(msg.type === 'error') {
    notice = msg.message || 'Szerverhiba.';
    if (!socketAuthenticated) {
      socketAuthFailed = true;
      notice += ' A kapcsolat hitelesítése nem sikerült; használd a Szinkronizálás gombot az újrapróbáláshoz, vagy lépj ki és csatlakozz újra.';
      const failedSocket = socket;
      socket = null;
      try { failedSocket?.close(1008, 'A játékos hitelesítése nem sikerült.'); } catch {}
    }
    render(); return;
  }
}
function sendAction(action) {
  if(!socket || socket.readyState !== WebSocket.OPEN || !socketAuthenticated || !state || !session) { notice = 'Nincs aktív kapcsolat.'; render(); return; }
  socket.send(JSON.stringify({ type:'action', expectedSequence:state.sequence, action }));
}
function render() {
  if(!app) return;
  if(!session) { renderLanding(); return; }
  const connected = socket?.readyState === WebSocket.OPEN && socketAuthenticated;
  const lobbyPlayers = lobby?.seats ?? [];
  const rawPlayerCards = state?.players?.find(p => p.id === session.playerId)?.hand ?? [];
  const suitMeta = {
    hearts: { label: '♥ Kőr', order: 0 },
    diamonds: { label: '♦ Káró', order: 1 },
    clubs: { label: '♣ Treff', order: 2 },
    spades: { label: '♠ Pikk', order: 3 },
  };
  const suitRankOrder = { K: 5, Q: 4, C: 3, J: 2, '10': 1 };
  const sortCard = (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'tarokk' ? -1 : 1;
    if (a.kind === 'tarokk') return Number(b.rank) - Number(a.rank);
    const suitDiff = (suitMeta[a.suit]?.order ?? 99) - (suitMeta[b.suit]?.order ?? 99);
    return suitDiff || ((suitRankOrder[b.rank] ?? 0) - (suitRankOrder[a.rank] ?? 0));
  };
  const playerCards = [...rawPlayerCards].sort(sortCard);
  const me = lobbyPlayers.find(p => p.playerId === session.playerId);
  const ready = lobby?.ready === true;
  if(!state || !ready) {
    app.innerHTML = `
      <div class="top"><div><strong>Szobakód:</strong> <span class="room-code">${esc(session.roomId)}</span></div><button id="copy">Szobakód másolása</button><button id="resync">Szinkronizálás</button><button id="leave">Kilépés</button></div>
      <div class="status ${connected ? 'ok':''}">${connected ? '● Real-time kapcsolat aktív' : '○ Kapcsolódás…'} ${esc(notice)}</div>
      <section class="panel"><h2>Lobby</h2><p>${lobby?.joinedCount ?? 0}/${lobby?.playerCount ?? 4} játékos csatlakozott. ${lobby?.playerCount === 5 ? 'Öt fősnél az osztó minden leosztásban kimarad; az osztótól jobbra ülő játékos kezd.' : 'A játék akkor indulhat, ha mind a négy hely foglalt és minden játékos kapcsolódva van.'}</p>
      <div class="players">${lobbyPlayers.map(p => `<div class="player ${p.playerId===session.playerId?'me':''}"><strong>${esc(p.displayName)}${lobby?.playerCount===5 && p.playerId===lobby?.dealerPlayerId ? ' · OSZTÓ' : ''}</strong><span>${p.joined ? (p.connected ? '● online' : '○ offline') : 'Üres hely'}</span></div>`).join('')}</div></section>`;
    document.querySelector('#copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(session.roomId); notice='A szobakód a vágólapra került.'; render(); } catch { notice=`Szobakód: ${session.roomId}`; render(); } });
    document.querySelector('#resync')?.addEventListener('click', syncNow);
    document.querySelector('#leave')?.addEventListener('click', clearSession);
    ensureLobbyRefreshPolling();
    return;
  }
  const current = state.currentPlayerId;
  const hints = state.legalActionHints || {};
  const isMyTurn = current === session.playerId;
  const activeIds = Array.isArray(state.match?.activePlayerIds) && state.match.activePlayerIds.length ? state.match.activePlayerIds : state.players.filter(p => p.active !== false).map(p => p.id);
  const revealActive = Boolean(revealTrick && revealUntil > Date.now());
  const displayed = displayedTrick();
  const completedCount = Number(state.game?.completedTricks?.length ?? 0);
  const trickNumber = state.phase === 'play' ? (revealActive ? Number(revealTrick.number || completedCount || 1) : completedCount + 1) : undefined;
  const trick = state.game?.trick;
  const skartPhase = state.phase === 'skart';
  const skartAnnouncementPhase = state.phase === 'skart-announcement';
  const myPlayer = state.players.find(p => p.id === session.playerId);
  const receivedTalon = myPlayer?.receivedTalon || [];
  const talonCount = Number(myPlayer?.receivedTalonCount ?? receivedTalon.length);
  const skartCount = Number(hints.skartCount ?? talonCount);
  const canSkart = skartPhase && skartCount > 0 && hints.skartComplete !== true;
  // During the parallel skart phase every player acts independently.
  // Prefer the authoritative action type over secondary hint flags so a stale
  // snapshot cannot accidentally disable the whole hand.
  const legal = new Set(hints.playCardIds || []);
  const skartable = new Set(hints.skartCardIds || []);
  const renderCard = c => {
    const playable = state.phase === 'play' && legal.has(c.id);
    const selectable = skartPhase && canSkart && skartable.has(c.id);
    const active = playable || selectable;
    const selected = selectedSkart.has(c.id);
    const suitClass = c.kind === 'suit' ? `suit-${c.suit}` : 'tarokk';
    // In the parallel skart phase cards are intentionally NOT rendered with the
    // native HTML disabled attribute: this keeps browser input independent from
    // simultaneous server state updates. The server remains authoritative.
    const nativeDisabled = state.phase === 'skart' ? '' : (active ? '' : 'disabled');
    const aria = active ? '' : ' aria-disabled="true"';
    return `<button type="button" class="card card-illustrated ${suitClass} ${active?'active':'disabled'} ${selectable?'skartable':''} ${selected?'selected':''}" data-card="${esc(c.id)}"${nativeDisabled}${aria} aria-label="${esc(cardName(c))}" title="${esc(cardName(c))}"><img class="card-face" src="${esc(cardImageSrc(c))}" alt="${esc(cardName(c))}" loading="lazy" decoding="async" draggable="false"><span class="card-points" aria-hidden="true">${c.points}</span><strong class="card-a11y">${esc(cardName(c))}</strong></button>`;
  };
  const groupOrder = ['hearts','diamonds','clubs','spades'];
  // Always display the full current hand. The server snapshot already removes
  // played cards; legal play hints only control which remaining cards are enabled.
  const handCards = playerCards;
  const cardGroups = [
    { key: 'tarokk', label: 'Tarokkok · erősségi sorrend', cards: handCards.filter(c => c.kind === 'tarokk').sort(sortCard) },
    ...groupOrder.map(suit => ({ key: suit, label: `${suitMeta[suit].label} · ${suit === 'hearts' || suit === 'diamonds' ? 'K–Q–C–J–A' : 'K–Q–C–J–10'}`, cards: handCards.filter(c => c.kind === 'suit' && c.suit === suit).sort(sortCard) })),
  ].filter(group => group.cards.length);
  const hand = cardGroups.map(group => `<div class="hand-group hand-group-${group.key}"><h3>${esc(group.label)}</h3><div class="hand-grid">${group.cards.map(renderCard).join('')}</div></div>`).join('');
  const playButtons = state.phase === 'play' && isMyTurn ? playerCards.filter(c => (hints.playCardIds || []).includes(c.id)).map(c => `<button data-action="play" data-card-id="${esc(c.id)}">Kijátszás: ${esc(cardName(c))}</button>`).join('') : '';
  // Never invent an auction action on the client. The server is authoritative;
  // this is especially important for the 3->2 first-speaker XX-invit, where a
  // plain Pass is deliberately not legal.
  const auctionActions = Array.isArray(hints.auctionActions) ? [...hints.auctionActions] : [];
  const auctionButtons = auctionActions.map((a,i) => `<button data-auction-index="${i}">${esc(auctionLabel(a, state.auction, playerCards))}</button>`).join('');
  const partnerButtons = hints.partnerRanks?.map(r => `<button data-partner="${r}">${r}. tarokk${r===20 ? (myPlayer?.hand?.some(c => c.kind === 'tarokk' && Number(c.rank) === 20) ? ' (önhívás)' : '') : ''}</button>`).join('') || '';
  const declButtons = (hints.declarationActions || []).map((a,i) => `<button data-decl-index="${i}">${esc(a.type==='pass'?'Passz':a.type==='tarokkCount'?`${a.count} tarokk`:`${labels[a.declaration] || a.declaration}${a.targetCardId ? ` · ${a.targetCardId}` : ''}`)}</button>`).join('');
  const selectedCount = selectedSkart.size;
  const skartButton = canSkart ? `<button id="submit-skart" class="primary" ${selectedCount === skartCount ? '' : 'disabled'}>Fektetés (${selectedCount}/${skartCount})</button>` : '';
  const ownSkartTarokkCount = (state.players?.find(p => p.id === session.playerId)?.ownSkart || []).filter(c => c.kind === 'tarokk').length;
  const skartAnnouncementButton = skartAnnouncementPhase && hints.skartNeedsAnnouncement === true && hints.types?.includes('skart-announce')
    ? `<button data-skart-announce>Bejelentem: ${ownSkartTarokkCount} tarokkot fektettem</button>` : '';
  const contra = [];
  if(hints.gameContra?.level) contra.push(`<button data-contra-game>${esc(hints.gameContra.label || hints.gameContra.level)} a játékra</button>`);
  (hints.declarationContraActions || []).forEach(item => {
    const figure = labels[item.type] || item.type;
    contra.push(`<button data-contra="${esc(item.id)}">${esc(item.label || 'Kontra')} a ${esc(figure)} bemondásra</button>`);
  });
  const status = connected ? '● Real-time kapcsolat aktív' : '○ Reconnecting…';
  const turnText = canSkart
    ? 'Fektetés: minden játékos párhuzamosan fektethet.'
    : skartAnnouncementPhase && hints.skartNeedsAnnouncement === true
      ? 'Fektetés közlése: jelezd, hogy tarokkot fektettél.'
      : skartAnnouncementPhase
        ? 'Fektetés közlése: a szükséges közléseket a játékosok elvégzik.'
        : state.phase === 'partner-call' && isMyTurn
      ? 'Kötelező partnerhívás: válaszd ki a meghívandó tarokkot.'
      : state.phase === 'declarations' && isMyTurn
        ? 'Bemondás: a felvevő kötelező partnerhívása már megtörtént; most bemondhatsz vagy passzolhatsz.'
        : isMyTurn ? `Te jössz. · ${esc(playerName(current))}` : `Most: ${esc(playerName(current))}`;
  const scoreboard = state.scoreboard || { dealsPlayed: 0, scores: {}, history: [], instantHistory: [] };
  const match = state.match || { rounds: 4, playerCount: 4, dealsPerRound: 4, totalDeals: 16, completedDeals: 0, currentRound: 1, complete: false };
  const matchText = `Kör ${Math.min(match.currentRound, match.rounds)}/${match.rounds} · leosztás ${Math.min(match.completedDeals + (match.complete ? 0 : 1), match.totalDeals)}/${match.totalDeals}`;
  const scores = state.players.map(p => `<span class="score">${esc(playerName(p.id))}: ${Number(scoreboard.scores?.[p.id] ?? p.score ?? 0)}</span>`).join(' · ');
  const instantScoreHtml = (scoreboard.instantHistory || []).slice(-6).map(x => `<div class="instant-score">${esc(playerName(x.playerId))} · ${esc(String(x.count))} tarokk · +${esc(String(x.totalWon))} pont összesen (${esc(String(x.pointsEach))}/játékos)</div>`).join('');
  const declarations = state.game?.declarations?.map(d => `${esc(labels[d.type] || d.type)} — ${esc(playerName(d.ownerId))}${d.status ? ` · ${d.status === 'fulfilled' ? 'teljesült' : d.status === 'failed' ? 'bukott' : 'aktív'}` : ''}${d.contra && d.contra !== 'none' ? ` · ${esc(d.contra)}` : ''}`).join('<br>') || (state.lastSettlement?.declarations?.length ? state.lastSettlement.declarations.map(d => `${esc(labels[d.type] || d.type)} — ${esc(playerName(d.ownerId))} · ${d.status === 'fulfilled' ? 'teljesült' : d.status === 'failed' ? 'bukott' : d.status}${d.contra && d.contra !== 'none' ? ` · ${esc(d.contra)}` : ''}`).join('<br>') : 'Nincs');
  const lastCompleted = state.game?.completedTricks?.at?.(-1);
  const trickCards = displayed?.cards || [];
  const trickHtml = trickCards.length ? trickCards.map(x => playedCardHtml(x.player, x.card)).join('') : '<span class="muted">Nincs aktív ütés.</span>';
  const lastTrickHtml = lastCompleted ? lastCompleted.cards.map(x => playedCardHtml(x.player, x.card)).join('') : '<span class="muted">Még nincs lezárt ütés.</span>';
  const settlement = state.game?.settlement;
  const settlementLines = settlement?.lines?.length ? settlement.lines.map(line => `${esc(settlementLineLabel(line, state.game?.declarations || []))}: ${line.positiveForTakerPair ? '+' : '-'}${line.points} · ${esc(settlementSide(line))}`).join(' · ') : '';
  const resultBox = state.lastSettlement ? (() => { const r = state.lastSettlement; const lines = (r.lines || []).map(line => `${esc(settlementLineLabel(line, r.declarations || []))}: ${line.positiveForTakerPair ? '+' : '-'}${line.points} · ${esc(settlementSide(line))}`).join(' · '); const silent = (r.silentFigures || []).map(s => `${esc(labels[s.type] || s.type)} (${s.status === 'fulfilled' ? 'csendes · teljesült' : 'csendes'}) · ${esc(playerName(s.ownerId))}`).join(' · '); return `<div class="result"><strong>Előző leosztás elszámolása</strong> · ${r.result === 'taker' ? 'A felvevő pár nyert.' : 'Az ellenpár nyert.'} · felvevőpár ${r.takerPairPoints} – ellenpár ${r.defencePairPoints} · nettó ${r.netForTakerPair > 0 ? '+' : ''}${r.netForTakerPair}${r.gameContra && r.gameContra !== 'none' ? `<br><small>Parti-kontra: ${esc(r.gameContra)}</small>` : ''}${lines ? `<br><small>${lines}</small>` : ''}${silent ? `<br><small>Csendes figurák: ${silent}</small>` : ''}</div>`; })() : (state.phase === 'scoring' || state.phase === 'complete') ? '<div class="result">Az elszámolás elkészült.</div>' : '';
  const publicSkartInfo = state.players.filter(p => p.revealedSkart?.length).map(p => `<span class="public-skart"><strong>${esc(playerName(p.id))} fektetett tarokkjai:</strong><span class="inline-card-list">${p.revealedSkart.map(c => smallCardHtml(c)).join('')}</span></span>`).join('');
  const talonInfo = state.phase === 'skart' && talonCount > 0 ? `<div class="talon-info"><strong>Talont kaptál:</strong>${receivedTalon.length ? `<span class="inline-card-list talon-card-list">${receivedTalon.map(c => smallCardHtml(c)).join('')}</span>` : ''}<span class="muted">${talonCount} lap</span></div>` : '';
  // The table is rotated to the current viewer: self at the bottom, next player to the right.
  const seatPositions = ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'];
  const viewerSeatIndex = Math.max(0, activeIds.indexOf(session.playerId));
  const seatHtml = activeIds.map((playerId, seatIndex) => {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return '';
    const relativeSeat = (seatIndex - viewerSeatIndex + activeIds.length) % activeIds.length;
    const position = seatPositions[relativeSeat] || 'seat-bottom';
    const lobbySeat = lobbyPlayers.find(p => p.playerId === playerId);
    const online = lobbySeat?.connected ?? player.connected;
    const cardCount = Number(player.cardCount ?? player.hand?.length ?? 0);
    const isCurrent = playerId === current;
    const isMe = playerId === session.playerId;
    return `<div class="seat ${position}${isCurrent ? ' current' : ''}${isMe ? ' me' : ''}"><strong>${esc(playerName(playerId))}</strong><span>${online ? '● online' : '○ offline'} · ${cardCount} lap</span>${isCurrent ? '<em>Jelenleg soron</em>' : ''}</div>`;
  }).join('');
  const currentTrickLabel = state.phase === 'play'
    ? `${revealActive ? 'Előző ütés' : 'Aktuális ütés'} · ${Number(trickNumber || completedCount + 1)}. ütés / 9`
    : `Asztal · ${phaseLabel(state.phase)}`;
  const eventTypeLabel = { 'action-accepted': 'Akció', 'phase-changed': 'Játékszakasz', 'deal-complete': 'Leosztás', 'match-complete': 'Mérkőzés', 'instant-score': 'Azonnali elszámolás', redeal: 'Újraosztás' };
  const eventHtml = [...(Array.isArray(state.publicEvents) ? state.publicEvents : [])].slice(-100).reverse().map(event => {
    const prefix = event.playerId ? `${playerName(event.playerId)}: ` : '';
    const message = event.message || eventTypeLabel[event.type] || event.type || 'Esemény';
    const stamp = event.sequence == null ? '' : `#${event.sequence}`;
    const special = ['phase-changed', 'deal-complete', 'match-complete', 'redeal'].includes(event.type) ? ' phase-event' : '';
    return `<div class="event-item${special}"><small>${esc(stamp)}</small><div><span class="muted">${esc(eventTypeLabel[event.type] || event.type || 'Esemény')}</span><br>${esc(prefix + message)}</div></div>`;
  }).join('') || '<div class="muted">Még nincs rögzített játékesemény.</div>';
  const dealerPlayerId = state.match?.dealerPlayerId || state.players.find(p => p.dealer)?.id;
  const dealerNote = Number(state.match?.playerCount) === 5 && dealerPlayerId
    ? `<div class="dealer-note">Ötfős játék: ${esc(playerName(dealerPlayerId))} az osztó, ebben a leosztásban kimarad.</div>`
    : '';
  const roles = state.partnership;
  const rolePanel = roles?.takerId ? `<section class="panel roles-panel"><h2>Játékosoldalak</h2><p><strong>Felvevő:</strong> ${esc(playerName(roles.takerId))}</p>${roles.partnerId ? `<p><strong>Felvevő partnere:</strong> ${esc(playerName(roles.partnerId))}</p><p><strong>Ellenpár:</strong> ${state.players.filter(p => p.id !== roles.takerId && p.id !== roles.partnerId).map(p => esc(playerName(p.id))).join(' · ')}</p>` : `<p class="muted">A partner személye még nem vált nyilvánossá.</p>`}</section>` : '';
  const flow = state.declarationFlow;
  const contraLevelLabels = { kontra: 'Kontra', rekontra: 'Rekontra', szubkontra: 'Szubkontra', mordkontra: 'Mordkontra' };
  const speechText = flow?.lastSpeechType === 'tarokkCount'
    ? `${Number(flow.lastTarokkCount)} tarokk`
    : flow?.lastSpeechType === 'contraSignal'
      ? `${contraLevelLabels[flow.lastContraLevel] || 'Kontra'} ${flow.lastContraTarget === 'game' ? 'a játékra' : `a ${labels[flow.lastContraFigure] || flow.lastContraFigure || 'bemondás'}-ra`}`
      : (flow?.lastFigure ? (labels[flow.lastFigure] || flow.lastFigure) : 'bemondás');
  const flowDirectionText = flow?.currentSpeakerGuidance
    ? `<p class="declaration-guidance"><strong>Teendő:</strong> ${esc(flow.currentSpeakerGuidance)}</p>`
    : flow?.recipientId
      ? `<p><strong>A következő bemondás címzettje:</strong> ${esc(playerName(flow.recipientId))}</p>`
      : flow?.recipientPlayerIds?.length
        ? `<p><strong>A bemondás címzettje:</strong> az ellenpár (${flow.recipientPlayerIds.map(playerName).map(esc).join(' · ')})</p>`
        : flow?.directionStatus === 'speaker-continuing'
          ? `<p class="muted">Az utolsó megszólaló folytathatja a saját bemondási körét, vagy Passzt mondhat.</p>`
          : flow?.directionStatus === 'awaiting-first-speaker'
            ? `<p class="muted">Az első nem-felvevő bemondás partnerjelzésnek számít; az ellenpárnak előbb kontrával kell jeleznie.</p>`
            : `<p class="muted">A címzettet a legutóbbi nyilvános jelzés és a párok nyilvános állapota határozza meg.</p>`;
  const declarationFlowPanel = flow ? `<section class="panel declaration-flow-panel"><h2>Bemondási irány</h2><p><strong>Felvevő:</strong> ${esc(playerName(flow.takerId || roles?.takerId || state.takerId))}</p>${flow.lastSpeakerId ? `<p><strong>${flow.lastSpeechType === 'contraSignal' ? 'Utolsó jelzés' : 'Utolsó bemondó'}:</strong> ${esc(playerName(flow.lastSpeakerId))} (${esc(speechText)})</p>` : `<p class="muted">Még nem hangzott el bemondás. A felvevő kezdte a bemondási szakaszt.</p>`}${flowDirectionText}${flow.pairsKnown ? `<p><strong>Felvevő partnere:</strong> ${esc(playerName(flow.partnerId))}</p><p><strong>Ellenpár:</strong> ${state.players.filter(p => p.id !== (flow.takerId || roles?.takerId) && p.id !== flow.partnerId).map(p => esc(playerName(p.id))).join(' · ')}</p>` : `<p class="muted">A párok még nem nyilvánosak; csak nyilvános bemondás, tarokkszám, kontra vagy rekontra után tisztázódnak.</p>`}</section>` : '';
  app.innerHTML = `
    <div class="top"><div><strong>${esc(me?.displayName || session.playerId)}</strong> · szoba <span class="room-code">${esc(session.roomId)}</span></div><span class="connection ${connected?'good':''}">${status}</span><button id="resync">Szinkronizálás</button><button id="leave">Kilépés</button></div>
    <div class="matchbar"><strong>${esc(phaseLabel(state.phase))}</strong> · ${turnText}<span>${esc(matchText)}</span><span>${scores}</span></div>
    <div class="status">${esc(notice)}</div>${resultBox ? `<section class="panel">${resultBox}</section>` : ''}
    <div class="game-columns"><main class="game-main">${rolePanel}${declarationFlowPanel}
    <section class="panel table-panel"><div class="trick-heading"><strong>${esc(currentTrickLabel)}</strong><span>${isMyTurn ? 'Te vagy soron' : `Soron: ${esc(playerName(current))}`}</span></div><div class="table-layout"><div class="table-seat-layer">${seatHtml}</div><div class="table-center"><div class="turn-badge">${isMyTurn ? '▶ TE VAGY SORON' : `Soron: ${esc(playerName(current))}`}</div><div class="trick">${trickHtml}</div>${revealActive ? `<div class="trick-reveal">Az előző ütés lapjai még 5 másodpercig láthatók.</div>` : ''}</div></div>${dealerNote}</section>
    <section class="panel"><h2>Akciók</h2><div class="actions">${auctionButtons}${partnerButtons}${declButtons}${skartAnnouncementButton}${skartButton}${playButtons}${contra.join('') || (hints.types?.length ? '' : '<span class="muted">Most nem te cselekszel.</span>')}</div></section>
    <section class="panel hand-panel"><h2>Saját kéz (${playerCards.length})</h2>${talonInfo}${canSkart ? `<div class="skart-active"><strong>Fektetés aktív</strong> · ${hints.skartCount} lapot kell kijelölnöd. A lapok megmaradnak a képernyőn, amíg a Fektetés gombra nem kattintasz.</div>` : ''}<div class="hand">${hand}</div></section>
    <section class="panel last-trick-panel"><h2>Legutóbbi lezárt ütés</h2><div class="trick">${lastTrickHtml}</div>${lastCompleted?.winner ? `<p class="muted">Ütést vitte: ${esc(lastCompleted.winner)}</p>` : ''}${publicSkartInfo ? `<div class="public-skart-wrap">${publicSkartInfo}</div>` : ''}</section>
    <section class="panel scoreboard-panel"><h2>Játék állása</h2><p class="muted">Lejátszott leosztások: ${Number(scoreboard.dealsPlayed || 0)}</p><div class="scoreboard-grid">${state.players.map((p, i) => `<div class="score-row"><strong>${esc(playerName(p.id))}</strong><span>${Number(scoreboard.scores?.[p.id] ?? 0)} pont</span></div>`).join('')}</div>${instantScoreHtml ? `<div class="score-history"><h3>Azonnal elszámolt tarokkszámok</h3>${instantScoreHtml}</div>` : ''}${(scoreboard.history || []).length ? `<div class="score-history"><h3>Leosztások</h3>${[...(scoreboard.history || [])].reverse().map(r => { const contract = labels[r.contract] || r.contract || '—'; const taker = lobby?.seats?.find(s => s.playerId === r.takerId)?.displayName || r.takerId || '—'; const delta = Number(r.netForTakerPair ?? 0); const deltaText = state.players.map(p => { const name = lobby?.seats?.find(s => s.playerId === p.id)?.displayName || p.id; const d = Number(r.byPlayer?.[p.id] ?? 0); return `${esc(name)} ${d > 0 ? '+' : ''}${d}`; }).join(' · '); return `<div class="history-row"><span>#${Number(r.dealNumber || 0)} · ${esc(contract)} · felvevő: ${esc(taker)}<br><small>${deltaText}</small></span><strong>${delta > 0 ? '+' : ''}${delta}</strong></div>`; }).join('')}</div>` : '<p class="muted">Még nincs lezárt leosztás.</p>'}</section>
    <section class="panel"><h2>Bemondások</h2><p>${declarations}</p>${settlementLines ? `<p class="settlement-summary"><strong>Elszámolási tételek:</strong> ${settlementLines}</p>` : ''}</section>
    </main><aside class="panel event-log"><div class="event-log-head"><h2>Eseménynapló</h2><span>utolsó 100 esemény</span></div><div class="event-list">${eventHtml}</div></aside></div>`;
  document.querySelector('#leave')?.addEventListener('click', clearSession);
  document.querySelector('#resync')?.addEventListener('click', syncNow);
  document.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.card;
    const legalSkart = state.phase === 'skart' && canSkart && (hints.skartCardIds || []).includes(id);
    if(legalSkart) {
      if(selectedSkart.has(id)) selectedSkart.delete(id);
      else if(selectedSkart.size < Number(hints.skartCount || 0)) selectedSkart.add(id);
      render();
    }
  }));
  document.querySelectorAll('[data-auction-index]').forEach(btn => btn.addEventListener('click', () => { const a = auctionActions[Number(btn.dataset.auctionIndex)]; if(a) sendAction({type:'auction', action:a}); }));
  document.querySelectorAll('[data-partner]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'partner-call', rank:Number(btn.dataset.partner)})));
  document.querySelector('[data-skart-announce]')?.addEventListener('click', () => sendAction({type:'skart-announce'}));
  document.querySelectorAll('[data-decl-index]').forEach(btn => btn.addEventListener('click', () => { const a = hints.declarationActions[Number(btn.dataset.declIndex)]; if(a) { sendAction({type:'declaration', action:a}); } }));
  document.querySelector('#submit-skart')?.addEventListener('click', () => {
    if(selectedSkart.size === skartCount) sendAction({type:'skart', cardIds:[...selectedSkart]});
  });
  document.querySelectorAll('[data-action="play"]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'play-card', cardId:btn.dataset.cardId})));
  document.querySelector('[data-contra-game]')?.addEventListener('click', () => sendAction({type:'game-contra'}));
  document.querySelectorAll('[data-contra]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'declaration-contra', declarationId:btn.dataset.contra})));
}
function inviteTargetLabel(target) {
  return target === 20 ? 'XX' : target === 19 ? 'XIX' : target === 18 ? 'XVIII' : `${target}`;
}
function auctionLabel(a, auction, hand = []) {
  if (a?.invitationSignalTarget !== undefined) return `Licit: ${labels[a.contract] || a.contract} · ${inviteTargetLabel(a.invitationSignalTarget)}-invit jelzés`;
  if (a?.acceptsInviteTarget !== undefined) {
    const verb = a.type === 'bid' ? `Licit: ${labels[a.contract] || a.contract}` : `Tartom: ${labels[a.contract] || a.contract}`;
    return `${verb} · ${inviteTargetLabel(a.acceptsInviteTarget)}-invit fogadása`;
  }
  const records = auction?.records || [];
  const bids = records.filter(r => r.action?.type === 'bid');
  const actor = auction?.seats?.[auction.currentSeat]?.playerId;
  const inviteTarget = (rank) => hand.some(c => c.kind === 'tarokk' && Number(c.rank) === rank);
  const threeTwo = bids.length === 2 && bids[0]?.action?.contract === 'three'
    && bids[1]?.action?.contract === 'two' && bids[0]?.playerId !== bids[1]?.playerId;
  const lateXixInvite = bids.length === 3 && bids[0]?.action?.contract === 'three'
    && bids[1]?.action?.contract === 'two' && bids[2]?.action?.contract === 'one'
    && bids[0]?.playerId === bids[2]?.playerId && bids[1]?.playerId === actor;
  const lateXixInviter = bids.length >= 3 && bids[0]?.action?.contract === 'three'
    && bids[1]?.action?.contract === 'two' && bids[2]?.action?.contract === 'one'
    && bids[0]?.playerId === bids[2]?.playerId && bids[0]?.playerId === actor;
  if (a.type === 'pass') {
    if (a.inviteTarget === 20) return 'Engedés / Passz · XX-invit felajánlása';
    if (a.inviteTarget !== undefined) return `Passz · ${inviteTargetLabel(a.inviteTarget)}-invit / partnerhívás`;
    if (auction?.outstandingInvite && auction?.inviteAcceptedBy && auction.outstandingInvite.inviterId === actor) return `Passz · ${inviteTargetLabel(auction.outstandingInvite.target)}-invit lezárása`;
    return 'Passz';
  }
  if (a.type === 'bid') {
    if (a.inviteTarget !== undefined) return `Licit: ${labels[a.contract] || a.contract} · ${inviteTargetLabel(a.inviteTarget)}-invit`;
    if (a.honourless) return 'Honőr nélküli Hármas';
    if (a.contract === 'solo' && auction?.outstandingInvite?.target === 19
      && !auction?.inviteAcceptedBy && actor !== auction?.outstandingInvite?.inviterId
      && actor !== auction?.inviteResponderId) return 'Licit: Szóló · folyamatban lévő XIX-invit közbeni válasz';
    if (bids.length === 0 && a.contract === 'two' && inviteTarget(19)) return 'Licit: Kettő · XIX-invit (nyitójelzés)';
    if (bids.length === 0 && a.contract === 'one' && inviteTarget(18)) return 'Licit: Egy · XVIII-invit (nyitójelzés)';
    if (threeTwo && actor === bids[0]?.playerId && a.contract === 'one' && inviteTarget(19)) return 'Licit: Egy · XIX-invit';
    if (lateXixInvite && a.contract === 'solo') return 'Licit: Szóló · XIX-invit fogadása';
    if (lateXixInviter && a.contract === 'solo') return 'Licit: Szóló · XIX-invit';
    if (a.type === 'bid' && a.contract === 'solo' && bids.length === 2 && bids[0]?.action?.contract === 'three'
      && bids[1]?.action?.contract === 'two' && actor === bids[0]?.playerId && inviteTarget(18)) return 'Licit: Szóló · XVIII-invit';
    return `Licit: ${labels[a.contract] || a.contract}`;
  }
  if (a.type === 'hold') {
    if (auction?.outstandingInvite && auction?.inviteResponderId === actor) return `Tartom: ${labels[a.contract] || a.contract} · ${inviteTargetLabel(auction.outstandingInvite.target)}-invit fogadása`;
    if (lateXixInvite) return `Tartom: ${labels[a.contract] || a.contract} · XIX-invit fogadása`;
    return `Tartom: ${labels[a.contract] || a.contract}`;
  }
  if (a.type === 'hold-invite') return `Tartom: ${labels[a.contract] || a.contract} · ${inviteTargetLabel(a.target)}-invit fogadása`;
  if (a.type === 'invite') {
    if (a.target === 20) return 'Engedés / Passz · XX-invit';
    return `Licit: ${labels[a.contract || auction?.highest?.contract] || a.contract || 'Licit'} · ${inviteTargetLabel(a.target)}-invit`;
  }
  return a.type;
}

async function renderLanding() {
  // The unauthenticated landing page must not read game-state variables.
  app.innerHTML = `
    <div class="hero"><span class="badge">v2.99.0 multiplayer</span><h2>Online Illusztrált Tarokk</h2><p class="muted">Szobaalapú lobby, szerveroldali szabályellenőrzés és valós idejű játék.</p></div>
    <section class="panel forms"><div><h3>Új szoba</h3><label>Név<input id="createName" maxlength="28" placeholder="Játékos neve"></label><label>Játékosok száma<select id="playerCount"><option value="4" selected>4 fő</option><option value="5">5 fő · az osztó leosztásonként kimarad</option></select></label><label>Játék hossza<select id="matchRounds"><option value="1">1 kör · 4/5 leosztás</option><option value="2">2 kör · 8/10 leosztás</option><option value="4" selected>4 kör · 16/20 leosztás</option></select></label><button id="create">Szoba létrehozása</button></div><div><h3>Csatlakozás</h3><label>Szobakód<input id="roomCode" maxlength="6" placeholder="ABC123"></label><label>Név<input id="joinName" maxlength="28" placeholder="Játékos neve"></label><button id="join">Csatlakozás</button></div></section><p class="server">Szerver: ${esc(apiBase)}</p>${notice ? `<div class="status">${esc(notice)}</div>`:''}`;
  document.querySelector('#create')?.addEventListener('click', async () => {
    const createButton = document.querySelector('#create');
    const displayName = document.querySelector('#createName')?.value ?? '';
    const matchRounds = Number(document.querySelector('#matchRounds')?.value ?? 4);
    const playerCount = Number(document.querySelector('#playerCount')?.value ?? 4);
    // Capture the form values BEFORE any render. render() rebuilds the landing DOM
    // and would otherwise reset the select to its default (4), causing a chosen
    // 5-player room to be created as a 4-player room.
    if (createButton) { createButton.disabled = true; createButton.textContent = 'Szoba létrehozása…'; }
    notice='Szoba létrehozása…';
    try {
      const r=await jsonFetch('/lobby/rooms',{method:'POST',body:JSON.stringify({displayName, matchRounds, playerCount})});
      session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Szoba létrehozva.'; render(); connectSocket();
    } catch(e){ notice=e.message; render(); }
  });
  document.querySelector('#join')?.addEventListener('click', async () => { try { const room=String(document.querySelector('#roomCode').value).trim().toUpperCase(); const r=await jsonFetch(`/lobby/rooms/${encodeURIComponent(room)}/join`,{method:'POST',body:JSON.stringify({displayName:document.querySelector('#joinName').value})}); session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Csatlakozva a szobához.'; render(); connectSocket(); } catch(e){ notice=e.message; render(); } });
}
loadSession();
render();
if(session) connectSocket();
window.addEventListener('beforeunload', () => { try { socket?.close(1000); } catch {} });
