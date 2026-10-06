import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, legalAuctionActions, applyAuctionAction } from '../src/engine/auction.js';
import { createDeclarationWindow, legalDeclarationActions, applyDeclarationAction } from '../src/engine/declarationWindow.js';
import { createInitialState, playCard } from '../src/engine/game.js';
import { figureSettlementsFromProgress } from '../src/engine/settlement.js';
const t = rank => ({ id:`T${rank}`, kind:'tarokk', rank, points:5 });

const full = (...tarokks) => tarokks;

test('v2.61 opening Solo action stays a plain bid, not an invite label/action', async () => {
  const { createAuction, legalAuctionActions } = await import('../src/engine/auction.js');
  const auction = createAuction(['A','B','C','D'], 0);
  const t = rank => ({kind:'tarokk',rank,id:`T${rank}`,points:rank===21||rank===22?5:1});
  const hand = [t(22),t(21),t(20),t(19),t(18),t(17),t(16),t(15)];
  const hands = {A:hand,B:hand,C:hand,D:hand};
  const actions = legalAuctionActions(auction, 'A', hands);
  assert.ok(actions.some(a => a.type === 'bid' && a.contract === 'solo'));
  assert.equal(actions.some(a => a.type === 'invite'), false);
});
test('v2.61 first-speaker plain Solo is never exposed as an invite', async () => {
  const { createAuction, legalAuctionActions } = await import('../src/engine/auction.js');
  const h=(ranks)=>ranks.map((rank,i)=>({kind:'tarokk',rank,id:`s${rank}-${i}`,points:rank===1||rank>=21?5:1}));
  const hands={A:h([22,20,19,18,17,16,15,14,13]),B:h([21,19,18,17,16,15,14,13,12]),C:h([21,19,18,17,16,15,14,13,12]),D:h([21,19,18,17,16,15,14,13,12])};
  const a=createAuction(['A','B','C','D'],0);
  const actions=legalAuctionActions(a,'A',hands);
  assert.ok(actions.some(x=>x.type==='bid'&&x.contract==='solo'));
  assert.equal(actions.some(x=>x.type==='invite'),false);
});

test('v2.61 normal Pass is still available to an honourless player', () => {
  const a=createAuction(['A','B','C','D'],0);
  const hands={A:[t(22),t(21),t(20),t(19),t(18),t(17),t(16),t(15)],B:[t(10),t(9),t(8),t(7),t(6),t(5),t(4),t(3)],C:[],D:[]};
  const s={...a,records:[{playerId:'A',action:{type:'bid',contract:'three'}}],highest:{playerId:'A',contract:'three',seat:0},holdOwnerId:'A',currentSeat:1};
  assert.ok(legalAuctionActions(s,'B',hands).some(a=>a.type==='pass'));
});

test('v2.61 after 3-2 first speaker cannot plain-pass and may Engedés only with XX+5 tarokks+big honour', () => {
  const a=createAuction(['A','B','C','D'],0);
  const good={A:[t(22),t(21),t(20),t(19),t(18),t(17),t(16),t(15)],B:[t(22),t(21),t(20),t(19),t(18),t(17),t(16),t(15)],C:[],D:[]};
  const goodState={...a,records:[{playerId:'A',action:{type:'bid',contract:'three'}},{playerId:'B',action:{type:'bid',contract:'two'}}],highest:{playerId:'B',contract:'two',seat:1},holdOwnerId:'A',currentSeat:0};
  const goodActs=legalAuctionActions(goodState,'A',good);
  assert.ok(!goodActs.some(x=>x.type==='pass'));
  assert.ok(goodActs.some(x=>x.type==='invite'&&x.target===20));
  const bad={...good,A:[t(22),t(21),t(19),t(18),t(17),t(16),t(15),t(14)]};
  const badActs=legalAuctionActions(goodState,'A',bad);
  assert.ok(!badActs.some(x=>x.type==='pass'));
  assert.ok(!badActs.some(x=>x.type==='invite'&&x.target===20));
});

test('v2.61 one-speaker Three closes after the third other Pass', () => {
  const a=createAuction(['A','B','C','D'],0);
  const hands={A:[t(22),t(21),t(20),t(19),t(18),t(17),t(16),t(15)],B:[t(10)],C:[t(12)],D:[t(13)]};
  let s=a; s=applyAuctionAction(s,{type:'bid',contract:'three'},hands); s=applyAuctionAction(s,{type:'pass'},hands); s=applyAuctionAction(s,{type:'pass'},hands); s=applyAuctionAction(s,{type:'pass'},hands); assert.equal(s.finished,true); assert.equal(s.highest?.contract,'three');
});

