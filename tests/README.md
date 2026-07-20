# Prometheus Backend Tests

Unit tests for the simulation math in `functions/simulate_portfolio/app.py`
and `functions/backtest_strategy/app.py`.

## Why there's a `stubs/yfinance.py`

The real `yfinance` package makes live network calls to Yahoo Finance.
Real unit tests shouldn't depend on live market data (results would change
day to day, and tests would fail with no internet connection) — so every
test monkeypatches `yfinance.Ticker` to return controlled, synthetic price
data instead. The stub only exists so `app.py`'s `import yfinance as yf`
succeeds in an environment where the real package might not be installed;
it's never actually used to fetch anything (every test replaces `Ticker`
before calling into the simulator).

## Running the tests

From the repo root:

```bash
python3 -m unittest discover -s tests -v
```

Requires `pandas` (already a dependency of both Lambda functions — see
their `requirements.txt`). No other install needed; the suite uses Python's
built-in `unittest`, not an external test runner.

## What's covered

**`test_simulate_portfolio.py`** — the main simulator:
- Basic lump-sum buy/sell math
- Monthly recurring contributions (DCA)
- Dividend reinvestment
- Monthly fee (expense ratio) decay
- Withdrawals, including running out of money mid-simulation
- Combining multiple tickers into one real value history
- Risk metrics (Sharpe/volatility/max drawdown) against hand-derived expected values
- Correlation matrix (perfectly correlated and perfectly anti-correlated cases)
- Panic-sell simulation (value flattens after the sale date)
- Depletion date detection
- Rebalancing actually pulling divergent tickers back toward equal weight

**`test_backtest_strategy.py`** — the strategy backtester:
- SMA crossover golden-cross / death-cross signal detection
- RSI signals (no false signals on a flat price, buy signal on oversold recovery)
- The all-in/all-out trade execution loop, including the case where a position is still open at the end

## Adding more tests

If you add new simulation logic to either `app.py`, add a matching test
here using the same pattern: build a small synthetic `pandas.DataFrame`
with a known, hand-checkable shape, monkeypatch `Ticker` to return it, and
assert against a value you can verify by hand (not just "whatever the
function returns" — that doesn't actually test anything).