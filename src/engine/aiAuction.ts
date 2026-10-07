import { Card, isHonour, isTarokk } from './cards.js';
import { evaluateDealPlan } from './aiDealPlan.js';
import { evaluateAuctionPath } from './aiDealPortfolio.js';
import { evaluateAuctionDealLine } from './aiDealLineSearch.js';
import { AuctionAction, AuctionState, legalAuctionActions, Contract } from './auction.js';
import { PlayerId } from './game.js';

export interface AIAuctionDecision {
  action: AuctionAction;
  score: number;
  reasons: string[];
}

const contractWeight: Record<Contract, number> = { three: 3, two: 4, one: 5, solo: 7 };

type Honour = 'pagat' | 'xxi' | 'skiz';

interface HandProfile {
  tarokks: number;
  pagat: boolean;
  xxi: boolean;
  skiz: boolean;
  xx: boolean;
  xix: boolean;
  xviii: boolean;
  xvii: boolean;
  honours: number;
  bigHonours: number;
  highProtection: number;
  mediumTarokkControl: number;
}

export type AuctionPosture = 'profit-maximising' | 'loss-minimising' | 'balanced';

export interface CaptureConfiguration {
  pagat?: PlayerId;
  xxi?: PlayerId;
  skiz?: PlayerId;
  probability: number;
  reasons: string[];
}

/**
 * Pairwise hidden-honour hypotheses from the public auction.
 *
 * This is intentionally different from AuctionBelief: AuctionBelief asks
 * "how plausible is XXI/Skíz at this seat?", while this function asks
 * "which complete Pagát–XXI–Skíz arrangement best explains the auction?".
 * No single bid identifies a card. In particular, 3→2 keeps arrangements
 * such as A=Pagát, B=XXI, C=Skíz alive.
 */
export function inferCaptureConfigurations(auction: AuctionState): CaptureConfiguration[] {
  const players = auction.seats.map(s => s.playerId);
  const bids = auction.records.filter(r => r.action.type === 'bid') as Array<{
    playerId: PlayerId; action: Extract<AuctionAction, { type: 'bid' }>
  }>;
  if (players.length < 3) return [];

  const raw: CaptureConfiguration[] = [];
  for (const pagat of players) for (const xxi of players) for (const skiz of players) {
    if (new Set([pagat, xxi, skiz]).size !== 3) continue;
    let score = 1;
    const reasons: string[] = [];
    const playerBids = (id: PlayerId) => bids.filter(b => b.playerId === id).map(b => b.action.contract);
    const pb = playerBids(pagat);
    const xb = playerBids(xxi);
    const sb = playerBids(skiz);

    // These are weak priors only. The three honours can all bid, and absence
    // of a bid is never treated as proof of absence of the card.
    if (pb.includes('three')) score *= 1.10;
    if (xb.includes('three')) score *= 1.18;
    if (sb.includes('three')) score *= 1.18;
    if (pb.includes('two')) score *= 1.05;
    if (xb.includes('two')) score *= 1.12;
    if (sb.includes('two')) score *= 1.12;
    if (pb.includes('one')) score *= 1.02;
    if (xb.includes('one')) score *= 1.04;
    if (sb.includes('one')) score *= 1.04;

    // Explicitly preserve the user's counterexample: A=Pagát, B=XXI, C=Skíz
    // is a live explanation of A:3 → B:2 → C:1. It is not an exceptional
    // edge case that the belief engine is allowed to discard.
    if (bids[0]?.action.contract === 'three' && bids[1]?.action.contract === 'two' && bids[2]?.action.contract === 'one') {
      const a = bids[0].playerId, b = bids[1].playerId, c = bids[2].playerId;
      if (pagat === a && xxi === b && skiz === c) {
        score *= 1.25;
        reasons.push('3–2–1-ben az A=Pagát, B=XXI, C=Skíz fogási konfiguráció továbbra is koherens.');
      }
    }

    // An explicit invite is much stronger public information than an ordinary
    // bid. In particular, the 3-2-1 -> Solo move by the original Three bidder
    // is a XIX invite: the inviter has XIX, must have a big honour, and has at
    // least five tarokks. Therefore an invite target of XIX rules out Pagat for
    // the inviter, but does NOT tell us whether the big honour is XXI or Skiz.
    // The eventual partner is also not known until the invite is accepted.
    const explicitInvites = auction.records.filter(r => r.action.type === 'invite') as Array<{
      playerId: PlayerId; action: Extract<AuctionAction, { type: 'invite' }>
    }>;
    for (const inv of explicitInvites) {
      if (inv.action.target === 19) {
        if (pagat === inv.playerId) {
          score *= 0.05;
          reasons.push('XIX-invit: az invitáló nem lehet Pagát, mert az invit nagyhonőrt feltételez.');
        }
        if (xxi === inv.playerId || skiz === inv.playerId) {
          score *= 1.55;
          reasons.push('XIX-invit: az invitálónál biztosan XIX van és nagyhonőr is kell, de XXI és Skíz között nem dönt.');
        }
      }
    }

    // If the suspected XXI is currently highest bidder and the Skíz sits
    // behind that bidder, the configuration has practical capture relevance.
    const highest = auction.highest?.playerId;
    if (highest === xxi) {
      score *= 1.12;
      reasons.push('A konfiguráció szerint a jelenlegi felvevőjelölt XXI; a Skíz helyzete ezért fogási szempontból releváns.');
    }
    raw.push({ pagat, xxi, skiz, probability: score, reasons });
  }

  const total = raw.reduce((sum, c) => sum + c.probability, 0) || 1;
  return raw.map(c => ({ ...c, probability: c.probability / total }))
    .sort((a, b) => b.probability - a.probability);
}

export interface InvitePartnerCandidate {
  inviterId: PlayerId;
  target: 20 | 19 | 18;
  playerId: PlayerId;
  probability: number;
  canAcceptFromPublicAuction: boolean;
  reasons: string[];
}

/**
 * Models who can become the partner of an explicit invit. This is intentionally
 * separate from honour ownership: an invit identifies the requested tarokk in
 * the inviter's hand, but the partner is only identified when somebody accepts.
 * Public PASS records therefore remove candidates, while silence keeps them
 * alive. If the current player is known to hold the target, the candidate is
 * treated as the mandatory/very-strong acceptance path rather than a vague hint.
 */
export function inferInvitePartnerCandidates(auction: AuctionState): InvitePartnerCandidate[] {
  const invites = auction.records.filter(r => r.action.type === 'invite') as Array<{
    playerId: PlayerId; action: Extract<AuctionAction, { type: 'invite' }>
  }>;
  const invite = invites.at(-1);
  if (!invite) return [];

  const candidates = auction.seats
    .filter(s => s.playerId !== invite.playerId && !auction.out.includes(s.playerId))
    .map(s => {
      const passed = auction.records.some(r => r.playerId === s.playerId && r.action.type === 'pass');
      const reasons: string[] = [];
      let probability = passed ? 0 : 1;
      if (passed) reasons.push('A játékos az invit után már passzolt, ezért nem lehet a fogadó-felvevő.');
      else reasons.push('A játékos még nem zárta ki magát passzal az invit utáni licitből.');
      if (auction.currentSeat === s.seat && !passed) {
        probability *= 1.5;
        reasons.push('Ő következik: ha nála van az invitált tarokk, ő lehet a tényleges fogadó-felvevő.');
      }
      return {
        inviterId: invite.playerId,
        target: invite.action.target,
        playerId: s.playerId,
        probability,
        canAcceptFromPublicAuction: !passed,
        reasons,
      };
    });

  const total = candidates.reduce((sum, c) => sum + c.probability, 0);
  if (!total) return candidates.map(c => ({ ...c, probability: 0 }));
  return candidates
    .map(c => ({ ...c, probability: c.probability / total }))
    .sort((a, b) => b.probability - a.probability);
}

export interface AuctionBelief {
  playerId: PlayerId;
  seat: number;
  bigHonourLikelihood: number;
  likelyXXI: number;
  likelySkiz: number;
  likelyPagat: number;
  likelyXX: number;
  reasons: string[];
}

/**
 * Public-auction belief model. This deliberately models probabilities rather
 * than hidden cards: the AI must never treat a bid as proof of an honour.
 * Seat order matters because a bidder immediately behind a suspected XXI can
 * be a Skíz threat, while a Skíz with only later bidders can preserve the
 * capture option without becoming taker.
 */
