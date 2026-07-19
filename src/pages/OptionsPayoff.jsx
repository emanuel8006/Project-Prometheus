import { useState, useMemo } from 'react';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

const POSITION_TYPES = [
  { id: 'long_call', label: 'Long Call', desc: 'Betting the price goes up. Limited loss (the premium), unlimited upside.' },
  { id: 'long_put', label: 'Long Put', desc: 'Betting the price goes down. Limited loss (the premium), large upside if it drops.' },
  { id: 'short_call', label: 'Short Call', desc: 'Betting the price stays flat or drops. Limited gain (the premium), unlimited loss if it rises.' },
  { id: 'short_put', label: 'Short Put', desc: 'Betting the price stays flat or rises. Limited gain (the premium), large loss if it drops sharply.' },
];

const CONTRACT_MULTIPLIER = 100; // one options contract = 100 shares

function payoffAt(positionType, underlyingPrice, strike, premium) {
  const intrinsicCall = Math.max(underlyingPrice - strike, 0);
  const intrinsicPut = Math.max(strike - underlyingPrice, 0);

  switch (positionType) {
    case 'long_call':
      return (intrinsicCall - premium) * CONTRACT_MULTIPLIER;
    case 'long_put':
      return (intrinsicPut - premium) * CONTRACT_MULTIPLIER;
    case 'short_call':
      return (premium - intrinsicCall) * CONTRACT_MULTIPLIER;
    case 'short_put':
      return (premium - intrinsicPut) * CONTRACT_MULTIPLIER;
    default:
      return 0;
  }
}

