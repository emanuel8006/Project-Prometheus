import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const CAREER_PRESETS = [
  { label: 'Startup / Tech', startingSalary: 75000, growthRate: 8, desc: 'Lower early salary, but faster raises and equity upside possible.' },
  { label: 'Corporate / Established', startingSalary: 65000, growthRate: 4, desc: 'Steady, predictable raises over a long career.' },
  { label: 'Public Sector / Nonprofit', startingSalary: 55000, growthRate: 2.5, desc: 'Lower ceiling, but very stable and often better benefits/pension.' },
  { label: 'Custom', startingSalary: 60000, growthRate: 4, desc: 'Set your own numbers.' },
];

const CITY_PRESETS = [
  { label: 'Lower Cost of Living', typicalSavingsRate: '20-30%', note: 'Smaller cities/rural areas — housing costs go much further.' },
  { label: 'Mid Cost of Living', typicalSavingsRate: '15-20%', note: 'Most mid-size metro areas.' },
  { label: 'Major Metro (NYC/SF/etc.)', typicalSavingsRate: '5-15%', note: 'Higher salaries often get eaten by housing costs — actual savings rate matters more than salary size here.' },
];

function projectNetWorth(currentAge, retirementAge, startingSalary, salaryGrowthRate, savingsRatePct, investmentReturnPct, lifeEvents) {
  const months = (retirementAge - currentAge) * 12;
  const monthlyReturn = investmentReturnPct / 100 / 12;

  let balance = 0;
  let salary = startingSalary;
  const history = [{ age: currentAge, balance }];

  const eventsByMonth = {};
  lifeEvents.forEach(e => {
    const monthIndex = Math.round((e.age - currentAge) * 12);
    if (monthIndex >= 0 && monthIndex <= months) {
      eventsByMonth[monthIndex] = (eventsByMonth[monthIndex] || 0) + e.amount;
    }
  });

  for (let m = 1; m <= months; m++) {
    if (m % 12 === 0) {
      salary = salary * (1 + salaryGrowthRate / 100);
    }
    const monthlyContribution = (salary / 12) * (savingsRatePct / 100);
    balance = balance * (1 + monthlyReturn) + monthlyContribution;

    if (eventsByMonth[m]) {
      balance = Math.max(0, balance + eventsByMonth[m]);
    }

    if (m % 12 === 0) {
      history.push({ age: currentAge + m / 12, balance });
    }
  }

  return { finalBalance: balance, history, finalSalary: salary };
}

