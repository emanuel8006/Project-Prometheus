import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const CONTRACT_MULTIPLIER = 100; // one options contract = 100 shares

const POSITION_TYPES = [
  { id: 'long_call', label: 'Long Call', desc: 'Betting the price goes up. Limited loss (the premium), unlimited upside.' },
  { id: 'long_put', label: 'Long Put', desc: 'Betting the price goes down. Limited loss (the premium), large upside if it drops.' },
  { id: 'short_call', label: 'Short Call', desc: 'Betting the price stays flat or drops. Limited gain (the premium), unlimited loss if it rises.' },
  { id: 'short_put', label: 'Short Put', desc: 'Betting the price stays flat or rises. Limited gain (the premium), large loss if it drops sharply.' },
];

const STRATEGY_TYPES = [
  { id: 'covered_call', label: 'Covered Call', desc: 'Own the stock, sell a call against it. Caps your upside in exchange for immediate income — a common way to generate yield on shares you already hold.' },
  { id: 'protective_put', label: 'Protective Put', desc: 'Own the stock, buy a put as insurance. Costs a premium, but puts a floor under how much you can lose if the stock crashes.' },
  { id: 'bull_call_spread', label: 'Bull Call Spread', desc: 'Buy a call at a lower strike, sell a call at a higher strike. Cheaper than a plain long call, but caps your maximum profit.' },
  { id: 'bear_put_spread', label: 'Bear Put Spread', desc: 'Buy a put at a higher strike, sell a put at a lower strike. Cheaper than a plain long put, but caps your maximum profit.' },
];

function singleLegPayoff(positionType, price, strike, premium) {
  const intrinsicCall = Math.max(price - strike, 0);
  const intrinsicPut = Math.max(strike - price, 0);
  switch (positionType) {
    case 'long_call': return (intrinsicCall - premium) * CONTRACT_MULTIPLIER;
    case 'long_put': return (intrinsicPut - premium) * CONTRACT_MULTIPLIER;
    case 'short_call': return (premium - intrinsicCall) * CONTRACT_MULTIPLIER;
    case 'short_put': return (premium - intrinsicPut) * CONTRACT_MULTIPLIER;
    default: return 0;
  }
}

function singleLegStats(positionType, strike, premium) {
  switch (positionType) {
    case 'long_call':
      return { breakeven: strike + premium, maxLossLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`, maxProfitLabel: 'Unlimited' };
    case 'long_put':
      return { breakeven: strike - premium, maxLossLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`, maxProfitLabel: `$${((strike - premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })} (if price hits $0)` };
    case 'short_call':
      return { breakeven: strike + premium, maxLossLabel: 'Unlimited', maxProfitLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}` };
    case 'short_put':
      return { breakeven: strike - premium, maxLossLabel: `$${((strike - premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })} (if price hits $0)`, maxProfitLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}` };
    default:
      return {};
  }
}

function strategyPayoff(strategyType, price, params) {
  const { stockPrice, strike, premium, strike2, premium2 } = params;
  switch (strategyType) {
    case 'covered_call': {
      const stockPL = (price - stockPrice) * CONTRACT_MULTIPLIER;
      const shortCallPL = (premium - Math.max(price - strike, 0)) * CONTRACT_MULTIPLIER;
      return stockPL + shortCallPL;
    }
    case 'protective_put': {
      const stockPL = (price - stockPrice) * CONTRACT_MULTIPLIER;
      const longPutPL = (Math.max(strike - price, 0) - premium) * CONTRACT_MULTIPLIER;
      return stockPL + longPutPL;
    }
    case 'bull_call_spread': {
      const longCallPL = (Math.max(price - strike, 0) - premium) * CONTRACT_MULTIPLIER;
      const shortCallPL = (premium2 - Math.max(price - strike2, 0)) * CONTRACT_MULTIPLIER;
      return longCallPL + shortCallPL;
    }
    case 'bear_put_spread': {
      const shortPutPL = (premium - Math.max(strike - price, 0)) * CONTRACT_MULTIPLIER;
      const longPutPL = (Math.max(strike2 - price, 0) - premium2) * CONTRACT_MULTIPLIER;
      return shortPutPL + longPutPL;
    }
    default:
      return 0;
  }
}