function getStats(positionType, strike, premium) {
  switch (positionType) {
    case 'long_call':
      return {
        breakeven: strike + premium,
        maxLoss: premium * CONTRACT_MULTIPLIER,
        maxProfit: 'Unlimited',
        maxLossLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`,
      };
    case 'long_put':
      return {
        breakeven: strike - premium,
        maxLoss: premium * CONTRACT_MULTIPLIER,
        maxProfit: `$${((strike - premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })} (if price hits $0)`,
        maxLossLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`,
      };
    case 'short_call':
      return {
        breakeven: strike + premium,
        maxLoss: 'Unlimited',
        maxProfit: premium * CONTRACT_MULTIPLIER,
        maxProfitLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`,
      };
    case 'short_put':
      return {
        breakeven: strike - premium,
        maxLoss: `$${((strike - premium) * CONTRACT_MULTIPLIER).toLocaleString(undefined, { maximumFractionDigits: 0 })} (if price hits $0)`,
        maxProfit: premium * CONTRACT_MULTIPLIER,
        maxProfitLabel: `$${(premium * CONTRACT_MULTIPLIER).toLocaleString()}`,
      };
    default:
      return {};
  }
}

function OptionsPayoff() {
  const [positionType, setPositionType] = useState('long_call');
  const [strike, setStrike] = useState(100);
  const [premium, setPremium] = useState(5);
  const [currentPrice, setCurrentPrice] = useState(100);

  const positionInfo = POSITION_TYPES.find(p => p.id === positionType);
  const stats = useMemo(() => getStats(positionType, strike, premium), [positionType, strike, premium]);

  // Sample a price range around the strike for the payoff curve
  const rangeLow = Math.max(0, strike * 0.5);
  const rangeHigh = strike * 1.5;
  const numPoints = 100;
  const curve = useMemo(() => {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const price = rangeLow + (i / numPoints) * (rangeHigh - rangeLow);
      points.push({ price, payoff: payoffAt(positionType, price, strike, premium) });
    }
    return points;
  }, [positionType, strike, premium, rangeLow, rangeHigh]);

  const currentPayoff = payoffAt(positionType, currentPrice, strike, premium);

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

  // Split the curve into profit (above zero) and loss (below zero) fill areas
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
              See exactly how a call or put actually pays off at every possible price — including where the risk is unlimited.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Position</h4>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {POSITION_TYPES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPositionType(p.id)}
                    className={`p-3 rounded-lg text-left transition-all border-2 ${
                      positionType === p.id ? 'border-teal bg-teal/10' : 'border-cream-dark hover:border-teal/50'
                    }`}
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
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="1"
                    value={strike}
                    onChange={(e) => setStrike(parseFloat(e.target.value))}
                    className="w-full accent-teal"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-navy font-medium">Premium ({positionType.startsWith('long') ? 'Paid' : 'Received'})</label>
                    <span className="text-navy font-semibold">${premium.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="50"
                    step="0.5"
                    value={premium}
                    onChange={(e) => setPremium(parseFloat(e.target.value))}
                    className="w-full accent-teal"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-navy font-medium">Current Underlying Price</label>
                    <span className="text-navy font-semibold">${currentPrice}</span>
                  </div>
                  <input
                    type="range"
                    min={rangeLow}
                    max={rangeHigh}
                    step="1"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                    className="w-full accent-coral"
                  />
                </div>
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
                <p className="font-display text-2xl font-bold text-coral">
                  {stats.maxLossLabel || (typeof stats.maxLoss === 'string' ? stats.maxLoss : `$${stats.maxLoss.toLocaleString()}`)}
                </p>
              </div>
              <div className="p-5 bg-sage/10 rounded-2xl text-center">
                <p className="text-navy-light text-sm mb-1">Max Profit</p>
                <p className="font-display text-2xl font-bold text-sage">
                  {stats.maxProfitLabel || (typeof stats.maxProfit === 'string' ? stats.maxProfit : `$${stats.maxProfit.toLocaleString()}`)}
                </p>
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
                {/* Zero line */}
                <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#1a2744" strokeOpacity="0.3" strokeWidth="1.5" />
                <text x={width - padding} y={zeroY - 6} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.6">$0</text>

                {/* Strike line */}
                <line x1={xScale(strike)} y1={padding} x2={xScale(strike)} y2={height - padding} stroke="#1a2744" strokeOpacity="0.15" strokeDasharray="4" />
                <text x={xScale(strike)} y={padding - 8} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.6">Strike ${strike}</text>

                {/* Current price marker */}
                <line x1={xScale(currentPrice)} y1={padding} x2={xScale(currentPrice)} y2={height - padding} stroke="#D9534F" strokeWidth="1.5" strokeDasharray="2 3" />

                {/* X axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const price = rangeLow + pct * (rangeHigh - rangeLow);
                  return (
                    <text key={i} x={xScale(price)} y={height - padding + 20} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">
                      ${price.toFixed(0)}
                    </text>
                  );
                })}

                {/* Profit/loss fill */}
                <path d={areaAbove} fill="#6FA88A" fillOpacity="0.25" stroke="none" />
                <path d={areaBelow} fill="#D9534F" fillOpacity="0.2" stroke="none" />

                {/* Payoff curve */}
                <path d={linePath} fill="none" stroke="#3D8B8B" strokeWidth="3" />

                {/* Current price dot */}
                <circle cx={xScale(currentPrice)} cy={yScale(currentPayoff)} r="6" fill="#D9534F" />
              </svg>
              <p className="text-navy-light text-xs text-center mt-2">
                Dashed red line = current underlying price. Dashed gray line = strike price.
              </p>
            </div>
          </FadeInSection>

          <div className="bg-coral/10 rounded-2xl p-6">
            <p className="text-navy font-semibold mb-1">⚠️ Real risk, not a game</p>
            <p className="text-navy-light text-sm">
              Short calls carry theoretically unlimited loss potential — the stock price has no upper limit. Short puts can lose most of their value if the stock drops toward $0.
              Options can expire completely worthless, and this tool ignores time decay, volatility changes, and the actual cost of buying/selling contracts. This is for building intuition about payoff shape, not for making real trading decisions — options trading carries substantial risk and isn't suitable for beginners without further education.
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