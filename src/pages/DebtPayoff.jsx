import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const DEFAULT_DEBTS = [
  { id: 1, name: 'Credit Card A', balance: 4000, apr: 22, minPayment: 100 },
  { id: 2, name: 'Credit Card B', balance: 1500, apr: 18, minPayment: 50 },
  { id: 3, name: 'Car Loan', balance: 8000, apr: 6, minPayment: 200 },
];

/**
 * Simulates a real debt payoff schedule month by month:
 * - Interest accrues on every active debt's remaining balance
 * - Minimum payments are made on every active debt
 * - Any extra budget (explicit extra payment + minimums freed up from
 *   debts that have already been paid off) is thrown entirely at the
 *   top-priority debt under the given strategy
 * - "avalanche" prioritizes highest APR first; "snowball" prioritizes
 *   smallest balance first
 */
function simulatePayoff(debts, extraPayment, strategy) {
  let working = debts.map(d => ({ ...d, rolled: false }));
  let rolledExtra = 0;
  let totalInterest = 0;
  let month = 0;
  const history = [{ month: 0, totalRemaining: working.reduce((s, d) => s + d.balance, 0) }];
  const MAX_MONTHS = 600; // 50-year safety cap in case minimums can't cover interest

  while (working.some(d => d.balance > 0.01) && month < MAX_MONTHS) {
    month++;
    const active = working.filter(d => d.balance > 0.01);

    // Accrue interest
    for (const d of active) {
      const interest = d.balance * (d.apr / 100 / 12);
      d.balance += interest;
      totalInterest += interest;
    }

    // Pay minimums
    for (const d of active) {
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
    }

    // Apply extra budget to the top-priority debt(s), cascading leftover
    let pool = extraPayment + rolledExtra;
    const sorted = [...active].sort((a, b) =>
      strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance
    );
    for (const d of sorted) {
      if (pool <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(pool, d.balance);
      d.balance -= pay;
      pool -= pay;
    }

    // Roll freed-up minimum payments from anything paid off this month
    for (const d of active) {
      if (d.balance <= 0.01 && !d.rolled) {
        rolledExtra += d.minPayment;
        d.rolled = true;
      }
    }

    const totalRemaining = working.reduce((s, d) => s + Math.max(d.balance, 0), 0);
    history.push({ month, totalRemaining });
  }

  return {
    months: month,
    totalInterest,
    payoffDate: month,
    hitCap: month >= MAX_MONTHS,
    history,
  };
}

function DebtPayoff() {
  const [debts, setDebts] = useState(DEFAULT_DEBTS);
  const [extraPayment, setExtraPayment] = useState(150);

  const updateDebt = (id, field, value) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const addDebt = () => {
    setDebts(prev => [...prev, { id: Date.now(), name: `Debt ${prev.length + 1}`, balance: 1000, apr: 15, minPayment: 25 }]);
  };

  const removeDebt = (id) => {
    setDebts(prev => prev.filter(d => d.id !== id));
  };

  const totalMinPayments = debts.reduce((s, d) => s + (parseFloat(d.minPayment) || 0), 0);
  const totalBalance = debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);

  const cleanDebts = useMemo(() =>
    debts.map(d => ({
      ...d,
      balance: parseFloat(d.balance) || 0,
      apr: parseFloat(d.apr) || 0,
      minPayment: parseFloat(d.minPayment) || 0,
    })).filter(d => d.balance > 0),
  [debts]);

  const avalanche = useMemo(() => simulatePayoff(cleanDebts, parseFloat(extraPayment) || 0, 'avalanche'), [cleanDebts, extraPayment]);
  const snowball = useMemo(() => simulatePayoff(cleanDebts, parseFloat(extraPayment) || 0, 'snowball'), [cleanDebts, extraPayment]);

  const width = 500;
  const height = 220;
  const padding = 44;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const maxMonths = Math.max(avalanche.months, snowball.months, 1);
  const maxBalance = totalBalance * 1.05;

  const xScale = (m) => padding + (m / maxMonths) * plotWidth;
  const yScale = (v) => padding + plotHeight - (v / (maxBalance || 1)) * plotHeight;
  const pathFor = (history) => history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.month)} ${yScale(p.totalRemaining)}`).join(' ');

  const winner = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball';
  const interestSaved = Math.abs(avalanche.totalInterest - snowball.totalInterest);

  return (
    <div className="min-h-screen bg-coral/10 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-coral px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Planning Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Debt Payoff Calculator
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Avalanche vs. snowball — see which actually saves you more, using your real numbers.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Your Debts</h4>
              <div className="space-y-4">
                {debts.map(d => (
                  <div key={d.id} className="p-3 md:p-0 border md:border-0 border-cream-dark rounded-xl md:rounded-none">
                    {/* Name + remove button row, always full width */}
                    <div className="flex gap-2 items-center mb-2 md:mb-0 md:grid md:grid-cols-12 md:gap-2">
                      <input
                        type="text"
                        value={d.name}
                        onChange={(e) => updateDebt(d.id, 'name', e.target.value)}
                        className="flex-1 md:col-span-4 p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                      <button
                        onClick={() => removeDebt(d.id)}
                        className="md:hidden text-navy-light hover:text-coral text-lg leading-none px-2"
                        title="Remove"
                      >
                        ×
                      </button>
                      <div className="hidden md:block md:col-span-3 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">$</span>
                        <input
                          type="number"
                          value={d.balance}
                          onChange={(e) => updateDebt(d.id, 'balance', e.target.value)}
                          placeholder="Balance"
                          className="w-full p-2 pl-5 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                        />
                      </div>
                      <div className="hidden md:block md:col-span-2 relative">
                        <input
                          type="number"
                          step="0.1"
                          value={d.apr}
                          onChange={(e) => updateDebt(d.id, 'apr', e.target.value)}
                          placeholder="APR"
                          className="w-full p-2 pr-5 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">%</span>
                      </div>
                      <div className="hidden md:block md:col-span-2 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">$</span>
                        <input
                          type="number"
                          value={d.minPayment}
                          onChange={(e) => updateDebt(d.id, 'minPayment', e.target.value)}
                          placeholder="Min pay"
                          className="w-full p-2 pl-5 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => removeDebt(d.id)}
                        className="hidden md:block md:col-span-1 text-navy-light hover:text-coral text-lg leading-none"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>

                    {/* Balance/APR/Min payment as labeled fields, mobile only */}
                    <div className="grid grid-cols-3 gap-2 md:hidden">
                      <div>
                        <label className="block text-navy-light text-xs mb-1">Balance</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-xs">$</span>
                          <input
                            type="number"
                            value={d.balance}
                            onChange={(e) => updateDebt(d.id, 'balance', e.target.value)}
                            className="w-full p-2 pl-4 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-navy-light text-xs mb-1">APR %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={d.apr}
                          onChange={(e) => updateDebt(d.id, 'apr', e.target.value)}
                          className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-navy-light text-xs mb-1">Min pay</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-xs">$</span>
                          <input
                            type="number"
                            value={d.minPayment}
                            onChange={(e) => updateDebt(d.id, 'minPayment', e.target.value)}
                            className="w-full p-2 pl-4 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={addDebt}
                  className="text-teal hover:text-teal-light text-sm font-medium"
                >
                  + Add another debt
                </button>
                <p className="text-navy-light text-sm">
                  Total balance: <span className="font-semibold text-navy">${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  {' '}· Min payments: <span className="font-semibold text-navy">${totalMinPayments.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-cream-dark">
                <label className="block text-navy font-medium mb-2">Extra Monthly Payment</label>
                <p className="text-navy-light text-sm mb-3">On top of all minimums, how much extra can you put toward debt each month?</p>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                  <input
                    type="number"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(e.target.value)}
                    className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-1">Which Wins?</h4>
              <p className="text-navy-light text-sm mb-6">
                Avalanche pays highest-interest debt first (mathematically optimal). Snowball pays smallest-balance debt first (built for motivation via quick wins).
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className={`p-5 rounded-xl border-2 ${winner === 'avalanche' ? 'border-sage bg-sage/10' : 'border-cream-dark'}`}>
                  <p className="font-semibold text-navy mb-2">🏔️ Avalanche {winner === 'avalanche' && '(saves more)'}</p>
                  <p className="text-navy-light text-sm">Debt-free in <span className="font-semibold text-navy">{avalanche.months} months</span></p>
                  <p className="text-navy-light text-sm">Total interest paid: <span className="font-semibold text-navy">${avalanche.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></p>
                </div>
                <div className={`p-5 rounded-xl border-2 ${winner === 'snowball' ? 'border-sage bg-sage/10' : 'border-cream-dark'}`}>
                  <p className="font-semibold text-navy mb-2">⛄ Snowball {winner === 'snowball' && '(saves more)'}</p>
                  <p className="text-navy-light text-sm">Debt-free in <span className="font-semibold text-navy">{snowball.months} months</span></p>
                  <p className="text-navy-light text-sm">Total interest paid: <span className="font-semibold text-navy">${snowball.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></p>
                </div>
              </div>
              {interestSaved > 1 && (
                <p className="text-navy font-semibold text-center mt-6">
                  {winner === 'avalanche' ? 'Avalanche' : 'Snowball'} saves you ${interestSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} in interest
                  {winner !== 'avalanche' && " — but avalanche is almost always cheaper mathematically; snowball can still make sense if quick wins keep you motivated to stick with it"}.
                </p>
              )}
              {(avalanche.hitCap || snowball.hitCap) && (
                <p className="text-coral text-sm text-center mt-4">
                  ⚠️ With these numbers, minimum payments may not even cover the interest — increase your extra payment to see a realistic payoff timeline.
                </p>
              )}
            </div>
          </FadeInSection>

          <FadeInSection delay={0.3}>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">📉 Balance Over Time</h4>
              <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {[0, 0.5, 1].map((pct, i) => {
                  const y = padding + pct * plotHeight;
                  const value = maxBalance - pct * maxBalance;
                  return (
                    <g key={i}>
                      <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
                      <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">
                        ${(value / 1000).toFixed(1)}k
                      </text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const x = padding + pct * plotWidth;
                  const m = Math.round(pct * maxMonths);
                  return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">{m}mo</text>;
                })}
                <path d={pathFor(avalanche.history)} fill="none" stroke="#3D8B8B" strokeWidth="3" />
                <path d={pathFor(snowball.history)} fill="none" stroke="#E8A54B" strokeWidth="2.5" strokeDasharray="5 3" />
              </svg>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2"><div className="w-4 h-1 bg-teal rounded"></div><span className="text-navy">Avalanche</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-amber rounded"></div><span className="text-navy">Snowball</span></div>
              </div>
            </div>
          </FadeInSection>

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            Assumes fixed APRs and no new charges added to any balance. Real cards often have variable rates and fees not modeled here.
          </p>

          <PageNavigation
            prevPath="/goal-planner"
            prevLabel="Goal Planner"
            nextPath="/monte-carlo"
            nextLabel="Monte Carlo Simulator"
          />
        </div>
      </div>
    </div>
  );
}

export default DebtPayoff;