function strategyStats(strategyType, params) {
  const { stockPrice, strike, premium, strike2, premium2 } = params;
  switch (strategyType) {
    case 'covered_call':
      return {
        breakeven: stockPrice - premium,
        maxProfitLabel: `$${((strike - stockPrice + premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        maxLossLabel: `$${((stockPrice - premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })} (if stock hits $0)`,
      };
    case 'protective_put':
      return {
        breakeven: stockPrice + premium,
        maxProfitLabel: 'Unlimited',
        maxLossLabel: `$${((stockPrice - strike + premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      };
    case 'bull_call_spread': {
      const netDebit = premium - premium2;
      return {
        breakeven: strike + netDebit,
        maxProfitLabel: `$${((strike2 - strike - netDebit) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        maxLossLabel: `$${(netDebit * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      };
    }
    case 'bear_put_spread': {
      const netDebit = premium2 - premium;
      return {
        breakeven: strike2 - netDebit,
        maxProfitLabel: `$${((strike2 - strike - netDebit) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        maxLossLabel: `$${(netDebit * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      };
    }
    default:
      return {};
  }
}

function OptionsPayoff() {
  const [mode, setMode] = useState('single'); // 'single' | 'strategy'

  // Single-leg state
  const [positionType, setPositionType] = useState('long_call');
  const [strike, setStrike] = useState(100);
  const [premium, setPremium] = useState(5);

  // Strategy (multi-leg) state
  const [strategyType, setStrategyType] = useState('covered_call');
  const [stockPrice, setStockPrice] = useState(100);
  const [stratStrike, setStratStrike] = useState(110);
  const [stratPremium, setStratPremium] = useState(3);
  const [stratStrike2, setStratStrike2] = useState(120);
  const [stratPremium2, setStratPremium2] = useState(1.5);

  const [currentPrice, setCurrentPrice] = useState(100);

  const positionInfo = POSITION_TYPES.find(p => p.id === positionType);
  const strategyInfo = STRATEGY_TYPES.find(s => s.id === strategyType);
  const isSpread = strategyType === 'bull_call_spread' || strategyType === 'bear_put_spread';

  const anchorPrice = mode === 'single' ? strike : (isSpread ? stratStrike : stockPrice);
  const rangeLow = Math.max(0, anchorPrice * 0.5);
  const rangeHigh = anchorPrice * 1.5;
  const numPoints = 100;

  const strategyParams = {
    stockPrice,
    strike: stratStrike,
    premium: stratPremium,
    strike2: stratStrike2,
    premium2: stratPremium2,
  };

  const payoffAt = (price) => mode === 'single'
    ? singleLegPayoff(positionType, price, strike, premium)
    : strategyPayoff(strategyType, price, strategyParams);

  const stats = useMemo(() => mode === 'single'
    ? singleLegStats(positionType, strike, premium)
    : strategyStats(strategyType, strategyParams),
  [mode, positionType, strike, premium, strategyType, stockPrice, stratStrike, stratPremium, stratStrike2, stratPremium2]);

  const curve = useMemo(() => {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const price = rangeLow + (i / numPoints) * (rangeHigh - rangeLow);
      points.push({ price, payoff: payoffAt(price) });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, positionType, strike, premium, strategyType, stockPrice, stratStrike, stratPremium, stratStrike2, stratPremium2, rangeLow, rangeHigh]);

  const currentPayoff = payoffAt(currentPrice);

  // Chart geometry
  const width = 560;
  const height = 280;
  const padding = 50;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const maxAbsPayoff = Math.max(...curve.map(p => Math.abs(p.payoff)), 1) * 1.15;
  const xScale = (price) => padding + ((price - rangeLow) / (rangeHigh - rangeLow)) * plotWidth;
  const yScale = (payoff) => padding + plotHeight / 2 - (payoff / maxAbsPayoff) * (plotHeight / 2);

  const linePath = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.price)} ${yScale(p.payoff)}`).join(' ');
  const zeroY = yScale(0);

  const areaAbove = `${curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.price)} ${yScale(Math.max(p.payoff, 0))}`).join(' ')} L ${xScale(rangeHigh)} ${zeroY} L ${xScale(rangeLow)} ${zeroY} Z`;
  const areaBelow = `${curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.price)} ${yScale(Math.min(p.payoff, 0))}`).join(' ')} L ${xScale(rangeHigh)} ${zeroY} L ${xScale(rangeLow)} ${zeroY} Z`;

  return (
    <div className="min-h-screen bg-navy/5 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-navy px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Advanced Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Options Payoff Visualizer
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              See exactly how a position — single-leg or multi-leg — actually pays off at every possible price.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setMode('single')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${mode === 'single' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'}`}
                >
                  Single Position
                </button>
                <button
                  onClick={() => setMode('strategy')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${mode === 'strategy' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'}`}
                >
                  Multi-Leg Strategy
                </button>
              </div>

              {mode === 'single' ? (
                <>
                  <h4 className="font-display text-xl font-bold text-navy mb-4">Position</h4>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {POSITION_TYPES.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPositionType(p.id)}
                        className={`p-3 rounded-lg text-left transition-all border-2 ${positionType === p.id ? 'border-teal bg-teal/10' : 'border-cream-dark hover:border-teal/50'}`}
                      >
                        <div className="font-semibold text-navy text-sm">{p.label}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-navy-light text-sm bg-cream p-3 rounded-lg mb-6">{positionInfo.desc}</p>

                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-navy font-medium">Strike Price</label>
                        <span className="text-navy font-semibold">${strike}</span>
                      </div>
                      <input type="range" min="10" max="500" step="1" value={strike} onChange={(e) => setStrike(parseFloat(e.target.value))} className="w-full accent-teal" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-navy font-medium">Premium ({positionType.startsWith('long') ? 'Paid' : 'Received'})</label>
                        <span className="text-navy font-semibold">${premium.toFixed(2)}</span>
                      </div>
                      <input type="range" min="0.5" max="50" step="0.5" value={premium} onChange={(e) => setPremium(parseFloat(e.target.value))} className="w-full accent-teal" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-display text-xl font-bold text-navy mb-4">Strategy</h4>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {STRATEGY_TYPES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setStrategyType(s.id)}
                        className={`p-3 rounded-lg text-left transition-all border-2 ${strategyType === s.id ? 'border-teal bg-teal/10' : 'border-cream-dark hover:border-teal/50'}`}
                      >
                        <div className="font-semibold text-navy text-sm">{s.label}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-navy-light text-sm bg-cream p-3 rounded-lg mb-6">{strategyInfo.desc}</p>

                  <div className="space-y-5">
                    {!isSpread && (
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-navy font-medium">Stock Purchase Price</label>
                          <span className="text-navy font-semibold">${stockPrice}</span>
                        </div>
                        <input type="range" min="10" max="500" step="1" value={stockPrice} onChange={(e) => setStockPrice(parseFloat(e.target.value))} className="w-full accent-navy" />
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-navy font-medium">
                          {strategyType === 'covered_call' ? 'Call Strike (sold)' :
                           strategyType === 'protective_put' ? 'Put Strike (bought)' :
                           strategyType === 'bull_call_spread' ? 'Lower Strike (long call, bought)' :
                           'Lower Strike (short put, sold)'}
                        </label>
                        <span className="text-navy font-semibold">${stratStrike}</span>
                      </div>
                      <input type="range" min="10" max="500" step="1" value={stratStrike} onChange={(e) => setStratStrike(parseFloat(e.target.value))} className="w-full accent-teal" />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-navy font-medium">Premium ({strategyType === 'bull_call_spread' ? 'Paid, long leg' : strategyType === 'bear_put_spread' ? 'Received, short leg' : strategyType === 'covered_call' ? 'Received' : 'Paid'})</label>
                        <span className="text-navy font-semibold">${stratPremium.toFixed(2)}</span>
                      </div>
                      <input type="range" min="0.5" max="50" step="0.5" value={stratPremium} onChange={(e) => setStratPremium(parseFloat(e.target.value))} className="w-full accent-teal" />
                    </div>

                    {isSpread && (
                      <>
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-navy font-medium">
                              {strategyType === 'bull_call_spread' ? 'Higher Strike (short call, sold)' : 'Higher Strike (long put, bought)'}
                            </label>
                            <span className="text-navy font-semibold">${stratStrike2}</span>
                          </div>
                          <input type="range" min="10" max="500" step="1" value={stratStrike2} onChange={(e) => setStratStrike2(parseFloat(e.target.value))} className="w-full accent-coral" />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-navy font-medium">Premium ({strategyType === 'bull_call_spread' ? 'Received, short leg' : 'Paid, long leg'})</label>
                            <span className="text-navy font-semibold">${stratPremium2.toFixed(2)}</span>
                          </div>
                          <input type="range" min="0.5" max="50" step="0.5" value={stratPremium2} onChange={(e) => setStratPremium2(parseFloat(e.target.value))} className="w-full accent-coral" />
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="mt-6 pt-6 border-t border-cream-dark">
                <div className="flex justify-between mb-1">
                  <label className="text-navy font-medium">Current Underlying Price</label>
                  <span className="text-navy font-semibold">${currentPrice}</span>
                </div>
                <input type="range" min={rangeLow} max={rangeHigh} step="1" value={currentPrice} onChange={(e) => setCurrentPrice(parseFloat(e.target.value))} className="w-full accent-coral" />
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.15}>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-5 bg-cream-dark rounded-2xl text-center">
                <p className="text-navy-light text-sm mb-1">Breakeven Price</p>
                <p className="font-display text-2xl font-bold text-navy">${stats.breakeven.toFixed(2)}</p>
              </div>
              <div className="p-5 bg-coral/10 rounded-2xl text-center">
                <p className="text-navy-light text-sm mb-1">Max Loss</p>
                <p className="font-display text-2xl font-bold text-coral">{stats.maxLossLabel}</p>
              </div>
              <div className="p-5 bg-sage/10 rounded-2xl text-center">
                <p className="text-navy-light text-sm mb-1">Max Profit</p>
                <p className="font-display text-2xl font-bold text-sage">{stats.maxProfitLabel}</p>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            <div className={`rounded-2xl p-6 text-center ${currentPayoff >= 0 ? 'bg-sage/20' : 'bg-coral/20'}`}>
              <p className="text-navy-light mb-1">If the price is ${currentPrice} at expiration, this position is worth</p>
              <p className={`font-display text-4xl font-bold ${currentPayoff >= 0 ? 'text-sage' : 'text-coral'}`}>
                {currentPayoff >= 0 ? '+' : ''}${currentPayoff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-navy-light text-sm mt-1">per contract (100 shares)</p>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.25}>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">📈 Payoff at Expiration</h4>
              <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#1a2744" strokeOpacity="0.3" strokeWidth="1.5" />
                <text x={width - padding} y={zeroY - 6} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.6">$0</text>

                <line x1={xScale(anchorPrice)} y1={padding} x2={xScale(anchorPrice)} y2={height - padding} stroke="#1a2744" strokeOpacity="0.15" strokeDasharray="4" />

                {isSpread && (
                  <line x1={xScale(stratStrike2)} y1={padding} x2={xScale(stratStrike2)} y2={height - padding} stroke="#1a2744" strokeOpacity="0.15" strokeDasharray="4" />
                )}

                <line x1={xScale(currentPrice)} y1={padding} x2={xScale(currentPrice)} y2={height - padding} stroke="#D9534F" strokeWidth="1.5" strokeDasharray="2 3" />

                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const price = rangeLow + pct * (rangeHigh - rangeLow);
                  return (
                    <text key={i} x={xScale(price)} y={height - padding + 20} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">
                      ${price.toFixed(0)}
                    </text>
                  );
                })}

                <path d={areaAbove} fill="#6FA88A" fillOpacity="0.25" stroke="none" />
                <path d={areaBelow} fill="#D9534F" fillOpacity="0.2" stroke="none" />
                <path d={linePath} fill="none" stroke="#3D8B8B" strokeWidth="3" />
                <circle cx={xScale(currentPrice)} cy={yScale(currentPayoff)} r="6" fill="#D9534F" />
              </svg>
              <p className="text-navy-light text-xs text-center mt-2">
                Dashed red line = current underlying price. Dashed gray line(s) = strike price(s).
              </p>
            </div>
          </FadeInSection>

          <div className="bg-coral/10 rounded-2xl p-6">
            <p className="text-navy font-semibold mb-1">⚠️ Real risk, not a game</p>
            <p className="text-navy-light text-sm">
              Short calls (including the call leg of a covered call, if uncovered) and short positions generally carry outsized loss potential relative to the premium collected.
              Options can expire completely worthless, and this tool ignores time decay, volatility changes, assignment risk, and the actual cost of buying/selling contracts. This is for building intuition about payoff shape, not for making real trading decisions — options trading carries substantial risk and isn't suitable for beginners without further education.
            </p>
          </div>

          <PageNavigation
            prevPath="/monte-carlo"
            prevLabel="Monte Carlo"
            nextPath="/algo-backtester"
            nextLabel="Strategy Backtester"
          />
        </div>
      </div>
    </div>
  );
}

export default OptionsPayoff;