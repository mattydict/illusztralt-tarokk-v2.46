const app = document.querySelector('#app');
const storageKey = 'illusztralt-tarokk-multiplayer-session-v247';
let session = null;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let state = null;
let lobby = null;
let selectedSkart = new Set();
let notice = '';

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
function phaseLabel(p) { return ({auction:'Licit','skart':'Fektetés','partner-call':'Partnerhívás',declarations:'Bemondás',play:'Lejátszás',scoring:'Elszámolás',complete:'Lezárva'})[p] ?? p; }
function saveSession() { try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch {} }
function loadSession() { try { const raw = localStorage.getItem(storageKey); if(raw) session = JSON.parse(raw); } catch {} }
function clearSession() { try { localStorage.removeItem(storageKey); } catch {} session = null; state = null; lobby = null; disconnectSocket(false); render(); }
async function jsonFetch(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, { ...options, headers: {'content-type':'application/json', ...(options.headers || {})} });
  const body = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
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
  if(msg.type === 'event') { state = msg.snapshot; lobby = msg.lobby || lobby; notice = msg.event?.message || ''; render(); return; }
  if(msg.type === 'action-accepted') { state = msg.snapshot; notice = 'Akció elfogadva.'; render(); return; }
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
  const suitOrder = {hearts: 0, diamonds: 1, spades: 2, clubs: 3};
  const suitRankOrder = {K: 5, Q: 4, C: 3, J: 2, '10': 1};
  const playerCards = [...rawPlayerCards].sort((a,b) => {
    if (a.kind !== b.kind) return a.kind === 'tarokk' ? -1 : 1;
    if (a.kind === 'tarokk') return b.rank - a.rank;
    return (suitOrder[a.suit] - suitOrder[b.suit]) || (suitRankOrder[a.rank] - suitRankOrder[b.rank]);
  });
  const me = lobbyPlayers.find(p => p.playerId === session.playerId);
  const ready = lobby?.ready === true;
  if(!state || !ready) {
    app.innerHTML = `
      <div class="top"><div><strong>Szobakód:</strong> <span class="room-code">${esc(session.roomId)}</span></div><button id="copy">Szobakód másolása</button><button id="leave">Kilépés</button></div>
      <div class="status ${connected ? 'ok':''}">${connected ? '● Real-time kapcsolat aktív' : '○ Kapcsolódás…'} ${esc(notice)}</div>
      <section class="panel"><h2>Lobby</h2><p>${lobby?.joinedCount ?? 0}/4 játékos csatlakozott. A játék akkor indulhat, ha mind a négy hely foglalt és minden játékos kapcsolódva van.</p>
      <div class="players">${lobbyPlayers.map(p => `<div class="player ${p.playerId===session.playerId?'me':''}"><strong>${esc(p.displayName)}</strong><span>${p.joined ? (p.connected ? '● online' : '○ offline') : 'Üres hely'}</span></div>`).join('')}</div></section>`;
    document.querySelector('#copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(session.roomId); notice='A szobakód a vágólapra került.'; render(); } catch { notice=`Szobakód: ${session.roomId}`; render(); } });
    document.querySelector('#leave')?.addEventListener('click', clearSession);
    return;
  }
  const current = state.currentPlayerId;
  const hints = state.legalActionHints || {};
  const isMyTurn = current === session.playerId;
  const trick = state.game?.trick;
  const skartPhase = state.phase === 'skart';
  const canSkart = skartPhase && hints.skartComplete === false && hints.skartAllDone === false;
  const hand = playerCards.map(c => {
    const legal = new Set(hints.playCardIds || []);
    const skartable = new Set(hints.skartCardIds || []);
    const active = state.phase === 'play' ? legal.has(c.id) : skartPhase ? canSkart && skartable.has(c.id) : false;
    const selected = selectedSkart.has(c.id);
    const suitClass = c.kind === 'suit' ? `suit-${c.suit}` : 'tarokk';
    return `<button class="card ${suitClass} ${active?'active':'disabled'} ${selected?'selected':''}" data-card="${esc(c.id)}" ${active ? '' : 'disabled'}><strong>${esc(cardName(c))}</strong><small>${c.points} pont</small></button>`;
  }).join('');
  const playButtons = state.phase === 'play' && isMyTurn ? playerCards.filter(c => (hints.playCardIds || []).includes(c.id)).map(c => `<button data-action="play" data-card-id="${esc(c.id)}">Kijátszás: ${esc(cardName(c))}</button>`).join('') : '';
  const auctionButtons = hints.auctionActions?.map((a,i) => `<button data-auction-index="${i}">${esc(auctionLabel(a))}</button>`).join('') || '';
  const partnerButtons = hints.partnerRanks?.map(r => `<button data-partner="${r}">${r}. tarokk</button>`).join('') || '';
  const declButtons = (hints.declarationActions || []).map((a,i) => `<button data-decl-index="${i}">${esc(a.type==='pass'?'Passz':a.type==='tarokkCount'?`${a.count} tarokk`:`${labels[a.declaration] || a.declaration}${a.targetCardId ? ` · ${a.targetCardId}` : ''}`)}</button>`).join('');
  const selectedCount = selectedSkart.size;
  const skartButton = canSkart ? `<button id="submit-skart" ${selectedCount === (hints.skartCount ?? -1) ? '' : 'disabled'}>Fektetés (${selectedCount}/${hints.skartCount ?? '?'})</button>` : '';
  const skartAnnounceButton = state.phase === 'skart' && hints.skartAllDone && isMyTurn && hints.skartComplete && !hints.skartAnnounced ? '<button id="announce-skart">Fektetés bemondása</button>' : '';
  const contra = [];
  if(hints.gameContra) contra.push('<button data-contra-game>Kontra a játékra</button>');
  (hints.declarationContraIds || []).forEach(id => contra.push(`<button data-contra="${esc(id)}">Kontra a bemondásra</button>`));
  const status = connected ? '● Real-time kapcsolat aktív' : '○ Reconnecting…';
  const turnText = canSkart ? 'Fektetés: te is fektethetsz.' : isMyTurn ? 'Te jössz.' : `Most: ${esc(current || '—')}`;
  const scores = state.players.map(p => `<span class="score">${esc(p.id)}: ${p.score ?? 0}</span>`).join(' · ');
  const declarations = state.game?.declarations?.map(d => `${esc(labels[d.type] || d.type)} — ${esc(d.ownerId)}${d.contra && d.contra !== 'none' ? ` · ${esc(d.contra)}` : ''}`).join('<br>') || 'Nincs';
  const trickHtml = trick ? trick.cards.map(x => `<div class="played"><b>${esc(x.player)}</b><span>${esc(cardName(x.card))}</span></div>`).join('') : '<span class="muted">Nincs aktív ütés.</span>';
  app.innerHTML = `
    <div class="top"><div><strong>${esc(me?.displayName || session.playerId)}</strong> · szoba <span class="room-code">${esc(session.roomId)}</span></div><span class="connection ${connected?'good':''}">${status}</span><button id="resync">Szinkronizálás</button><button id="leave">Kilépés</button></div>
    <div class="matchbar"><strong>${esc(phaseLabel(state.phase))}</strong> · ${turnText}<span>${scores}</span></div>
    <div class="status">${esc(notice)}</div>
    <section class="panel"><h2>Játékosok</h2><div class="players">${state.players.map(p => `<div class="player ${p.id===session.playerId?'me':''}"><strong>${esc((lobby?.seats?.find(x=>x.playerId===p.id)?.displayName) || p.id)}</strong><span>${p.connected ? '● online' : '○ offline'} · ${p.cardCount} lap</span></div>`).join('')}</div></section>
    <section class="panel"><h2>Akciók</h2><div class="actions">${auctionButtons}${partnerButtons}${declButtons}${skartButton}${playButtons}${contra.join('') || (hints.types?.length ? '' : '<span class="muted">Most nem te cselekszel.</span>')}</div></section>
    <section class="panel"><h2>Saját kéz (${playerCards.length})</h2><div class="hand">${hand}</div></section>
    <section class="panel"><h2>Ütés</h2><div class="trick">${trickHtml}</div></section>
    <section class="panel"><h2>Bemondások</h2><p>${declarations}</p></section>`;
  document.querySelector('#leave')?.addEventListener('click', clearSession);
  document.querySelector('#resync')?.addEventListener('click', () => { if(socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'resync', since:state.sequence})); });
  document.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.card;
    if(state.phase === 'skart' && hints.skartComplete === false && hints.skartAllDone === false && (hints.skartCardIds || []).includes(id)) { if(selectedSkart.has(id)) selectedSkart.delete(id); else selectedSkart.add(id); render(); }
  }));
  document.querySelectorAll('[data-auction-index]').forEach(btn => btn.addEventListener('click', () => { const a = hints.auctionActions[Number(btn.dataset.auctionIndex)]; if(a) sendAction({type:'auction', action:a}); }));
  document.querySelectorAll('[data-partner]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'partner-call', rank:Number(btn.dataset.partner)})));
  document.querySelectorAll('[data-decl-index]').forEach(btn => btn.addEventListener('click', () => { const a = hints.declarationActions[Number(btn.dataset.declIndex)]; if(a) { sendAction({type:'declaration', action:a}); } }));
  document.querySelector('#submit-skart')?.addEventListener('click', () => { if(selectedSkart.size === hints.skartCount) { sendAction({type:'skart', cardIds:[...selectedSkart]}); selectedSkart.clear(); } });
  document.querySelector('#announce-skart')?.addEventListener('click', () => sendAction({type:'skart-announce'}));
  document.querySelectorAll('[data-action="play"]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'play-card', cardId:btn.dataset.cardId})));
  document.querySelector('[data-contra-game]')?.addEventListener('click', () => sendAction({type:'game-contra'}));
  document.querySelectorAll('[data-contra]').forEach(btn => btn.addEventListener('click', () => sendAction({type:'declaration-contra', declarationId:btn.dataset.contra})));
}
function auctionLabel(a) {
  if(a.type === 'pass') return 'Passz';
  if(a.type === 'bid') return a.honourless ? 'Honőr nélküli hármas' : `Licit: ${labels[a.contract] || a.contract}`;
  if(a.type === 'hold') return `Tartom: ${labels[a.contract] || a.contract}`;
  if(a.type === 'hold-invite') return `Tartom + invit: ${labels[a.contract] || a.contract} → ${a.target}`;
  if(a.type === 'invite') return `Invit: ${a.target}. tarokk`;
  return a.type;
}
async function renderLanding() {
  app.innerHTML = `
    <div class="hero"><span class="badge">v2.47 multiplayer</span><h2>Online Illusztrált Tarokk</h2><p class="muted">Szobaalapú lobby, szerveroldali szabályellenőrzés és valós idejű játék.</p></div>
    <section class="panel forms"><div><h3>Új szoba</h3><label>Név<input id="createName" maxlength="28" placeholder="Játékos neve"></label><button id="create">Szoba létrehozása</button></div><div><h3>Csatlakozás</h3><label>Szobakód<input id="roomCode" maxlength="6" placeholder="ABC123"></label><label>Név<input id="joinName" maxlength="28" placeholder="Játékos neve"></label><button id="join">Csatlakozás</button></div></section><p class="server">Szerver: ${esc(apiBase)}</p>${notice ? `<div class="status">${esc(notice)}</div>`:''}`;
  document.querySelector('#create')?.addEventListener('click', async () => { try { notice='Szoba létrehozása…'; render(); const r=await jsonFetch('/lobby/rooms',{method:'POST',body:JSON.stringify({displayName:document.querySelector('#createName').value})}); session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Szoba létrehozva.'; render(); connectSocket(); } catch(e){ notice=e.message; render(); } });
  document.querySelector('#join')?.addEventListener('click', async () => { try { const room=String(document.querySelector('#roomCode').value).trim().toUpperCase(); const r=await jsonFetch(`/lobby/rooms/${encodeURIComponent(room)}/join`,{method:'POST',body:JSON.stringify({displayName:document.querySelector('#joinName').value})}); session={roomId:r.roomId,playerId:r.playerId,token:r.token}; state=r.snapshot; lobby=r.status; saveSession(); notice='Csatlakozva a szobához.'; render(); connectSocket(); } catch(e){ notice=e.message; render(); } });
}
loadSession();
render();
if(session) connectSocket();
window.addEventListener('beforeunload', () => { try { socket?.close(1000); } catch {} });
