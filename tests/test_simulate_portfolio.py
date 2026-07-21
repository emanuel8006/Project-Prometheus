"""
Unit tests for functions/simulate_portfolio/app.py — the core simulation
math (DCA, dividends, fees, withdrawals, rebalancing, risk metrics,
correlation, panic-sell, depletion detection).

Run with:
    python3 -m unittest discover -s tests -v

No network access is used or required: yfinance.Ticker.history is
monkeypatched in every test to return controlled, synthetic price data,
so results are fully deterministic and don't depend on live markets.
"""

import sys
import os
import math
import unittest
from unittest.mock import patch

import pandas as pd

# Make the stub yfinance importable before app.py does `import yfinance as yf`,
# and make the simulator module itself importable.
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, 'stubs'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'functions', 'simulate_portfolio'))

import app  # noqa: E402


def make_history(dates, opens, closes, dividends=None):
    """Build a synthetic OHLC-ish DataFrame shaped like yfinance's output."""
    if dividends is None:
        dividends = [0] * len(dates)
    return pd.DataFrame(
        {'Open': opens, 'Close': closes, 'Dividends': dividends},
        index=pd.DatetimeIndex(dates),
    )


class FakeTicker:
    """Stand-in for yf.Ticker(symbol) that returns pre-built history."""
    def __init__(self, history_by_symbol):
        self.history_by_symbol = history_by_symbol

    def __call__(self, symbol):
        return _FakeTickerInstance(self.history_by_symbol[symbol])


class _FakeTickerInstance:
    def __init__(self, history_df):
        self._history_df = history_df

    def history(self, start=None, end=None, auto_adjust=False):
        return self._history_df.copy()


class TestSimulateTickerLumpSum(unittest.TestCase):
    def test_basic_lump_sum_no_extras(self):
        dates = pd.date_range('2020-01-01', periods=5, freq='D')
        history = make_history(dates, [100, 101, 102, 103, 104], [101, 102, 103, 104, 105])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker('TEST', '2020-01-01', '2020-01-05', 1000, 0, 'none')

        self.assertNotIn('error', result)
        self.assertAlmostEqual(result['final_shares'], 10.0, places=6)
        self.assertAlmostEqual(result['final_value'], 1050.0, places=2)
        self.assertAlmostEqual(result['roi'], 0.05, places=6)
        self.assertEqual(result['total_contributed'], 0)
        self.assertEqual(result['total_fees_paid'], 0)
        self.assertEqual(result['total_withdrawn'], 0)

    def test_zero_or_negative_price_is_an_error(self):
        dates = pd.date_range('2020-01-01', periods=2, freq='D')
        history = make_history(dates, [0, 0], [0, 0])
        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker('TEST', '2020-01-01', '2020-01-02', 1000, 0, 'none')
        self.assertIn('error', result)


class TestSimulateTickerContributions(unittest.TestCase):
    def test_monthly_contributions_buy_at_correct_prices(self):
        dates = [pd.Timestamp('2020-01-01'), pd.Timestamp('2020-02-01'), pd.Timestamp('2020-03-01')]
        history = make_history(dates, [100, 100, 100], [100, 110, 120])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker('TEST', '2020-01-01', '2020-03-01', 0, 100, 'monthly')

        # Pure DCA: no initial shares (cash=0), then two monthly buys
        expected_shares = (100 / 110) + (100 / 120)
        expected_value = expected_shares * 120  # sold at last close

        self.assertAlmostEqual(result['final_shares'], expected_shares, places=6)
        self.assertAlmostEqual(result['final_value'], expected_value, places=2)
        self.assertAlmostEqual(result['total_contributed'], 200.0, places=2)
        self.assertEqual(result['contribution_count'], 2)


class TestSimulateTickerDividends(unittest.TestCase):
    def test_dividend_reinvestment_increases_shares(self):
        dates = pd.date_range('2020-01-01', periods=3, freq='D')
        history = make_history(dates, [100, 100, 100], [100, 100, 100], dividends=[0, 2, 0])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker('TEST', '2020-01-01', '2020-01-03', 1000, 0, 'none')

        # 10 shares initially; $2/share dividend on day 2 reinvested at $100 close = +0.2 shares
        self.assertAlmostEqual(result['final_shares'], 10.2, places=6)
        self.assertAlmostEqual(result['dividends_reinvested'], 20.0, places=2)
        self.assertAlmostEqual(result['final_value'], 1020.0, places=2)