export function inferAuctionBeliefs(auction: AuctionState): AuctionBelief[] {
  const bids = auction.records.filter(r => r.action.type === 'bid') as Array<{ playerId: PlayerId; action: Extract<AuctionAction, { type: 'bid' }> }>;
  const seats = auction.seats;
  const bidPlayers = new Set(bids.map(b => b.playerId));
  return seats.map(seatInfo => {
    const id = seatInfo.playerId;
    const ownBids = bids.filter(b => b.playerId === id);
    const reasons: string[] = [];
    let big = 0, xxi = 0, skiz = 0, pagat = 0, xx = 0;
    for (const b of ownBids) {
      if (b.action.contract === 'three') { big += 0.35; reasons.push('Hármas: nagyhonőr valószínűsége nő.'); }
      if (b.action.contract === 'two') { big += 0.22; }
      if (b.action.contract === 'one') { pagat += 0.10; }
      if (b.action.contract === 'solo') { big += 0.18; reasons.push('Szóló: önálló játékra alkalmasabb kéz valószínű.'); }
    }
    const lastBid = ownBids.at(-1)?.action.contract;
    if (lastBid === 'three') {
      xxi += 0.12; skiz += 0.12; pagat += 0.05;
    }

    // A 3→2→1 sequence is particularly information-rich. It does not tell us
    // which player owns XXI or Skíz, but it raises the probability that the
    // active bidders contain the two big honours. Keep this as a soft pairwise
    // inference rather than assigning either honour deterministically.
    const sequence = bids.map(b => b.action.contract);
    if (sequence.length >= 2 && sequence[0] === 'three' && sequence[1] === 'two' && ownBids.length > 0) {
      big += 0.08;
      reasons.push('Hármas→Kettes: két nagyhonőrös licitkonfliktus valószínűsége nő.');
      if (lastBid === 'two') {
        xxi += 0.03;
        skiz += 0.03;
      }
    }
    if (sequence.length >= 3 && sequence[0] === 'three' && sequence[1] === 'two' && sequence[2] === 'one' && ownBids.length > 0) {
      big += 0.05;
      reasons.push('3–2–1: a licit több nagyhonőrös szereplőt valószínűsít, de a konkrét honőrhely továbbra is bizonytalan.');
    }

    // The transition pattern itself carries information. A player who enters
    // directly after a Hármas is a candidate in the XXI/Skíz confrontation;
    // a later Egyes does not identify the card, but confirms that several
    // honour-driven players may be present. Keep these as paired hypotheses.
    const firstThreePlayer = bids.find(b => b.action.contract === 'three')?.playerId;
    const secondBid = bids[1];
    const thirdBid = bids[2];
    if (firstThreePlayer === id && secondBid?.action.contract === 'two') {
      xxi += 0.05;
      skiz += 0.05;
      reasons.push('Hármas → közvetlen Kettes: ez a játékos lehet a nagyhonőr-konfliktus egyik oldala (XXI vagy Skíz).');
    }
    if (secondBid?.playerId === id && secondBid.action.contract === 'two' && thirdBid?.action.contract === 'one') {
      xxi += 0.04;
      skiz += 0.04;
      reasons.push('Kettes után Egyes is belépett: a középső licitáló fogási/ellenjáték-helyzete információsan értékesebb.');
    }

    // IMPORTANT: the published example is a concrete hand, not a universal
    // decoding rule. In Illustrated Tarokk A=Three can be Pagát, B=Two can be
    // XXI, and C can still be the Skíz. Therefore 3→2 must increase the
    // *conflict* hypothesis, not identify B as Skíz. The seat of the later
    // bidder remains live until subsequent public bidding/declarations narrow
    // the possibilities.
    if (bids[0]?.action.contract === 'three' && bids[1]?.playerId === id && bids[1]?.action.contract === 'two') {
      skiz += 0.02;
      xxi += 0.08;
      pagat += 0.03;
      reasons.push('3→2 közvetlen minta: nagyhonőr-konfliktus valószínűbb, de a Ketteses lehet XXI vagy Skíz; a későbbi ülők is maradnak fogási jelöltként.');
    }

    // A later bidder is especially important in the user-corrected scenario:
    // A may be Pagát, B may be XXI, while C is Skíz. Do not let the earlier
    // 3→2 pattern collapse C/D's Skíz probability merely because B said Two.
    const firstTwoPlayer = bids.find(b => b.action.contract === 'two')?.playerId;
    if (firstTwoPlayer && firstTwoPlayer !== id && ownBids.some(b => b.action.contract === 'one' || b.action.contract === 'two')) {
      const firstThree = bids.find(b => b.action.contract === 'three');
      if (firstThree && firstTwoPlayer !== firstThree.playerId) {
        skiz += 0.12;
        xxi += 0.03;
        reasons.push('3→2 után későbbi licitáló: a Skíz/XXI szerepek továbbra is több ülés között oszlanak meg; a fogási jelöltlista nem szűkíthető B-re.');
      }
    }

    // If the same player remains active at One after the third player enters,
    // this strengthens the hypothesis that the middle bidder is participating
    // in a big-honour / capture conflict, but it still does not prove Skíz:
    // XXI remains possible and the later bidder may be the actual Skíz.
    if (bids[1]?.playerId === id && bids[1]?.action.contract === 'two' &&
        bids[2]?.action.contract === 'one' &&
        ownBids.some(b => b.action.contract === 'one')) {
      skiz += 0.06;
      xxi += 0.05;
      reasons.push('3→2→1-ben a Ketteses tovább srófol Egyesig: a fogási konfliktus erősödik, de ebből önmagában nem következik, hogy B Skíz.');
    }

    // A hold after the opening three is stronger evidence of willingness to
    // retain the game than a simple bid record, especially when another player
    // has already entered at two/one. This is still only public evidence.
    const hasHold = auction.records.some(r => r.playerId === id && r.action.type === 'hold');
    if (hasHold && ownBids.some(b => b.action.contract === 'three')) {
      big += 0.10;
      reasons.push('Hármas utáni tartás: erősebb nagyhonőrös / felvevői szándék valószínű.');

      // If the public sequence already contains 3–2–1, the original Hármas
      // holder's hold is especially informative: it says the player is not
      // merely opening conventionally but is willing to retain the game after
      // two challengers have appeared. This increases both big-honour and
      // XXI/Skíz conflict hypotheses without selecting one hidden card.
      if (sequence.length >= 3 && sequence[0] === 'three' && sequence[1] === 'two' && sequence[2] === 'one') {
        big += 0.08;
        xxi += 0.04;
        skiz += 0.04;
        reasons.push('3–2–1 utáni Hármas-tartás: erős felvevői szándék és XXI/Skíz-konfliktus valószínűbb.');
      }
    }

    // If the player entered immediately after a three with a two, the seat is
    // especially relevant to a possible XXI-under-Skíz confrontation.
    const ownSeat = seatInfo.seat;
    const nextSeat = seats.find(s => s.seat === (ownSeat + 1) % seats.length)?.playerId;
    const nextLast = bids.filter(b => b.playerId === nextSeat).at(-1)?.action.contract;
    if (lastBid === 'three' && (nextLast === 'two' || nextLast === 'one' || nextLast === 'solo')) {
      xxi += 0.18; skiz += 0.18;
      reasons.push('Közvetlenül utána licitáló játékos: nagyhonőr-konfrontáció valószínűbb.');
    }
    // Three-player public auction: the player who ultimately keeps the game
    // is more likely to carry a large honour than a lone one-level bidder.
    if (new Set(bids.map(b => b.playerId)).size >= 3 && ownBids.length > 0) big += 0.10;
    return {
      playerId: id, seat: ownSeat,
      bigHonourLikelihood: clampBelief(big),
      likelyXXI: clampBelief(xxi), likelySkiz: clampBelief(skiz),
      likelyPagat: clampBelief(pagat), likelyXX: clampBelief(xx),
      reasons,
    };
  });
}

function clampBelief(v: number): number { return Math.max(0, Math.min(1, v)); }

/**
 * Literature-informed auction policy.
 *
 * Important design principle: auction strength is not a scalar. Seat and the
 * distributional information created by bidding can be more valuable than
 * taking an extra card from the talon. The policy therefore has explicit
 * positional rules before applying generic hand-strength scoring.
 *
 * Sources used when building these heuristics include the ITVB rules and the
 * TAROKK-ŐR / Tarokk Akadémia material. They are conventions/strategy, not
 * legality rules; legality remains delegated to auction.ts.
 */
export interface AIAuctionOptions {
  /** UI-specific calibration; omitted/default keeps the shared engine unchanged. */
  singlePlayer?: boolean;
}

