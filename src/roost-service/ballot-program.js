/**
 * Ballot counting: pure. One ballot per roll member (a later ballot from the same member replaces an earlier one), a quorum,
 * and a majority or plurality rule. The result carries the winner and the reason a ballot was not decided, never a tally.
 *
 * A ballot is { flyerId, choice, order }; choice is an option id or 'abstain'. Ballots from outside the roll are ignored and
 * reported by account; ballots for an unknown option are spoiled and do not count toward the quorum; abstaining counts toward
 * the quorum but not toward the majority.
 */
export function clearBallot({ options, roll, ballots, quorumBps, rule = 'majority' }) {
  if (rule !== 'majority' && rule !== 'plurality') throw new Error("rule must be 'majority' or 'plurality'");
  if (!Number.isSafeInteger(quorumBps) || quorumBps < 0 || quorumBps > 10000) throw new Error('quorumBps must be 0 to 10000');
  const rollSet = new Set(roll); const valid = new Set([...options, 'abstain']);
  const outsiders = []; let duplicates = 0; let spoiled = 0;
  const latest = new Map();
  ballots.forEach((b, i) => {
    if (!rollSet.has(b.flyerId)) { if (!outsiders.includes(b.flyerId)) outsiders.push(b.flyerId); return; }
    const prev = latest.get(b.flyerId);
    if (prev) { duplicates += 1; if (b.order < prev.order) return; }
    latest.set(b.flyerId, { ...b, index: i });
  });
  const counted = [];
  for (const b of latest.values()) { if (valid.has(b.choice)) counted.push(b); else spoiled += 1; }
  const base = { spoiled, outsiders, duplicates };
  const cast = counted.length;
  const quorumMet = cast * 10000 >= quorumBps * roll.length;
  if (!quorumMet) return { ...base, decided: false, winner: null, reason: 'no-quorum', quorumMet };
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  for (const b of counted) if (b.choice !== 'abstain') counts[b.choice] += 1;
  const nonAbstain = counted.filter((b) => b.choice !== 'abstain').length;
  const top = Math.max(0, ...Object.values(counts)); const leaders = options.filter((o) => counts[o] === top);
  if (nonAbstain === 0) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  if (leaders.length !== 1) return { ...base, decided: false, winner: null, reason: 'tie', quorumMet };
  if (rule === 'majority' && !(top * 2 > nonAbstain)) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  return { ...base, decided: true, winner: leaders[0], reason: null, quorumMet };
}