class TestSimulateTickerFees(unittest.TestCase):
    def test_monthly_fee_decay_reduces_shares(self):
        dates = [pd.Timestamp('2020-01-01'), pd.Timestamp('2020-02-01')]
        history = make_history(dates, [100, 100], [100, 100])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker('TEST', '2020-01-01', '2020-02-01', 1000, 0, 'none', annual_fee_pct=12.0)

        # 12%/year = 1%/month. 10 shares * 1% = 0.1 share fee taken on the Feb row.
        self.assertAlmostEqual(result['final_shares'], 9.9, places=6)
        self.assertAlmostEqual(result['total_fees_paid'], 10.0, places=2)
        self.assertAlmostEqual(result['final_value'], 990.0, places=2)


class TestSimulateTickerWithdrawals(unittest.TestCase):
    def test_withdrawals_reduce_shares_each_month(self):
        dates = [pd.Timestamp('2020-01-01'), pd.Timestamp('2020-02-01'), pd.Timestamp('2020-03-01')]
        history = make_history(dates, [100, 100, 100], [100, 100, 100])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker(
                'TEST', '2020-01-01', '2020-03-01', 1000, 0, 'none',
                withdrawal_start_date='2020-01-15', withdrawal_amount=200,
            )

        # 10 shares initially; $200 withdrawn each of Feb and Mar at $100/share = 2 shares each
        self.assertAlmostEqual(result['final_shares'], 6.0, places=6)
        self.assertAlmostEqual(result['total_withdrawn'], 400.0, places=2)
        self.assertAlmostEqual(result['final_value'], 600.0, places=2)

    def test_withdrawals_cannot_go_negative_when_balance_runs_out(self):
        dates = [pd.Timestamp('2020-01-01'), pd.Timestamp('2020-02-01')]
        history = make_history(dates, [100, 100], [100, 100])

        with patch.object(app.yf, 'Ticker', FakeTicker({'TEST': history})):
            result = app.simulate_ticker(
                'TEST', '2020-01-01', '2020-02-01', 100, 0, 'none',
                withdrawal_start_date='2020-01-05', withdrawal_amount=200,
            )

        # Only 1 share ($100) exists; a $200 withdrawal request should be capped at what's available.
        self.assertAlmostEqual(result['final_shares'], 0.0, places=6)
        self.assertAlmostEqual(result['total_withdrawn'], 100.0, places=2)
        self.assertGreaterEqual(result['final_shares'], 0)


class TestBuildValueHistory(unittest.TestCase):
    def test_combines_two_tickers_correctly(self):
        dates_a = pd.to_datetime(['2020-01-01', '2020-02-01', '2020-03-01'])
        dates_b = pd.to_datetime(['2020-01-01', '2020-02-01', '2020-03-01'])

        shares_a = pd.Series([10, 10, 10], index=dates_a)
        close_a = pd.Series([100, 110, 120], index=dates_a)
        shares_b = pd.Series([5, 5, 5], index=dates_b)
        close_b = pd.Series([200, 190, 210], index=dates_b)

        series_map = {
            'A': {'shares_series': shares_a, 'close_series': close_a},
            'B': {'shares_series': shares_b, 'close_series': close_b},
        }

        history = app.build_value_history(series_map, '2020-01-01', '2020-03-01')

        # Expect a snapshot for each of Jan/Feb/Mar with combined value = 10*price_a + 5*price_b
        values_by_date = {pt['date']: pt['value'] for pt in history}
        self.assertAlmostEqual(values_by_date['2020-01-01'], 10 * 100 + 5 * 200, places=2)
        self.assertAlmostEqual(values_by_date['2020-02-01'], 10 * 110 + 5 * 190, places=2)
        self.assertAlmostEqual(values_by_date['2020-03-01'], 10 * 120 + 5 * 210, places=2)


