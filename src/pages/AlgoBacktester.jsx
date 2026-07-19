import { useState } from 'react';
import { API_BASE_URL } from '../config';
import { FadeInSection } from '../components';
import { PageNavigation } from '../PageLayout';

function AlgoBacktester() {
  const [ticker, setTicker] = useState('AAPL');
  const [startDate, setStartDate] = useState('2018-01-01');
  const [endDate, setEndDate] = useState('2023-12-31');
  const [startingCash, setStartingCash] = useState(10000);
  const [strategy, setStrategy] = useState('sma_crossover');
  const [shortWindow, setShortWindow] = useState(20);
  const [longWindow, setLongWindow] = useState(50);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [buyThreshold, setBuyThreshold] = useState(30);
  const [sellThreshold, setSellThreshold] = useState(70);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        ticker,
        start_date: startDate,
        end_date: endDate,
        starting_cash: startingCash,
        strategy,
        ...(strategy === 'sma_crossover'
          ? { short_window: shortWindow, long_window: longWindow }
          : { rsi_period: rsiPeriod, buy_threshold: buyThreshold, sell_threshold: sellThreshold }),
      };
      const res = await fetch(`${API_BASE_URL}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Chart geometry (only used once we have a result)
  const width = 560;
  const height = 260;
  const padding = 48;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  let strategyPath = '', buyHoldPath = '', maxValue = 1;
  if (result) {
    const stratCurve = result.strategy_result.equity_curve;
    const bhCurve = result.buy_hold_result.equity_curve;
    const points = Math.min(stratCurve.length, bhCurve.length);
    const step = Math.max(1, Math.floor(points / 80));
    const sampledStrat = stratCurve.filter((_, i) => i % step === 0 || i === stratCurve.length - 1);
    const sampledBh = bhCurve.filter((_, i) => i % step === 0 || i === bhCurve.length - 1);
    maxValue = Math.max(...sampledStrat.map(p => p.value), ...sampledBh.map(p => p.value)) * 1.05;
    const xScale = (i, len) => padding + (i / (len - 1 || 1)) * plotWidth;
    const yScale = (v) => padding + plotHeight - (v / maxValue) * plotHeight;
    strategyPath = sampledStrat.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i, sampledStrat.length)} ${yScale(p.value)}`).join(' ');
    buyHoldPath = sampledBh.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i, sampledBh.length)} ${yScale(p.value)}`).join(' ');
  }

  const strategyWins = result && result.strategy_result.final_value > result.buy_hold_result.final_value;

  return (
    <div className="min-h-screen bg-teal/5 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-teal px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Advanced Tool
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Algorithmic Strategy Backtester
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Test a real rules-based trading strategy against real historical data — and see if it actually beats just holding.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-8">
          <FadeInSection delay={0.1}>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h4 className="font-display text-xl font-bold text-navy mb-4">Setup</h4>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-navy font-medium mb-2">Ticker</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Starting Cash</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                    <input
                      type="number"
                      value={startingCash}
                      onChange={(e) => setStartingCash(Math.max(1, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={endDate}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-navy font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-navy font-medium mb-2">Strategy</label>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setStrategy('sma_crossover')}
                    className={`flex-1 p-3 rounded-lg font-medium transition-all ${
                      strategy === 'sma_crossover' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    Moving Average Crossover
                  </button>
                  <button
                    onClick={() => setStrategy('rsi')}
                    className={`flex-1 p-3 rounded-lg font-medium transition-all ${
                      strategy === 'rsi' ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    RSI Mean Reversion
                  </button>
                </div>

                {strategy === 'sma_crossover' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-navy-light text-sm mb-1">Short Window (days)</label>
                      <input
                        type="number"
                        value={shortWindow}
                        onChange={(e) => setShortWindow(Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-navy-light text-sm mb-1">Long Window (days)</label>
                      <input
                        type="number"
                        value={longWindow}
                        onChange={(e) => setLongWindow(Math.max(3, parseInt(e.target.value) || 3))}
                        className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <p className="col-span-2 text-navy-light text-xs">
                      Buys when the {shortWindow}-day average price crosses above the {longWindow}-day average (an uptrend forming), sells when it crosses back below.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-navy-light text-sm mb-1">RSI Period</label>
                      <input
                        type="number"
                        value={rsiPeriod}
                        onChange={(e) => setRsiPeriod(Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-navy-light text-sm mb-1">Buy Below (oversold)</label>
                      <input
                        type="number"
                        value={buyThreshold}
                        onChange={(e) => setBuyThreshold(parseFloat(e.target.value) || 0)}
                        className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-navy-light text-sm mb-1">Sell Above (overbought)</label>
                      <input
                        type="number"
                        value={sellThreshold}
                        onChange={(e) => setSellThreshold(parseFloat(e.target.value) || 0)}
                        className="w-full p-2 rounded-lg border-2 border-cream-dark text-navy text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                    <p className="col-span-3 text-navy-light text-xs">
                      Buys on the recovery out of oversold (RSI crossing back above {buyThreshold}), sells on the pullback out of overbought (RSI crossing back below {sellThreshold}).
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleRun}
                disabled={loading}
                className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                  loading ? 'bg-cream-dark text-navy-light cursor-not-allowed' : 'bg-teal text-white hover:bg-teal-light'
                }`}
              >
                {loading ? 'Backtesting...' : '📊 Run Backtest'}
              </button>
              {error && <p className="text-coral text-sm mt-3 text-center">{error}</p>}
            </div>
          </FadeInSection>

          {result && (
            <>
              <FadeInSection delay={0.1}>
                <div className={`rounded-2xl p-8 text-center ${strategyWins ? 'bg-sage/20' : 'bg-coral/20'}`}>
                  <p className="text-navy-light mb-2">
                    {strategyWins ? 'Your strategy beat buy-and-hold' : 'Buy-and-hold beat your strategy'}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="p-4 bg-white rounded-xl">
                      <p className="text-navy-light text-sm mb-1">Strategy Result</p>
                      <p className="font-display text-3xl font-bold text-navy">
                        ${result.strategy_result.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className={`text-sm font-semibold ${result.strategy_result.total_return_pct >= 0 ? 'text-sage' : 'text-coral'}`}>
                        {result.strategy_result.total_return_pct >= 0 ? '+' : ''}{result.strategy_result.total_return_pct}%
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-xl">
                      <p className="text-navy-light text-sm mb-1">Buy & Hold Result</p>
                      <p className="font-display text-3xl font-bold text-navy">
                        ${result.buy_hold_result.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className={`text-sm font-semibold ${result.buy_hold_result.total_return_pct >= 0 ? 'text-sage' : 'text-coral'}`}>
                        {result.buy_hold_result.total_return_pct >= 0 ? '+' : ''}{result.buy_hold_result.total_return_pct}%
                      </p>
                    </div>
                  </div>
                </div>
              </FadeInSection>

              <FadeInSection delay={0.15}>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-cream-dark rounded-xl text-center">
                    <p className="text-navy-light text-xs mb-1">Trades Made</p>
                    <p className="font-display text-xl font-bold text-navy">{result.strategy_result.num_trades}</p>
                  </div>
                  <div className="p-4 bg-cream-dark rounded-xl text-center">
                    <p className="text-navy-light text-xs mb-1">Win Rate</p>
                    <p className="font-display text-xl font-bold text-navy">
                      {result.strategy_result.win_rate_pct != null ? `${result.strategy_result.win_rate_pct}%` : 'N/A'}
                    </p>
                  </div>
                  <div className="p-4 bg-cream-dark rounded-xl text-center">
                    <p className="text-navy-light text-xs mb-1">Max Drawdown</p>
                    <p className="font-display text-xl font-bold text-navy">{result.strategy_result.max_drawdown_pct}%</p>
                  </div>
                </div>
              </FadeInSection>

              <FadeInSection delay={0.2}>
                <div className="bg-white rounded-2xl p-6 shadow-lg">
                  <h4 className="font-display text-xl font-bold text-navy mb-4">📈 Strategy vs. Buy & Hold</h4>
                  <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    {[0, 0.5, 1].map((pct, i) => {
                      const y = padding + pct * plotHeight;
                      const value = maxValue - pct * maxValue;
                      return (
                        <g key={i}>
                          <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
                          <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">
                            ${(value / 1000).toFixed(1)}k
                          </text>
                        </g>
                      );
                    })}
                    <path d={buyHoldPath} fill="none" stroke="#E8A54B" strokeWidth="2.5" strokeDasharray="5 3" />
                    <path d={strategyPath} fill="none" stroke="#3D8B8B" strokeWidth="3" />
                  </svg>
                  <div className="flex justify-center gap-4 mt-4 text-sm">
                    <div className="flex items-center gap-2"><div className="w-4 h-1 bg-teal rounded"></div><span className="text-navy">Strategy</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-amber rounded"></div><span className="text-navy">Buy & Hold</span></div>
                  </div>
                </div>
              </FadeInSection>

              {result.strategy_result.trades.length > 0 && (
                <FadeInSection delay={0.25}>
                  <div className="bg-white rounded-2xl p-6 shadow-lg">
                    <h4 className="font-display text-xl font-bold text-navy mb-4">Trade Log</h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {result.strategy_result.trades.map((t, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-cream rounded-lg text-sm">
                          <span className={`font-semibold ${t.action === 'buy' ? 'text-teal' : 'text-coral'}`}>
                            {t.action === 'buy' ? '🟢 Buy' : '🔴 Sell'}
                          </span>
                          <span className="text-navy-light">{t.date}</span>
                          <span className="text-navy font-medium">${t.price}</span>
                          {t.trade_return_pct != null && (
                            <span className={t.trade_return_pct >= 0 ? 'text-sage' : 'text-coral'}>
                              {t.trade_return_pct >= 0 ? '+' : ''}{t.trade_return_pct}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </FadeInSection>
              )}
            </>
          )}

          <p className="text-navy-light text-xs text-center max-w-2xl mx-auto">
            Past performance never guarantees future results. These rules-based strategies are simplified for education —
            real algorithmic trading accounts for transaction costs, slippage, taxes, and much more nuance than shown here.
          </p>

          <PageNavigation
            prevPath="/options-payoff"
            prevLabel="Options Payoff"
            nextPath="/conclusion"
            nextLabel="See Conclusion"
          />
        </div>
      </div>
    </div>
  );
}

export default AlgoBacktester;