import { writeFileSync } from 'node:fs';
import { analyzeScenario } from '../src/sim.js';

const result = analyzeScenario();
const compact = {
  scenario: 'Fixed-seed synthetic support traffic; same tickets and service times under both non-preemptive policies',
  config: result.config,
  comparison: result.comparison,
  pairedTrialDifferences: result.pairedTrialDifferences,
  firstTrial: {
    tickets: result.example.fifo.ticketCount,
    fifo: {
      urgent: result.example.fifo.urgent,
      routine: result.example.fifo.routine,
      maxWaiting: result.example.fifo.maxWaiting,
      drainMinutes: result.example.fifo.drainMinutes,
    },
    urgentFirst: {
      urgent: result.example.urgentFirst.urgent,
      routine: result.example.urgentFirst.routine,
      maxWaiting: result.example.urgentFirst.maxWaiting,
      drainMinutes: result.example.urgentFirst.drainMinutes,
    },
  },
};
// Tiny floating-point differences across operating systems should not change the checked-in evidence.
const stableNumber = (_key, value) => typeof value === 'number'
  ? Math.round(value * 1e9) / 1e9
  : value;
writeFileSync(new URL('../evidence/default.json', import.meta.url), `${JSON.stringify(compact, stableNumber, 2)}\n`);
console.log(JSON.stringify({
  trialCount: result.config.trials,
  averageTicketsPerTrial: result.comparison.averageTicketsPerTrial,
  urgentMissRateGain: result.comparison.urgentMissRateGain,
  routineMeanWaitCost: result.comparison.routineMeanWaitCost,
}, null, 2));