class TestComputeRiskMetrics(unittest.TestCase):
    def test_volatility_and_return_match_hand_calculation(self):
        # Three monthly snapshots, 2 months apart total (60 days): 1000 -> 1100 -> 990
        value_history = [
            {'date': '2020-01-01', 'value': 1000.0},
            {'date': '2020-02-01', 'value': 1100.0},
            {'date': '2020-03-01', 'value': 990.0},
        ]
        total_invested = 1000.0
        final_value = 990.0

        result = app.compute_risk_metrics(value_history, total_invested, final_value)
        self.assertIsNotNone(result)

        # Hand-derived: returns = [+0.10, -0.10], sample std (ddof=1) = sqrt(0.02) ≈ 0.14142136
        expected_monthly_std = math.sqrt(0.02)
        expected_annualized_vol_pct = expected_monthly_std * math.sqrt(12) * 100

        # Hand-derived CAGR: years = 60 days / 365.25
        years = (pd.Timestamp('2020-03-01') - pd.Timestamp('2020-01-01')).days / 365.25
        expected_cagr_pct = ((final_value / total_invested) ** (1 / years) - 1) * 100

        self.assertAlmostEqual(result['annualized_volatility_pct'], expected_annualized_vol_pct, places=2)
        self.assertAlmostEqual(result['annualized_return_pct'], expected_cagr_pct, places=2)
        # Max drawdown: peak was 1100, trough after was 990 -> (990-1100)/1100
        self.assertAlmostEqual(result['max_drawdown_pct'], ((990 - 1100) / 1100) * 100, places=2)

    def test_returns_none_for_too_short_or_invalid_input(self):
        self.assertIsNone(app.compute_risk_metrics([], 1000, 1000))
        self.assertIsNone(app.compute_risk_metrics(
            [{'date': '2020-01-01', 'value': 100}, {'date': '2020-02-01', 'value': 110}],
            1000, 1100,
        ))  # only 2 points, function requires >= 3
        self.assertIsNone(app.compute_risk_metrics(
            [{'date': '2020-01-01', 'value': 0}, {'date': '2020-02-01', 'value': 0}, {'date': '2020-03-01', 'value': 0}],
            0, 0,
        ))  # total_invested <= 0


class TestComputeCorrelationMatrix(unittest.TestCase):
    def test_identical_returns_are_perfectly_correlated(self):
        dates = pd.to_datetime(['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05', '2020-01-06'])
        close_a = pd.Series([100, 102, 101, 105, 103, 108], index=dates)
        close_b = close_a.copy()  # identical price path

        series_map = {
            'A': {'shares_series': pd.Series([1], index=[dates[0]]), 'close_series': close_a},
            'B': {'shares_series': pd.Series([1], index=[dates[0]]), 'close_series': close_b},
        }

        result = app.compute_correlation_matrix(series_map)
        self.assertIsNotNone(result)
        for row in result['matrix']:
            for value in row:
                self.assertAlmostEqual(value, 1.0, places=3)

    def test_opposite_returns_are_perfectly_anti_correlated(self):
        dates = pd.to_datetime(['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05', '2020-01-06'])
        close_a = pd.Series([100, 110, 105, 115, 108, 120], index=dates)
        # B's returns are the exact negative of A's returns each day
        returns_a = close_a.pct_change().dropna()
        close_b = [100.0]
        for r in returns_a:
            close_b.append(close_b[-1] * (1 - r))
        close_b = pd.Series(close_b, index=dates)

        series_map = {
            'A': {'shares_series': pd.Series([1], index=[dates[0]]), 'close_series': close_a},
            'B': {'shares_series': pd.Series([1], index=[dates[0]]), 'close_series': close_b},
        }

        result = app.compute_correlation_matrix(series_map)
        self.assertAlmostEqual(result['matrix'][0][1], -1.0, places=3)
        self.assertAlmostEqual(result['matrix'][1][0], -1.0, places=3)

    def test_returns_none_with_fewer_than_two_tickers(self):
        dates = pd.to_datetime(['2020-01-01', '2020-01-02'])
        series_map = {'A': {'shares_series': pd.Series([1], index=[dates[0]]), 'close_series': pd.Series([100, 101], index=dates)}}
        self.assertIsNone(app.compute_correlation_matrix(series_map))


