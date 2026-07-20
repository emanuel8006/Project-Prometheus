import { useState } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const VOLATILITY_PRESETS = [
  { label: 'Conservative (bonds-heavy)', return: 5, volatility: 6 },
  { label: 'Moderate (S&P 500-like)', return: 8, volatility: 15 },
  { label: 'Aggressive (growth-heavy)', return: 10, volatility: 22 },
];

const TRIAL_OPTIONS = [200, 500, 1000];

// Box-Muller transform: converts uniform random numbers into a standard
// normal (bell-curve) random variable, which is what lets each simulated
// month's return vary randomly around the expected mean instead of
// following one smooth deterministic curve.
function standardNormalRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function runMonteCarlo(startingAmount, monthlyContribution, years, annualReturnPct, annualVolatilityPct, numTrials) {
  const months = Math.round(years * 12);
  const monthlyReturn = annualReturnPct / 100 / 12;
  const monthlyVol = (annualVolatilityPct / 100) / Math.sqrt(12);

  // balancesByMonth[m] = array of every trial's balance at month m
  const balancesByMonth = Array.from({ length: months + 1 }, () => []);

  for (let t = 0; t < numTrials; t++) {
    let balance = startingAmount;
    balancesByMonth[0].push(balance);
    for (let m = 1; m <= months; m++) {
      const randomReturn = monthlyReturn + monthlyVol * standardNormalRandom();
      balance = Math.max(0, balance * (1 + randomReturn) + monthlyContribution);
      balancesByMonth[m].push(balance);
    }
  }

  const percentile = (arr, p) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  };

  const fan = balancesByMonth.map((balances, m) => ({
    month: m,
    p10: percentile(balances, 10),
    p25: percentile(balances, 25),
    p50: percentile(balances, 50),
    p75: percentile(balances, 75),
    p90: percentile(balances, 90),
  }));

  const finalBalances = balancesByMonth[months];

  return { fan, finalBalances, months };
}