test('v2.61 multiple distinct declarations can be made in one speaking turn', () => {
  const hand=[t(22),t(21),t(20),t(19),t(18)];
  let w=createDeclarationWindow(['A','B','C','D'],true);
  const ctx={isTaker:true,firstRound:true,previousDeclarations:[],partnersKnown:true,pairId:'taker:A'};
  const first=legalDeclarationActions(w,'A',hand,ctx).find(a=>a.type==='declare'&&a.declaration==='tuletroa'); assert.ok(first);
  w=applyDeclarationAction(w,first,hand);
  const second=legalDeclarationActions(w,'A',hand,{...ctx,previousDeclarations:w.records.filter(x=>x.type==='declare').map(x=>x.declaration),pairId:'taker:A'}).find(a=>a.type==='declare'&&a.declaration==='fourKings');
  assert.ok(second);
});

test('v2.61 declaration contra and recontra are available to the respective side', async () => {
  const { canRaiseDeclarationContraInGame, raiseDeclarationContraInGame } = await import('../src/engine/game.js');
  const d={id:'d1',type:'centrum',ownerId:'A',status:'active',contra:{level:'none',target:'centrum',records:[]}};
  const base={phase:'declarations',takerId:'A',partnerId:'B',players:[{id:'A'},{id:'B'},{id:'C'},{id:'D'}],declarations:{declarations:[d]}};
  assert.equal(canRaiseDeclarationContraInGame(base,'d1','C'),true);
  const c=raiseDeclarationContraInGame(base,'d1','C');
  assert.equal(canRaiseDeclarationContraInGame(c,'d1','A'),true);
  const r=raiseDeclarationContraInGame(c,'d1','A');
  assert.equal(r.declarations.declarations[0].contra.level,'rekontra');
});

test('v2.61 silent Sas Ultimo is not counted when Sas is played before trick 9', async () => {
  const { initialDeclarationProgress, evaluateDeclarations } = await import('../src/engine/declarationLifecycle.js');
  const progress=initialDeclarationProgress();
  const trick=[{winner:'D',cards:[{player:'A',card:t(2)},{player:'D',card:t(22)}]}];
  const updated=evaluateDeclarations(progress,trick,id=>id==='A'?'taker':'defence',1, {t:0,defence:0});
  const figures=figureSettlementsFromProgress(updated,'A','B');
  assert.equal(figures.some(f=>f.type==='sasUltimo'&&f.silent===true),false);
});

test('v2.61 silent Sas Ultimo is worth 5 points when won by its holder on trick 9', async () => {
  const { initialDeclarationProgress, evaluateDeclarations } = await import('../src/engine/declarationLifecycle.js');
  const progress=initialDeclarationProgress();
  const tricks=Array.from({length:8},(_,i)=>({winner:'D',cards:[{player:'D',card:{id:`m${i}`,kind:'suit',suit:'hearts',rank:'A',points:1}}]}));
  tricks.push({winner:'A',cards:[{player:'A',card:t(2)},{player:'D',card:{id:'m8',kind:'suit',suit:'hearts',rank:'A',points:1}}]});
  const updated=evaluateDeclarations(progress,tricks,id=>id==='A'?'taker':'defence',9, {t:0,defence:0});
  const figures=figureSettlementsFromProgress(updated,'A','B');
  const sas=figures.find(f=>f.type==='sasUltimo');
  assert.equal(sas?.silent,true);
  assert.equal(sas?.points,5);
  const { settlementLines } = await import('../src/engine/settlement.js');
  const lines=settlementLines({contract:'three',takerPairWon:true,takerTrickPoints:40,gameContra:'none',figures});
  assert.equal(lines.find(x=>x.type==='sasUltimo')?.points,5);
});

