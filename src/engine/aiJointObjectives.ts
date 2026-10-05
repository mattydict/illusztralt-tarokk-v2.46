/**
 * Joint objective arbitration for figure play.
 *
 * The portfolio already knows whether a candidate helps own, partner and
 * opponent figure objectives. This layer asks a narrower question: does the
 * SAME card line improve several objectives at once?  It therefore rewards
 * genuine overlap, rather than simply counting positive objectives.
 */
export interface JointObjectiveInputs {
  declaredOwn: number;
  declaredPartner: number;
  silentOwn: number;
  silentPartner: number;
  opponentDisruption: number;
}

export interface JointObjectiveAssessment {
  score: number;
  reasons: string[];
  bundleStrength: number;
}

const positive = (value: number): number => Math.max(0, value);

function pairStrength(a: number, b: number, divisor = 18): number {
  const aa = positive(a);
  const bb = positive(b);
  if (aa <= 0 || bb <= 0) return 0;
  return Math.min(1, Math.min(aa, bb) / divisor);
}

/**
 * Score real multi-goal overlap. The result is intentionally bounded because
 * tactical play, deadlines and settlement remain stronger authorities.
 */
export function assessJointObjectivePlay(input: JointObjectiveInputs): JointObjectiveAssessment {
  const ownDeclared = positive(input.declaredOwn);
  const partnerDeclared = positive(input.declaredPartner);
  const ownSilent = positive(input.silentOwn);
  const partnerSilent = positive(input.silentPartner);
  const disruption = positive(input.opponentDisruption);

  let score = 0;
  const reasons: string[] = [];
  let bundleStrength = 0;

  const ownDeclaredAndSilent = pairStrength(ownDeclared, ownSilent, 16);
  if (ownDeclaredAndSilent > 0) {
    const value = ownDeclaredAndSilent * 3.5;
    score += value;
    bundleStrength += ownDeclaredAndSilent;
    if (value >= 1.5) reasons.push('A kijátszás ugyanazt a saját deklarált és csendes célvonalat erősíti.');
  }

  const partnerBundle = pairStrength(partnerDeclared, partnerSilent, 16);
  if (partnerBundle > 0) {
    const value = partnerBundle * 4.5;
    score += value;
    bundleStrength += partnerBundle;
    if (value >= 1.5) reasons.push('A partner deklarált és csendes figuráját ugyanaz a kijátszás támogatja.');
  }

  const ownAndPartner = pairStrength(Math.max(ownDeclared, ownSilent), Math.max(partnerDeclared, partnerSilent), 20);
  if (ownAndPartner > 0) {
    const value = ownAndPartner * 3.25;
    score += value;
    bundleStrength += ownAndPartner;
    if (value >= 1.5) reasons.push('A saját és partneri figuraút ugyanazzal a lappal közös ütésvonalba rendezhető.');
  }

  const partnerAndDisruption = pairStrength(Math.max(partnerDeclared, partnerSilent), disruption, 18);
  if (partnerAndDisruption > 0) {
    const value = partnerAndDisruption * 3.0;
    score += value;
    bundleStrength += partnerAndDisruption;
    if (value >= 1.5) reasons.push('A partner támogatása közben az ellenfél csendes figurája is sérül.');
  }

  const ownAndDisruption = pairStrength(Math.max(ownDeclared, ownSilent), disruption, 20);
  if (ownAndDisruption > 0) {
    const value = ownAndDisruption * 2.25;
    score += value;
    bundleStrength += ownAndDisruption;
    if (value >= 1.5) reasons.push('A saját figura építése egyben ellenfél-figura blokkolásával jár.');
  }

  // Three-way overlap is qualitatively better than three unrelated positives.
  const threeWay = Math.min(
    positive(Math.max(ownDeclared, ownSilent)),
    positive(Math.max(partnerDeclared, partnerSilent)),
    disruption,
  ) / 20;
  if (threeWay > 0) {
    const value = Math.min(3.5, threeWay * 3.5);
    score += value;
    bundleStrength += threeWay;
    if (value >= 1.2) reasons.push('Háromirányú közös cél: saját/partneri építés és ellenfél-blokkolás egyszerre javul.');
  }

  return {
    score: Math.max(0, Math.min(14, score)),
    reasons: [...new Set(reasons)].slice(0, 4),
    bundleStrength: Math.max(0, Math.min(4, bundleStrength)),
  };
}