export function chooseAIAuctionAction(
  auction: AuctionState,
  playerId: PlayerId,
  hand: Card[],
  hands?: Record<PlayerId, Card[]>,
  options: AIAuctionOptions = {},
): AIAuctionDecision {
  const legal = legalAuctionActions(auction, playerId, hands);
  if (!legal.length) throw new Error('Az AI játékosnak nincs szabályos licitlépése.');

  const profile = profileHand(hand);
  const position = auctionPosition(auction, playerId);
  const scored = legal.map(action => scoreAuctionAction(action, auction, profile, position, hand));
  scored.sort((a, b) => b.score - a.score);

  // Calibration guard: the strategic layers above intentionally contain many
  // positive tactical incentives (XXI protection, Skíz pressure, weak-Pagát
  // loss minimisation, talon denial). Without a final opportunity-cost check
  // those bonuses can make a marginal bid beat a perfectly reasonable pass by
  // a fraction of a point. The published material treats silence as a real
  // information-preserving action, so require a meaningful edge before entering
  // the auction. Strong conventions (invites/holds) remain untouched.
  const pass = scored.find(x => x.action.type === 'pass');
  let best = scored[0]!;
  // Single-player opening calibration: a nyitó Szóló nem általános kézerősségi
  // döntés, hanem nagyon szűk, klasszikus kivétel.
  //
  // 1) Skíz + legalább 7 tarokk; vagy
  // 2) XXI + Skíz + legalább 6 tarokk.
  // Mindkét nyitó Szóló-profilnál további kötelező feltétel, hogy a
  // legkisebb tarokk XIII-as vagy magasabb legyen, és legyen legalább egy
  // színes király a kézben.
  //
  // Ez a korábbi, túl tág "két nagyhonőr + 6 tarokk" kaput szándékosan
  // megszünteti. A feltétel csak a single-player UI-kalibrációt érinti; a
  // multiplayer ugyanazt az engine-t használhatja a default opcióval.
  const hasSuitKing = hand.some(card => card.kind === 'suit' && card.rank === 'K');
  const tarokkRanks = hand.filter(isTarokk).map(card => card.rank);
  const lowestTarokkRank = tarokkRanks.length ? Math.min(...tarokkRanks) : undefined;
  const exceptionalOpeningProfile =
    (profile.skiz && profile.tarokks >= 7) ||
    (profile.xxi && profile.skiz && profile.tarokks >= 6);
  const openingSoloExceptional =
    exceptionalOpeningProfile &&
    lowestTarokkRank !== undefined &&
    lowestTarokkRank >= 13 &&
    hasSuitKing;
  // A Nagymadár klasszikus magas-tarokk lépcsője: XX-XIX-XVIII-XVII-XVI.
  // Nyitó Egyeshez ebből legalább négy szükséges, és ugyanúgy kell legalább
  // egy színes király. Ez a két kivételes nagyhonőrös profil mindegyikére
  // vonatkozik, függetlenül attól, hogy a Szóló szűk feltétele teljesül-e.
  const nagymadarRanks = [20, 19, 18, 17, 16];
  const nagymadarHighCount = tarokkRanks.filter(rank => nagymadarRanks.includes(rank)).length;
  const nagymadarOpeningOne = exceptionalOpeningProfile && nagymadarHighCount >= 4 && hasSuitKing;

  if (options.singlePlayer && !position.hasOpened) {
    // These opening conventions are hard single-player policy gates, not
    // scoring bonuses: if the exceptional Solo profile is present, generic
    // opportunity-cost calibration must not turn it back into a lower bid.
    if (openingSoloExceptional) {
      const solo = scored.find(x => x.action.type === 'bid' && x.action.contract === 'solo');
      if (solo) {
        return { ...solo, reasons: [...solo.reasons, 'Single-player nyitókalibráció: kivételes Szóló-kéz, ezért a nyitó Szóló elsődleges és nem csak pontozási opció.'] };
      }
    }

    if (exceptionalOpeningProfile && nagymadarOpeningOne) {
      const one = scored.find(x => x.action.type === 'bid' && x.action.contract === 'one');
      if (one) {
        return { ...one, reasons: [...one.reasons, 'Single-player nyitókalibráció: legalább négy Nagymadárig szükséges magas tarokk + király esetén Egyes az elsődleges nyitás.'] };
      }
    }

    // A két kivételes, nagyhonőrös nyitóprofilnál, ha a Szólóhoz szükséges
    // szűk feltétel nem áll fenn és az Egyes Nagymadár-küszöbe sem teljesül,
    // a nyitó Kettes legyen az alapértelmezett emelés. Ezt is csak single-player
    // módban alkalmazzuk.
    if (exceptionalOpeningProfile && !openingSoloExceptional && !nagymadarOpeningOne) {
      const two = scored.find(x => x.action.type === 'bid' && x.action.contract === 'two');
      if (two) {
        return { ...two, reasons: [...two.reasons, 'Single-player nyitókalibráció: a kivételes nagyhonőrös profil megvan, de a Szóló- és Egyes-küszöb nem teljesül; Kettes a következő nyitó lépcső.'] };
      }
    }

    if (best.action.type === 'bid' && best.action.contract === 'solo' && !openingSoloExceptional) {
      const nonSolo = scored.find(x => x.action.type === 'bid' && x.action.contract !== 'solo');
      if (nonSolo) {
        best = { ...nonSolo, reasons: [...nonSolo.reasons, 'Single-player kalibráció: nyitó Szóló csak a szűk kivételes kézprofilok egyikével engedett stratégiai cél.'] };
      }
    }
  }
  if (pass && best.action.type === 'bid') {
    const margin = best.action.contract === 'solo' ? 5 : best.action.contract === 'three' ? 2.5 : 3.5;
    if (best.score < pass.score + margin) {
      return {
        action: pass.action,
        score: pass.score,
        reasons: [...pass.reasons, `Licittartalék-kalibráció: a ${best.action.contract} csak ${ (best.score - pass.score).toFixed(1) } ponttal volt jobb a passznál, ezért a kisebb információs kockázatú passz marad.`],
      };
    }
  }
  return best;
}

function profileHand(hand: Card[]): HandProfile {
  const t = hand.filter(isTarokk).length;
  const pagat = hasTarokk(hand, 1);
  const xxi = hasTarokk(hand, 21);
  const skiz = hasTarokk(hand, 22);
  return {
    tarokks: t,
    pagat,
    xxi,
    skiz,
    xx: hasTarokk(hand, 20),
    xix: hasTarokk(hand, 19),
    xviii: hasTarokk(hand, 18),
    xvii: hasTarokk(hand, 17),
    honours: hand.filter(isHonour).length,
    bigHonours: Number(xxi) + Number(skiz),
    highProtection: Number(hasTarokk(hand, 20)) + Number(hasTarokk(hand, 19)) + Number(hasTarokk(hand, 18)),
    mediumTarokkControl: Number(hasTarokk(hand, 17)),
  };
}

interface AuctionPosition {
  /** 0 = opening/A, 1 = B, 2 = C, 3 = D relative to first bidder. */
  relative: number;
  firstBidder?: PlayerId;
  hasOpened: boolean;
  bidCount: number;
  activeBidders: number;
}

