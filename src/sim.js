/** Deterministic, event-driven queue simulation. No browser or package dependencies. */

export const HORIZON_MINUTES = 240;
export const SLA_MINUTES = Object.freeze({ urgent: 10, routine: 45 });

export class BinaryHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() { return this.items.length; }

  push(value) {
    const items = this.items;
    items.push(value);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[parent], items[i]) <= 0) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    if (!this.items.length) return undefined;
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        let next = left;
        if (right < items.length && this.compare(items[right], items[left]) < 0) next = right;
        if (this.compare(items[i], items[next]) <= 0) break;
        [items[i], items[next]] = [items[next], items[i]];
        i = next;
      }
    }
    return first;
  }
}

export function rngFromSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be a 32-bit unsigned integer');
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rate, rng) {
  const threshold = Math.exp(-rate);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > threshold);
  return count - 1;
}

export function generateTraffic({ seed, peakMultiplier, urgentShare, horizon = HORIZON_MINUTES }) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 1440) throw new RangeError('Invalid horizon');
  if (!Number.isFinite(peakMultiplier) || peakMultiplier < 1 || peakMultiplier > 5) throw new RangeError('Invalid peak multiplier');
  if (!Number.isFinite(urgentShare) || urgentShare < 0 || urgentShare > 1) throw new RangeError('Invalid urgent share');
  const rng = rngFromSeed(seed);
  const tickets = [];
  for (let minute = 0; minute < horizon; minute += 1) {
    const inPeak = minute >= Math.round(horizon * 0.30) && minute < Math.round(horizon * 0.55);
    const rate = 0.32 * (inPeak ? peakMultiplier : 1);
    const count = poisson(rate, rng);
    for (let i = 0; i < count; i += 1) {
      tickets.push({
        id: `T${String(tickets.length + 1).padStart(4, '0')}`,
        arrival: minute + rng(),
        service: Math.min(45, 2 - 7 * Math.log(1 - rng())),
        priority: rng() < urgentShare ? 'urgent' : 'routine',
      });
    }
  }
  tickets.sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  return tickets;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function summarize(records) {
  if (!records.length) return { count: 0, meanWait: null, p90Wait: null, missRate: null };
  const waits = records.map((record) => record.wait);
  return {
    count: records.length,
    meanWait: waits.reduce((a, b) => a + b, 0) / waits.length,
    p90Wait: percentile(waits, 0.9),
    missRate: records.filter((record) => record.wait > SLA_MINUTES[record.priority]).length / records.length,
  };
}

/**
 * Non-preemptive agents, unlimited waiting room. Arrival and completion events
 * at the same time are processed together before dispatching new work.
 */
