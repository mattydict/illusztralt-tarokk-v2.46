/**
 * Build auditable supervised-learning examples from completed illustrated-tarokk
 * deal reviews. Every feature is restricted to information available to the acting
 * player at the decision point. Opponent hands, future plays and result fields are
 * kept out of `features` and are used only as labels/outcomes.
 */

function cardCopy(card) {
  if (!card || typeof card !== 'object') return null;
  const result = { id: String(card.id ?? '') };
  if (card.kind !== undefined) result.kind = card.kind;
  if (card.rank !== undefined) result.rank = card.rank;
  if (card.suit !== undefined) result.suit = card.suit;
  if (card.points !== undefined) result.points = card.points;
  return result;
}

function cardList(cards) {
  return (Array.isArray(cards) ? cards : []).map(cardCopy).filter(Boolean);
}

function uniqueCards(cards) {
  const seen = new Set();
  return cardList(cards).filter(card => {
    if (!card.id || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function withoutCards(cards, removed) {
  const ids = new Set((Array.isArray(removed) ? removed : []).map(card => typeof card === 'string' ? card : card?.id).filter(Boolean));
  return uniqueCards(cards).filter(card => !ids.has(card.id));
}

function safeAction(action) {
  if (!action || typeof action !== 'object') return {};
  // Auction actions are public. Whitelist fields rather than copying arbitrary
  // state that could accidentally include private cards in future versions.
  const allowed = ['type', 'contract', 'honourless', 'inviteTarget', 'target', 'invitationSignalTarget', 'acceptsInviteTarget'];
  return Object.fromEntries(allowed.filter(key => action[key] !== undefined).map(key => [key, action[key]]));
}

function publicDeclaration(declaration) {
  const allowed = ['order', 'type', 'ownerId', 'contra', 'targetCardId', 'trickNumber'];
  return Object.fromEntries(allowed.filter(key => declaration?.[key] !== undefined).map(key => [key, declaration[key]]));
}

function archiveParts(deal) {
  const review = deal?.review ?? deal;
  if (!review || typeof review !== 'object') return null;
  const sourceRoomId = deal?.roomId ?? review.roomId ?? 'unknown-room';
  const dealNumber = Number(deal?.dealNumber ?? review.dealNumber ?? 0);
  const players = Array.isArray(review.players) ? review.players : [];
  const playerById = new Map(players.filter(p => p?.playerId).map(p => [String(p.playerId), p]));
  const initialHands = new Map();
  const postSkartHands = new Map();
  const skartHands = new Map();
  for (const player of players) {
    const id = String(player.playerId);
    const dealt = uniqueCards(player.dealtHand ?? []);
    const talon = uniqueCards(player.receivedTalon ?? []);
    const expanded = uniqueCards([...dealt, ...talon]);
    const skart = uniqueCards(player.skart ?? []);
    initialHands.set(id, dealt);
    skartHands.set(id, expanded);
    postSkartHands.set(id, withoutCards(expanded, skart));
  }
  return { review, roomId: String(sourceRoomId), dealNumber, playerById, initialHands, postSkartHands, skartHands };
}

function resultLabel(review) {
  return {
    ...(review?.finalPoints?.result !== undefined ? { result: review.finalPoints.result } : {}),
    ...(review?.finalPoints?.takerPair !== undefined ? { takerPairPoints: review.finalPoints.takerPair } : {}),
    ...(review?.finalPoints?.defencePair !== undefined ? { defencePairPoints: review.finalPoints.defencePair } : {}),
    ...(review?.settlement?.result !== undefined ? { settlementResult: review.settlement.result } : {}),
  };
}

function actorSide(actorId, review) {
  return actorId === review?.takerId || actorId === review?.partnerId ? 'taker-pair' : 'defence-pair';
}

function buildOneDeal(deal) {
  const parts = archiveParts(deal);
  if (!parts) return [];
  const { review, roomId, dealNumber, playerById, initialHands, postSkartHands, skartHands } = parts;
  const dealId = `${roomId}:${dealNumber}`;
  const baseOutcome = resultLabel(review);
  const examples = [];
  let step = 0;
  const add = (kind, actorId, features, label, outcome = {}) => {
    if (!actorId || !features || !label) return;
    examples.push({
      schemaVersion: 1,
      exampleId: `${dealId}:${kind}:${++step}`,
      dealId,
      kind,
      actorId: String(actorId),
      features,
      label,
      outcome: { ...baseOutcome, ...outcome },
    });
  };

  // Auction: only the acting player's original hand and earlier public bids enter features.
  const auction = Array.isArray(review.auction) ? review.auction : [];
  const auctionSoFar = [];
  for (const item of auction) {
    const actorId = String(item?.playerId ?? '');
    const hand = initialHands.get(actorId);
    if (hand) {
      add('auction', actorId, {
        phase: 'auction',
        hand: cardList(hand),
        priorAuction: auctionSoFar.map(record => ({ playerId: record.playerId, action: safeAction(record.action) })),
      }, { action: safeAction(item.action) });
    }
    if (item?.playerId) auctionSoFar.push({ playerId: String(item.playerId), action: item.action ?? {} });
  }

  // Skart choice. The selected cards are labels; features contain the actor's
  // own expanded hand and public auction history, never other players' talons/skarts.
  const auctionHistory = auction.map(item => ({ playerId: item.playerId, action: safeAction(item.action) }));
  for (const [actorId, expandedHand] of skartHands) {
    const player = playerById.get(actorId);
    const receivedTalon = uniqueCards(player?.receivedTalon ?? []);
    const selectedSkart = uniqueCards(player?.skart ?? []);
    // In this four-player ruleset, only the taker receives the talon and chooses
    // the skart. Empty arrays on defenders are not skart decisions and must not
    // become fake training examples.
    if (!player || actorId !== String(review.takerId ?? '') || receivedTalon.length === 0 || selectedSkart.length === 0) continue;
    add('skart', actorId, {
      phase: 'skart',
      hand: cardList(expandedHand),
      ownReceivedTalon: cardList(receivedTalon),
      priorAuction: auctionHistory,
    }, { cardIds: selectedSkart.map(card => card.id) });
  }

  // Partner call: target rank is treated as the action label, not as an input.
  if (review.takerId && review.calledTarokk !== undefined && review.calledTarokk !== null) {
    const actorId = String(review.takerId);
    const hand = postSkartHands.get(actorId);
    if (hand) add('partner-call', actorId, {
      phase: 'partner-call',
      hand: cardList(hand),
      contract: review.contract ?? null,
      priorAuction: auctionHistory,
    }, { calledTarokk: Number(review.calledTarokk) });
  }

  // Declarations are recorded as explicit positive actions. Pass/no-declaration
  // decisions cannot reliably be inferred because legacy reviews did not store them.
  const declarations = Array.isArray(review.declarations) ? review.declarations : [];
  const declarationsSoFar = [];
  for (const declaration of declarations) {
    const actorId = String(declaration?.ownerId ?? '');
    const hand = postSkartHands.get(actorId);
    if (hand) {
      add('declaration', actorId, {
        phase: 'declarations',
        hand: cardList(hand),
        contract: review.contract ?? null,
        takerId: review.takerId ?? null,
        // partnerId is deliberately omitted: archives know the actual partner,
        // but that identity may not yet be known to the acting player.
        priorAuction: auctionHistory,
        priorDeclarations: declarationsSoFar.map(publicDeclaration),
      }, {
        declaration: declaration.type,
        ...(declaration.targetCardId ? { targetCardId: declaration.targetCardId } : {}),
        ...(declaration.contra !== undefined ? { contra: declaration.contra } : {}),
      }, { declarationStatus: declaration.status ?? 'unknown' });
    }
    declarationsSoFar.push(declaration);
  }

  // Trick-by-trick play. Maintain each private hand by removing that actor's
  // earlier card choices; current and completed tricks contain only public cards.
  const liveHands = new Map([...postSkartHands.entries()].map(([id, hand]) => [id, cardList(hand)]));
  const completedTricks = [];
  const priorPlayedCards = [];
  const tricks = Array.isArray(review.tricks) ? review.tricks : [];
  for (const [trickIndex, trick] of tricks.entries()) {
    const cardsInTrick = [];
    const played = Array.isArray(trick?.cards) ? trick.cards : [];
    for (const cardRecord of played) {
      const actorId = String(cardRecord?.player ?? '');
      const hand = liveHands.get(actorId) ?? [];
      const card = cardCopy(cardRecord?.card);
      if (card) {
        const side = actorSide(actorId, review);
        const winnerSide = trick?.winner ? actorSide(String(trick.winner), review) : undefined;
        add('play-card', actorId, {
          phase: 'play',
          hand: cardList(hand),
          contract: review.contract ?? null,
          takerId: review.takerId ?? null,
          // Do not expose the true partner ID in features. It is retained only
          // for outcome labels and may be hidden from players at this point.
          calledTarokk: review.calledTarokk ?? null,
          trickNumber: Number(trick?.number ?? trickIndex + 1),
          leader: trick?.leader ?? null,
          currentTrick: cardsInTrick.map(item => ({ playerId: item.playerId, card: cardCopy(item.card) })),
          completedTricks: completedTricks.map(item => ({ number: item.number, leader: item.leader, winner: item.winner, cards: item.cards.map(c => ({ playerId: c.playerId, card: cardCopy(c.card) })) })),
          priorPlayedCards: priorPlayedCards.map(item => ({ trickNumber: item.trickNumber, playerId: item.playerId, card: cardCopy(item.card) })),
          declarations: declarations.map(publicDeclaration),
        }, { cardId: card.id }, {
          trickNumber: Number(trick?.number ?? trickIndex + 1),
          trickWinner: trick?.winner ?? null,
          ...(winnerSide ? { wonTrickForActorSide: side === winnerSide } : {}),
        });
        liveHands.set(actorId, withoutCards(hand, [card.id]));
        const publicPlay = { trickNumber: Number(trick?.number ?? trickIndex + 1), playerId: actorId, card };
        cardsInTrick.push(publicPlay);
        priorPlayedCards.push(publicPlay);
      }
    }
    completedTricks.push({
      number: Number(trick?.number ?? trickIndex + 1),
      leader: trick?.leader ?? null,
      winner: trick?.winner ?? null,
      cards: cardsInTrick.map(item => ({ playerId: item.playerId, card: item.card })),
    });
  }

  return examples;
}

export function buildDealLearningDataset(deals) {
  const examples = [];
  const skipped = [];
  for (const [index, deal] of (Array.isArray(deals) ? deals : []).entries()) {
    try {
      const rows = buildOneDeal(deal);
      if (!rows.length) skipped.push({ index, reason: 'missing-review-or-decisions' });
      examples.push(...rows);
    } catch (error) {
      skipped.push({ index, reason: error instanceof Error ? error.message : 'invalid-deal' });
    }
  }
  const byKind = {};
  for (const example of examples) byKind[example.kind] = (byKind[example.kind] ?? 0) + 1;
  return {
    schemaVersion: 1,
    stats: { dealCount: (Array.isArray(deals) ? deals : []).length, exampleCount: examples.length, byKind, skippedDealCount: skipped.length },
    examples,
    skipped,
  };
}
