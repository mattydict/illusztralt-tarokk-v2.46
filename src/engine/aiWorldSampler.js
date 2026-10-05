/**
 * Deterministic stratified sampling over the complete belief distribution.
 *
 * The play engine may have up to 64 beam worlds but only a small interactive
 * rollout budget. Taking the first N worlds silently discards the lower-tail
 * probability mass. This sampler instead places evenly spaced quantiles over
 * the full distribution, so every part of the belief beam can influence the
 * rollout while keeping candidate comparisons identical.
 */
export function selectBeliefWorlds(worlds, limit, seed) {
    if (!worlds.length)
        return [];
    const count = Math.max(1, Math.min(limit, worlds.length));
    const normalized = normalize(worlds);
    if (count === worlds.length) {
        return normalized.map((world, sourceIndex) => ({ world, sourceIndex, weight: world.weight }));
    }
    // A tiny deterministic phase shift avoids repeatedly hitting exact beam
    // boundaries while remaining fully reproducible for all candidate cards.
    const phase = ((mix(seed) % 997) / 997) * 0.20;
    const selected = [];
    for (let i = 0; i < count; i += 1) {
        const q = Math.min(0.999999, (i + 0.5 + phase) / count);
        const index = cumulativeIndex(normalized, q);
        const world = normalized[index];
        selected.push({ world, sourceIndex: index, weight: 1 / count });
    }
    return selected;
}
export function normalizeBeliefWeights(worlds) {
    return normalize(worlds);
}
function normalize(worlds) {
    const positive = worlds.map(world => ({ ...world, weight: Math.max(0, Number.isFinite(world.weight) ? world.weight : 0) }));
    const total = positive.reduce((sum, world) => sum + world.weight, 0);
    if (total <= 0) {
        const equal = 1 / positive.length;
        return positive.map(world => ({ ...world, weight: equal }));
    }
    return positive.map(world => ({ ...world, weight: world.weight / total }));
}
function cumulativeIndex(worlds, quantile) {
    let cumulative = 0;
    for (let i = 0; i < worlds.length; i += 1) {
        cumulative += worlds[i].weight;
        if (quantile <= cumulative || i === worlds.length - 1)
            return i;
    }
    return worlds.length - 1;
}
function mix(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}