export function simulate(tickets, { agents, policy, horizon = HORIZON_MINUTES }) {
  if (!Number.isInteger(agents) || agents < 1 || agents > 100) throw new RangeError('Invalid agent count');
  if (policy !== 'fifo' && policy !== 'urgent-first') throw new RangeError('Unknown policy');
  if (!Number.isFinite(horizon) || horizon < 1) throw new RangeError('Invalid horizon');
  if (!Array.isArray(tickets)) throw new TypeError('Tickets must be an array');
  const ids = new Set();
  for (const ticket of tickets) {
    if (!ticket || typeof ticket.id !== 'string' || !ticket.id || ids.has(ticket.id) ||
        !Number.isFinite(ticket.arrival) || ticket.arrival < 0 ||
        !Number.isFinite(ticket.service) || ticket.service <= 0 ||
        !Object.hasOwn(SLA_MINUTES, ticket.priority)) {
      throw new RangeError('Invalid or duplicate ticket');
    }
    ids.add(ticket.id);
  }
  const arrivals = [...tickets].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const waiting = new BinaryHeap((a, b) =>
    (policy === 'urgent-first' ? Number(b.priority === 'urgent') - Number(a.priority === 'urgent') : 0) ||
    a.arrival - b.arrival || a.id.localeCompare(b.id));
  const completions = new BinaryHeap((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  let available = agents;
  let index = 0;
  let maxWaiting = 0;
  let latestFinish = 0;
  let busyMinutes = 0;
  const records = [];
  const events = [{ time: 0, waiting: 0 }];
  while (index < arrivals.length || completions.size) {
    const nextArrival = index < arrivals.length ? arrivals[index].arrival : Infinity;
    const nextCompletion = completions.size ? completions.items[0].time : Infinity;
    const now = Math.min(nextArrival, nextCompletion);
    while (completions.size && completions.items[0].time <= now) {
      completions.pop();
      available += 1;
    }
    while (index < arrivals.length && arrivals[index].arrival <= now) {
      waiting.push(arrivals[index]);
      index += 1;
    }
    while (available > 0 && waiting.size) {
      const ticket = waiting.pop();
      const finish = now + ticket.service;
      records.push({ id: ticket.id, priority: ticket.priority, arrival: ticket.arrival,
                     start: now, finish, wait: now - ticket.arrival });
      completions.push({ time: finish, id: ticket.id });
      latestFinish = Math.max(latestFinish, finish);
      busyMinutes += ticket.service;
      available -= 1;
    }
    maxWaiting = Math.max(maxWaiting, waiting.size);
    events.push({ time: now, waiting: waiting.size });
  }
  const timeline = [];
  let eventIndex = 0;
  for (let minute = 0; minute <= horizon; minute += 5) {
    while (eventIndex + 1 < events.length && events[eventIndex + 1].time <= minute) eventIndex += 1;
    timeline.push({ minute, waiting: events[eventIndex].waiting });
  }
  return {
    policy, agents, ticketCount: records.length,
    all: summarize(records),
    urgent: summarize(records.filter((item) => item.priority === 'urgent')),
    routine: summarize(records.filter((item) => item.priority === 'routine')),
    maxWaiting,
    busyFraction: latestFinish ? busyMinutes / (agents * latestFinish) : 0,
    drainMinutes: Math.max(0, latestFinish - horizon),
    timeline,
    records: records.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function bootstrapMean(values, seed, repetitions = 1000) {
  if (!Array.isArray(values) || !values.length || values.some((x) => !Number.isFinite(x))) {
    throw new RangeError('Bootstrap needs finite samples');
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10000) throw new RangeError('Invalid repetitions');
  const rng = rngFromSeed(seed);
  const draws = [];
  for (let b = 0; b < repetitions; b += 1) {
    let total = 0;
    for (let i = 0; i < values.length; i += 1) total += values[Math.floor(rng() * values.length)];
    draws.push(total / values.length);
  }
  return {
    estimate: values.reduce((a, b) => a + b, 0) / values.length,
    low: percentile(draws, 0.025),
    high: percentile(draws, 0.975),
    samples: values.length,
  };
}

export function analyzeScenario({ agents = 4, peakMultiplier = 3, urgentShare = 0.25,
                                  seed = 20261110, trials = 30 } = {}) {
  if (!Number.isInteger(trials) || trials < 1 || trials > 100) throw new RangeError('Invalid trial count');
  rngFromSeed(seed);
  const urgentMissGains = [];
  const routineWaitCosts = [];
  let example = null;
  let ticketsPerTrial = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const tickets = generateTraffic({ seed: (seed + Math.imul(trial, 0x9e3779b9)) >>> 0,
                                      peakMultiplier, urgentShare });
    const fifo = simulate(tickets, { agents, policy: 'fifo' });
    const urgentFirst = simulate(tickets, { agents, policy: 'urgent-first' });
    if (fifo.urgent.count) urgentMissGains.push(fifo.urgent.missRate - urgentFirst.urgent.missRate);
    if (fifo.routine.count) routineWaitCosts.push(urgentFirst.routine.meanWait - fifo.routine.meanWait);
    ticketsPerTrial += tickets.length;
    if (trial === 0) example = { fifo, urgentFirst };
  }
  return {
    config: { agents, peakMultiplier, urgentShare, seed, trials, horizonMinutes: HORIZON_MINUTES,
              baseArrivalsPerMinute: 0.32, peakWindowMinutes: [72, 132] },
    comparison: {
      urgentMissRateGain: urgentMissGains.length ? bootstrapMean(urgentMissGains, (seed ^ 0xa5a5a5a5) >>> 0) : null,
      routineMeanWaitCost: routineWaitCosts.length ? bootstrapMean(routineWaitCosts, (seed ^ 0x5a5a5a5a) >>> 0) : null,
      averageTicketsPerTrial: ticketsPerTrial / trials,
    },
    pairedTrialDifferences: { urgentMissRateGain: urgentMissGains, routineMeanWaitCost: routineWaitCosts },
    example,
  };
}
