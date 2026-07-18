import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const RETURN_PRESETS = [
  { label: 'Conservative (4%)', value: 4 },
  { label: 'Moderate (7%)', value: 7 },
  { label: 'Aggressive (10%)', value: 10 },
];

// Future value of a lump sum plus a monthly contribution annuity:
//   FV = P(1+r)^n + PMT * (((1+r)^n - 1) / r)
// Solved for PMT (required monthly contribution) or FV (projected balance).
function projectBalance(currentSavings, monthlyContribution, annualReturnPct, months) {
  const r = annualReturnPct / 100 / 12;
  const history = [];
  let balance = currentSavings;
  history.push({ month: 0, balance });
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + r) + monthlyContribution;
    history.push({ month: m, balance });
  }
  return history;
}

function requiredMonthlyContribution(goalAmount, currentSavings, annualReturnPct, months) {
  const r = annualReturnPct / 100 / 12;
  const growthFactor = Math.pow(1 + r, months);
  const futureSavingsValue = currentSavings * growthFactor;
  const remaining = goalAmount - futureSavingsValue;

  if (remaining <= 0) return 0; // already on track without further contributions

  if (r === 0) return remaining / months;

  const annuityFactor = (growthFactor - 1) / r;
  return remaining / annuityFactor;
}

function GoalPlanner() {
  const [mode, setMode] = useState('findContribution'); // 'findContribution' | 'projectBalance'
  const [goalAmount, setGoalAmount] = useState(50000);
  const [currentSavings, setCurrentSavings] = useState(2000);
  const [years, setYears] = useState(10);
  const [annualReturn, setAnnualReturn] = useState(7);
  const [customReturn, setCustomReturn] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState(300);

  const effectiveReturn = customReturn !== '' ? parseFloat(customReturn) || 0 : annualReturn;
  const months = Math.max(1, Math.round(years * 12));

  const result = useMemo(() => {
    if (mode === 'findContribution') {
      const required = requiredMonthlyContribution(goalAmount, currentSavings, effectiveReturn, months);
      const history = projectBalance(currentSavings, required, effectiveReturn, months);
      return { requiredMonthly: required, history, finalBalance: history[history.length - 1].balance };
    } else {
      const history = projectBalance(currentSavings, monthlyContribution, effectiveReturn, months);
      return { history, finalBalance: history[history.length - 1].balance };
    }
  }, [mode, goalAmount, currentSavings, effectiveReturn, months, monthlyContribution]);

  // Simple SVG growth chart from the deterministic projection above
  const chartWidth = 500;
  const chartHeight = 220;
  const padding = 44;
  const plotWidth = chartWidth - padding * 2;
  const plotHeight = chartHeight - padding * 2;

  const sampleCount = Math.min(result.history.length, 60);
  const step = Math.max(1, Math.floor(result.history.length / sampleCount));
  const sampled = result.history.filter((_, i) => i % step === 0 || i === result.history.length - 1);

  const maxBalance = Math.max(...sampled.map(p => p.balance), goalAmount) * 1.05;
  const minBalance = 0;

  const xScale = (i) => padding + (i / (sampled.length - 1 || 1)) * plotWidth;
  const yScale = (v) => padding + plotHeight - ((v - minBalance) / (maxBalance - minBalance || 1)) * plotHeight;
  const linePath = sampled.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.balance)}`).join(' ');
  const goalY = yScale(goalAmount);

  return (
    <div className="min-h-screen bg-teal/10 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-teal px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Planning Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Goal Planner
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Work backward from a target — or forward from what you can save — using real compound-interest math.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setMode('findContribution')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                    mode === 'findContribution' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  I have a target — what do I need to save?
                </button>
                <button
                  onClick={() => setMode('projectBalance')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                    mode === 'projectBalance' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  I know what I can save — what will I end up with?
                </button>
              </div>

              <div className="space-y-6">
                {mode === 'findContribution' && (
                  <div>
                    <label className="block text-navy font-medium mb-2">Goal Amount</label>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                      <input
                        type="number"
                        value={goalAmount}
                        onChange={(e) => setGoalAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {mode === 'projectBalance' && (
                  <div>
                    <label className="block text-navy font-medium mb-2">Monthly Contribution</label>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                      <input
                        type="number"
                        value={monthlyContribution}
                        onChange={(e) => setMonthlyContribution(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-navy font-medium mb-2">Current Savings</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                      <input
                        type="number"
                        value={currentSavings}
                        onChange={(e) => setCurrentSavings(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-navy font-medium mb-2">Time Frame (years)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={years}
                      onChange={(e) => setYears(Math.min(60, Math.max(1, parseFloat(e.target.value) || 1)))}
                      className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-navy font-medium mb-2">Expected Annual Return</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {RETURN_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        onClick={() => { setAnnualReturn(preset.value); setCustomReturn(''); }}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          annualReturn === preset.value && customReturn === ''
                            ? 'bg-teal text-white'
                            : 'bg-cream-dark text-navy hover:bg-teal/20'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 max-w-xs">
                    <span className="text-navy-light text-sm">Custom:</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 8.5"
                        value={customReturn}
                        onChange={(e) => setCustomReturn(e.target.value)}
                        className={`w-full p-2 pr-7 rounded-lg border-2 text-navy font-medium focus:outline-none ${
                          customReturn !== '' ? 'border-teal bg-teal/10' : 'border-cream-dark bg-white'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy">%</span>
                    </div>
                  </div>
                  <p className="text-navy-light text-xs mt-2">
                    The S&P 500 has historically averaged around 10%/year before inflation, but returns vary a lot year to year — this tool assumes a smooth constant rate, which real markets never actually deliver.
                  </p>
                </div>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <div className={`rounded-2xl p-8 text-center ${mode === 'findContribution' ? 'bg-sage/20' : 'bg-teal/10'}`}>
              {mode === 'findContribution' ? (
                <>
                  <p className="text-navy-light mb-2">
                    To reach ${goalAmount.toLocaleString()} in {years} year{years !== 1 ? 's' : ''} at {effectiveReturn}%/year, starting from ${currentSavings.toLocaleString()}, you need to save
                  </p>
                  <p className="font-display text-5xl md:text-6xl font-bold text-navy mb-2">
                    {result.requiredMonthly <= 0
                      ? "you're already on track"
                      : `$${result.requiredMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-navy-light mb-2">
                    Saving ${monthlyContribution.toLocaleString()}/month for {years} year{years !== 1 ? 's' : ''} at {effectiveReturn}%/year, starting from ${currentSavings.toLocaleString()}, projects to
                  </p>
                  <p className="font-display text-5xl md:text-6xl font-bold text-navy mb-2">
                    ${result.finalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </>
              )}
            </div>
          </FadeInSection>

          <FadeInSection delay={0.3}>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">📈 Projected Growth</h4>
              <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
                {[0, 0.5, 1].map((pct, i) => {
                  const y = padding + pct * plotHeight;
                  const value = maxBalance - pct * (maxBalance - minBalance);
                  return (
                    <g key={i}>
                      <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
                      <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">
                        ${(value / 1000).toFixed(0)}k
                      </text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const x = padding + pct * plotWidth;
                  const yr = Math.round(pct * years);
                  return <text key={i} x={x} y={chartHeight - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">yr {yr}</text>;
                })}
                {mode === 'findContribution' && goalY >= padding && goalY <= chartHeight - padding && (
                  <>
                    <line x1={padding} y1={goalY} x2={chartWidth - padding} y2={goalY} stroke="#3D8B8B" strokeWidth="1.5" strokeDasharray="4" />
                    <text x={chartWidth - padding} y={goalY - 6} textAnchor="end" fontSize="10" fill="#3D8B8B">Goal</text>
                  </>
                )}
                <path d={linePath} fill="none" stroke="#3D8B8B" strokeWidth="3" />
                <circle cx={xScale(sampled.length - 1)} cy={yScale(sampled[sampled.length - 1].balance)} r="5" fill="#3D8B8B" />
              </svg>
            </div>
          </FadeInSection>

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            This is a projection based on a constant assumed return, not a guarantee or personalized financial advice.
            Real markets go up and down unevenly — use the Simulator to see how a real historical period actually played out.
          </p>

          <PageNavigation
            prevPath="/simulation"
            prevLabel="Simulation"
            nextPath="/debt-payoff"
            nextLabel="Debt Payoff Calculator"
          />
        </div>
      </div>
    </div>
  );
}

export default GoalPlanner;