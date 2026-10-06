const app = document.querySelector('#app');
const storageKey = 'illusztralt-tarokk-multiplayer-session-v260';
let session = null;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let state = null;
let lobby = null;
let selectedSkart = new Set();
let notice = '';
let lobbyRefreshTimer = null;
let lobbyRefreshInFlight = false;

const apiBase = new URLSearchParams(location.search).get('server') || `${location.protocol}//${location.host}`;
const wsBase = apiBase.replace(/^http/, 'ws');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {
  three:'Hármas', two:'Kettes', one:'Egyes', solo:'Szóló', pass:'Passz',
  tarokk8:'8 tarokk', tarokk9:'9 tarokk', tuletroa:'Tulétroá', fourKings:'Négykirály',
  doubleGame:'Duplajáték', volat:'Volát', xxiFogas:'XXI-fogás', centrum:'Centrum',
  kismadar:'Kismadár', nagymadar:'Nagymadár', pagatUltimo:'Pagát ultimó', pagatUhu:'Pagát uhu',
  sasUltimo:'Sas ultimó', sasUhu:'Sas uhu', kingUltimo:'Király ultimó', kingUhu:'Király uhu'
};
function cardName(c) { return c.kind === 'tarokk' ? `${c.rank}. tarokk` : `${({hearts:'♥',diamonds:'♦',spades:'♠',clubs:'♣'})[c.suit]}${c.rank}`; }
function phaseLabel(p) { return ({auction:'Licit','skart':'Fektetés','skart-announcement':'Fektetés közlése','partner-call':'Bemondás',declarations:'Bemondás',play:'Lejátszás',scoring:'Elszámolás',complete:'Lezárva'})[p] ?? p; }
function saveSession() { try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch {} }
function loadSession() { try { const raw = localStorage.getItem(storageKey); if(raw) session = JSON.parse(raw); } catch {} }
function clearSession() { try { localStorage.removeItem(storageKey); } catch {} if(lobbyRefreshTimer){ clearInterval(lobbyRefreshTimer); lobbyRefreshTimer=null; } session = null; state = null; lobby = null; disconnectSocket(false); render(); }
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
    if (lobby?.ready && socket?.readyState === WebSocket.OPEN) {
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
    if (!lobby?.ready || !socket || socket.readyState !== WebSocket.OPEN) refreshLobbyStatus();
  }, 2000);
}
function connectSocket() {
  if(!session || socket || reconnectTimer) return;
  try { socket = new WebSocket(`${wsBase}/ws`); } catch(e) { scheduleReconnect(); return; }
  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    socket.send(JSON.stringify({ type:'hello', roomId:session.roomId, playerId:session.playerId, token:session.token, since:state?.sequence ?? 0 }));
    render();
  });
  socket.addEventListener('message', event => {
    try { handleServerMessage(JSON.parse(event.data)); } catch { notice = 'Érvénytelen szerverüzenet.'; render(); }
  });
  socket.addEventListener('error', () => { notice = 'A real-time kapcsolat hibát jelzett.'; });
  socket.addEventListener('close', () => { socket = null; if(session) scheduleReconnect(); render(); });
}
function disconnectSocket(schedule = true) {
  if(reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if(socket) { try { socket.close(1000); } catch {} socket = null; }
  if(schedule && session) scheduleReconnect();
}
function scheduleReconnect() {
  if(!session || reconnectTimer) return;
  const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempt++));
  notice = `Kapcsolat megszakadt; újracsatlakozás ${Math.ceil(delay / 1000)} mp múlva.`;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSocket(); }, delay);
  render();
}
function handleServerMessage(msg) {
  if(msg.type === 'welcome' || msg.type === 'resync') { state = msg.snapshot; lobby = msg.status || lobby; notice = msg.resyncRequired ? 'Teljes állapotfrissítés történt.' : 'Kapcsolat létrejött.'; selectedSkart.clear(); render(); return; }
  if(msg.type === 'event') {
    if(msg.event?.actionType === 'skart' && msg.event?.playerId === session?.playerId) selectedSkart.clear();
    state = msg.snapshot; lobby = msg.lobby || lobby; notice = msg.event?.message || ''; render(); return;
  }
  if(msg.type === 'action-accepted') {
    if(msg.actionType === 'skart' && msg.playerId === session?.playerId) selectedSkart.clear();
    state = msg.snapshot; notice = 'Akció elfogadva.'; render(); return;
  }
  if(msg.type === 'action-rejected') { state = msg.snapshot || state; notice = msg.message || 'Az akciót a szerver elutasította.'; render(); return; }
  if(msg.type === 'lobby') { lobby = msg.status; render(); return; }
  if(msg.type === 'error') { notice = msg.message || 'Szerverhiba.'; render(); return; }
}
function sendAction(action) {
  if(!socket || socket.readyState !== WebSocket.OPEN || !state || !session) { notice = 'Nincs aktív kapcsolat.'; render(); return; }
  socket.send(JSON.stringify({ type:'action', expectedSequence:state.sequence, action }));
}
function render() {
  if(!app) return;
  if(!session) { renderLanding(); return; }
  const connected = socket?.readyState === WebSocket.OPEN;
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
      <section class="panel"><h2>Lobby</h2><p>${lobby?.joinedCount ?? 0}/4 játékos csatlakozott. A játék akkor indulhat, ha mind a négy hely foglalt és minden játékos kapcsolódva van.</p>
      <div class="players">${lobbyPlayers.map(p => `<div class="player ${p.playerId===session.playerId?'me':''}"><strong>${esc(p.displayName)}</strong><span>${p.joined ? (p.connected ? '● online' : '○ offline') : 'Üres hely'}</span></div>`).join('')}</div></section>`;
    document.querySelector('#copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(session.roomId); notice='A szobakód a vágólapra került.'; render(); } catch { notice=`Szobakód: ${session.roomId}`; render(); } });
    document.querySelector('#resync')?.addEventListener('click', syncNow);
    document.querySelector('#leave')?.addEventListener('click', clearSession);
    ensureLobbyRefreshPolling();
    return;
  }
  const current = state.currentPlayerId;
  const hints = state.legalActionHints || {};
  const isMyTurn = current === session.playerId;
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
    return `<button type="button" class="card ${suitClass} ${active?'active':'disabled'} ${selectable?'skartable':''} ${selected?'selected':''}" data-card="${esc(c.id)}"${nativeDisabled}${aria}><strong>${esc(cardName(c))}</strong><small>${c.points} pont</small></button>`;
  };
  const groupOrder = ['hearts','diamonds','clubs','spades'];
  const handCards = state.phase === 'play' && isMyTurn && (hints.playCardIds || []).length
    ? playerCards.filter(c => (hints.playCardIds || []).includes(c.id))
    : playerCards;
  const cardGroups = [
    { key: 'tarokk', label: 'Tarokkok · erősségi sorrend', cards: handCards.filter(c => c.kind === 'tarokk').sort(sortCard) },
    ...groupOrder.map(suit => ({ key: suit, label: `${suitMeta[suit].label} · K–Q–C–J–10`, cards: handCards.filter(c => c.kind === 'suit' && c.suit === suit).sort(sortCard) })),
  ].filter(group => group.cards.length);
  const hand = cardGroups.map(group => `<div class="hand-group hand-group-${group.key}"><h3>${esc(group.label)}</h3><div class="hand-grid">${group.cards.map(renderCard).join('')}</div></div>`).join('');
  const playButtons = state.phase === 'play' && isMyTurn ? playerCards.filter(c => (hints.playCardIds || []).includes(c.id)).map(c => `<button data-action="play" data-card-id="${esc(c.id)}">Kijátszás: ${esc(cardName(c))}</button>`).join('') : '';
  // Never invent an auction action on the client. The server is authoritative;
  // this is especially important for the 3->2 first-speaker XX-invit, where a
  // plain Pass is deliberately not legal.
  const auctionActions = Array.isArray(hints.auctionActions) ? [...hints.auctionActions] : [];
  const auctionButtons = auctionActions.map((a,i) => `<button data-auction-index="${i}">${esc(auctionLabel(a, state.auction))}</button>`).join('');
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
        : isMyTurn ? 'Te jössz.' : `Most: ${esc(current || '—')}`;
  const scoreboard = state.scoreboard || { dealsPlayed: 0, scores: {}, history: [] };
  const scores = state.players.map(p => `<span class="score">${esc(lobby?.seats?.find(s => s.playerId === p.id)?.displayName || p.id)}: ${Number(scoreboard.scores?.[p.id] ?? p.score ?? 0)}</span>`).join(' · ');
  const declarations = state.game?.declarations?.map(d => `${esc(labels[d.type] || d.type)} — ${esc(d.ownerId)}${d.status ? ` · ${d.status === 'fulfilled' ? 'teljesült' : d.status === 'failed' ? 'bukott' : 'aktív'}` : ''}${d.contra && d.contra !== 'none' ? ` · ${esc(d.contra)}` : ''}`).join('<br>') || (state.lastSettlement?.declarations?.length ? state.lastSettlement.declarations.map(d => `${esc(labels[d.type] || d.type)} — ${esc(d.ownerId)} · ${d.status === 'fulfilled' ? 'teljesült' : d.status === 'failed' ? 'bukott' : d.status}${d.contra && d.contra !== 'none' ? ` · ${esc(d.contra)}` : ''}`).join('<br>') : 'Nincs');
  const lastCompleted = state.game?.completedTricks?.at?.(-1);
  const trickHtml = trick ? trick.cards.map(x => `<div class="played"><b>${esc(x.player)}</b><span>${esc(cardName(x.card))}</span></div>`).join('') : '<span class="muted">Nincs aktív ütés.</span>';
  const lastTrickHtml = lastCompleted ? lastCompleted.cards.map(x => `<div class="played"><b>${esc(x.player)}</b><span>${esc(cardName(x.card))}</span></div>`).join('') : '<span class="muted">Még nincs lezárt ütés.</span>';
  const settlement = state.game?.settlement;
  const settlementLines = settlement?.lines?.length ? settlement.lines.map(line => `${esc(labels[line.type] || line.type)}: ${line.positiveForTakerPair ? '+' : '-'}${line.points}`).join(' · ') : '';
  const resultBox = state.lastSettlement ? (() => { const r = state.lastSettlement; const lines = (r.lines || []).map(line => `${esc(labels[line.type] || line.type)}: ${line.positiveForTakerPair ? '+' : '-'}${line.points}`).join(' · '); const silent = (r.silentFigures || []).map(s => `${esc(labels[s.type] || s.type)} (csendes)`).join(' · '); return `<div class="result"><strong>Előző leosztás elszámolása</strong> · ${r.result === 'taker' ? 'A felvevő pár nyert.' : 'Az ellenpár nyert.'} · felvevőpár ${r.takerPairPoints} – ellenpár ${r.defencePairPoints} · nettó ${r.netForTakerPair > 0 ? '+' : ''}${r.netForTakerPair}${lines ? `<br><small>${lines}</small>` : ''}${silent ? `<br><small>Csendes figurák: ${silent}</small>` : ''}</div>`; })() : (state.phase === 'scoring' || state.phase === 'complete') ? '<div class="result">Az elszámolás elkészült.</div>' : '';
  const publicSkartInfo = state.players.filter(p => p.revealedSkart?.length).map(p => `<span class="public-skart"><strong>${esc(p.id)} fektetett tarokkjai:</strong> ${p.revealedSkart.map(cardName).map(esc).join(', ')}</span>`).join('');
  const talonInfo = state.phase === 'skart' && talonCount > 0 ? `<div class="talon-info"><strong>Talont kaptál:</strong> ${receivedTalon.length ? `${receivedTalon.map(cardName).map(esc).join(', ')} · ` : ''}${talonCount} lap</div>` : '';
  app.innerHTML = `
    <div class="top"><div><strong>${esc(me?.displayName || session.playerId)}</strong> · szoba <span class="room-code">${esc(session.roomId)}</span></div><span class="connection ${connected?'good':''}">${status}</span><button id="resync">Szinkronizálás</button><button id="leave">Kilépés</button></div>
    <div class="matchbar"><strong>${esc(phaseLabel(state.phase))}</strong> · ${turnText}<span>${scores}</span></div>
    <div class="status">${esc(notice)}</div>${resultBox ? `<section class="panel">${resultBox}</section>` : ''}
    <section class="panel"><h2>Játékosok</h2><div class="players">${state.players.map(p => { const seat = lobby?.seats?.find(x=>x.playerId===p.id); const online = seat ? seat.connected : p.connected; return `<div class="player ${p.id===session.playerId?'me':''}"><strong>${esc(seat?.displayName || p.id)}</strong><span>${online ? '● online' : '○ offline'} · ${p.cardCount} lap</span></div>`; }).join('')}</div></section>
    <section class="panel"><h2>Akciók</h2><div class="actions">${auctionButtons}${partnerButtons}${declButtons}${skartAnnouncementButton}${skartButton}${playButtons}${contra.join('') || (hints.types?.length ? '' : '<span class="muted">Most nem te cselekszel.</span>')}</div></section>
    <section class="panel hand-panel"><h2>Saját kéz (${playerCards.length})</h2>${talonInfo}${canSkart ? `<div class="skart-active"><strong>Fektetés aktív</strong> · ${hints.skartCount} lapot kell kijelölnöd. A lapok megmaradnak a képernyőn, amíg a Fektetés gombra nem kattintasz.</div>` : ''}<div class="hand">${hand}</div></section>
    <section class="panel"><h2>Aktuális ütés</h2><div class="trick">${trickHtml}</div></section>
    <section class="panel last-trick-panel"><h2>Legutóbbi lezárt ütés</h2><div class="trick">${lastTrickHtml}</div>${lastCompleted?.winner ? `<p class="muted">Ütést vitte: ${esc(lastCompleted.winner)}</p>` : ''}${publicSkartInfo ? `<div class="public-skart-wrap">${publicSkartInfo}</div>` : ''}</section>
    <section class="panel scoreboard-panel"><h2>Játék állása</h2><p class="muted">Lejátszott leosztások: ${Number(scoreboard.dealsPlayed || 0)}</p><div class="scoreboard-grid">${state.players.map((p, i) => `<div class="score-row"><strong>${esc(lobby?.seats?.find(s => s.playerId === p.id)?.displayName || p.id)}</strong><span>${Number(scoreboard.scores?.[p.id] ?? 0)} pont</span></div>`).join('')}</div>${(scoreboard.history || []).length ? `<div class="score-history"><h3>Leosztások</h3>${[...(scoreboard.history || [])].reverse().map(r => { const contract = labels[r.contract] || r.contract || '—'; const taker = lobby?.seats?.find(s => s.playerId === r.takerId)?.displayName || r.takerId || '—'; const delta = Number(r.netForTakerPair ?? 0); const deltaText = state.players.map(p => { const name = lobby?.seats?.find(s => s.playerId === p.id)?.displayName || p.id; const d = Number(r.byPlayer?.[p.id] ?? 0); return `${esc(name)} ${d > 0 ? '+' : ''}${d}`; }).join(' · '); return `<div class="history-row"><span>#${Number(r.dealNumber || 0)} · ${esc(contract)} · felvevő: ${esc(taker)}<br><small>${deltaText}</small></span><strong>${delta > 0 ? '+' : ''}${delta}</strong></div>`; }).join('')}</div>` : '<p class="muted">Még nincs lezárt leosztás.</p>'}</section>
    <section class="panel"><h2>Bemondások</h2><p>${declarations}</p></section>`;
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
function auctionLabel(a, auction) {
  if(a.type === 'pass') return a.inviteTarget !== undefined ? `Passz (${inviteTargetLabel(a.inviteTarget)} invit)` : 'Passz';
  if(a.type === 'bid') return a.honourless ? 'Honőr nélküli Hármas' : `Licit: ${labels[a.contract] || a.contract}`;
  if(a.type === 'hold') return `Tartom: ${labels[a.contract] || a.contract}`;
  if(a.type === 'hold-invite') return `Tartom: ${labels[a.contract] || a.contract} (${inviteTargetLabel(a.target)} invit)`;
  if(a.type === 'invite') {
    if(a.target === 20) return 'Engedés (XX invit)';
    const contract = a.contract || auction?.highest?.contract || 'solo';
    return `${labels[contract] || contract} (${inviteTargetLabel(a.target)} invit)`;
  }
  return a.type;
}
async function renderLanding() {
  app.innerHTML = `
    <div class="hero"><span class="badge">v2.60 multiplayer</span><h2>Online Illusztrált Tarokk</h2><p class="muted">Szobaalapú lobby, szerveroldali szabályellenőrzés és valós idejű játék.</p></div>
    <section class="panel forms"><div><h3>Új szoba</h3><label>Név<input id="createName" maxlength="28" placeholder="Játékos neve"></label><button id="create">Szoba létrehozása</button></div><div><h3>Csatlakozás</h3><label>Szobakód<input id="roomCode" maxlength="6" placeholder="ABC123"></label><label>Név<input id="joinName" maxlength="28" placeholder="Játékos neve"></label><button id="join">Csatlakozás</button></div></section><p class="server">Szerver: ${esc(apiBase)}</p>${notice ? `<div class="status">${esc(notice)}</div>`:''}`;
  document.querySelector('#create')?.addEventListener('click', async () => { try { notice='Szoba létrehozása…'; render(); const r=await jsonFetch('/lobby/rooms',{method:'POST',body:JSON.stringify({displayName:document.querySelector('#createName').value})}); session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Szoba létrehozva.'; render(); connectSocket(); } catch(e){ notice=e.message; render(); } });
  document.querySelector('#join')?.addEventListener('click', async () => { try { const room=String(document.querySelector('#roomCode').value).trim().toUpperCase(); const r=await jsonFetch(`/lobby/rooms/${encodeURIComponent(room)}/join`,{method:'POST',body:JSON.stringify({displayName:document.querySelector('#joinName').value})}); session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Csatlakozva a szobához.'; render(); connectSocket(); } catch(e){ notice=e.message; render(); } });
}
loadSession();
render();
if(session) connectSocket();
window.addEventListener('beforeunload', () => { try { socket?.close(1000); } catch {} });