interface XXITrapAssessment {
  risk: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

interface SkizCaptureAssessment {
  pressure: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

function auctionPosition(auction: AuctionState, playerId: PlayerId): AuctionPosition {
  const firstBid = auction.records.find(r => r.action.type === 'bid');
  const firstBidder = firstBid?.playerId;
  const firstSeat = firstBidder === undefined ? undefined : auction.seats.find(s => s.playerId === firstBidder)?.seat;
  const ownSeat = auction.seats.find(s => s.playerId === playerId)?.seat ?? 0;
  const relative = firstSeat === undefined ? 0 : (ownSeat - firstSeat + auction.seats.length) % auction.seats.length;
  return {
    relative,
    ...(firstBidder !== undefined ? { firstBidder } : {}),
    hasOpened: firstBidder !== undefined,
    bidCount: auction.records.filter(r => r.action.type === 'bid').length,
    activeBidders: new Set(auction.records.filter(r => r.action.type === 'bid').map(r => r.playerId)).size,
  };
}


function assessXXICaptureRisk(
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
): XXITrapAssessment {
  const reasons: string[] = [];
  let risk = 0;
  if (!h.xxi || h.skiz || h.pagat) return { risk: 0, confidence: 'low', reasons };

  const bids = auction.records.filter(r => r.action.type === 'bid') as Array<{ playerId: PlayerId; action: Extract<AuctionAction, { type: 'bid' }> }>;
  const active = auction.seats.filter(s => !auction.out.includes(s.playerId));
  const ownSeat = auction.seats.find(s => s.playerId === auction.seats[auction.currentSeat]?.playerId)?.seat ?? 0;
  const previousSeat = (ownSeat - 1 + auction.seats.length) % auction.seats.length;
  const nextSeat = (ownSeat + 1) % auction.seats.length;
  const previousPlayer = auction.seats.find(s => s.seat === previousSeat)?.playerId;
  const nextPlayer = auction.seats.find(s => s.seat === nextSeat)?.playerId;
  const previousBid = bids.filter(b => b.playerId === previousPlayer).at(-1);
  const nextBid = bids.filter(b => b.playerId === nextPlayer).at(-1);
  const hasThreeBefore = bids.some(b => b.action.contract === 'three');
  const previousThree = previousBid?.action.contract === 'three';
  const previousRaisedAgainstXXI = previousBid && (previousBid.action.contract === 'two' || previousBid.action.contract === 'one' || previousBid.action.contract === 'solo');
  const nextHasPublicBid = !!nextBid;

  // TAROKK-ŐR: when A says 3 and B is only XXI, B should normally not
  // volunteer for the raising battle because A may be the Skíz. This is the
  // canonical XXI-under-the-Skíz danger.
  if (previousThree && pos.relative === 1) {
    risk += 8;
    reasons.push('Csak XXI + közvetlenül előtte Hármas: klasszikus Skíz-gyanús fogási helyzet.');
  }

  // If the immediately preceding player has already raised after the XXI's
  // position became relevant, the auction itself is evidence of a possible
  // Skíz press.
  if (previousRaisedAgainstXXI) {
    risk += 4;
    reasons.push('Az előttünk licitáló emelt: a licit önmagában is erősítheti a Skíz-gyanút.');
  }

  // A bidder behind us has not acted yet, so this is only a latent risk. It is
  // intentionally smaller: the AI must not pretend to know the hidden Skíz.
  if (!nextHasPublicBid && active.length >= 3) {
    risk += 1;
    reasons.push('A mögöttünk ülő még nem licitált: a Skíz helye ismeretlen, ezért csak kis elővigyázatossági súly jár.');
  }

  // A weak XXI is an important exception. The literature explicitly gives
  // examples where a weak XXI DOES bid in order to become taker and obtain XX
  // support. Therefore capture risk must never hard-block the bid.
  if (h.tarokks <= 5) {
    risk -= 2;
    reasons.push('Gyenge XXI kivétel: a felvevőség és a XX segítségének megszerzése önmagában is érték.');
  }

  risk = Math.max(0, Math.min(10, risk));
  const confidence = risk >= 7 ? 'high' : risk >= 4 ? 'medium' : 'low';
  return { risk, confidence, reasons };
}

function assessSkizSeatPressure(
  auction: AuctionState,
  h: HandProfile,
  capturePressure: number,
): { scoreByContract: Record<Contract, number>; reasons: string[] } {
  const zero: Record<Contract, number> = { three: 0, two: 0, one: 0, solo: 0 };
  const reasons: string[] = [];
  if (!h.skiz || capturePressure <= 0) return { scoreByContract: zero, reasons };

  const me = auction.seats[auction.currentSeat];
  if (!me) return { scoreByContract: zero, reasons };
  const n = auction.seats.length;
  const dist = (seat: number) => (seat - me.seat + n) % n;
  const bidderSeats = new Set(
    auction.records
      .filter(r => r.action.type === 'bid')
      .map(r => auction.seats.find(s => s.playerId === r.playerId)?.seat)
      .filter((x): x is number => x !== undefined),
  );
  const before = [...bidderSeats].some(seat => dist(seat) === n - 1);
  const behind = [...bidderSeats].some(seat => dist(seat) > 0 && dist(seat) < n - 1);

  // If nobody has spoken immediately before the Skíz and all visible bidding
  // is behind him, taking the game is not automatically useful. The Skíz can
  // let the later bidder become taker and keep the XXI-capture option alive.
  if (!before && behind) {
    zero.solo -= 12;
    zero.two -= 3;
    zero.one += 3;
    reasons.push('Skíz ülés: a licit csak mögötte történt, ezért nem szükséges mindenáron felvevővé válnia.');
  }

  if (before) {
    if (h.tarokks <= 4) {
      zero.one += 10;
      zero.two += 3;
      zero.solo -= 22;
      reasons.push('Fogószituáció + Skíz + legfeljebb 4 tarokk: az előtte ülőt tipikusan Egyesig szorítja, Szólóig viszont ritkán megy.');
    } else if (h.tarokks <= 5) {
      zero.one += 7;
      zero.two += 4;
      zero.solo -= 13;
      reasons.push('Fogószituáció + Skíz + 5 tarokk: Egyes/Kettes felé van nyomás, de Szóló még kivételes.');
    } else if (h.tarokks < 6) {
      zero.solo -= 8;
      reasons.push('Hat tarokk alatt a Skíz Szólója csak kivételes egyéb erővel indokolt.');
    } else if (h.tarokks === 6) {
      zero.solo -= 4;
      zero.one += 2;
      reasons.push('Hat tarokkos Skíz már erősen licitálhat, de fogási helyzetben a Szóló továbbra sem automatikus.');
    }
  }

  return { scoreByContract: zero, reasons };
}

function assessSkizCapturePressure(
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
): SkizCaptureAssessment {
  const reasons: string[] = [];
  let pressure = 0;
  if (!h.skiz) return { pressure: 0, confidence: 'low', reasons };

  const bids = auction.records.filter(r => r.action.type === 'bid') as Array<{ playerId: PlayerId; action: Extract<AuctionAction, { type: 'bid' }> }>;
  const previousPlayer = auction.seats.find(s => s.seat === ((auction.seats.find(x => x.playerId === auction.seats[auction.currentSeat]?.playerId)?.seat ?? 0) - 1 + auction.seats.length) % auction.seats.length)?.playerId;
  const previousBid = bids.filter(b => b.playerId === previousPlayer).at(-1);

  // Public pressure only: a previous Hármas is evidence that the player in
  // front may be a big-honour holder, but it is NOT proof that XXI is there.
  if (pos.relative === 1 && previousBid?.action.contract === 'three') {
    pressure += 5;
    reasons.push('Skíz közvetlenül a Hármas után: a licitáló lehet XXI-es, ezért a fogási lehetőség értékelendő.');
  }

  // Pagát+Skíz makes the external XXI particularly relevant: if XXI is
  // outside our hand, taking the game can both protect Pagát and create a
  // later XXI-fogási opportunity.
  if (h.pagat && !h.xxi) {
    pressure += 2;
    reasons.push('Skíz+Pagát és nincs XXI: a külső XXI helye és a Pagát védelme együtt fontos.');
  }

  if (h.tarokks >= 7) pressure += 2;
  if (h.xx) pressure += 1;

  pressure = Math.max(0, Math.min(10, pressure));
  return { pressure, confidence: pressure >= 7 ? 'high' : pressure >= 4 ? 'medium' : 'low', reasons };
}

/**
 * A Skíz does not always want to win the auction cheaply. The Tarokk Akadémia
 * describes a specific release condition: the Skíz may let another bidder
 * take the game when XX is also in the hand and the two talon cards are
 * genuinely needed, especially with Pagát. This is strategic evidence, not a
 * legality rule.
 */
interface SkizTalonDenialAssessment {
  score: number;
  xxiShare: number;
  reasons: string[];
}

/**
 * A separate value for denying the talon to a suspected XXI. This is not the
 * same thing as capture pressure: a Skíz can have a good later fogási
 * position and still want to raise now because allowing the suspected XXI to
 * take the talon may improve the very hand we intend to catch. Conversely,
 * if the suspected XXI sits behind us, the later capture position can make
 * releasing the auction more attractive.
 *
 * The source material explicitly describes raising as serving both purposes:
 * it can communicate the catch possibility and keep an overbid XXI from
 * taking the talon. The exact hidden hand is never known, so xxiShare is only
 * the probability mass of public-auction configurations supporting that
 * hypothesis.
 */
function assessSkizTalonDenial(
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
  action: Extract<AuctionAction, { type: 'bid' }>,
  captureConfigurations: CaptureConfiguration[],
): SkizTalonDenialAssessment {
  const reasons: string[] = [];
  if (!h.skiz) return { score: 0, xxiShare: 0, reasons };

  const me = auction.seats[auction.currentSeat]?.playerId;
  const highest = auction.highest?.playerId;
  if (!me || !highest || highest === me) return { score: 0, xxiShare: 0, reasons };

  const xxiShare = captureConfigurations
    .filter(c => c.skiz === me && c.xxi === highest)
    .reduce((sum, c) => sum + c.probability, 0);

  if (xxiShare < 0.05) return { score: 0, xxiShare, reasons };

  const order: Record<Contract, number> = { three: 1, two: 2, one: 3, solo: 4 };
  const current = auction.highest?.contract;
  if (!current || order[action.contract] <= order[current]) return { score: 0, xxiShare, reasons };

  let score = xxiShare * 10;

  // The closer the current XXI is to being overbid, the more useful the
  // immediate raise is. The highest bidder has to react; if they pass, they
  // no longer improve their hand through the talon.
  if (current === 'one') score += 2.0;
  else if (current === 'two') score += 1.2;
  else if (current === 'three') score += 0.5;

  // Seat order changes the trade-off. A Skíz sitting behind the suspected XXI
  // retains a genuine later catch route, so denial and release are closer. If
  // the suspected XXI is immediately before us, denial is particularly useful
  // because otherwise the opponent gets both the game and the talon.
  const mySeat = auction.seats.find(s => s.playerId === me)?.seat;
  const xxiSeat = auction.seats.find(s => s.playerId === highest)?.seat;
  if (mySeat !== undefined && xxiSeat !== undefined) {
    const n = auction.seats.length;
    const distance = (mySeat - xxiSeat + n) % n;
    if (distance === 1) {
      score += 2.5;
      reasons.push('A feltételezett XXI közvetlenül előttünk ül: a talon átengedése különösen veszélyes, ezért a felsrófolás talonjavítás-ellenes értéke magas.');
    } else if (distance > 1) {
      score += 0.8;
      reasons.push('A feltételezett XXI mögöttünk ül: a későbbi fogási pozíció valamennyire megmarad, ezért a talonmegtagadás és a kiengedés között kisebb a különbség.');
    }
  }

  if (h.tarokks >= 7) score += 1.0;
  else if (h.tarokks <= 4) score -= 0.8;
  if (h.pagat) score += 0.8;

  score = Math.max(0, Math.min(10, score));
  reasons.push(`Talonmegtagadási érték: ${score.toFixed(1)}/10; a konfigurációk ${Math.round(xxiShare * 100)}%-a támogatja, hogy a jelenlegi felvevőjelölt XXI.`);
  if (score >= 4) {
    reasons.push('A Skíz emelése itt nem pusztán fogási jelzés: célja lehet, hogy a feltételezett XXI ne jusson javító talonhoz.');
  }
  return { score, xxiShare, reasons };
}


/**
 * Forward auction response model. This is deliberately probabilistic: the AI
 * does not know the hidden hand of the current bidder. It estimates whether a
 * suspected XXI is likely to survive a proposed escalation. A high contract
 * can therefore have value even when it is unlikely to become the final
 * contract: forcing a pass is itself a strategic outcome.
 */
interface EscalationResponseAssessment {
  score: number;
  expectedRelease: number;
  expectedTalonDenial: number;
  reasons: string[];
}

function assessEscalationResponse(
  auction: AuctionState,
  h: HandProfile,
  action: Extract<AuctionAction, { type: 'bid' }>,
  configurations: CaptureConfiguration[],
): EscalationResponseAssessment {
  const reasons: string[] = [];
  const me = auction.seats[auction.currentSeat]?.playerId;
  const highest = auction.highest?.playerId;
  const current = auction.highest?.contract;
  if (!me || !highest || highest === me || !current) {
    return { score: 0, expectedRelease: 0, expectedTalonDenial: 0, reasons };
  }

  const order: Record<Contract, number> = { three: 1, two: 2, one: 3, solo: 4 };
  if (order[action.contract] <= order[current]) {
    return { score: 0, expectedRelease: 0, expectedTalonDenial: 0, reasons };
  }

  const xxiShare = configurations
    .filter(c => c.skiz === me && c.xxi === highest)
    .reduce((sum, c) => sum + c.probability, 0);
  if (xxiShare < 0.05) return { score: 0, expectedRelease: 0, expectedTalonDenial: 0, reasons };

  // Approximate response survival from public contract pressure. These are
  // response tendencies, not rules. A suspected XXI is more likely to hold
  // with a cheap contract and less likely to survive a Solo challenge.
  const pressure = order[action.contract] - order[current];
  let release = 0.22 + (h.tarokks <= 5 ? 0.16 : 0) - pressure * 0.07;
  if (current === 'three') release -= 0.05;
  release = Math.max(0.05, Math.min(0.75, release));

  // A weak XXI has a positive incentive to keep the game in order to obtain
  // XX support, so do not model it as an automatic fold.
  if (h.tarokks <= 5 && h.pagat === false) release -= 0.05;

  const denial = xxiShare * (0.45 + pressure * 0.15);
  const expected = denial * 10 + release * 3;

  reasons.push(`Előreszámolt reakció: a feltételezett XXI elengedési valószínűsége kb. ${Math.round(release * 100)}% a ${action.contract} emelésnél.`);
  if (release >= 0.35) {
    reasons.push('Az emelésnek itt akkor is lehet értéke, ha nem nyerjük meg a játékot: a XXI egy része várhatóan elengedi, így a talonjavítás elmarad.');
  } else {
    reasons.push('A feltételezett XXI várhatóan gyakran tart; az emelés ezért csak akkor indokolt, ha a fogási/talommegtagadási érték ezt kompenzálja.');
  }

  return {
    score: expected,
    expectedRelease: release,
    expectedTalonDenial: denial,
    reasons,
  };
}

function assessSkizTalonRelease(h: HandProfile): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (!h.skiz || !h.xx) return { score: 0, reasons };

