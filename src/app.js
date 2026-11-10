import { analyzeScenario } from './sim.js';

const $ = (id) => document.getElementById(id);
const agents = $('agents');
const peak = $('peak');
const urgentShare = $('urgent-share');
let current = null;

const minutes = (value) => value == null ? 'No data' : `${value.toFixed(1)} min`;
const percent = (value) => value == null ? 'No data' : `${(value * 100).toFixed(1)}%`;
const signed = (value, unit) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} ${unit}`;

function intervalText(interval, multiplier, unit) {
  if (!interval) return 'Not enough tickets in this priority group';
  return `${signed(interval.low * multiplier, unit)} to ${signed(interval.high * multiplier, unit)} · ${interval.samples} paired trials`;
}

function urgentIntervalText(interval) {
  if (!interval) return 'Not enough urgent tickets in this scenario';
  const low = interval.low * 100;
  const high = interval.high * 100;
  if (low >= 0) return `${low.toFixed(1)}–${high.toFixed(1)} pp fewer · ${interval.samples} paired trials`;
  if (high <= 0) return `${Math.abs(high).toFixed(1)}–${Math.abs(low).toFixed(1)} pp more · ${interval.samples} paired trials`;
  return intervalText(interval, 100, 'pp');
}

function chartPath(timeline, maxWaiting) {
  const left = 48, top = 18, width = 720, height = 218;
  const x = (point) => left + (point.minute / 240) * width;
  const y = (point) => top + height - (point.waiting / maxWaiting) * height;
  return timeline.map((point, i) => `${i ? 'L' : 'M'}${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(' ');
}

function drawChart(fifo, priority) {
  const maxWaiting = Math.max(1, fifo.maxWaiting, priority.maxWaiting);
  const burstStart = 48 + (72 / 240) * 720;
  const burstWidth = ((132 - 72) / 240) * 720;
  const tick = Math.ceil(maxWaiting / 2);
  $('chart').setAttribute('aria-label', `First trial waiting queue. FIFO peak ${fifo.maxWaiting} tickets; urgent-first peak ${priority.maxWaiting} tickets. The highlighted burst is minutes 72 through 132.`);
  $('chart').innerHTML = `<svg viewBox="0 0 800 270" role="presentation" focusable="false" aria-hidden="true">
    <rect x="${burstStart}" y="18" width="${burstWidth}" height="218" fill="#f2b578" opacity="0.07" />
    <path d="M48 18H768 M48 127H768 M48 236H768" stroke="#ffffff" opacity="0.10" stroke-dasharray="4 7" />
    <text x="8" y="23">${maxWaiting}</text><text x="8" y="132">${tick}</text><text x="21" y="240">0</text>
    <path d="${chartPath(fifo.timeline, maxWaiting)}" class="chart-fifo" />
    <path d="${chartPath(priority.timeline, maxWaiting)}" class="chart-priority" />
  </svg>`;
}

function render() {
  const config = {
    agents: Number(agents.value),
    peakMultiplier: Number(peak.value),
    urgentShare: Number(urgentShare.value) / 100,
    seed: 20261110,
    trials: 30,
  };
  $('agents-value').textContent = String(config.agents);
  $('peak-value').textContent = `${config.peakMultiplier.toFixed(2).replace(/\.00$/, '.0')}×`;
  $('urgent-value').textContent = `${Number(urgentShare.value)}%`;
  try {
    current = analyzeScenario(config);
    const { comparison, example } = current;
    const gain = comparison.urgentMissRateGain;
    const cost = comparison.routineMeanWaitCost;
    $('urgent-delta').textContent = gain ? `${Math.abs(gain.estimate * 100).toFixed(1)} pp ${gain.estimate >= 0 ? 'fewer' : 'more'}` : 'No urgent tickets';
    $('urgent-interval').textContent = urgentIntervalText(gain);
    $('routine-delta').textContent = cost ? signed(cost.estimate, 'min') : 'No routine tickets';
    $('routine-interval').textContent = intervalText(cost, 1, 'min');
    const fifo = example.fifo, priority = example.urgentFirst;
    $('count-fifo').textContent = String(fifo.ticketCount);
    $('count-priority').textContent = String(priority.ticketCount);
    $('urgent-fifo').textContent = percent(fifo.urgent.missRate);
    $('urgent-priority').textContent = percent(priority.urgent.missRate);
    $('routine-fifo').textContent = minutes(fifo.routine.p90Wait);
    $('routine-priority').textContent = minutes(priority.routine.p90Wait);
    $('queue-fifo').textContent = String(fifo.maxWaiting);
    $('queue-priority').textContent = String(priority.maxWaiting);
    $('drain-fifo').textContent = minutes(fifo.drainMinutes);
    $('drain-priority').textContent = minutes(priority.drainMinutes);
    drawChart(fifo, priority);
    $('status').textContent = `${comparison.averageTicketsPerTrial.toFixed(0)} tickets per trial on average · seed ${config.seed}`;
  } catch (error) {
    current = null;
    $('status').textContent = `Scenario unavailable: ${error.message}`;
  }
}

function download() {
  if (!current) return;
  const { config, comparison, pairedTrialDifferences, example } = current;
  const output = {
    notice: 'Synthetic simulation; not a staffing forecast',
    config, comparison, pairedTrialDifferences,
    firstTrial: {
      fifo: { all: example.fifo.all, urgent: example.fifo.urgent, routine: example.fifo.routine,
              maxWaiting: example.fifo.maxWaiting, drainMinutes: example.fifo.drainMinutes,
              timeline: example.fifo.timeline },
      urgentFirst: { all: example.urgentFirst.all, urgent: example.urgentFirst.urgent,
                     routine: example.urgentFirst.routine, maxWaiting: example.urgentFirst.maxWaiting,
                     drainMinutes: example.urgentFirst.drainMinutes, timeline: example.urgentFirst.timeline },
    },
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `burstlab-${config.seed}-scenario.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const input of [agents, peak, urgentShare]) input.addEventListener('input', render);
$('reset').addEventListener('click', () => { agents.value = '4'; peak.value = '3'; urgentShare.value = '25'; render(); });
$('download').addEventListener('click', download);
render();