function MonteCarlo() {
  const [startingAmount, setStartingAmount] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(400);
  const [years, setYears] = useState(30);
  const [preset, setPreset] = useState(1); // index into VOLATILITY_PRESETS
  const [customReturn, setCustomReturn] = useState('');
  const [customVolatility, setCustomVolatility] = useState('');
  const [goalAmount, setGoalAmount] = useState(1000000);
  const [numTrials, setNumTrials] = useState(500);

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveReturn = customReturn !== '' ? parseFloat(customReturn) || 0 : VOLATILITY_PRESETS[preset].return;
  const effectiveVolatility = customVolatility !== '' ? parseFloat(customVolatility) || 0 : VOLATILITY_PRESETS[preset].volatility;

  const handleRun = () => {
    setRunning(true);
    // Defer to the next tick so the "Simulating..." state actually paints
    // before the (synchronous, CPU-bound) simulation blocks the thread.
    setTimeout(() => {
      const sim = runMonteCarlo(startingAmount, monthlyContribution, years, effectiveReturn, effectiveVolatility, numTrials);
      setResult(sim);
      setRunning(false);
    }, 50);
  };

  const probabilityOfSuccess = result
    ? (result.finalBalances.filter(b => b >= goalAmount).length / result.finalBalances.length) * 100
    : null;

  // Chart geometry
  const width = 560;
  const height = 260;
  const padding = 48;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const chartData = result ? result.fan : null;
  const maxValue = chartData ? Math.max(...chartData.map(d => d.p90), goalAmount) * 1.05 : 1;
  const xScale = (m) => padding + (chartData ? (m / result.months) * plotWidth : 0);
  const yScale = (v) => padding + plotHeight - (v / maxValue) * plotHeight;

  const areaPath = (upperKey, lowerKey) => {
    if (!chartData) return '';
    const top = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.month)} ${yScale(d[upperKey])}`).join(' ');
    const bottom = [...chartData].reverse().map(d => `L ${xScale(d.month)} ${yScale(d[lowerKey])}`).join(' ');
    return `${top} ${bottom} Z`;
  };

  const linePath = (key) => chartData ? chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.month)} ${yScale(d[key])}`).join(' ') : '';

  const goalY = chartData ? yScale(goalAmount) : null;

  return (
    <div className="min-h-screen bg-navy/5 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-navy px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Advanced Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Monte Carlo Simulator
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Markets don't follow a smooth line. Run thousands of randomized futures and see the real range of outcomes.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Setup</h4>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-navy font-medium mb-2">Starting Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                    <input
                      type="number"
                      value={startingAmount}
                      onChange={(e) => setStartingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Monthly Contribution</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                    <input
                      type="number"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Time Horizon (years)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={years}
                    onChange={(e) => setYears(Math.min(60, Math.max(1, parseFloat(e.target.value) || 1)))}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Goal Amount (optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                    <input
                      type="number"
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-navy font-medium mb-2">Return & Volatility Profile</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {VOLATILITY_PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={() => { setPreset(i); setCustomReturn(''); setCustomVolatility(''); }}
                      className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                        preset === i && customReturn === '' && customVolatility === ''
                          ? 'bg-teal text-white'
                          : 'bg-cream-dark text-navy hover:bg-teal/20'
                      }`}
                    >
                      {p.label} — {p.return}%/{p.volatility}%
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`Return (${VOLATILITY_PRESETS[preset].return}%)`}
                      value={customReturn}
                      onChange={(e) => setCustomReturn(e.target.value)}
                      className={`w-full p-2 pr-6 rounded-lg border-2 text-navy text-sm focus:outline-none ${customReturn !== '' ? 'border-teal bg-teal/10' : 'border-cream-dark bg-white'}`}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-light text-xs">%</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`Volatility (${VOLATILITY_PRESETS[preset].volatility}%)`}
                      value={customVolatility}
                      onChange={(e) => setCustomVolatility(e.target.value)}
                      className={`w-full p-2 pr-6 rounded-lg border-2 text-navy text-sm focus:outline-none ${customVolatility !== '' ? 'border-teal bg-teal/10' : 'border-cream-dark bg-white'}`}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-light text-xs">%</span>
                  </div>
                </div>
                <p className="text-navy-light text-xs mt-2">
                  Volatility (standard deviation of annual returns) is what makes each simulated path different — higher volatility means a wider range of possible outcomes, good and bad.
                </p>
              </div>

              <div className="mt-6">
                <label className="block text-navy font-medium mb-2">Number of Simulations</label>
                <div className="flex gap-2">
                  {TRIAL_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setNumTrials(n)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        numTrials === n ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                      }`}
                    >
                      {n.toLocaleString()}
                    </button>
                  ))}
                </div>
                <p className="text-navy-light text-xs mt-2">More simulations = smoother, more reliable percentile bands, at the cost of a moment more compute time.</p>
              </div>

              <button
                onClick={handleRun}
                disabled={running}
                className={`w-full mt-8 py-3 rounded-xl font-semibold transition-colors ${
                  running ? 'bg-cream-dark text-navy-light cursor-not-allowed' : 'bg-teal text-white hover:bg-teal-light'
                }`}
              >
                {running ? `Running ${numTrials.toLocaleString()} simulations...` : '🎲 Run Monte Carlo Simulation'}
              </button>
            </div>
          </FadeInSection>

          {running && !result && (
            <FadeInSection delay={0.1}>
              <div className="bg-white rounded-2xl p-6 shadow-lg animate-pulse" aria-busy="true" aria-label="Running simulation">
                <div className="h-6 bg-cream-dark rounded w-1/3 mb-4"></div>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className="h-20 bg-cream-dark rounded-2xl"></div>
                  <div className="h-20 bg-cream-dark rounded-2xl"></div>
                  <div className="h-20 bg-cream-dark rounded-2xl"></div>
                </div>
                <div className="h-56 bg-cream-dark rounded-xl"></div>
              </div>
            </FadeInSection>
          )}

          {result && (
            <>
              <FadeInSection delay={0.15}>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-5 bg-coral/10 rounded-2xl text-center">
                    <p className="text-navy-light text-sm mb-1">Bad Case (10th percentile)</p>
                    <p className="font-display text-2xl font-bold text-coral">
                      ${result.fan[result.fan.length - 1].p10.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="p-5 bg-teal/10 rounded-2xl text-center">
                    <p className="text-navy-light text-sm mb-1">Median Outcome</p>
                    <p className="font-display text-2xl font-bold text-teal">
                      ${result.fan[result.fan.length - 1].p50.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="p-5 bg-sage/10 rounded-2xl text-center">
                    <p className="text-navy-light text-sm mb-1">Good Case (90th percentile)</p>
                    <p className="font-display text-2xl font-bold text-sage">
                      ${result.fan[result.fan.length - 1].p90.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </FadeInSection>

              {goalAmount > 0 && (
                <FadeInSection delay={0.2}>
                  <div className={`rounded-2xl p-6 text-center ${probabilityOfSuccess >= 70 ? 'bg-sage/20' : probabilityOfSuccess >= 40 ? 'bg-amber/20' : 'bg-coral/20'}`}>
                    <p className="text-navy-light mb-1">Probability of reaching ${goalAmount.toLocaleString()}</p>
                    <p className="font-display text-4xl font-bold text-navy">{probabilityOfSuccess.toFixed(0)}%</p>
                    <p className="text-navy-light text-sm mt-1">
                      of {numTrials.toLocaleString()} simulated random paths ended at or above your goal
                    </p>
                  </div>
                </FadeInSection>
              )}

              <FadeInSection delay={0.25}>
                <div className="bg-white rounded-2xl p-6 shadow-lg">
                  <h4 className="font-display text-xl font-bold text-navy mb-1">📊 Probability Fan Chart</h4>
                  <p className="text-navy-light text-sm mb-4">
                    The shaded bands show where {numTrials.toLocaleString()} randomized paths actually landed — not one guess, a real distribution.
                  </p>
                  <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    {[0, 0.5, 1].map((pct, i) => {
                      const y = padding + pct * plotHeight;
                      const value = maxValue - pct * maxValue;
                      return (
                        <g key={i}>
                          <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
                          <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">
                            ${(value / 1000).toFixed(0)}k
                          </text>
                        </g>
                      );
                    })}
                    {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                      const x = padding + pct * plotWidth;
                      const yr = Math.round(pct * years);
                      return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">yr {yr}</text>;
                    })}

                    {goalAmount > 0 && goalY >= padding && goalY <= height - padding && (
                      <>
                        <line x1={padding} y1={goalY} x2={width - padding} y2={goalY} stroke="#1a2744" strokeWidth="1.5" strokeDasharray="4" />
                        <text x={width - padding} y={goalY - 6} textAnchor="end" fontSize="10" fill="#1a2744">Goal</text>
                      </>
                    )}

                    {/* Outer band: 10th-90th percentile */}
                    <path d={areaPath('p90', 'p10')} fill="#3D8B8B" fillOpacity="0.15" stroke="none" />
                    {/* Inner band: 25th-75th percentile */}
                    <path d={areaPath('p75', 'p25')} fill="#3D8B8B" fillOpacity="0.3" stroke="none" />
                    {/* Median line */}
                    <path d={linePath('p50')} fill="none" stroke="#3D8B8B" strokeWidth="3" />
                  </svg>
                  <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
                    <div className="flex items-center gap-2"><div className="w-4 h-3 bg-teal/15 rounded"></div><span className="text-navy">10th-90th percentile range</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-3 bg-teal/30 rounded"></div><span className="text-navy">25th-75th percentile range</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-1 bg-teal rounded"></div><span className="text-navy">Median path</span></div>
                  </div>
                </div>
              </FadeInSection>
            </>
          )}

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            This models returns as randomly distributed around a fixed average — real markets have patterns (crashes, recoveries, cycles) this simplified model doesn't capture. It's a tool for understanding a range of outcomes, not a prediction.
          </p>

          <PageNavigation
            prevPath="/debt-payoff"
            prevLabel="Debt Payoff"
            nextPath="/options-payoff"
            nextLabel="Options Payoff Visualizer"
          />
        </div>
      </div>
    </div>
  );
}

export default MonteCarlo;