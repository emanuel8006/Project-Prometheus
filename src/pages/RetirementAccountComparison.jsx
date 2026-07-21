import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

function compoundGrowth(monthlyContribution, months, annualReturnPct) {
  const monthlyReturn = annualReturnPct / 100 / 12;
  let balance = 0;
  const history = [{ month: 0, balance }];
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyReturn) + monthlyContribution;
    if (m % 12 === 0) history.push({ month: m, balance });
  }
  return { finalBalance: balance, history };
}

function RetirementAccountComparison() {
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [currentTaxRate, setCurrentTaxRate] = useState(22);
  const [retirementTaxRate, setRetirementTaxRate] = useState(15);
  const [yearsToRetirement, setYearsToRetirement] = useState(30);
  const [annualReturnPct, setAnnualReturnPct] = useState(7);
  const [employerMatchPct, setEmployerMatchPct] = useState(50);
  const [employerMatchCap, setEmployerMatchCap] = useState(150);

  const months = yearsToRetirement * 12;

  const result = useMemo(() => {
    const employerMatch = Math.min(monthlyContribution * (employerMatchPct / 100), employerMatchCap);

    // Traditional 401(k): pre-tax contribution + employer match, both grow
    // tax-deferred, taxed as ordinary income when withdrawn.
    const trad401k = compoundGrowth(monthlyContribution + employerMatch, months, annualReturnPct);
    const trad401kAfterTax = trad401k.finalBalance * (1 - retirementTaxRate / 100);

    // Traditional IRA: same pre-tax treatment, but no employer match exists for IRAs.
    const tradIRA = compoundGrowth(monthlyContribution, months, annualReturnPct);
    const tradIRAAfterTax = tradIRA.finalBalance * (1 - retirementTaxRate / 100);

    // Roth IRA: contributions are already after-tax, so they grow to a
    // smaller pre-tax-equivalent balance for the same dollar amount, but
    // withdrawals are entirely tax-free -- no match exists for Roth IRA either.
    const roth = compoundGrowth(monthlyContribution, months, annualReturnPct);
    const rothAfterTax = roth.finalBalance; // already tax-free

    return {
      employerMatch,
      trad401k: { ...trad401k, afterTax: trad401kAfterTax },
      tradIRA: { ...tradIRA, afterTax: tradIRAAfterTax },
      roth: { ...roth, afterTax: rothAfterTax },
    };
  }, [monthlyContribution, retirementTaxRate, months, annualReturnPct, employerMatchPct, employerMatchCap]);

  const accounts = [
    { key: 'trad401k', label: 'Traditional 401(k)', color: '#3D8B8B', hasMatch: true },
    { key: 'tradIRA', label: 'Traditional IRA', color: '#E8A54B', hasMatch: false },
    { key: 'roth', label: 'Roth IRA', color: '#6FA88A', hasMatch: false },
  ];

  const winner = accounts.reduce((best, acc) =>
    result[acc.key].afterTax > result[best.key].afterTax ? acc : best
  , accounts[0]);

  // Chart geometry
  const width = 560;
  const height = 260;
  const padding = 48;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const maxBalance = Math.max(
    result.trad401k.afterTax, result.tradIRA.afterTax, result.roth.afterTax,
    result.trad401k.finalBalance
  ) * 1.1;

  const xScale = (m) => padding + (m / months) * plotWidth;
  const yScale = (v) => padding + plotHeight - (v / maxBalance) * plotHeight;
  const pathFor = (history, afterTaxFinal, preTaxFinal) => {
    // Scale each history point proportionally so the after-tax adjustment
    // shows on the whole curve, not just snapped on at the very end.
    const scaleFactor = preTaxFinal > 0 ? afterTaxFinal / preTaxFinal : 1;
    return history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.month)} ${yScale(p.balance * scaleFactor)}`).join(' ');
  };

  return (
    <div className="min-h-screen bg-teal/5 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-teal px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Planning Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              401(k) vs. Roth vs. Traditional IRA
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Same monthly contribution, three different tax treatments — see what actually comes out ahead for your situation.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Your Numbers</h4>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
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
                  <label className="block text-navy font-medium mb-2">Years Until Retirement</label>
                  <input
                    type="number"
                    value={yearsToRetirement}
                    onChange={(e) => setYearsToRetirement(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Your Tax Rate Now</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={currentTaxRate}
                      onChange={(e) => setCurrentTaxRate(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                      className="w-full p-3 pr-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Expected Tax Rate in Retirement</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={retirementTaxRate}
                      onChange={(e) => setRetirementTaxRate(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                      className="w-full p-3 pr-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Expected Annual Return</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={annualReturnPct}
                      onChange={(e) => setAnnualReturnPct(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 pr-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy">%</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-cream-dark">
                <label className="block text-navy font-medium mb-2">401(k) Employer Match (doesn't apply to IRAs)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-navy-light text-sm mb-1">Match Rate</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={employerMatchPct}
                        onChange={(e) => setEmployerMatchPct(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full p-2 pr-7 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-navy-light text-sm mb-1">Match Cap (monthly $)</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">$</span>
                      <input
                        type="number"
                        value={employerMatchCap}
                        onChange={(e) => setEmployerMatchCap(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full p-2 pl-5 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-navy-light text-xs mt-2">
                  Currently: employer adds ${result.employerMatch.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month in free money to your 401(k) — this alone is often the single best argument for using the 401(k) at least up to the match.
                </p>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.15}>
            <div className={`rounded-2xl p-8 text-center ${winner.key === 'trad401k' ? 'bg-teal/20' : winner.key === 'roth' ? 'bg-sage/20' : 'bg-amber/20'}`}>
              <p className="text-navy-light mb-2">Based on your numbers, the winner (after-tax, at retirement) is</p>
              <p className="font-display text-4xl font-bold text-navy mb-4">{winner.label}</p>
              <div className="grid md:grid-cols-3 gap-4">
                {accounts.map(acc => (
                  <div key={acc.key} className={`p-4 rounded-xl ${acc.key === winner.key ? 'bg-white shadow-md' : 'bg-white/50'}`}>
                    <p className="text-navy-light text-sm mb-1">{acc.label}</p>
                    <p className="font-display text-2xl font-bold" style={{ color: acc.color }}>
                      ${result[acc.key].afterTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    {acc.hasMatch && result.employerMatch > 0 && (
                      <p className="text-navy-light text-xs mt-1">includes employer match</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-1">📈 Growth Over Time (After-Tax Value)</h4>
              <p className="text-navy-light text-sm mb-4">
                Shown in the dollars you'd actually get to keep after taxes at withdrawal.
              </p>
              <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {[0, 0.5, 1].map((pct, i) => {
                  const y = padding + pct * plotHeight;
                  const value = maxBalance - pct * maxBalance;
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
                  const yr = Math.round(pct * yearsToRetirement);
                  return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">yr {yr}</text>;
                })}
                {accounts.map(acc => (
                  <path
                    key={acc.key}
                    d={pathFor(result[acc.key].history, result[acc.key].afterTax, result[acc.key].finalBalance)}
                    fill="none"
                    stroke={acc.color}
                    strokeWidth={acc.key === winner.key ? 3.5 : 2.5}
                  />
                ))}
              </svg>
              <div className="flex justify-center gap-4 mt-4 text-sm flex-wrap">
                {accounts.map(acc => (
                  <div key={acc.key} className="flex items-center gap-2">
                    <div className="w-4 h-1 rounded" style={{ backgroundColor: acc.color }}></div>
                    <span className="text-navy">{acc.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.25}>
            <div className="bg-cream rounded-2xl p-6">
              <h4 className="font-display text-lg font-bold text-navy mb-2">Why this happens</h4>
              <ul className="space-y-2 text-navy-light text-sm">
                <li>• If your tax rate now equals your tax rate in retirement, Traditional and Roth are mathematically identical for the same dollar contribution — the only real edge Traditional has is the employer match, which Roth IRA can't get.</li>
                <li>• If you expect a <strong>lower</strong> tax rate in retirement than now, Traditional tends to win — you defer tax now at a high rate and pay it later at a lower one.</li>
                <li>• If you expect a <strong>higher</strong> tax rate in retirement than now (common for young people early in their careers), Roth tends to win — you pay tax now at a low rate and never pay it again.</li>
                <li>• An employer match is free money regardless of account type — always contribute at least enough to capture the full match before optimizing anything else.</li>
              </ul>
            </div>
          </FadeInSection>

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            Simplified for education: real accounts have contribution limits, required minimum distributions, early withdrawal penalties, and other rules not modeled here. This isn't tax or investment advice — consult a professional for your actual situation.
          </p>

          <PageNavigation
            prevPath="/life-path"
            prevLabel="Life Path"
            nextPath="/conclusion"
            nextLabel="See Conclusion"
          />
        </div>
      </div>
    </div>
  );
}

export default RetirementAccountComparison;