test('v2.61 declaration window opens a second round after every player closes their first turn without creating three consecutive passes', async () => {
  const { createDeclarationWindow, legalDeclarationActions, applyDeclarationAction } = await import('../src/engine/declarationWindow.js');
  const hand=[t(22),t(21),t(20),t(19),t(18)];
  let w=createDeclarationWindow(['A','B','C','D'],true);
  for(const id of ['A','B','C','D']) {
    const actions=legalDeclarationActions(w,id,hand,{isTaker:id==='A',previousDeclarations:[],partnersKnown:true});
    const declaration=actions.find(a=>a.type==='declare'&&a.declaration==='tuletroa');
    assert.ok(declaration);
    w=applyDeclarationAction(w,declaration,hand);
    assert.equal(w.currentIndex,['A','B','C','D'].indexOf(id));
    assert.ok(legalDeclarationActions(w,id,hand,{isTaker:id==='A',previousDeclarations:["tuletroa"],partnersKnown:true}).some(a=>a.type==='pass'));
    w=applyDeclarationAction(w,{type:'pass',playerId:id},hand);
  }
  assert.equal(w.finished,false);
  assert.equal(w.roundNumber,2);
  assert.equal(w.firstRound,false);
  assert.equal(w.currentIndex,0);
  assert.ok(legalDeclarationActions(w,'A',hand,{isTaker:true,previousDeclarations:[],partnersKnown:true}).some(a=>a.type==='declare'));
});

test('v2.61 final scoring has a settlement once the game carries the contract', async () => {
  // Build a compact all-trump 9-card play state and verify the last card closes scoring.
  const ids=['A','B','C','D'];
  let s=createInitialState(ids,0);
  const cards=[];
  for(let r=1;r<=22;r++) cards.push(t(r));
  for(const suit of ['hearts','diamonds','spades','clubs']) for(const rank of ['K','Q','C','J','10']) cards.push({id:`${suit}-${rank}`,kind:'suit',suit,rank,points:rank==='K'?5:rank==='Q'?4:rank==='C'?3:rank==='J'?2:1});
  const deal=cards.slice(0,36);
  s={...s,phase:'play',contract:'three',takerId:'A',partnerId:'B',calledTarokk:20,players:ids.map((id,i)=>({...s.players[i],id,active:true,hand:deal.slice(i*9,i*9+9)})),trick:{leader:'A',cards:[]},nextPlayerIndex:0,completedTricks:[],leadSuit:null,skartsByPlayer:{A:[],B:[],C:[],D:[]}};
  let guard=36;
  while(s.phase==='play'&&guard-->0){
    const pid=s.players[s.nextPlayerIndex].id;
    const card=s.players[s.nextPlayerIndex].hand[0];
    // Choose the first legal card for each turn.
    const { legalCardsForPlay }=await import('../src/engine/game.js');
    const legal=legalCardsForPlay(s,pid); assert.ok(legal.length>0);
    s=playCard(s,pid,legal[0].id);
  }
  assert.equal(s.phase,'scoring');
  assert.ok(s.settlement);
  assert.ok(s.finalPoints);
});


test('v2.61 UI never fabricates a Pass that the server did not authorize', async () => {
  const { readFile } = await import('node:fs/promises');
  const ui = await readFile(new URL('../src/ui/multiplayer.js', import.meta.url), 'utf8');
  assert.equal(ui.includes("auctionActions.unshift({type:'pass'})"), false);
});

test('v2.61 third speaker with Skíz receives the next ordinary bid', () => {
  const handWith = (ranks) => ranks.map((rank,i)=>({kind:'tarokk',rank,id:`${rank}-${i}`,points:[1,21,22].includes(rank)?5:1}));
  const hands={A:handWith([21,18,17,16,15]),B:handWith([19,18,17,16,15]),C:handWith([20,18,17,16,15]),D:handWith([22,19,18,17,16])};
  let a=createAuction(['A','B','C','D'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'D');
  assert.ok(legalAuctionActions(a,'D',hands).some(x=>x.type==='bid'&&x.contract==='two'));
});

test('v2.61 Engedés resolves to a Kettő winner and mandatory XX partner call', async () => {
  const h=(ranks)=>ranks.map((rank,i)=>({kind:'tarokk',rank,id:`${rank}-${i}`,points:[1,21,22].includes(rank)?5:1}));
  const hands={A:h([22,20,19,18,17,16,15,14]),B:h([21,19,18,17,16,15,14,13]),C:h([21,19,18,17,16,15,14,13]),D:h([21,19,18,17,16,15,14,13])};
  let a=createAuction(['A','B','C','D'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'invite',target:20,contract:'two'},hands);
  assert.equal(a.finished,true);
  const { resolveAuctionOutcome } = await import('../src/engine/auctionOutcome.js');
  const out=resolveAuctionOutcome(a,hands,[]);
  assert.equal(out.takerId,'B');
  assert.equal(out.contract,'two');
  assert.equal(out.calledTarokk,20);
  assert.equal(out.requiredPartnerCallId,'A');
});
