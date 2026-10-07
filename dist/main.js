import { isTarokk } from '../engine/cards.js';
import { applyAuctionAction, legalAuctionActions } from '../engine/auction.js';
import { resolveAuctionOutcome } from '../engine/auctionOutcome.js';
import { createRound, dealRound, distributeRoundTalon, skartRoundPlayer, announceSkartCount } from '../engine/round.js';
import { activePlayerIds, completeDeal, createMatch, isMatchComplete } from '../engine/match.js';
import { resolveCalledPartner } from '../engine/partnership.js';
import { chooseAIDeclaration, communicationBeliefs } from '../engine/aiDeclarations.js';
import { buildAIBeliefSnapshot, partnerBeliefsFromAIBeliefSnapshot } from '../engine/aiBeliefEngine.js';
import { buildHandHypotheses } from '../engine/aiHandHypotheses.js';
import { chooseAIContra } from '../engine/aiContra.js';
import { chooseAIAuctionAction } from '../engine/aiAuction.js';
import { chooseAICardAtDifficulty } from '../engine/aiPlay.js';
import { createInitialState, legalCardsForPlay, playCard, setPartnership, recordPartnerCall, startDeclarations, startPlay, declareFigureInGame, canRaiseGameContraInGame, raiseGameContraInGame, canRaiseDeclarationContraInGame, raiseDeclarationContraInGame } from '../engine/game.js';
import { createDeclarationWindow, currentDeclarer, legalDeclarationActions, applyDeclarationAction, markDeclarationTurnAction } from '../engine/declarationWindow.js';
import { legalSkartCards } from '../engine/skart.js';
import { chooseAISkart } from '../engine/aiSkart.js';
import { chooseAIPartnerCall } from '../engine/aiPartnerCall.js';
const app = document.querySelector('#app');
const HUMAN = 'P1';
const PLAYER_POOL = ['P1', 'P2', 'P3', 'P4', 'P5'];
let playerIds = PLAYER_POOL.slice(0, 4);
let match = null;
let round = null;
let game = null;
let talon = [];
let selectedSkart = new Set();
let calledTarokk;
let declarationWindow = null;
let message = '';
let seed = 20261003;
let matchTrickPoints = {};
let aiDifficulty = 'expert';
let showAiReasons = false;
let paused = false;
let aiTimer;
let lastAiReason;
let uiError = '';
let lastUiAction = 'A játék készen áll.';
let savedRounds = 1;
function loadUISettings() {
    try {
        const raw = window.localStorage.getItem('illusztralt-tarokk-settings-v241');
        if (!raw)
            return;
        const parsed = JSON.parse(raw);
        if (parsed.aiDifficulty === 'expert' || parsed.aiDifficulty === 'standard' || parsed.aiDifficulty === 'casual')
            aiDifficulty = parsed.aiDifficulty;
        if (typeof parsed.showAiReasons === 'boolean')
            showAiReasons = parsed.showAiReasons;
        if (parsed.playerCount === 4 || parsed.playerCount === 5)
            playerIds = PLAYER_POOL.slice(0, parsed.playerCount);
        const storedRounds = parsed.rounds;
        if (typeof storedRounds === 'number' && Number.isInteger(storedRounds) && storedRounds >= 1 && storedRounds <= 50)
            savedRounds = storedRounds;
    }
    catch { /* localStorage unavailable */ }
}
function saveUISettings() {
    try {
        window.localStorage.setItem('illusztralt-tarokk-settings-v241', JSON.stringify({ aiDifficulty, showAiReasons, playerCount: playerIds.length, rounds: savedRounds }));
    }
    catch { /* localStorage unavailable */ }
}
function clearAiTimer() {
    if (aiTimer !== undefined) {
        window.clearTimeout(aiTimer);
        aiTimer = undefined;
    }
}
function recordUiError(error, fallback = 'Váratlan alkalmazáshiba.') {
    uiError = error instanceof Error ? error.message : fallback;
    lastUiAction = 'A játék biztonságosan megállt.';
    paused = true;
    clearAiTimer();
}
function aiDelayMs() {
    return aiDifficulty === 'expert' ? 850 : aiDifficulty === 'standard' ? 1100 : 1450;
}
function aiAuctionDelayMs() { return aiDifficulty === 'expert' ? 900 : aiDifficulty === 'standard' ? 1200 : 1600; }
function aiDeclarationDelayMs() { return aiDifficulty === 'expert' ? 1050 : aiDifficulty === 'standard' ? 1350 : 1750; }
function aiSkartDelayMs() { return aiDifficulty === 'expert' ? 700 : aiDifficulty === 'standard' ? 900 : 1200; }
function setAiReason(playerId, reasons) {
    if (!reasons.length)
        return;
    lastAiReason = { playerId, text: reasons.slice(0, 3).join(' · ') };
}
function rng(seed0) { let x = seed0 >>> 0; return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; }; }
function cardName(card) { if (card.kind === 'tarokk')
    return `${card.rank}. tarokk`; const suit = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' }[card.suit]; return `${suit}${card.rank}`; }
function playerName(id) { return id === HUMAN ? 'Te' : `Gépi ${id.slice(1)}`; }
function phaseLabel(phase) {
    return {
        auction: 'Licit',
        'talon-distribution': 'Talon',
        skart: 'Fektetés',
        'partner-call': 'Partnerhívás',
        declarations: 'Bemondások',
        play: 'Lejátszás',
        scoring: 'Elszámolás',
        complete: 'Lezárva',
    }[phase] ?? phase;
}
function declarationLabel(type) {
    return {
        tarokk8: '8 tarokk', tarokk9: '9 tarokk', tuletroa: 'Tulétroá', fourKings: 'Négykirály',
        doubleGame: 'Duplajáték', volat: 'Volát', xxiFogas: 'XXI-fogás', centrum: 'Centrum',
        kismadar: 'Kismadár', nagymadar: 'Nagymadár', pagatUltimo: 'Pagát ultimó', pagatUhu: 'Pagát uhu',
        sasUltimo: 'Sas ultimó', sasUhu: 'Sas uhu', kingUltimo: 'Király ultimó', kingUhu: 'Király uhu',
    }[type] ?? type;
}
function contractLabel(contract) {
    return { three: 'Hármas', two: 'Kettes', one: 'Egyes', solo: 'Szóló' }[contract ?? ''] ?? contract ?? '—';
}
function currentDealSummary() {
    if (!game)
        return '—';
    const taker = game.takerId ? playerName(game.takerId) : '—';
    const partner = game.partnerId ? playerName(game.partnerId) : '—';
    const called = game.calledTarokk !== undefined ? `${game.calledTarokk}. tarokk` : '—';
    return `${contractLabel(game.contract)} · felvevő: ${taker} · partner: ${partner} · hívott: ${called}`;
}
function activeHand(id) { return round?.players.find(p => p.playerId === id)?.hand ?? []; }
function humanRound() { return round?.players.find(p => p.playerId === HUMAN); }
function orderedDealPlayers(state) {
    return activePlayerIds(state);
}
function startConfiguredMatch(playerCount, targetRounds) {
    paused = false;
    uiError = '';
    lastAiReason = undefined;
    clearAiTimer();
    playerIds = PLAYER_POOL.slice(0, playerCount);
    const startingDealerIndex = playerCount - 1;
    match = createMatch(playerIds, targetRounds, startingDealerIndex);
    matchTrickPoints = Object.fromEntries(playerIds.map(id => [id, 0]));
    startNextDeal();
}
function startNextDeal() {
    if (!match)
        return;
    paused = false;
    uiError = '';
    lastAiReason = undefined;
    clearAiTimer();
    game = null;
    declarationWindow = null;
    selectedSkart.clear();
    calledTarokk = undefined;
    message = '';
    seed += 1;
    const dealPlayers = orderedDealPlayers(match);
    round = createRound(dealPlayers, 0);
    // Single-player uses the same parallel skart state model as multiplayer.
    // The taker does not get a separate 'announce discarded tarokks' turn; the
    // authoritative round engine handles the public disclosure rules.
    round = { ...round, parallelSkart: true };
    round = dealRound(round, rng(seed));
    talon = round.talon;
    message = dealPlayers.includes(HUMAN)
        ? `${playerName(round.startingPlayerId)} kezdi a licitet.`
        : 'Te vagy az osztó; ebben a leosztásban kimaradsz.';
    render();
    runAiAuction();
}
function finishCurrentDeal() {
    if (!match || !game?.finalPoints)
        return;
    for (const [id, points] of Object.entries(game.finalPoints.byPlayer)) {
        matchTrickPoints[id] = (matchTrickPoints[id] ?? 0) + points;
    }
    match = completeDeal(match);
    if (isMatchComplete(match)) {
        message = `A mérkőzés befejeződött: ${match.completedRounds} forduló, ${match.completedDeals} leosztás.`;
        render();
        return;
    }
    startNextDeal();
}
function announceUiAction(text) { lastUiAction = text; }
function pauseAI() {
    if (!match || !game || game.phase !== 'play')
        return;
    paused = true;
    clearAiTimer();
    message = 'A gépi lejátszás szüneteltetve.';
    announceUiAction('AI szüneteltetve.');
    render();
}
function resumeAI() {
    if (!paused)
        return;
    paused = false;
    uiError = '';
    message = 'A gépi lejátszás folytatódik.';
    announceUiAction('AI folytatódik.');
    render();
    runAiPlay();
}
function restartCurrentDeal() {
    if (!match)
        return;
    startNextDeal();
}
function newMatch() {
    const playerCount = Number(document.querySelector('#playerCount')?.value ?? 4);
    const rawRounds = Number(document.querySelector('#rounds')?.value ?? 1);
    const targetRounds = Number.isFinite(rawRounds) ? Math.max(1, Math.min(50, Math.floor(rawRounds))) : savedRounds;
    savedRounds = targetRounds;
    aiDifficulty = (document.querySelector('#aiDifficulty')?.value ?? aiDifficulty);
    showAiReasons = document.querySelector('#showAiReasons')?.checked ?? showAiReasons;
    saveUISettings();
    startConfiguredMatch(playerCount, targetRounds);
}
function handsMap() { return Object.fromEntries((round?.players ?? []).map(p => [p.playerId, p.hand])); }
function aiAuctionAction(state, id) {
    const hand = activeHand(id);
    return chooseAIAuctionAction(state, id, hand, handsMap(), { singlePlayer: true }).action;
}
function applyBid(action) {
    if (!round)
        return;
    try {
        round = { ...round, auction: applyAuctionAction(round.auction, action, handsMap()), eventLog: [...round.eventLog, `${HUMAN}: ${labelAction(action)}`] };
        message = 'Licit megtörtént.';
        render();
        runAiAuction();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Szabálytalan licit.';
        render();
    }
}
function labelAction(a) {
    if (a.type === 'pass')
        return 'passz';
    if (a.type === 'bid')
        return a.honourless ? 'honőr nélküli hármas' : 'licit ' + a.contract;
    if (a.type === 'hold')
        return 'tartom ' + a.contract;
    if (a.type === 'hold-invite')
        return `tartom ${a.contract}, invit ${a.target}. tarokk`;
    return `invit ${a.target}. tarokk`;
}
function runAiAuction() {
    clearAiTimer();
    if (!round || round.auction.finished) {
        if (round)
            finishAuctionFlow();
        return;
    }
    const id = round.auction.seats[round.auction.currentSeat]?.playerId;
    if (!id || id === HUMAN) {
        render();
        return;
    }
    const action = aiAuctionAction(round.auction, id);
    try {
        round = { ...round, auction: applyAuctionAction(round.auction, action, handsMap()), eventLog: [...round.eventLog, `${playerName(id)}: ${labelAction(action)}`] };
        message = `${playerName(id)} licitált: ${labelAction(action)}.`;
    }
    catch (e) {
        round = { ...round, auction: { ...round.auction, finished: true }, eventLog: [...round.eventLog, 'Az AI licitje hibás lett; a parti leállt.'] };
        message = e instanceof Error ? e.message : 'AI licithiba';
    }
    render();
    if (round.auction.finished)
        finishAuctionFlow();
    else
        aiTimer = window.setTimeout(runAiAuction, aiAuctionDelayMs());
}
function finishAuctionFlow() {
    if (!round || !round.auction.finished || !round.auction.highest) {
        render();
        return;
    }
    try {
        const outcome = resolveAuctionOutcome(round.auction, handsMap(), talon);
        round = { ...round, contract: outcome.contract, takerId: outcome.takerId, auctionOutcome: outcome, phase: 'talon-distribution', currentPlayerId: outcome.takerId, ...(outcome.calledTarokk !== undefined ? { calledTarokk: outcome.calledTarokk, invitedTarokk: outcome.calledTarokk } : {}), eventLog: [...round.eventLog, `Felvevő: ${playerName(outcome.takerId)}, játék: ${outcome.contract}.`].concat(outcome.requiredPartnerCallId ? [`Meghívandó invitáló: ${playerName(outcome.requiredPartnerCallId)}`] : []) };
        // distributeRoundTalon expects its own talon, then skartolási fázist kezdi.
        round = distributeRoundTalon(round, talon);
        message = round.takerId === HUMAN ? 'Vedd fel a talont, majd válaszd ki a fektetendő lapokat.' : 'A gépek fektetnek.';
        render();
        runAiSkart();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Az aukció eredménye érvénytelen.';
        render();
    }
}
function runAiSkart() {
    clearAiTimer();
    if (!round || !['skart', 'skart-announcement'].includes(round.phase)) {
        if (round?.phase === 'partner-call')
            runAiPartnerCall();
        else if (round?.phase === 'declarations') {
            if (!game)
                autoPartnerIfPossible();
            else
                runAiDeclarations();
        }
        else
            render();
        return;
    }
    if (round.phase === 'skart') {
        const pendingAI = round.players.find(p => p.playerId !== HUMAN && p.skart.length < p.receivedTalon.length);
        if (pendingAI) {
            const n = pendingAI.receivedTalon.length;
            let decision;
            try {
                decision = chooseAISkart(pendingAI.hand, n, {
                    isTaker: pendingAI.playerId === round.takerId,
                    ...(round.invitedTarokk !== undefined ? { invitedTarokk: round.invitedTarokk } : {}),
                    ...(round.contract ? { contract: round.contract } : {}),
                    ...(pendingAI.preSkartSuitCounts ? { preSkartSuitCounts: pendingAI.preSkartSuitCounts } : {}),
                });
            }
            catch (e) {
                // Single-player safety net: a strategy-layer failure must not
                // deadlock the whole fektetés. The authoritative skart validator
                // still decides whether the fallback is legal.
                const legal = legalSkartCards(pendingAI.hand, round.invitedTarokk);
                if (legal.length < n) {
                    message = e instanceof Error ? e.message : `${playerName(pendingAI.playerId)} nem tudott szabályos fektetést választani.`;
                    render();
                    return;
                }
                decision = { cards: legal.slice(0, n), reasons: ['Biztonsági fektetés: az AI stratégiai skartválasztója hibát jelzett.'] };
            }
            try {
                round = skartRoundPlayer(round, pendingAI.playerId, decision.cards);
                setAiReason(pendingAI.playerId, decision.reasons);
                round = { ...round, eventLog: [...round.eventLog, `${playerName(pendingAI.playerId)} fektetett ${decision.cards.filter(isTarokk).length} tarokkot.`] };
                message = `${playerName(pendingAI.playerId)} befejezte a fektetést.`;
            }
            catch (e) {
                message = e instanceof Error ? e.message : `${playerName(pendingAI.playerId)} nem tudott szabályos fektetést választani.`;
            }
            render();
            if (round.phase === 'skart')
                aiTimer = window.setTimeout(runAiSkart, aiSkartDelayMs());
            else
                runAiSkart();
            return;
        }
        // The human can fektet independently in the parallel phase.
        if (round.players.find(p => p.playerId === HUMAN)?.skart.length !== round.players.find(p => p.playerId === HUMAN)?.receivedTalon.length) {
            message = 'A gépek fektetnek; te közben kijelölheted és leadhatod a saját fektetésedet.';
            render();
            return;
        }
    }
    if (round.phase === 'skart-announcement') {
        const pendingAI = round.players.find(p => p.playerId !== HUMAN && p.playerId !== round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced);
        if (pendingAI) {
            try {
                round = announceSkartCount(round, pendingAI.playerId);
                round = { ...round, eventLog: [...round.eventLog, `${playerName(pendingAI.playerId)} közölte: ${pendingAI.skartTarokkCount} tarokkot fektetett.`] };
                message = `${playerName(pendingAI.playerId)} közölte a fektetését.`;
            }
            catch (e) {
                message = e instanceof Error ? e.message : 'Fektetésközlési hiba.';
            }
            render();
            if (round.phase === 'skart-announcement')
                aiTimer = window.setTimeout(runAiSkart, aiSkartDelayMs());
            else
                runAiSkart();
            return;
        }
        const hp = round.players.find(p => p.playerId === HUMAN);
        if (hp && hp.playerId !== round.takerId && (hp.skartTarokkCount ?? 0) > 0 && !hp.skartAnnounced) {
            message = 'A fektetett tarokkok közlése következik.';
            render();
            return;
        }
    }
    if (round.phase === 'partner-call')
        runAiPartnerCall();
    else if (round.phase === 'declarations') {
        if (!game)
            autoPartnerIfPossible();
        else
            runAiDeclarations();
    }
    else
        render();
}
function humanSkart() {
    if (!round || round.phase !== 'skart')
        return;
    const p = humanRound();
    if (!p || p.skart.length === p.receivedTalon.length)
        return;
    const count = p.receivedTalon.length;
    const cards = p.hand.filter(c => selectedSkart.has(c.id));
    try {
        round = skartRoundPlayer(round, HUMAN, cards);
        selectedSkart.clear();
        message = 'Fektetés megtörtént.';
        render();
        runAiSkart();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Szabálytalan fektetés.';
        render();
    }
}
function humanSkartAnnounce() {
    if (!round || round.phase !== 'skart-announcement')
        return;
    try {
        round = announceSkartCount(round, HUMAN);
        message = 'A fektetésközlés megtörtént.';
        render();
        runAiSkart();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Hiba';
        render();
    }
}
function callPartner(rank) {
    if (!round || round.phase !== 'partner-call' || !round.takerId || round.currentPlayerId !== HUMAN)
        return;
    const partner = resolveCalledPartner(round.takerId, rank, round.players.map(p => ({ id: p.playerId, hand: p.hand })));
    const required = round.auctionOutcome?.calledTarokk;
    if (required !== undefined && rank !== required) {
        message = `Ebben az invitált játékban kötelező a ${required}. tarokkot meghívni.`;
        render();
        return;
    }
    if (!partner) {
        message = `A ${rank}. tarokk nem ad egyértelmű partnert.`;
        render();
        return;
    }
    calledTarokk = rank;
    round = { ...round, calledTarokk, invitedTarokk: rank, eventLog: [...round.eventLog, `Te meghívtad a ${rank}. tarokkot; partner: ${playerName(partner)}.`] };
    startGame(partner);
}
function runAiPartnerCall() {
    if (!round || round.phase !== 'partner-call' || !round.takerId)
        return;
    if (round.currentPlayerId === HUMAN) {
        message = 'Válaszd ki, melyik tarokkot hívod meg partnernek.';
        render();
        return;
    }
    const activeRound = round;
    const taker = activeRound.players.find(p => p.playerId === activeRound.takerId);
    if (!taker)
        return;
    const required = activeRound.auctionOutcome?.calledTarokk;
    const decision = chooseAIPartnerCall(taker.hand, {
        ...(required !== undefined ? { requiredTarokk: required, invitedTarokk: required } : {}),
        ...(activeRound.contract ? { contract: activeRound.contract } : {}),
    });
    const rank = decision.rank;
    // This lookup resolves the partner only after the rank has been chosen; the
    // strategy itself never receives opponents' hidden hands.
    const partner = resolveCalledPartner(taker.playerId, rank, round.players.map(p => ({ id: p.playerId, hand: p.hand })));
    if (!partner) {
        message = `A ${rank}. tarokk hívása nem eredményezett egyértelmű partnert.`;
        render();
        return;
    }
    calledTarokk = rank;
    round = { ...round, calledTarokk, invitedTarokk: rank, eventLog: [...round.eventLog, `${playerName(taker.playerId)} meghívta a ${rank}. tarokkot; partner: ${playerName(partner)}.`, ...decision.reasons.map(reason => `${playerName(taker.playerId)} partnerhívási döntés: ${reason}`)] };
    startGame(partner);
}
function runAiContraResponses() {
    if (!game || game.phase !== 'declarations' || !round)
        return;
    let guard = 8;
    while (guard-- > 0) {
        const currentGame = game;
        const candidates = currentGame.players
            .filter(p => p.id !== HUMAN)
            .map(p => ({ player: p, decision: chooseAIContra(currentGame, p.id) }))
            .filter(x => x.decision !== undefined);
        if (!candidates.length)
            break;
        candidates.sort((a, b) => (b.decision?.score ?? -Infinity) - (a.decision?.score ?? -Infinity));
        const best = candidates[0];
        const decision = best.decision;
        if (!decision)
            break;
        try {
            if (decision.target === 'game')
                game = raiseGameContraInGame(currentGame, best.player.id);
            else
                game = raiseDeclarationContraInGame(currentGame, decision.target, best.player.id);
            round = { ...round, eventLog: [...round.eventLog, `${playerName(best.player.id)}: ${decision.target === 'game' ? 'Kontra a játékra' : `Kontra a ${game.declarations.declarations.find(d => d.id === decision.target)?.type ?? 'bemondás'}-ra`} (${decision.reason})`] };
        }
        catch {
            break;
        }
    }
}
function targetCardForKingDeclaration(type, hand) {
    const kings = hand.filter(c => c.kind === 'suit' && c.rank === 'K');
    if (!kings.length)
        return undefined;
    // In the AI path choose a concrete king deterministically; the human UI
    // exposes the individual king choices instead.
    return kings.sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
}
function defencePubliclyIdentified(g) {
    if (!g) return false;
    const defenceIds = g.players.filter(p => p.active && p.id !== g.takerId && p.id !== g.partnerId).map(p => p.id);
    if (!defenceIds.length) return true;
    if ((g.gameContraState?.records ?? []).some(r => defenceIds.includes(r.byPlayer))) return true;
    return g.declarations.declarations.some(d => (d.contra?.records ?? []).some(r => defenceIds.includes(r.byPlayer)));
}

function singlePlayerTakerRekontraTarget(g, id) {
    if (!g || id !== g.partnerId) return undefined;
    const firstGame = g.gameContraState?.records?.find(r => r.side === 'defence' && r.level === 'kontra');
    if (firstGame && !g.gameContraState.records.some(r => r.side === 'taker' && r.level === 'rekontra'))
        return 'game';
    for (const d of g.declarations.declarations) {
        const first = (d.contra?.records ?? []).find(r => r.side === 'defence' && r.level === 'kontra');
        if (!first) continue;
        const hasTakerReply = (d.contra?.records ?? []).some(r => r.side === 'taker' && r.level === 'rekontra');
        if (!hasTakerReply) return d.id;
    }
    return undefined;
}


function forceSinglePlayerDefenceIdentification(id) {
    if (!game || game.phase !== 'declarations' || id === game.takerId || id === game.partnerId) return false;
    if (defencePubliclyIdentified(game)) return false;
    try {
        game = raiseGameContraInGame(game, id);
        round = { ...round, eventLog: [...round.eventLog, `${playerName(id)}: Kontra a játékra — az ellenpár azonosította magát.`] };
        declarationWindow = markDeclarationTurnAction(declarationWindow, id);
        message = `${playerName(id)} kontrával azonosította az ellenpárt.`;
        return true;
    } catch {
        return false;
    }
}

function logDeclarationRoundTransition(beforeWindow, afterWindow) {
    if (!beforeWindow || !afterWindow || afterWindow.roundNumber === beforeWindow.roundNumber) return;
    round = { ...round, eventLog: [...round.eventLog, `Bemondások: megkezdődött a ${afterWindow.roundNumber}. kör.`] };
}

function runAiDeclarations() {
    clearAiTimer();
    if (!game || game.phase !== 'declarations' || !round || !declarationWindow)
        return;
    const id = currentDeclarer(declarationWindow);
    if (!id)
        return;
    // Human declarations are never automated.  The UI remains on this player
    // until they explicitly choose a declaration or Passz.
    if (id === HUMAN) {
        round = { ...round, currentPlayerId: HUMAN };
        message = 'Te következel a bemondásban. A saját bemondásaidat neked kell megtenned.';
        render();
        return;
    }
    if (forceSinglePlayerDefenceIdentification(id)) {
        render();
        aiTimer = window.setTimeout(runAiDeclarations, aiDeclarationDelayMs());
        return;
    }
    const gp = game.players.find(p => p.id === id);
    if (!gp)
        return;
    const ctx = {
        isTaker: id === game.takerId,
        invited: round.auctionOutcome?.calledTarokk !== undefined,
        ...(round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: round.auctionOutcome.calledTarokk } : {}),
        ...(round.contract ? { contract: round.contract } : {}),
        previousDeclarations: game.declarations.declarations.map(d => d.type),
        firstRound: declarationWindow.firstRound,
        partnersKnown: true,
        ...(id === game.partnerId ? { isPartner: true } : {}),
        ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk } : {}),
        ...(game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}),
        ...(id === game.takerId && round.calledTarokk === 19 && !game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}),
        speakerSeat: game.players.findIndex(p => p.id === id),
        ...(game.partnerId ? { partnerSeat: game.players.findIndex(p => p.id === game.partnerId) } : {}),
        ...(game.startingPlayerId ? { starterSeat: game.players.findIndex(p => p.id === game.startingPlayerId) } : {}),
        xxiThreatScore: game.declarations.declarations.some(d => d.type === 'fourKings') ? 6 : 0,
        skizCapturePressure: gp.hand.some(c => c.kind === 'tarokk' && c.rank === 22) ? 5 : 0,
        partnerSupport: communicationBeliefs({ previous: game.declarations.declarations.map(d => d.type), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk } : {}) }).encouragements.figure?.score ?? 0,
        partnerDeclaredTarokk9: game.partnerId ? declarationWindow.records.some(r => r.playerId === game.partnerId && r.type === 'tarokkCount' && r.count === 9) : false,
        partnerDeclaredFourKings: game.partnerId ? game.declarations.declarations.some(d => d.ownerId === game.partnerId && d.type === 'fourKings') : false,
        partnerDeclarationEncouragement: game.partnerId ? (declarationWindow.records.some(r => r.playerId === game.partnerId && r.type === 'tarokkCount' && r.count === 9) && game.declarations.declarations.some(d => d.ownerId === game.partnerId && d.type === 'fourKings')) : false
    };
    if (ctx.partnerDeclarationEncouragement && !round.eventLog.some(x => x.includes(`${playerName(game.partnerId)}: 9 tarokk + Négykirály partneri bíztatás felismerve`))) {
        round = { ...round, eventLog: [...round.eventLog, `${playerName(game.partnerId)}: 9 tarokk + Négykirály partneri bíztatás felismerve — a partneri oldal erős játékot jelez.`] };
    }
    const actions = legalDeclarationActions(declarationWindow, id, gp.hand, ctx);
    if (!actions.length) {
        message = `A bemondási állapothoz nincs elérhető akció (${playerName(id)}).`;
        render();
        return;
    }
    const currentTrickNumber = game.completedTricks.length + 1;
    const aiSide = id === game.takerId || id === game.partnerId ? 'taker' : 'defence';
    const pairAlreadyDeclaredThisTrick = game.declarations.declarations.some(d => d.declaredAtTrick === currentTrickNumber && ((d.ownerId === game.takerId || d.ownerId === game.partnerId ? 'taker' : 'defence') === aiSide));
    const forcedCount = declarationWindow.pendingTarokkCountPlayerId === id ? actions.find(a => a.type === 'tarokkCount') : undefined;
    const worldBeliefs = buildAIBeliefSnapshot(game, id);
    const handHypotheses = buildHandHypotheses(game, id, worldBeliefs);
    const decision = chooseAIDeclaration(gp.hand, ctx, communicationBeliefs({ previous: game.declarations.declarations.map(d => d.type), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk } : {}) }), worldBeliefs, handHypotheses, game);
    let action = actions[0];
    if (forcedCount)
        action = forcedCount;
    else if (pairAlreadyDeclaredThisTrick)
        action = actions.find(a => a.type === 'pass') ?? actions[0];
    else if (decision.action.type === 'pass')
        action = actions.find(a => a.type === 'pass') ?? actions[0];
    else if (decision.action.type === 'tarokk8' || decision.action.type === 'tarokk9')
        action = actions.find(a => a.type === 'tarokkCount' && a.count === Number(decision.action.type === 'tarokk8' ? 8 : 9)) ?? actions.find(a => a.type === 'pass') ?? actions[0];
    else
        action = actions.find(a => a.type === 'declare' && a.declaration === decision.action.type) ?? actions.find(a => a.type === 'pass') ?? actions[0];
    try {
        const forcedRekontraTarget = singlePlayerTakerRekontraTarget(game, id);
        if (forcedRekontraTarget && action.type !== 'pass') {
            game = forcedRekontraTarget === 'game'
                ? raiseGameContraInGame(game, id)
                : raiseDeclarationContraInGame(game, forcedRekontraTarget, id);
            declarationWindow = markDeclarationTurnAction(declarationWindow, id);
            round = { ...round, eventLog: [...round.eventLog, `${playerName(id)}: Rekontra — a felvevőpár azonosította magát.`] };
        }
        if (action.type === 'declare') {
            const targetCardId = (action.declaration === 'kingUltimo' || action.declaration === 'kingUhu') ? targetCardForKingDeclaration(action.declaration, gp.hand) : undefined;
            if ((action.declaration === 'kingUltimo' || action.declaration === 'kingUhu') && !targetCardId)
                action = actions.find(a => a.type === 'pass') ?? action;
            else
                game = declareFigureInGame(game, action.declaration, id, game.completedTricks.length + 1, targetCardId);
        }
        const beforeDeclarationWindow = declarationWindow;
        declarationWindow = applyDeclarationAction(declarationWindow, action, gp.hand);
        logDeclarationRoundTransition(beforeDeclarationWindow, declarationWindow);
        const actionText = action.type === 'pass' ? 'Passz' : action.type === 'tarokkCount' ? `${action.count} tarokk` : declarationLabel(action.declaration);
        round = { ...round, eventLog: [...round.eventLog, `${playerName(id)}: ${actionText}`] };
        message = `${playerName(id)}: ${actionText}.`;
        runAiContraResponses();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Szabálytalan AI-bemondás.';
        render();
        return;
    }
    render();
    if (declarationWindow.finished && game && round) {
        const g = game;
        const startingPlayerId = round.startingPlayerId;
        const leaderIndex = g.players.findIndex(p => p.id === startingPlayerId);
        game = startPlay({ ...g, startingPlayerId }, leaderIndex);
        round = { ...round, phase: 'play', currentPlayerId: game.players[leaderIndex].id };
        message = 'A lejátszás kezdődik.';
        render();
        runAiPlay();
        return;
    }
    const next = currentDeclarer(declarationWindow);
    round = next ? { ...round, currentPlayerId: next } : round;
    if (next === HUMAN) {
        message = 'Te következel a bemondásban.';
        render();
        return;
    }
    aiTimer = window.setTimeout(runAiDeclarations, aiDeclarationDelayMs());
}
function choosePartner(rank) {
    if (!round || !round.takerId)
        return;
    const holders = round.players.filter(p => p.playerId !== round.takerId && p.hand.some(c => c.kind === 'tarokk' && c.rank === rank));
    if (holders.length !== 1) {
        message = `A ${rank}. tarokk nem ad egyértelmű partnert ebben a kézben.`;
        render();
        return;
    }
    calledTarokk = rank;
    startGame(holders[0].playerId);
}
function startGame(partnerId) {
    if (!round || !round.takerId)
        return;
    const g0 = createInitialState(round.players.map(p => p.playerId), 0);
    const players = g0.players.map(p => { const rp = round.players.find(x => x.playerId === p.id); return { ...p, hand: [...rp.hand], active: true }; });
    const startingPlayerId = round.startingPlayerId;
    let g = setPartnership({ ...g0, players, talon: [], startingPlayerId, skartsByPlayer: Object.fromEntries(round.players.map(p => [p.playerId, [...p.skart]])) }, round.takerId, partnerId);
    if (calledTarokk === undefined)
        throw new Error('A partnerhívás nincs rögzítve.');
    g = recordPartnerCall(g, calledTarokk, partnerId);
    const takerIndex = g.players.findIndex(p => p.id === round.takerId);
    // Declaration order always starts with the taker, regardless of who opened
    // the auction or who will lead the first trick.
    g = startDeclarations(g, takerIndex);
    game = g;
    declarationWindow = createDeclarationWindow([round.takerId, ...g.players.map(p => p.id).filter(id => id !== round.takerId)], true);
    round = { ...round, phase: 'declarations', currentPlayerId: g.players[takerIndex].id, ...(calledTarokk !== undefined ? { calledTarokk } : {}) };
    message = 'A bemondási kör kezdődik: a felvevő következik.';
    render();
    runAiDeclarations();
}
function autoPartnerIfPossible() {
    if (!round || !round.takerId)
        return;
    // Demo safeguard only: if an invite fixed the partner, use it; otherwise expose explicit choice.
    const target = round.auctionOutcome?.calledTarokk;
    if (target !== undefined)
        choosePartner(target);
    else
        render();
}
function contraLabel(level) {
    return { kontra: 'Kontra', rekontra: 'Rekontra', szubkontra: 'Szubkontra', mordkontra: 'Mordkontra' }[level] ?? level;
}
function humanContra(target) {
    if (!game || game.phase !== 'declarations')
        return;
    try {
        if (target === 'game') {
            if (!canRaiseGameContraInGame(game, HUMAN))
                throw new Error('Most nem mondhatsz kontrát a játékra.');
            game = raiseGameContraInGame(game, HUMAN);
            round = round ? { ...round, eventLog: [...round.eventLog, `Te: ${contraLabel(game.gameContraState?.level ?? 'kontra')} a játékra.`] } : round;
        }
        else {
            if (!canRaiseDeclarationContraInGame(game, target, HUMAN))
                throw new Error('Most nem mondhatsz kontrát erre a bemondásra.');
            const d = game.declarations.declarations.find(x => x.id === target);
            game = raiseDeclarationContraInGame(game, target, HUMAN);
            const level = game.declarations.declarations.find(x => x.id === target)?.contra.level ?? 'kontra';
            round = round ? { ...round, eventLog: [...round.eventLog, `Te: ${contraLabel(level)} a ${d?.type ?? 'bemondás'}-ra.`] } : round;
        }
        message = 'Kontra rögzítve.';
        runAiContraResponses();
        // A kontra nem deklarációs turnusváltás, ezért ugyanabból a pontból
        // folytatjuk a bemondási állapotgépet: ha most AI jön, automatikusan
        // továbbmegy, ha pedig a human következik, a UI gombjai jelennek meg.
        runAiDeclarations();
        render();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Szabálytalan kontra.';
        render();
    }
}
function syncRoundPhaseFromGame() {
    if (!round || !game)
        return;
    if (game.phase === 'scoring') {
        const { currentPlayerId: _currentPlayerId, ...rest } = round;
        round = { ...rest, phase: 'scoring' };
    }
}
function playHuman(cardId) {
    if (!game || game.phase !== 'play')
        return;
    if (game.players[game.nextPlayerIndex]?.id !== HUMAN) {
        message = 'Most nem te jössz.';
        render();
        return;
    }
    try {
        game = playCard(game, HUMAN, cardId);
        syncRoundPhaseFromGame();
        render();
        runAiPlay();
    }
    catch (e) {
        message = e instanceof Error ? e.message : 'Érvénytelen kijátszás.';
        render();
    }
}
function runAiPlay() {
    clearAiTimer();
    if (paused) {
        render();
        return;
    }
    if (!game || game.phase !== 'play') {
        syncRoundPhaseFromGame();
        render();
        return;
    }
    if (game.players[game.nextPlayerIndex]?.id === HUMAN) {
        render();
        return;
    }
    const id = game.players[game.nextPlayerIndex]?.id;
    if (!id) {
        recordUiError('Az AI lejátszási állapotában nincs következő játékos.', 'Érvénytelen lejátszási állapot.');
        render();
        return;
    }
    try {
        const legal = legalCardsForPlay(game, id);
        if (!legal.length)
            throw new Error(`A(z) ${playerName(id)} AI-játékosnak nincs szabályosan kijátszható lapja.`);
        const beliefSnapshot = buildAIBeliefSnapshot(game, id);
        const partnerBeliefs = partnerBeliefsFromAIBeliefSnapshot(beliefSnapshot);
        const gameState = game;
        const chosen = chooseAICardAtDifficulty(gameState, id, partnerBeliefs, aiDifficulty, { singlePlayer: true });
        game = playCard(gameState, id, chosen.card.id);
        setAiReason(id, chosen.reasons);
        if (round) {
            const reasonText = chosen.reasons.length ? ` — ${chosen.reasons.slice(0, 2).join(' | ')}` : '';
            round = { ...round, eventLog: [...round.eventLog, `${playerName(id)} kijátszotta: ${cardName(chosen.card)}${reasonText}`] };
        }
    }
    catch (e) {
        recordUiError(e, 'Az AI nem tudott szabályosan lépni.');
        render();
        return;
    }
    syncRoundPhaseFromGame();
    render();
    if (!paused && game?.phase === 'play' && game.players[game.nextPlayerIndex]?.id !== HUMAN) {
        aiTimer = window.setTimeout(runAiPlay, aiDelayMs());
    }
}
function actionButtons() {
    if (!round)
        return '<button id="new">Új mérkőzés</button>';
    if (round.phase === 'auction' && round.auction.seats[round.auction.currentSeat]?.playerId === HUMAN && !round.auction.finished) {
        const actions = legalAuctionActions(round.auction, HUMAN, handsMap());
        return actions.map((a, i) => `<button class="action" data-bid="${i}">${labelAction(a)}</button>`).join('');
    }
    if (round.phase === 'skart') {
        const p = humanRound();
        if (p.skart.length < p.receivedTalon.length)
            return `<button class="primary" id="skart">Fektetés (${p.receivedTalon.length} lap)</button>`;
    }
    if (round.phase === 'skart-announcement') {
        const p = humanRound();
        if (p.playerId !== round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced)
            return `<button class="primary" id="announce">Bejelentem: ${p.skartTarokkCount} tarokkot fektettem</button>`;
    }
    if (round.phase === 'partner-call' && round.currentPlayerId === HUMAN) {
        const required = round.auctionOutcome?.calledTarokk;
        const humanHand = activeHand(HUMAN);
        const ranks = (required !== undefined ? [required] : (humanHand.some(c => c.kind === 'tarokk' && c.rank === 20) ? [19, 20] : [20])).filter(r => resolveCalledPartner(HUMAN, r, round.players.map(p => ({ id: p.playerId, hand: p.hand }))) !== undefined);
        return ranks.map(r => `<button class="action" data-call="${r}">${r === 20 && HUMAN === round.takerId ? 'XX-önhívás' : `${r}. tarokk hívása`}</button>`).join('') || '<span class="muted">Nincs egyértelműen hívható tarokk.</span>';
    }
    if (round.phase === 'declarations' && game && declarationWindow && currentDeclarer(declarationWindow) === HUMAN) {
        const hp = game.players.find(p => p.id === HUMAN);
        if (hp) {
            const ctx = { isTaker: HUMAN === game.takerId, invited: round.auctionOutcome?.calledTarokk !== undefined, ...(round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: round.auctionOutcome.calledTarokk } : {}), ...(round.contract ? { contract: round.contract } : {}), previousDeclarations: game.declarations.declarations.map(d => d.type), partnersKnown: true, ...(HUMAN === game.partnerId ? { isPartner: true } : {}), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk } : {}), ...(game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}), ...(HUMAN === game.takerId && round.calledTarokk === 19 && !game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}) };
            const acts = legalDeclarationActions(declarationWindow, HUMAN, hp.hand, ctx);
            const currentGame = game;
            const humanNeedsDefenceIdentification = HUMAN !== currentGame.takerId && HUMAN !== currentGame.partnerId && !defencePubliclyIdentified(currentGame);
            const humanNeedsRekontra = Boolean(singlePlayerTakerRekontraTarget(currentGame, HUMAN));
            const currentTrickNumber = currentGame.completedTricks.length + 1;
            const humanSide = HUMAN === currentGame.takerId || HUMAN === currentGame.partnerId ? 'taker' : 'defence';
            const pairAlreadyDeclaredThisTrick = currentGame.declarations.declarations.some(d => d.declaredAtTrick === currentTrickNumber && ((d.ownerId === currentGame.takerId || d.ownerId === currentGame.partnerId ? 'taker' : 'defence') === humanSide));
            const filteredActs = humanNeedsDefenceIdentification
                ? []
                : (humanNeedsRekontra
                    ? acts.filter(a => a.type === 'pass')
                    : (pairAlreadyDeclaredThisTrick ? acts.filter(a => a.type !== 'declare') : acts));
            const declButtons = filteredActs.flatMap((a) => {
                const i = acts.indexOf(a);
                if (a.type === 'declare' && (a.declaration === 'kingUltimo' || a.declaration === 'kingUhu')) {
                    const kings = hp.hand.filter(c => c.kind === 'suit' && c.rank === 'K');
                    return kings.length
                        ? kings.map(k => `<button class="action" data-decl="${i}" data-target="${k.id}">${a.declaration} · ${cardName(k)}</button>`)
                        : [];
                }
                return [`<button class="action" data-decl="${i}">${a.type === 'pass' ? 'Passz' : a.type === 'tarokkCount' ? `${a.count} tarokk` : a.declaration}</button>`];
            }).join('');
            const contraButtons = [];
            const forcedHumanRekontraTarget = singlePlayerTakerRekontraTarget(game, HUMAN);
            if (forcedHumanRekontraTarget === 'game') {
                contraButtons.push(`<button class="action contra" data-contra-game="1">Rekontra játék</button>`);
            } else if (forcedHumanRekontraTarget) {
                contraButtons.push(`<button class="action contra" data-contra="${forcedHumanRekontraTarget}">Rekontra bemondás</button>`);
            }
            if (canRaiseGameContraInGame(game, HUMAN) && !forcedHumanRekontraTarget) {
                const next = game.gameContraState?.level === 'none' || !game.gameContraState ? 'Kontra' : { kontra: 'Rekontra', rekontra: 'Szubkontra', szubkontra: 'Mordkontra' }[game.gameContraState.level];
                if (next)
                    contraButtons.push(`<button class="action contra" data-contra-game="1">${next} játék</button>`);
            }
            for (const d of game.declarations.declarations) {
                if (!canRaiseDeclarationContraInGame(game, d.id, HUMAN))
                    continue;
                const next = d.contra.level === 'none' ? 'Kontra' : { kontra: 'Rekontra', rekontra: 'Szubkontra', szubkontra: 'Mordkontra' }[d.contra.level];
                if (next)
                    contraButtons.push(`<button class="action contra" data-contra="${d.id}">${next} ${d.type}</button>`);
            }
            return `${declButtons}${contraButtons.length ? `<div class="contra-actions"><strong>Kontra:</strong>${contraButtons.join('')}</div>` : ''}`;
        }
    }
    if (round.phase === 'scoring' && game?.finalPoints) {
        if (match && isMatchComplete(match))
            return '<button class="primary" id="restart">Új mérkőzés</button>';
        return '<button class="primary" id="nextDeal">Következő leosztás</button>';
    }
    if (round.phase === 'declarations' && game) {
        const contraButtons = [];
        if (canRaiseGameContraInGame(game, HUMAN)) {
            const next = game.gameContraState?.level === 'none' || !game.gameContraState ? 'Kontra' : { kontra: 'Rekontra', rekontra: 'Szubkontra', szubkontra: 'Mordkontra' }[game.gameContraState.level];
            if (next)
                contraButtons.push(`<button class="action contra" data-contra-game="1">${next} játék</button>`);
        }
        for (const d of game.declarations.declarations) {
            if (!canRaiseDeclarationContraInGame(game, d.id, HUMAN))
                continue;
            const next = d.contra.level === 'none' ? 'Kontra' : { kontra: 'Rekontra', rekontra: 'Szubkontra', szubkontra: 'Mordkontra' }[d.contra.level];
            if (next)
                contraButtons.push(`<button class="action contra" data-contra="${d.id}">${next} ${d.type}</button>`);
        }
        if (contraButtons.length)
            return `<div class="contra-actions" aria-label="Kontra lehetőségek"><strong>Kontra lehetőség:</strong>${contraButtons.join('')}</div>`;
    }
    return '';
}
function render() {
    if (!round) {
        app.innerHTML = `<div class="empty"><h3>Illusztrált Magyar Tarokk</h3><p>Single-player release candidate · valódi szabálymotorral és stratégiai AI-val.</p><div class="settings" role="group" aria-label="Játékbeállítások"><label>Játékosok: <select id="playerCount" aria-label="Játékosok száma"><option value="4">4</option><option value="5">5</option></select></label> <label>Fordulók: <input id="rounds" type="number" min="1" max="50" value="${savedRounds}" aria-label="Fordulók száma"></label> <label>AI nehézség: <select id="aiDifficulty" aria-label="AI nehézsége"><option value="casual">Gyakorló</option><option value="standard">Normál</option><option value="expert">Expert</option></select></label> <label><input id="showAiReasons" type="checkbox"> AI-indoklások</label></div><div class="settings-actions"><button id="new" class="primary">Új mérkőzés</button></div></div>`;
        const difficultySelect = document.querySelector('#aiDifficulty');
        if (difficultySelect)
            difficultySelect.value = aiDifficulty;
        const playerCountSelect = document.querySelector('#playerCount');
        if (playerCountSelect)
            playerCountSelect.value = String(playerIds.length);
        const reasonsToggle = document.querySelector('#showAiReasons');
        if (reasonsToggle)
            reasonsToggle.checked = showAiReasons;
        document.querySelector('#new')?.addEventListener('click', newMatch);
        difficultySelect?.addEventListener('change', () => { aiDifficulty = difficultySelect.value; saveUISettings(); });
        playerCountSelect?.addEventListener('change', () => { playerIds = PLAYER_POOL.slice(0, Number(playerCountSelect.value)); saveUISettings(); });
        document.querySelector('#rounds')?.addEventListener('change', (event) => { const value = Number(event.target.value); if (Number.isInteger(value)) {
            savedRounds = Math.max(1, Math.min(50, value));
            saveUISettings();
        } });
        reasonsToggle?.addEventListener('change', () => { showAiReasons = reasonsToggle.checked; saveUISettings(); render(); });
        return;
    }
    const human = game?.players.find(p => p.id === HUMAN) ?? humanRound();
    const humanIsDealer = match?.playerCount === 5 && match.playerIds[match.dealerIndex] === HUMAN;
    const hand = [...(human?.hand ?? [])].sort((a, b) => {
        if (a.kind !== b.kind)
            return a.kind === 'tarokk' ? -1 : 1;
        if (a.kind === 'tarokk' && b.kind === 'tarokk')
            return Number(b.rank) - Number(a.rank);
        if (a.kind === 'suit' && b.kind === 'suit') {
            const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
            const rankOrder = { K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 0 };
            return suitOrder[a.suit] - suitOrder[b.suit] || rankOrder[b.rank] - rankOrder[a.rank];
        }
        return 0;
    });
    const legal = game && game.phase === 'play' ? new Set(legalCardsForPlay(game, HUMAN).map(c => c.id)) : new Set();
    const current = game ? game.players[game.nextPlayerIndex]?.id : round.currentPlayerId;
    const phase = game?.phase ?? round.phase;
    const skartMode = round?.phase === 'skart' && (round.parallelSkart === true || round.currentPlayerId === HUMAN);
    const skartLegal = skartMode ? new Set(legalSkartCards(hand, round.invitedTarokk).map(c => c.id)) : new Set();
    const renderCard = (c) => {
        const canSkart = skartMode && skartLegal.has(c.id);
        const selected = skartMode && selectedSkart.has(c.id);
        const canPlay = phase === 'play' && legal.has(c.id);
        const enabled = canSkart || canPlay;
        const label = canPlay ? `${cardName(c)} – szabályosan kijátszható` : canSkart ? `${cardName(c)} – fektetéshez választható` : `${cardName(c)} – jelenleg nem választható`;
        const suitClass = c.kind === 'suit' ? `suit-${c.suit}` : '';
        return `<button type="button" class="card ${c.kind === 'tarokk' ? 'tarokk' : suitClass} ${canPlay ? 'legal' : ''} ${canSkart ? 'skartable' : ''} ${selected ? 'selected' : ''} ${enabled ? 'active' : 'disabled'}" data-card="${c.id}" aria-label="${label}" title="${label}" ${enabled ? '' : 'aria-disabled=\"true\" disabled'}><strong>${cardName(c)}</strong><small>${c.points} pont</small></button>`;
    };
    const suitGroups = [
        { key: 'tarokk', label: 'Tarokkok', cards: hand.filter(c => c.kind === 'tarokk') },
        ...['hearts', 'diamonds', 'clubs', 'spades'].map(suit => ({ key: suit, label: { hearts: '♥ Kőr', diamonds: '♦ Káró', clubs: '♣ Treff', spades: '♠ Pikk' }[suit], cards: hand.filter(c => c.kind === 'suit' && c.suit === suit) })),
    ];
    const cards = suitGroups.filter(g => g.cards.length).map(g => `<section class="hand-group hand-group-${g.key}"><h3>${g.label}</h3><div class="hand-grid">${g.cards.map(renderCard).join('')}</div></section>`).join('');
    const skartInfo = round.phase === 'skart' ? `<p>Fektetendő lapok: ${round.players.find(p => p.playerId === HUMAN).receivedTalon.length}. Kijelölve: ${selectedSkart.size}</p>` : round.phase === 'skart-announcement' ? `<p>A fektetett tarokkok közlése a fektető védők feladata.</p>` : '';
    const opponents = round.players.filter(p => p.playerId !== HUMAN).map(p => `<div class="opponent"><strong>${playerName(p.playerId)}</strong><span>${p.hand.length} lap</span><span>${round.takerId === p.playerId ? 'felvevő' : game?.partnerId === p.playerId ? 'felvevő párja' : 'ellenfél'}</span></div>`).join('');
    const trick = game?.trick?.cards ?? [];
    const trickNo = game ? game.completedTricks.length + 1 : 0;
    const trickHtml = trick.length ? trick.map(x => `<div class="played"><strong>${playerName(x.player)}</strong><span>${cardName(x.card)}</span></div>`).join('') : '<span class="muted">Nincs aktív ütés.</span>';
    // The table intentionally exposes only the most recent completed trick;
    // older trick history is not shown to the players.
    const lastCompletedTrick = game?.completedTricks.at(-1);
    const lastTrickHtml = lastCompletedTrick
        ? `<div class="last-trick"><div class="last-trick-cards">${lastCompletedTrick.cards.map(x => `<div class="played"><strong>${playerName(x.player)}</strong><span>${cardName(x.card)}</span></div>`).join('')}</div><div class="last-trick-winner"><strong>${playerName(lastCompletedTrick.winner)}</strong> vitte az ütést.</div></div>`
        : '<span class="muted">Még nincs lezárt ütés.</span>';
    const declarationHistory = game?.declarations.declarations.slice(-8) ?? [];
    const declarationHtml = declarationHistory.length ? declarationHistory.map(d => `<li>${playerName(d.ownerId)}: ${declarationLabel(d.type)}${d.status === 'fulfilled' ? ' ✓' : d.status === 'failed' ? ' ✗' : ''}</li>`).join('') : '<li class="muted">Még nincs bemondás.</li>';
    const auctionLog = round.eventLog.slice(-30).map((x, i) => `<li><span class="event-index">${i + 1}.</span> ${x}</li>`).join('');
    const settlementLines = game?.settlement?.lines?.length ? game.settlement.lines.map(line => `${declarationLabel(line.type ?? 'game')}${line.silent ? ' (csendes)' : ''}: ${line.positiveForTakerPair ? '+' : '-'}${line.points}`).join(' · ') : '';
    const silentFigureLines = game?.declarations?.silentFigures?.length ? game.declarations.silentFigures.map(f => `${declarationLabel(f.type)}${f.status === 'fulfilled' ? ' ✓' : ' ✗'}`).join(' · ') : '';
    const skartBreakdown = game?.finalPoints ? ` · skart: felvevőpár +${game.finalPoints.takerSkartPoints ?? 0}, ellenpár +${game.finalPoints.defenceSkartPoints ?? 0}` : '';
    const result = game?.finalPoints ? `<div class="result"><strong>${game.finalPoints.result === 'taker' ? 'A felvevő pár nyert.' : 'Az ellenpár nyert.'}</strong> · ütés ${game.finalPoints.takerPair}–${game.finalPoints.defencePair}${skartBreakdown}${game.settlement ? ` · nettó ${game.settlement.netForTakerPair > 0 ? '+' : ''}${game.settlement.netForTakerPair}` : ''}${settlementLines ? `<br><small>${settlementLines}</small>` : ''}${silentFigureLines ? `<br><small>Csendes figurák: ${silentFigureLines}</small>` : ''}</div>` : '';
    const matchInfo = match ? `<div class="match-info">Forduló ${match.roundNumber}/${match.targetRounds} · Leosztás ${Math.min(match.dealNumberInRound, match.playerCount)}/${match.playerCount} · Osztó: ${playerName(match.playerIds[match.dealerIndex])}</div>` : '';
    const dealSummary = game ? `<div class="deal-summary"><strong>${currentDealSummary()}</strong>${game.phase === 'play' ? ` · ${trickNo}. ütés, ${trick.length}/4 lap` : ''}</div>` : '';
    const scoreTable = match ? `<div class="match-score"><strong>Mérkőzés ütés-pontjai</strong> ${playerIds.map(id => `${playerName(id)}: ${matchTrickPoints[id] ?? 0}`).join(' · ')}</div>` : '';
    // The taker's discarded tarokks are public from the completed skart stage
    // until the first trick is completed. Only tarokks are exposed, not the
    // other discarded cards.
    const takerSkart = round.takerId ? (round.players.find(p => p.playerId === round.takerId)?.skart ?? []) : [];
    const showTakerSkartTarokks = Boolean(game)
        && game.completedTricks.length === 0
        && round.phase !== 'skart'
        && takerSkart.some(isTarokk);
    const takerSkartTarokkCards = takerSkart.filter(isTarokk);
    const takerSkartHtml = showTakerSkartTarokks
        ? `<section class="revealed-scart"><h3>Felvevő által skartba fektetett tarokk</h3><div class="revealed-scart-cards">${takerSkartTarokkCards.map(c => `<div class="played"><span>${cardName(c)}</span></div>`).join('')}</div><small class="muted">Ez az információ az első ütés lezárásáig látható.</small></section>`
        : '';
    const aiControls = game?.phase === 'play' ? `<button id="pauseAi" class="action">${paused ? 'AI folytatása' : 'AI szünet'}</button>` : '';
    const aiReasonHtml = showAiReasons && lastAiReason ? `<details class="ai-reason" open><summary>Legutóbbi AI-indoklás</summary><p><strong>${playerName(lastAiReason.playerId)}:</strong> ${lastAiReason.text}</p></details>` : '';
    const errorHtml = uiError ? `<div class="error"><strong>Az alkalmazás megállt biztonságosan.</strong> <span>${uiError}</span> <button id="clearError">Hiba bezárása</button></div>` : '';
    const handProgress = humanIsDealer ? 0 : Math.max(0, Math.min(100, ((9 - hand.length) / 9) * 100));
    const turnBadge = current ? `<span class="turn-badge">${current === HUMAN ? 'TE JÖSSZ' : playerName(current) + ' gondolkodik'}</span>` : '';
    const progressHtml = phase === 'play' ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="9" aria-valuenow="${Math.min(9, trickNo - 1)}" aria-label="Lejátszás előrehaladása"><span style="width:${handProgress}%"></span></div><div class="compact muted">${Math.min(9, trickNo - 1)}/9 ütés lezárva · ${hand.length} lap nálad · ${legal.size} legális kijátszás</div>` : '';
    const focusNote = phase === 'play' && current === HUMAN ? `<div class="focus-note" role="status"><strong>Te jössz.</strong> A világos kártyák kijátszhatók. <span class="muted">${legal.size} legális lehetőség.</span></div>` : '';
    app.innerHTML = `<div class="toolbar"><button id="new">Új mérkőzés</button><button id="newDeal" class="action">Új osztás</button>${aiControls}<span class="phase">${phaseLabel(phase)}</span>${result}</div>${errorHtml}${matchInfo}${dealSummary}${scoreTable}<div class="status"><strong>${current ? `${playerName(current)} jön` : 'Leosztás vége'}</strong>${turnBadge}<span>${message}</span></div>${progressHtml}<div class="compact muted" aria-live="polite">${lastUiAction}</div><section class="panel event-log-panel"><h2>Eseménynapló</h2><ol class="event-log">${auctionLog}</ol></section>${focusNote}<div class="opponents">${opponents}</div><section class="panel"><h3>Aktív szakasz</h3><div class="actions">${actionButtons()}</div>${skartInfo}</section>${aiReasonHtml}${takerSkartHtml}<section class="trick"><h3>Aktuális ütés${game && game.phase === 'play' ? ` · ${trickNo}.` : ''}</h3><div class="trick-grid">${trickHtml}</div></section><section class="hand"><h3>Az én lapjaim <small>(${humanIsDealer ? 'osztó / kimarad' : hand.length})</small></h3><div class="cards">${cards}</div></section><section class="history-grid"><details open><summary>Utolsó lezárt ütés</summary>${lastTrickHtml}</details><details><summary>Bemondások</summary><ul>${declarationHtml}</ul></details></section>`;
    document.querySelector('#new')?.addEventListener('click', () => { clearAiTimer(); round = null; game = null; match = null; paused = false; uiError = ''; lastAiReason = undefined; render(); });
    document.querySelector('#newDeal')?.addEventListener('click', restartCurrentDeal);
    document.querySelector('#pauseAi')?.addEventListener('click', () => paused ? resumeAI() : pauseAI());
    document.querySelector('#clearError')?.addEventListener('click', () => { uiError = ''; paused = false; render(); });
    document.querySelector('#nextDeal')?.addEventListener('click', finishCurrentDeal);
    document.querySelector('#skart')?.addEventListener('click', humanSkart);
    document.querySelector('#announce')?.addEventListener('click', humanSkartAnnounce);
    document.querySelector('#restart')?.addEventListener('click', () => { clearAiTimer(); round = null; game = null; match = null; paused = false; uiError = ''; lastAiReason = undefined; render(); });
    document.querySelectorAll('[data-bid]').forEach(b => b.addEventListener('click', () => { const acts = legalAuctionActions(round.auction, HUMAN, handsMap()); applyBid(acts[Number(b.dataset.bid)]); }));
    document.querySelectorAll('[data-call]').forEach(b => b.addEventListener('click', () => callPartner(Number(b.dataset.call))));
    document.querySelectorAll('[data-contra-game]').forEach(b => b.addEventListener('click', () => humanContra('game')));
    document.querySelectorAll('[data-contra]').forEach(b => b.addEventListener('click', () => humanContra(b.dataset.contra)));
    document.querySelectorAll('[data-decl]').forEach(b => b.addEventListener('click', () => {
        if (!game || !round || !declarationWindow)
            return;
        const hp = game.players.find(p => p.id === HUMAN);
        if (!hp)
            return;
        const ctx = { isTaker: HUMAN === game.takerId, invited: round.auctionOutcome?.calledTarokk !== undefined, ...(round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: round.auctionOutcome.calledTarokk } : {}), ...(round.contract ? { contract: round.contract } : {}), previousDeclarations: game.declarations.declarations.map(d => d.type), partnersKnown: true, ...(declarationWindow && declarationWindow.announcedTarokkCounts[HUMAN] !== undefined ? { announcedTarokkCount: declarationWindow.announcedTarokkCounts[HUMAN] } : {}), ...(HUMAN === game.partnerId ? { isPartner: true } : {}), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk } : {}), ...(game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}), ...(HUMAN === game.takerId && round.calledTarokk === 19 && !game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}) };
        const acts = legalDeclarationActions(declarationWindow, HUMAN, hp.hand, ctx);
        const a = acts[Number(b.dataset.decl)];
        if (!a)
            return;
        try {
            if (HUMAN !== game.takerId && HUMAN !== game.partnerId && !defencePubliclyIdentified(game))
                throw new Error('Az ellenpár első megszólalásakor előbb kontrával kell azonosítanod az ellenpárt.');
            if (singlePlayerTakerRekontraTarget(game, HUMAN) && a.type !== 'pass')
                throw new Error('Az ellenpár kontrája után a felvevőpárnak előbb rekontrával kell azonosítania magát.');
            // Keep the declaration window transactional with the game state: the
            // authoritative engine must accept a figure before the window advances.
            if (a.type === 'declare') {
                const targetCardId = b.dataset.target;
                game = declareFigureInGame(game, a.declaration, HUMAN, game.completedTricks.length + 1, targetCardId);
            }
            const beforeDeclarationWindow = declarationWindow;
            declarationWindow = applyDeclarationAction(declarationWindow, a, hp.hand);
            logDeclarationRoundTransition(beforeDeclarationWindow, declarationWindow);
            const humanActionText = a.type === 'pass' ? 'Passz' : a.type === 'tarokkCount' ? `${a.count} tarokk` : declarationLabel(a.declaration);
            round = { ...round, eventLog: [...round.eventLog, `Te: ${humanActionText}`] };
            message = `Te: ${humanActionText}.`;
            if (declarationWindow.finished) {
                const g = game;
                const startingPlayerId = round.startingPlayerId;
                const li = g.players.findIndex(p => p.id === startingPlayerId);
                game = startPlay({ ...g, startingPlayerId }, li);
                round = { ...round, phase: 'play', currentPlayerId: game.players[li].id };
                message = 'A lejátszás kezdődik.';
                runAiPlay();
            }
            else {
                const next = currentDeclarer(declarationWindow);
                round = next ? { ...round, currentPlayerId: next } : round;
                message = 'A bemondási kör folytatódik.';
                runAiDeclarations();
            }
            render();
        }
        catch (e) {
            message = e instanceof Error ? e.message : 'Szabálytalan bemondás.';
            render();
        }
    }));
    document.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.card; if (round.phase === 'skart' && (round.parallelSkart === true || round.currentPlayerId === HUMAN)) {
        const human = humanRound();
        const skartCount = human?.receivedTalon.length ?? 0;
        if (selectedSkart.has(id))
            selectedSkart.delete(id);
        else if (selectedSkart.size < skartCount)
            selectedSkart.add(id);
        render();
    }
    else
        playHuman(id); }));
}
window.addEventListener('error', (event) => { recordUiError(event.error ?? event.message, 'Váratlan böngészőhiba.'); render(); });
window.addEventListener('unhandledrejection', (event) => { recordUiError(event.reason, 'Váratlan aszinkron hiba.'); render(); });
window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement)
        return;
    if (event.key.toLowerCase() === 'p' && game?.phase === 'play') {
        event.preventDefault();
        paused ? resumeAI() : pauseAI();
    }
    if (event.key.toLowerCase() === 'n' && match) {
        event.preventDefault();
        restartCurrentDeal();
    }
});
loadUISettings();
render();
