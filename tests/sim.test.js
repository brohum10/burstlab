import assert from 'node:assert/strict';
import test from 'node:test';
import { BinaryHeap, analyzeScenario, bootstrapMean, generateTraffic, rngFromSeed, simulate } from '../src/sim.js';

const ticket = (id, arrival, service, priority = 'routine') => ({ id, arrival, service, priority });

test('binary heap returns values in comparator order', () => {
  const heap = new BinaryHeap((a, b) => a - b);
  [9, 2, 5, 1, 7, 3].forEach((x) => heap.push(x));
  assert.deepEqual(Array.from({ length: 6 }, () => heap.pop()), [1, 2, 3, 5, 7, 9]);
  assert.equal(heap.pop(), undefined);
});

test('urgent-first changes dispatch order without changing the workload', () => {
  const tickets = [ticket('A', 0, 11), ticket('B', 0, 2, 'urgent')];
  const fifo = simulate(tickets, { agents: 1, policy: 'fifo' });
  const priority = simulate(tickets, { agents: 1, policy: 'urgent-first' });
  assert.equal(fifo.urgent.missRate, 1);
  assert.equal(priority.urgent.missRate, 0);
  assert.equal(fifo.records.find((x) => x.id === 'B').wait, 11);
  assert.equal(priority.records.find((x) => x.id === 'A').wait, 2);
  assert.deepEqual(tickets, [ticket('A', 0, 11), ticket('B', 0, 2, 'urgent')]);
});

test('running work is never preempted', () => {
  const tickets = [ticket('A', 0, 20), ticket('B', 1, 2, 'urgent')];
  const result = simulate(tickets, { agents: 1, policy: 'urgent-first' });
  assert.equal(result.records.find((x) => x.id === 'B').start, 20);
  assert.equal(result.records.find((x) => x.id === 'B').wait, 19);
});

test('arrival at completion starts without waiting', () => {
  const result = simulate([ticket('A', 0, 5), ticket('B', 5, 2)],
                          { agents: 1, policy: 'fifo', horizon: 10 });
  assert.equal(result.records.find((x) => x.id === 'B').wait, 0);
  assert.equal(result.maxWaiting, 0);
});

test('two agents start two simultaneous tasks', () => {
  const result = simulate([ticket('A', 0, 8), ticket('B', 0, 8)],
                          { agents: 2, policy: 'fifo', horizon: 10 });
  assert.equal(result.all.meanWait, 0);
  assert.equal(result.busyFraction, 1);
});

test('empty workload yields honest null metrics', () => {
  const result = simulate([], { agents: 2, policy: 'fifo' });
  assert.equal(result.ticketCount, 0);
  assert.equal(result.urgent.missRate, null);
  assert.equal(result.all.p90Wait, null);
  assert.equal(result.busyFraction, 0);
  assert.ok(result.timeline.every((x) => x.waiting === 0));
});

test('sampled timeline reflects a waiting backlog', () => {
  const result = simulate([ticket('A', 0, 20), ticket('B', 1, 2)],
                          { agents: 1, policy: 'fifo', horizon: 20 });
  assert.equal(result.maxWaiting, 1);
  assert.equal(result.timeline.find((x) => x.minute === 5).waiting, 1);
  assert.equal(result.timeline.find((x) => x.minute === 20).waiting, 0);
});

test('SLA boundary is inclusive', () => {
  const result = simulate([ticket('A', 0, 10), ticket('B', 0, 2, 'urgent')],
                          { agents: 1, policy: 'fifo' });
  assert.equal(result.urgent.missRate, 0);
});

test('invalid and duplicate tickets fail clearly', () => {
  assert.throws(() => simulate([ticket('A', 0, 1), ticket('A', 1, 1)],
                               { agents: 1, policy: 'fifo' }), /duplicate/);
  assert.throws(() => simulate([ticket('A', 0, -1)], { agents: 1, policy: 'fifo' }), /Invalid/);
  assert.throws(() => simulate([ticket('A', 0, 1, 'unknown')], { agents: 1, policy: 'fifo' }), /Invalid/);
  assert.throws(() => simulate([], { agents: 0, policy: 'fifo' }), /agent/);
  assert.throws(() => simulate([], { agents: 2, policy: 'unfair' }), /policy/);
});

test('seeded traffic is reproducible and sorted', () => {
  const config = { seed: 20261110, peakMultiplier: 3, urgentShare: 0.25 };
  const first = generateTraffic(config);
  assert.deepEqual(first, generateTraffic(config));
  assert.notDeepEqual(first, generateTraffic({ ...config, seed: config.seed + 1 }));
  assert.ok(first.length > 50);
  assert.ok(first.every((row, i) => row.arrival >= 0 && (i === 0 || row.arrival >= first[i - 1].arrival)));
});

test('generator bounds are enforced', () => {
  assert.throws(() => rngFromSeed(-1), /Seed/);
  assert.throws(() => generateTraffic({ seed: 1, peakMultiplier: 0, urgentShare: 0.2 }), /peak/);
  assert.throws(() => generateTraffic({ seed: 1, peakMultiplier: 2, urgentShare: 2 }), /share/);
});

test('bootstrap of constant paired differences is exact', () => {
  const interval = bootstrapMean([2, 2, 2, 2], 8, 100);
  assert.deepEqual(interval, { estimate: 2, low: 2, high: 2, samples: 4 });
});

test('paired scenario analysis is deterministic and reports both sides', () => {
  const config = { agents: 4, peakMultiplier: 3, urgentShare: 0.25, seed: 20261110, trials: 8 };
  const first = analyzeScenario(config);
  assert.deepEqual(first, analyzeScenario(config));
  assert.equal(first.comparison.urgentMissRateGain.samples, 8);
  assert.equal(first.comparison.routineMeanWaitCost.samples, 8);
  assert.equal(first.example.fifo.ticketCount, first.example.urgentFirst.ticketCount);
  assert.ok(first.example.fifo.records.every((x) => x.wait >= 0));
  assert.ok(first.example.urgentFirst.records.every((x) => x.wait >= 0));
});

test('scenario validates trial count', () => {
  assert.throws(() => analyzeScenario({ trials: 0 }), /trial/);
  assert.throws(() => analyzeScenario({ seed: -1 }), /Seed/);
});

test('missing priority group is reported as unavailable, not fabricated', () => {
  const noUrgent = analyzeScenario({ urgentShare: 0, trials: 2 });
  assert.equal(noUrgent.comparison.urgentMissRateGain, null);
  assert.equal(noUrgent.pairedTrialDifferences.urgentMissRateGain.length, 0);
  const noRoutine = analyzeScenario({ urgentShare: 1, trials: 2 });
  assert.equal(noRoutine.comparison.routineMeanWaitCost, null);
});