class TestComputePanicSell(unittest.TestCase):
    def test_flattens_value_after_sale_date(self):
        dates = pd.to_datetime(['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01'])
        shares = pd.Series([10, 10, 10, 10], index=dates)
        close = pd.Series([100, 80, 90, 120], index=dates)  # crash then recovery

        ticker_series = {'A': {'shares_series': shares, 'close_series': close}}
        value_history = app.build_value_history(ticker_series, '2020-01-01', '2020-04-01')

        result = app.compute_panic_sell(ticker_series, value_history, '2020-02-01')
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result['value_at_sale'], 800.0, places=2)  # 10 shares * $80

        # Every point on/before the sale date matches the real history; every
        # point after is flat at the sale value (money sitting in cash).
        for pt in result['value_history']:
            if pt['date'] <= '2020-02-01':
                continue
            self.assertAlmostEqual(pt['value'], 800.0, places=2)

    def test_returns_none_without_a_panic_date(self):
        self.assertIsNone(app.compute_panic_sell({}, [], None))


class TestFindDepletionDate(unittest.TestCase):
    def test_finds_first_date_balance_hits_zero(self):
        value_history = [
            {'date': '2020-01-01', 'value': 500.0},
            {'date': '2020-02-01', 'value': 200.0},
            {'date': '2020-03-01', 'value': 0.0},
            {'date': '2020-04-01', 'value': 0.0},
        ]
        self.assertEqual(app.find_depletion_date(value_history), '2020-03-01')

    def test_returns_none_if_never_depleted(self):
        value_history = [
            {'date': '2020-01-01', 'value': 500.0},
            {'date': '2020-02-01', 'value': 600.0},
        ]
        self.assertIsNone(app.find_depletion_date(value_history))


class TestSimulatePortfolioWithRebalancing(unittest.TestCase):
    def test_rebalances_back_to_equal_weight_at_the_boundary(self):
        # A doubles, B stays flat -- without rebalancing A would dominate the
        # portfolio; with yearly rebalancing, the Jan-1-of-next-year snapshot
        # should reset both back toward equal weight.
        dates = pd.to_datetime(['2020-01-01', '2020-06-01', '2021-01-01', '2021-06-01'])
        history_a = make_history(dates, [100, 100, 100, 100], [100, 150, 200, 200])
        history_b = make_history(dates, [100, 100, 100, 100], [100, 100, 100, 100])

        with patch.object(app.yf, 'Ticker', FakeTicker({'A': history_a, 'B': history_b})):
            result = app.simulate_portfolio_with_rebalancing(
                ['A', 'B'], '2020-01-01', '2021-06-01', 1000, 0, 'none', 'yearly',
            )

        self.assertNotIn('error', result)
        self.assertGreater(len(result['rebalance_events']), 0)

        # After a rebalance, dollar value in A and B should be much closer to
        # equal than they would be without ever rebalancing (where A, having
        # doubled, would hold roughly 2x the value of B).
        final_a_value = result['ticker_breakdown']['A']['final_shares'] * result['ticker_breakdown']['A']['sell_price']
        final_b_value = result['ticker_breakdown']['B']['final_shares'] * result['ticker_breakdown']['B']['sell_price']
        ratio = final_a_value / final_b_value
        self.assertLess(abs(ratio - 1.0), 0.5, "Rebalancing should keep final values reasonably close to equal weight")

    def test_threshold_rebalancing_triggers_only_past_the_drift_limit(self):
        # A grows sharply in the first month (well past a 5% drift from equal
        # weight), then stays flat. Threshold mode should catch and correct
        # that drift; a huge threshold (allowing basically anything) should
        # never trigger a rebalance at all.
        dates = pd.to_datetime(['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01'])
        history_a = make_history(dates, [100, 100, 100, 100], [100, 140, 140, 140])
        history_b = make_history(dates, [100, 100, 100, 100], [100, 100, 100, 100])

        with patch.object(app.yf, 'Ticker', FakeTicker({'A': history_a, 'B': history_b})):
            tight = app.simulate_portfolio_with_rebalancing(
                ['A', 'B'], '2020-01-01', '2020-04-01', 1000, 0, 'none', 'threshold',
                rebalance_threshold_pct=5.0,
            )
            loose = app.simulate_portfolio_with_rebalancing(
                ['A', 'B'], '2020-01-01', '2020-04-01', 1000, 0, 'none', 'threshold',
                rebalance_threshold_pct=45.0,
            )

        self.assertGreater(len(tight['rebalance_events']), 0, "A 5% threshold should catch a large drift")
        self.assertEqual(len(loose['rebalance_events']), 0, "A 45% threshold should never trigger on this drift")


if __name__ == '__main__':
    unittest.main()