function LifePathSimulator() {
  const [currentAge, setCurrentAge] = useState(22);
  const [retirementAge, setRetirementAge] = useState(65);
  const [careerPresetIndex, setCareerPresetIndex] = useState(1);
  const [startingSalary, setStartingSalary] = useState(CAREER_PRESETS[1].startingSalary);
  const [salaryGrowthRate, setSalaryGrowthRate] = useState(CAREER_PRESETS[1].growthRate);
  const [cityPresetIndex, setCityPresetIndex] = useState(1);
  const [savingsRatePct, setSavingsRatePct] = useState(15);
  const [investmentReturnPct, setInvestmentReturnPct] = useState(7);
  const [lifeEvents, setLifeEvents] = useState([
    { id: 1, label: 'Buy a house (down payment)', age: 32, amount: -60000 },
    { id: 2, label: 'Have a kid', age: 30, amount: -15000 },
  ]);

  const applyCareerPreset = (index) => {
    setCareerPresetIndex(index);
    setStartingSalary(CAREER_PRESETS[index].startingSalary);
    setSalaryGrowthRate(CAREER_PRESETS[index].growthRate);
  };

  const updateEvent = (id, field, value) => {
    setLifeEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const addEvent = () => {
    setLifeEvents(prev => [...prev, { id: Date.now(), label: 'New event', age: currentAge + 5, amount: -10000 }]);
  };

  const removeEvent = (id) => {
    setLifeEvents(prev => prev.filter(e => e.id !== id));
  };

  const result = useMemo(() => {
    const cleanEvents = lifeEvents
      .map(e => ({ ...e, age: parseFloat(e.age) || 0, amount: parseFloat(e.amount) || 0 }))
      .filter(e => e.age >= currentAge && e.age <= retirementAge);
    return projectNetWorth(currentAge, retirementAge, startingSalary, salaryGrowthRate, savingsRatePct, investmentReturnPct, cleanEvents);
  }, [currentAge, retirementAge, startingSalary, salaryGrowthRate, savingsRatePct, investmentReturnPct, lifeEvents]);

  // Chart geometry
  const width = 560;
  const height = 260;
  const padding = 48;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const maxBalance = Math.max(...result.history.map(p => p.balance), 1) * 1.1;
  const minBalance = Math.min(0, ...result.history.map(p => p.balance));
  const xScale = (age) => padding + ((age - currentAge) / (retirementAge - currentAge || 1)) * plotWidth;
  const yScale = (v) => padding + plotHeight - ((v - minBalance) / (maxBalance - minBalance || 1)) * plotHeight;
  const linePath = result.history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.age)} ${yScale(p.balance)}`).join(' ');
  const zeroY = yScale(0);

  return (
    <div className="min-h-screen bg-sage/10 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-sage px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Advanced Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Life Path Simulator
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Career, savings rate, and real life events — see how they all compound into your net worth by retirement.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Your Timeline</h4>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-navy font-medium mb-2">Current Age</label>
                  <input
                    type="number"
                    value={currentAge}
                    onChange={(e) => setCurrentAge(Math.max(16, Math.min(80, parseInt(e.target.value) || 16)))}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Retirement Age</label>
                  <input
                    type="number"
                    value={retirementAge}
                    onChange={(e) => setRetirementAge(Math.max(currentAge + 1, Math.min(90, parseInt(e.target.value) || 65)))}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <h4 className="font-display text-lg font-bold text-navy mb-3">Career Path</h4>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {CAREER_PRESETS.map((preset, i) => (
                  <button
                    key={preset.label}
                    onClick={() => applyCareerPreset(i)}
                    className={`p-3 rounded-lg text-left border-2 transition-all ${
                      careerPresetIndex === i ? 'border-teal bg-teal/10' : 'border-cream-dark hover:border-teal/50'
                    }`}
                  >
                    <div className="font-semibold text-navy text-sm">{preset.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-navy-light text-xs bg-cream p-3 rounded-lg mb-4">{CAREER_PRESETS[careerPresetIndex].desc}</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-navy-light text-sm mb-1">Starting Salary</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                    <input
                      type="number"
                      value={startingSalary}
                      onChange={(e) => setStartingSalary(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-2 pl-7 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-navy-light text-sm mb-1">Annual Raise (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={salaryGrowthRate}
                    onChange={(e) => setSalaryGrowthRate(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <h4 className="font-display text-lg font-bold text-navy mb-3">Where You Live</h4>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {CITY_PRESETS.map((preset, i) => (
                  <button
                    key={preset.label}
                    onClick={() => setCityPresetIndex(i)}
                    className={`p-3 rounded-lg text-left border-2 transition-all ${
                      cityPresetIndex === i ? 'border-teal bg-teal/10' : 'border-cream-dark hover:border-teal/50'
                    }`}
                  >
                    <div className="font-semibold text-navy text-xs">{preset.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-navy-light text-xs bg-cream p-3 rounded-lg mb-6">
                {CITY_PRESETS[cityPresetIndex].note} Typical realistic savings rate here: {CITY_PRESETS[cityPresetIndex].typicalSavingsRate}.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-navy font-medium mb-2">Savings Rate (% of income)</label>
                  <input
                    type="number"
                    value={savingsRatePct}
                    onChange={(e) => setSavingsRatePct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Expected Return (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={investmentReturnPct}
                    onChange={(e) => setInvestmentReturnPct(parseFloat(e.target.value) || 0)}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.15}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-1">Life Events</h4>
              <p className="text-navy-light text-sm mb-4">One-time costs (or windfalls) at a given age — negative for expenses, positive for windfalls.</p>
              <div className="space-y-3 mb-4">
                {lifeEvents.map(e => (
                  <div key={e.id} className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      value={e.label}
                      onChange={(ev) => updateEvent(e.id, 'label', ev.target.value)}
                      className="flex-1 min-w-[140px] p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-navy-light text-xs">Age</span>
                      <input
                        type="number"
                        value={e.age}
                        onChange={(ev) => updateEvent(e.id, 'age', ev.target.value)}
                        className="w-16 p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-light text-sm">$</span>
                      <input
                        type="number"
                        value={e.amount}
                        onChange={(ev) => updateEvent(e.id, 'amount', ev.target.value)}
                        className="w-full p-2 pl-5 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => removeEvent(e.id)}
                      className="text-navy-light hover:text-coral text-lg leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addEvent} className="text-teal hover:text-teal-light text-sm font-medium">
                + Add a life event
              </button>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <div className="rounded-2xl p-8 text-center bg-sage/20">
              <p className="text-navy-light mb-2">
                Projected net worth at age {retirementAge}
              </p>
              <p className="font-display text-5xl md:text-6xl font-bold text-navy mb-2">
                ${result.finalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-navy-light text-sm">
                Final salary at retirement: ~${result.finalSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}/year
              </p>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.25}>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">📈 Net Worth Over Time</h4>
              <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {[0, 0.5, 1].map((pct, i) => {
                  const y = padding + pct * plotHeight;
                  const value = maxBalance - pct * (maxBalance - minBalance);
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
                  const age = Math.round(currentAge + pct * (retirementAge - currentAge));
                  return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">age {age}</text>;
                })}
                {minBalance < 0 && (
                  <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#1a2744" strokeOpacity="0.3" />
                )}
                {/* Life event markers */}
                {lifeEvents.filter(e => e.age >= currentAge && e.age <= retirementAge).map((e, i) => (
                  <line
                    key={i}
                    x1={xScale(e.age)} y1={padding}
                    x2={xScale(e.age)} y2={height - padding}
                    stroke={e.amount < 0 ? '#D9534F' : '#6FA88A'}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.5"
                  />
                ))}
                <path d={linePath} fill="none" stroke="#3D8B8B" strokeWidth="3" />
              </svg>
              <p className="text-navy-light text-xs text-center mt-2">
                Dashed lines mark life events (red = expense, green = windfall).
              </p>
            </div>
          </FadeInSection>

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            This assumes a smooth constant raise and constant investment return every year — real careers and markets are far less predictable.
            It's a tool for understanding how the pieces compound together, not a prediction of your actual future.
          </p>

          <PageNavigation
            prevPath="/algo-backtester"
            prevLabel="Backtester"
            nextPath="/conclusion"
            nextLabel="See Conclusion"
          />
        </div>
      </div>
    </div>
  );
}

export default LifePathSimulator;