  let score = 0;
  // A long tarokk hand has less need for the talon; a shorter hand has more.
  if (h.tarokks <= 5) score += 8;
  else if (h.tarokks <= 7) score += 5;
  else score -= 2;

  if (h.pagat) {
    score += 4;
    reasons.push('Skíz+XX+Pagát: a talon két lapja különösen értékes lehet Pagát uhu/ultimó vagy királyfigura előkészítéséhez.');
  }
  if (h.highProtection <= 1) {
    score += 2;
    reasons.push('Kevés XX alatti magas tarokk: a talon javító értéke nagyobb.');
  }

  return { score: Math.max(0, Math.min(10, score)), reasons };
}

function strategicPosture(h: HandProfile, auction: AuctionState, pos: AuctionPosition): AuctionPosture {
  const weakPagat = h.pagat && h.tarokks <= 5 && h.highProtection === 0;
  const strongOffence = (h.bigHonours === 2 && h.tarokks >= 6)
    || (h.skiz && h.tarokks >= 7)
    || (h.xxi && h.skiz && h.tarokks >= 6);
  const exposedLargeHonour = h.bigHonours === 1 && h.tarokks <= 4;
  const manyPublicBids = auction.records.filter(r => r.action.type === 'bid').length >= 2;
  if (weakPagat && (pos.hasOpened || manyPublicBids || pos.relative !== 0)) return 'loss-minimising';
  if (strongOffence && !exposedLargeHonour) return 'profit-maximising';
  return 'balanced';
}

function weakPagatLiability(h: HandProfile): boolean {
  return h.pagat && h.tarokks <= 5 && h.highProtection === 0;
}

function publicExposureRisk(auction: AuctionState, h: HandProfile): number {
  const bids = auction.records.filter(r => r.action.type === 'bid');
  const distinct = new Set(bids.map(r => r.playerId)).size;
  let risk = 0;
  if (distinct >= 1 && h.bigHonours === 0) risk += 2;
  if (distinct >= 2 && h.bigHonours === 0) risk += 3;
  if (distinct >= 2 && h.pagat && h.highProtection === 0) risk += 4;
  if (bids.some(r => r.action.type === 'bid' && r.action.contract === 'solo') && h.pagat && h.highProtection === 0) risk += 8;
  return risk;
}


/**
 * Hard strategic ceilings/floors taken from the published Illusztrált strategy
 * material. These are NOT legality rules: legalAuctionActions() remains the
 * authority on what can actually be said. They express the classic principle
 * that Pagát/XXI often behaves like a large honour in the auction, while Skíz
 * creates much stronger pressure.
 */
function detailedHandProfileSignal(
  action: AuctionAction,
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const bids = auction.records.filter(r => r.action.type === 'bid');
  const distinctBidders = new Set(bids.map(r => r.playerId)).size;
  const immediatelyBeforeBidder = pos.relative === 1 && bids.length > 0;

  // The literature is organised around these hand profiles rather than a
  // single numeric hand-strength scale. Keep them as strategic overlays: the
  // auction engine still decides legality.
  const skizXxiPagat = h.skiz && h.xxi && h.pagat;
  const skizXxi = h.skiz && h.xxi && !h.pagat;
  const skizPagat = h.skiz && h.pagat && !h.xxi;
  const xxiPagat = h.xxi && h.pagat && !h.skiz;
  const xxiXxPagat = h.xxi && h.xx && h.pagat && !h.skiz;
  const xxiXx = h.xxi && h.xx && !h.skiz && !h.pagat;
  const onlyXxi = h.xxi && !h.skiz && !h.pagat && !h.xx;
  const onlySkiz = h.skiz && !h.xxi && !h.pagat && !h.xx;
  const pagatXx = h.pagat && h.xx && !h.xxi && !h.skiz;
  const onlyPagat = h.pagat && !h.skiz && !h.xxi && !h.xx;

  // Skíz + XXI + Pagát is the strongest classic profit-maximising profile.
  // It should not be treated as merely “three honours”: its purpose is to
  // preserve both the high-honour upside and the possibility of figures.
  if (skizXxiPagat) {
    if (action.type === 'bid' && action.contract === 'solo') {
      score += 24;
      reasons.push('Skíz+XXI+Pagát: kiemelt nyereségmaximalizáló profil, a Szóló különösen értékes.');
    }
    if (action.type === 'hold') score += 8;
    if (action.type === 'pass') score -= 18;
  }

  if (skizXxi && h.tarokks >= 6) {
    if (action.type === 'bid' && action.contract === 'solo') score += 18;
    if (action.type === 'pass') score -= 15;
    reasons.push('Skíz+XXI: legalább 6 tarokk mellett a szakirodalmi kézprofil erős Szóló-irány.');
  }

  if (skizPagat && h.tarokks >= 6) {
    if (action.type === 'bid' && action.contract === 'solo') score += 14;
    if (action.type === 'pass') score -= 8;
    reasons.push('Skíz+Pagát: a Pagát és a Skíz együtt már nem pusztán gyenge Pagátos kéz; a játék drágítása gyakran védelmi és értékmaximalizáló eszköz.');
  }

  // XXI+Pagát is a literature’s own named profile. Without a strong high-tarokk
  // tail, avoid pretending it is equivalent to the two-big-honour profiles.
  if (xxiPagat) {
    if (h.tarokks >= 6 && action.type === 'bid' && action.contract === 'solo' && !immediatelyBeforeBidder) {
      score += 8;
      reasons.push('XXI+Pagát, 6+ tarokk: erős, de nem automatikus Szóló; az ülés és a talonérték dönt.');
    }
    if (action.type === 'pass' && h.tarokks <= 4) score += 4;
  }

  // These are the classic “cannot let the game go” profiles: XXI+XX+Pagát
  // with very little extra tarokk, and XXI+XX with little extra tarokk.
  if (xxiXxPagat && h.tarokks <= 5) {
    if (action.type === 'hold') score += 18;
    if (action.type === 'pass') score -= 30;
    if (action.type === 'bid') score += action.contract === 'solo' ? 3 : 8;
    reasons.push('XXI+XX+Pagát kevés további tarokkal: a játék kiengedése különösen veszélyes.');
  }
  if (xxiXx && h.tarokks <= 6) {
    if (action.type === 'hold') score += 14;
    if (action.type === 'pass') score -= 22;
    reasons.push('XXI+XX kevés további tarokkal: az olcsó játék kiengedése helyett a játék megtartása élvez elsőbbséget.');
  }

  // Only XXI / only Skíz are deliberately kept separate: the talon can change
  // the hand materially, so the same honour does not imply the same contract.
  if (onlyXxi) {
    if (action.type === 'bid' && !immediatelyBeforeBidder && h.tarokks >= 3) score += 5;
    if (action.type === 'bid' && action.contract === 'solo' && !immediatelyBeforeBidder && h.tarokks >= 5) score += 7;
    if (action.type === 'pass' && h.tarokks >= 5) score -= 3;
    if (immediatelyBeforeBidder && action.type === 'bid' && (action.contract === 'one' || action.contract === 'solo')) {
      score -= 12;
      reasons.push('Csak XXI, közvetlenül a korábbi licitáló után: az ülés miatt nem célszerű vakon Szólóig fúrni.');
    }
  }

  if (onlySkiz) {
    if (action.type === 'bid' && h.tarokks >= 5) score += 6;
    if (action.type === 'bid' && action.contract === 'solo' && h.tarokks >= 7) score += 15;
    if (action.type === 'pass' && h.tarokks >= 5) score -= 6;
  }

  // Pagát+XX is not a “weak Pagát”: XX changes the risk calculation and the
  // formal rule explicitly forbids releasing this game.
  if (pagatXx) {
    if (action.type === 'hold') score += 24;
    if (action.type === 'pass') score -= 35;
    if (action.type === 'bid') score += 6;
    reasons.push('Pagát+XX: a XX miatt a játék kiengedése nem megengedett; stratégiailag is a megtartás az alap.');
  }

  // Bare Pagát is intentionally NOT mapped to “pass”. The literature has a
  // dedicated only-Pagát profile and the loss-minimisation logic can make a
  // high contract preferable to leaving Pagát exposed to the other big honour.
  if (onlyPagat) {
    if (h.tarokks <= 5 && action.type === 'bid' && action.contract === 'solo') score += 12;
    if (h.tarokks <= 5 && action.type === 'pass') score -= 4;
    if (h.tarokks >= 6 && action.type === 'bid') score += 4;
    reasons.push('Csak Pagát: veszteségminimalizáló profil; a passz nem automatikusan jobb, a Pagát oldalának biztosítása a cél.');
  }

  // Three distinct bidders: large-honour ownership and figure potential have
  // priority over the small upside of an inexpensive counter-game.
  if (distinctBidders >= 3 && h.bigHonours > 0 && action.type === 'hold') {
    score += 12;
    reasons.push('Három licitáló + nagyhonőr: a nagyhonőrös fél tartása a figurapotenciált védi.');
  }

  return { score, reasons };
}

function literatureAuctionSignal(
  action: AuctionAction,
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const bids = auction.records.filter(r => r.action.type === 'bid');
  const distinctBidders = new Set(bids.map(r => r.playerId)).size;
  const currentHighest = auction.highest?.contract;
  const firstWasThree = bids[0]?.action.type === 'bid' && bids[0].action.contract === 'three';

  // Published strategy rule: Skíz + 7 tarokk => Szóló, irrespective of seat.
  if (h.skiz && h.tarokks >= 7 && action.type === 'bid' && action.contract === 'solo') {
    score += 45;
    reasons.push('Szakirodalmi alapszabály: Skíz + legalább 7 tarokk → Szólóig kell licitálni.');
  }

  // Skíz + Pagát, 6 tarokk: the classic "srófolás" exception is especially
  // strong when the other bidder is directly before us.
  if (h.skiz && h.pagat && h.tarokks >= 6 && !h.xxi && action.type === 'bid' && action.contract === 'solo' && pos.relative === 1) {
    score += 42;
    reasons.push('Skíz + Pagát + 6 tarokk, közvetlenül előttünk licitáló: a szakirodalom szerint Szólóig kell srófolni.');
  }

  // Skíz + XXI + 6 tarokk: Szóló any seat.
  if (h.skiz && h.xxi && h.tarokks >= 6 && action.type === 'bid' && action.contract === 'solo') {
    score += 40;
    reasons.push('Skíz + XXI + legalább 6 tarokk: a szakirodalmi minta szerint bármely ülésben Szólóig licitálható.');
  }

  // Three bidders: the large honour should normally retain the game. This is
  // an information/figure-protection rule, not a raw hand-strength bonus.
  if (distinctBidders >= 3 && h.bigHonours > 0 && action.type === 'hold') {
    score += 38;
    reasons.push('Három licitáló: a nagyhonőrös játékos tartja a játékot, mert a figura-potenciál értékesebb lehet az olcsó kontra-partinál.');
  }

  // XXI or Pagát normally belongs on the one-level side of the auction. If
  // sitting immediately after a normal 3-bidder, the published exception says
  // it should not drill beyond Kettes; with suitable strength it may invite.
  if ((h.xxi || h.pagat) && !h.skiz && pos.relative === 1 && firstWasThree) {
    if (action.type === 'bid' && (action.contract === 'one' || action.contract === 'solo')) {
      score -= 35;
      reasons.push('XXI/Pagát a Skíz helyén: közvetlenül a Hármas után a szakirodalmi kivétel szerint Kettesnél magasabbra nem fúrhat.');
    }
  } else if ((h.xxi || h.pagat) && !h.skiz && action.type === 'bid' && action.contract === 'one') {
    score += 18;
    reasons.push('XXI/Pagát: általános stratégiai alaphelyzetként az Egyes játék tartása/megmondása kap elsőbbséget.');
  }

  // A lone Pagát cannot invite. With only six tarokks, an invite needs a
  // consecutive high-tarokk structure; with 7+ it is more plausible.
  if (h.pagat && action.type === 'invite') {
    score -= 60;
    reasons.push('Pagáttal nem adunk invitet.');
  }
  if (action.type === 'invite' && h.tarokks === 6 && h.highProtection < 2) {
    score -= 35;
    reasons.push('Hat tarokknál az invit csak sorozatos nagy ütőkkel indokolt; az egyszerű hat-tarokkos kéz kevés.');
  }

  // A weak Pagát is a "large honour" strategically: if it cannot be protected,
  // the loss-minimising goal is to become taker rather than leave it opposite a
  // strong honour complex. This is deliberately a reward for the high contract,
  // not a claim that the hand is intrinsically strong.
  const unprotectedPagat = h.pagat && h.highProtection === 0 && h.tarokks <= 5;
  if (unprotectedPagat && action.type === 'bid' && action.contract === 'solo') {
    score += 34;
    reasons.push('Védtelen Pagát: veszteségminimalizáló Szóló, hogy a Pagát lehetőleg a felvevő oldalán maradjon.');
  }

  // A Pagát may safely release only when it is very likely to become partner
  // or can materially suppress the opponent's figures. We cannot know the
  // future partner, so the second case is represented by XX/XIX/XVIII control.
  if (h.pagat && action.type === 'hold') {
    const canSuppressFigures = h.xix && h.xviii && h.tarokks >= 6;
    const hasXXProtection = h.xx && h.tarokks >= 5;
    if (!canSuppressFigures && !hasXXProtection) {
      score -= 12;
      reasons.push('Pagát kiengedése csak biztos partneri helyzetben vagy erős figura-ellenőrzéssel kedvező.');
    }
  }

  // XXI-fogás awareness: a vulnerable XXI should avoid gratuitous information
  // exposure when a player immediately in front has already bid.
  if (h.xxi && !h.skiz && pos.relative === 2 && distinctBidders >= 2 && action.type === 'bid') {
    score -= 8;
    reasons.push('Szorongatott XXI-helyzet: a licit információt adhat és növelheti a fogási kockázatot.');
  }

  // A pair of big honours is a profit-maximising hand; do not let generic
  // "silence preserves information" rules overwhelm an otherwise clear Solo.
  if (h.bigHonours === 2 && h.tarokks >= 6 && action.type === 'bid' && action.contract === 'solo') {
    score += 20;
    reasons.push('Két nagyhonőr + 6+ tarokk: a stratégiai cél elsődlegesen nyereségmaximalizálás.');
  }

  return { score, reasons };
}

function scoreAuctionAction(
  action: AuctionAction,
  auction: AuctionState,
  h: HandProfile,
  pos: AuctionPosition,
  hand: Card[] = [],
): AIAuctionDecision {
  let score = 0;
  const reasons: string[] = [];
  const isOpening = !pos.hasOpened;
  const isB = pos.relative === 1;
  const isC = pos.relative === 2;
  const isD = pos.relative === 3;
  const bidActions = auction.records.filter(r => r.action.type === 'bid').map(r => r.action as Extract<AuctionAction,{type:'bid'}>);
  const externalBidderIds = new Set(auction.records.filter(r => r.action.type === 'bid' && r.playerId !== auction.seats[auction.currentSeat]?.playerId).map(r => r.playerId));
  const onlyOneExternalBidder = externalBidderIds.size === 1;
  const soleExternalIsImmediatelyBefore = onlyOneExternalBidder && (() => {
    const external = [...externalBidderIds][0];
    const extSeat = auction.seats.find(s => s.playerId === external)?.seat;
    if (extSeat === undefined) return false;
    return (extSeat + 1) % auction.seats.length === (auction.seats.find(s => s.playerId === auction.seats[auction.currentSeat]?.playerId)?.seat ?? 0);
  })();
  const highest = auction.highest;
  const current = highest?.contract;
  const bidContracts = bidActions.map(b => b.contract);
  const canonical321 = bidContracts.length >= 3 && bidContracts[0] === 'three' && bidContracts[1] === 'two' && bidContracts[2] === 'one';
  const currentIsFirstBidder = pos.relative === 0 && pos.firstBidder === auction.seats[auction.currentSeat]?.playerId;

  // Strategy deliberately uses ONLY public auction information plus our own
  // hand. `hands` is used upstream only for formal invite legality.
  const publicBids = bidActions.length;
  const otherBidderCount = new Set(auction.records.filter(r => r.action.type === 'bid').map(r => r.playerId)).size;
  const posture = strategicPosture(h, auction, pos);
  const exposureRisk = publicExposureRisk(auction, h);
  const weakPagat = weakPagatLiability(h);
  const xxiTrap = assessXXICaptureRisk(auction, h, pos);
  const skizCapture = assessSkizCapturePressure(auction, h, pos);
  const skizRelease = assessSkizTalonRelease(h);
  const literature = literatureAuctionSignal(action, auction, h, pos);
  const auctionBeliefs = inferAuctionBeliefs(auction);
  const captureConfigurations = inferCaptureConfigurations(auction);
  const invitePartners = inferInvitePartnerCandidates(auction);
  const activeInvite = auction.outstandingInvite;
  const currentPlayerId = auction.seats[auction.currentSeat]?.playerId;
  const canAcceptActiveInvite = !!activeInvite && currentPlayerId !== activeInvite.inviterId
    && ((activeInvite.target === 19 && h.xix) || (activeInvite.target === 18 && h.xviii) || (activeInvite.target === 20 && h.xx));
  const skizCaptureConfigs = h.skiz
    ? captureConfigurations.filter(c => c.skiz === auction.seats[auction.currentSeat]?.playerId)
    : [];
  const xxiCaptureShare = skizCaptureConfigs.reduce((sum, c) => sum + (c.xxi === highest?.playerId ? c.probability : 0), 0);
  const skizTalonDenial = action.type === 'bid'
    ? assessSkizTalonDenial(auction, h, pos, action, captureConfigurations)
    : { score: 0, xxiShare: xxiCaptureShare, reasons: [] as string[] };
  const escalationResponse = action.type === 'bid'
    ? assessEscalationResponse(auction, h, action, captureConfigurations)
    : { score: 0, expectedRelease: 0, expectedTalonDenial: 0, reasons: [] as string[] };
  const mySeat = auction.seats.find(s => s.playerId === auction.seats[auction.currentSeat]?.playerId)?.seat ?? 0;
  const nextSeat = (mySeat + 1) % auction.seats.length;
  const nextBelief = auctionBeliefs.find(b => b.seat === nextSeat);

  // Seat-aware Skíz pressure. In a capture situation the Skíz does not have
  // to insist on becoming taker merely because the hand is good. If the
  // public bidders are only behind the Skíz, there is little reason to seize
  // the game: the Skíz can preserve the option to attack the XXI from behind.
  // If the immediate bidder before the Skíz is the likely XXI, the tarokk
  // count controls how far the Skíz normally presses: about four tarokks can
  // force the preceding bidder down to Egyes, while below six tarokks a
  // Szóló should remain unusual unless other exceptional strength exists.
  const skizSeatProfile = assessSkizSeatPressure(auction, h, skizCapture.pressure);

  // Configuration-level capture evidence. This deliberately avoids saying
  // "B is Skíz"; it asks how much probability mass supports the full
  // configuration in which our Skíz is positioned against the current XXI.
  if (h.skiz && xxiCaptureShare > 0) {
    const cfgStrength = Math.min(10, xxiCaptureShare * 10);
    if (cfgStrength >= 1) {
      reasons.push(`Fogási konfigurációk: ${Math.round(xxiCaptureShare * 100)}% valószínűségi tömegben a jelenlegi felvevőjelölt XXI, miközben nálunk van a Skíz.`);
      if (action.type === 'bid' && (action.contract === 'one' || action.contract === 'two')) score += cfgStrength * 0.9;
      if (action.type === 'bid' && action.contract === 'solo') score += cfgStrength * 0.55;
    }
  }

  if (canonical321 && currentIsFirstBidder && h.xxi && !h.skiz && !h.pagat && h.tarokks <= 5) {
    if (action.type === 'hold') {
      score += 26;
      reasons.push('Klasszikus 3–2–1 XXI-védekezés: gyenge XXI-ként a tartás felvevőséget és XX-segítséget kereshet.');
    }
    if (action.type === 'pass') {
      score -= 24;
      reasons.push('3–2–1 után gyenge XXI-ként a passz túl könnyen átadja a játékot a lehetséges Skíznek.');
    }
  }
  score += literature.score;
  reasons.push(...literature.reasons);
  const profileSignal = detailedHandProfileSignal(action, auction, h, pos);
  score += profileSignal.score;
  reasons.push(...profileSignal.reasons);

  // Common deal-portfolio pricing: bidding is evaluated not only by contract
  // strength, but also by the downstream talon, game-risk and figure optionality
  // that the same hand can support after the auction. Specialist conventions
  // remain stronger; this layer is deliberately bounded.
  if (action.type === 'bid' || action.type === 'hold' || action.type === 'hold-invite' || action.type === 'invite') {
    const planContract = action.type === 'invite' ? (action.contract ?? auction.highest?.contract ?? 'three') : action.contract;
    const plan = evaluateDealPlan({ hand, contract: planContract, isTaker: true, partnerSupport: 0.5 });
    const path = evaluateAuctionPath({
      action: 'enter',
      contract: planContract,
      successProbability: plan.successProbability,
      figureOptionality: plan.figureExpectedValue * 0.35,
      positionValue: pos.relative === 0 ? 0.8 : pos.relative === 1 ? 0.35 : -0.15,
      tacticalValue: plan.planScore * 0.08,
    });
    const line = evaluateAuctionDealLine({ hand, contract: planContract, partnerSupport: 0.5, samples: planContract === 'solo' ? 1 : 6 });
    const boundedPlan = Math.max(-4.5, Math.min(4.5, path.score * 0.25));
    const boundedLine = Math.max(-5, Math.min(5, line.riskAdjustedValue * 0.18));
    score += boundedPlan + boundedLine;
    reasons.push(`Egységes partiút-modell: ${path.netExpectedValue.toFixed(1)} nettó útérték, ${Math.round(plan.successProbability * 100)}% becsült játéksiker.`);
    reasons.push(`Többlépcsős parti-vonal: ${line.riskAdjustedValue.toFixed(1)} kockázat-adjustált downstream érték (${line.sampleCount} talonvilág).`);
  }

  // Public-belief overlay: if the player immediately behind us is a plausible
  // Skíz, a XXI should value becoming taker more; if the player immediately
  // behind us is more plausibly XXI, a Skíz values retaining pressure. This is
  // deliberately a small overlay so it cannot override hard strategic rules.
  if (nextBelief) {
    if (h.xxi && !h.skiz && nextBelief.likelySkiz >= 0.25) {
      if (action.type === 'hold') score += 5;
      if (action.type === 'pass') score -= 4;
      reasons.push(`Mögéges Skíz közvetlenül mögöttünk (${Math.round(nextBelief.likelySkiz*100)}%): a felvevőség védelmi értéke nő.`);
    }
    if (h.skiz && nextBelief.likelyXXI >= 0.25) {
      if (action.type === 'bid' && (action.contract === 'one' || action.contract === 'two')) score += 3;
      reasons.push(`Mögöttünk valószínű XXI (${Math.round(nextBelief.likelyXXI*100)}%): a fogási lehetőség nyilvános licitből erősödik.`);
    }
  }

  if (action.type === 'pass') {
    score = 1;
    if (h.honours === 0 && h.tarokks < 5) {
      score += 24;
      reasons.push('Gyenge, honőr nélküli kéz: a passz egyértelműen előnyben van a licittel szemben.');
    }

    // The literature repeatedly treats silence as an information-preserving
    // action. This is especially important with a weak Pagát: cheap bidding
    // may improve the talon but can also destroy the distributional picture.
    if (weakPagat) {
      score += 1;
      reasons.push('Gyenge, védtelen Pagát: a döntést veszteségminimalizálásként kell értékelni, nem egyszerű kézerő alapján.');
    }

    // Skíz release: with XX in hand, a genuinely talon-dependent Skíz may
    // deliberately let the current bidder keep the game. This is the opposite
    // of the usual Skíz pressure and is a key loss/profit trade-off.
    if (h.skiz && h.xx && skizRelease.score >= 7 && current !== 'solo') {
      score += skizRelease.score * 2.0;
      reasons.push(...skizRelease.reasons);
      reasons.push(`Skíz kiengedési lehetőség: ${skizRelease.score.toFixed(1)}/10 — XX kézben, a talon értéke érdemi.`);
    }

    // XXI can be strategically interested in retaining the game rather than
    // letting an unknown XX become an opponent. The actual decision depends
    // on the current contract, so the penalty below is deliberately modest.
    if (h.xxi && !h.skiz && h.tarokks >= 5 && current && current !== 'solo') {
      score += 5;
      reasons.push('XXI + megfelelő tarokkerő: a túlzott továbblépés helyett az információ és a XX elhelyezkedése is számít.');
    }
    if (xxiTrap.risk > 0) {
      score += xxiTrap.risk * 2.4;
      reasons.push(...xxiTrap.reasons);
      reasons.push(`XXI-fogási kockázat: ${xxiTrap.confidence} (${xxiTrap.risk.toFixed(1)}/10).`);
    }

    // C-position with XX is a classic information-sensitive seat. If there is
    // already substantial bidding in front of us, silence can be preferable to
    // exposing our own XX unnecessarily.
    if (isC && h.xx && h.honours > 0) {
      score += 8;
      reasons.push('C-hely + XX + honőr: a hallgatás megőrizheti a nagyhonőrök elhelyezkedésére vonatkozó információt.');
    }

    if (h.xxi && h.xx && pos.relative >= 1 && h.tarokks >= 5) {
      score += 6;
      reasons.push('XXI + XX együtt: a kéz erős, de az információs érték miatt nem minden helyzetben kell azonnal drágítani.');
    }

    if (h.skiz && h.tarokks >= 7) score -= 12;
    if (h.xxi && h.skiz && h.tarokks >= 6) score -= 12;
    if (h.bigHonours === 2 && h.tarokks >= 6) score -= 5;
  }


  if (action.type === 'bid') {
    score = contractWeight[action.contract];
    if (h.honours === 0) {
      score -= 100;
      reasons.push('Gyenge, honőr nélküli kéz: a szabályos licitek stratégiailag erősen domináltak a passz mellett.');
    }
    if (h.skiz && skizTalonDenial.score >= 2) {
      // Denial is a distinct objective from ordinary capture pressure. Keep it
      // bounded so it cannot turn every suspected XXI into an automatic Solo.
      const denialWeight = action.contract === 'solo' ? 0.75 : 1.15;
      score += skizTalonDenial.score * denialWeight;
      reasons.push(...skizTalonDenial.reasons);
      // Forward-looking response value: a raise can be worthwhile because it
      // changes the opponent's expected decision, not merely because the raise
      // itself is a stronger contract. Keep this bounded.
      score += Math.min(5, escalationResponse.score) * (action.contract === 'solo' ? 0.55 : 0.75);
      reasons.push(...escalationResponse.reasons);
    }
    if (h.honours > 0) score += h.honours * 1.5;
    if (h.bigHonours === 2) score += 4;
    if (h.tarokks >= 5) score += 2;
    if (h.tarokks >= 7) score += 3;
    if (h.tarokks >= 9) score += 3;

    // Pagát: the formal material says it participates in bidding, but weak
    // Pagát should not automatically mean aggressive escalation.
    if (weakPagat) {
      // Illustrated Tarokk has a distinctive loss-minimisation strategy:
      // a weak, unprotected Pagát may deliberately drive the auction to Solo.
      // The point is not that the hand becomes strong, but that the Pagát
      // should preferably be on the taker's side rather than exposed against
      // a combined XXI/Skíz/XX structure with expensive figures.
      if (action.contract === 'solo') {
        score += 30;
        reasons.push('Gyenge, védtelen Pagát: veszteségminimalizáló stratégia — akár Szólóig is fel kell vinni, hogy a Pagát ne kerüljön egy erős ellenoldali figura-komplexum elé.');
        if (soleExternalIsImmediatelyBefore) {
          score -= 18;
          reasons.push('Kivételes ülés: egyetlen külső licitáló közvetlenül előttünk ül; a gyenge Pagát Szólója ebben a helyzetben nem automatikus.');
        }
      } else {
        score -= 2;
        reasons.push('Gyenge, védtelen Pagát: a passzív licit nem önmagában cél; a kulcs a későbbi felvevői oldal elérése.');
      }
    }

    if (h.honours === 0 && h.tarokks < 5) {
      score -= 20;
      reasons.push('Honőr nélküli, 5 tarokk alatti kéz: a licit erősen elutasított stratégiai opció.');
    }

    // XXI: when the player is already in a meaningful contract, preserving
    // the position can prevent an unknown XX from becoming a hostile partner
    // relationship. This is the strategic counterpart of the published
    // A/B/C examples in TAROKK-ŐR.
    if (h.xxi && !h.skiz && h.tarokks >= 5 && action.contract === 'solo') {
      score += 2;
      reasons.push('XXI legalább 5 tarokkal: a Szóló csak akkor értékes, ha a kéz tényleg megtartja a játékot.');
    }

    // Only XXI is a special defensive profile: when the auction strongly
    // resembles the canonical XXI-under-Skíz sequence, the AI should not
    // volunteer into the highest contract merely because it owns a big honour.
    // A weak XXI is exempt from a hard prohibition: becoming taker may be the
    // best way to secure XX support.
    if (xxiTrap.risk >= 7) {
      if (action.contract === 'solo') score -= 22;
      else if (action.contract === 'one' || action.contract === 'two') score -= 10;
      if (h.tarokks <= 5 && !h.pagat && !h.skiz && action.contract === 'two') score += 22;
      // Weak XXI is the deliberate exception described in TAROKK-ŐR: it may
      // still enter the auction to become taker and secure XX assistance.
      if (h.tarokks <= 5 && (action.contract === 'two' || action.contract === 'one')) score += 18;
      reasons.push(...xxiTrap.reasons);
      reasons.push('Csak XXI: erős fogási veszélyben a licit információs ára és a Skíz mögöttes fenyegetése elsődleges.');
    } else if (xxiTrap.risk >= 4) {
      if (action.contract === 'solo') score -= 10;
      if (h.tarokks <= 5 && (action.contract === 'two' || action.contract === 'one')) score += 12;
      reasons.push('Csak XXI: közepes fogási veszélyben a Szóló csak kivételesen indokolt; gyenge XXI-nél viszont a felvevőség keresése aktív stratégia.');
    }

    // Skíz-side capture pressure: when a public Hármas sits immediately
    // before us, the AI recognises a possible XXI target. This is soft evidence
    // only; the hidden XXI is never assumed to exist. The pressure raises the
    // value of retaining/raising the game, especially with Pagát or XX support.
    if (skizCapture.pressure > 0) {
      if (action.contract === 'two' || action.contract === 'one') score += skizCapture.pressure * 0.8;
      if (action.contract === 'solo' && h.tarokks >= 6) score += skizCapture.pressure * 0.7;
      reasons.push(...skizCapture.reasons);
      reasons.push(`Skíz-oldali fogási nyomás: ${skizCapture.confidence} (${skizCapture.pressure.toFixed(1)}/10).`);
    }

    if (h.skiz && skizCapture.pressure > 0) {
      score += skizSeatProfile.scoreByContract[action.contract];
      reasons.push(...skizSeatProfile.reasons);
    }

    // Skíz is much more aggressive than XXI. With 7+ tarokks the literature
    // explicitly favours drilling an earlier bidder down to Solo.
    if (h.skiz && h.tarokks >= 7) {
      score += action.contract === 'solo' ? 12 : 5;
      reasons.push('Skíz + legalább 7 tarokk: erős felsrófolás, szükség esetén Szólóig.');
    }

    // Skíz + Pagát with 6+ tarokks and no XXI in our hand means the XXI is
    // necessarily outside our hand. The strategic aim is often to prevent a
    // favourable Pagát/XXI structure from being handed to another bidder.
    if (h.skiz && h.pagat && !h.xxi && h.tarokks >= 6 && action.contract === 'solo') {
      score += 10;
      reasons.push('Skíz + Pagát + legalább 6 tarokk: erős Szóló-nyomás, mert a XXI biztosan kívül van a saját kézen.');
    }

    // Both big honours together: Solo is powerful, but the combination also
    // makes the hand unusually information-sensitive. Do not blindly reward
    // every intermediate jump.
    if (h.xxi && h.skiz && h.tarokks >= 6 && action.contract === 'solo') {
      score += 10;
      reasons.push('Skíz + XXI + legalább 6 tarokk: kiemelkedően erős Szóló-helyzet.');
    }

    if (isC && h.xx && h.honours > 0) {
      score -= 6;
      reasons.push('C-hely + XX + honőr: az indokolatlan licit információt adhat a kézről.');
    }

    if (h.xxi && h.xx && pos.relative >= 1 && action.contract === 'solo' && h.tarokks < 7) {
      score -= 4;
      reasons.push('XXI + XX, de nem kiemelkedő tarokkerő: a Szóló információs ára is számít.');
    }

    if (action.contract === 'three' && h.bigHonours === 0) score -= 7;
    if (action.contract === 'solo' && h.bigHonours === 0) score -= 10;
    if (action.contract === 'solo' && h.tarokks < 5) score -= 7;

    // If several opponents have already exposed themselves, the marginal
    // value of an aggressive bid rises because more public information exists.
    if (publicBids >= 2 && h.bigHonours >= 1 && h.tarokks >= 5) score += 1.5;
    if (isD && h.bigHonours >= 1 && h.tarokks >= 5) score += 1;

    // The original opener should not create unnecessary aggression with a
    // marginal hand; retaining a modest contract may be strategically better.
    if (isOpening && action.contract === 'three' && h.honours === 1 && h.tarokks < 5) score -= 4;
  }

  if (activeInvite && canAcceptActiveInvite && action.type !== 'pass') {
    score += 35;
    reasons.push(`Az aktív ${rankName(activeInvite.target)}-invit fogadója vagyunk: az invit elfogadása erős, szabályból következő partneri kötelesség.`);
    const candidates = invitePartners.filter(c => c.playerId !== currentPlayerId);
    if (candidates.length) {
      const likely = candidates[0]!;
      reasons.push(`Az invitáló ${likely.inviterId}; a fogadó-felvevő kiléte az elfogadással válik egyértelművé.`);
    }
  }
  if (activeInvite && !canAcceptActiveInvite && action.type !== 'pass') {
    score -= 100;
  }

  if (action.type === 'invite') {
    score = 2 + Math.min(h.tarokks, 8) * 0.8;
    if (h.honours === 0) {
      score -= 100;
      reasons.push('Honőr nélküli kéz: invit nélkül, tisztán szerkezeti erőre támaszkodni nem indokolt.');
    }
    const bidSeq = auction.records
      .filter((r): r is typeof r & { action: Extract<AuctionAction, { type: 'bid' }> } => r.action.type === 'bid')
      .map(r => r.action.contract);
    const isThreeTwoOneXixInvite = action.target === 19
      && bidSeq[0] === 'three' && bidSeq[1] === 'two' && bidSeq[2] === 'one'
      && auction.records.find((r): r is typeof r & { action: Extract<AuctionAction, { type: 'bid' }> } => r.action.type === 'bid' && r.action.contract === 'three')?.playerId === auction.seats[auction.currentSeat]?.playerId;
    if (isThreeTwoOneXixInvite) {
      score += 12;
      reasons.push('3–2–1 után a Hármasos XIX-invit: partneri együttműködést hoz létre, nem egyszerű Szóló-emelés.');
      if (h.xxi || h.skiz) score += 8;
      if (!h.xxi && !h.skiz) score -= 35;
      const candidates = inferInvitePartnerCandidates(auction);
      if (candidates.length) {
        reasons.push(`Az invit után ${candidates.length} még lehetséges fogadó marad; a pontos partner csak az elfogadással azonosítható.`);
      }
    }
    if (h.tarokks < 5) score -= 100;
    if (action.target === 19 && h.xix) score += 8;
    if (action.target === 18 && h.xviii) score += 8;
    if (action.target === 20 && h.xx) score -= 10;
    if ((action.target === 19 && !h.xix) || (action.target === 18 && !h.xviii)) score -= 100;
    reasons.push(`Az ${rankName(action.target)}-invit csak valódi meghívható tarokkal és legalább 5 tarokkal kap magas stratégiai értéket.`);
  }

  if (action.type === 'hold') {
    score = 5 + h.honours + Math.min(h.tarokks, 8) * 0.6;
    if (canonical321 && currentIsFirstBidder && h.xxi && !h.skiz && h.tarokks <= 5) {
      score += 40;
      reasons.push('3–2–1 után gyenge XXI-ként a tartás a kiemelt védelmi döntés.');
    }
    if (weakPagat) {
      score += 10;
      reasons.push('Gyenge, védtelen Pagát: a már magasra vitt játék megtartása veszteségminimalizáló lehet; a felvevői oldal előnyösebb lehet, mint az ellenoldali nagyfigurák ellen játszani.');
    }
    if (h.bigHonours === 2) score += 3;
    if (h.tarokks >= 5) score += 2;

    if (weakPagat) score -= 2;
    if (h.xxi && !h.skiz && h.tarokks >= 5) score += 3;
    if (h.skiz && h.tarokks >= 7) score += 7;
    reasons.push('A tartás megőrzi a már megszerzett licithelyzetet, miközben nem ad fölösleges új információt.');
  }

  if (action.type === 'hold-invite') {
    score = 8 + Math.min(h.tarokks, 8) * 0.5;
    if ((action.target === 19 && h.xix) || (action.target === 18 && h.xviii)) score += 7;
    reasons.push(`Az ${rankName(action.target)}-invit elfogadása tényleges lapbirtokláshoz kötött; ez erős partneri információ.`);
  }

  if (posture === 'loss-minimising') {
    if (action.type === 'bid' && action.contract === 'solo' && weakPagat) score += 6;
    if (action.type === 'hold' && weakPagat) score += 4;
    if (action.type === 'bid' && action.contract === 'three' && weakPagat) score -= 5;
  } else if (posture === 'profit-maximising') {
    if (action.type === 'bid' && action.contract === 'solo') score += 5;
    if (action.type === 'pass') score -= 5;
  }
  if (exposureRisk > 0 && weakPagat && action.type === 'bid' && action.contract !== 'solo') {
    score -= exposureRisk * 0.8;
    reasons.push(`A nyilvános licit alapján a Pagát ellenoldali kitettsége nő (${exposureRisk.toFixed(0)} kockázati egység); ezért a drágább, de felvevői oldalt biztosító játék előnyt kap.`);
  }
  return { action, score, reasons };
}

function hasTarokk(hand: Card[], rank: number): boolean {
  return hand.some(c => isTarokk(c) && c.rank === rank);
}

function rankName(rank: number): string {
  const names: Record<number, string> = { 22: 'Skíz', 21: 'XXI', 20: 'XX', 19: 'XIX', 18: 'XVIII', 17: 'XVII' };
  return names[rank] ?? String(rank);
}
