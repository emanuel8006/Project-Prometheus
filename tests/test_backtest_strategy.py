"""
Unit tests for functions/backtest_strategy/app.py — SMA crossover signals,
RSI signals, and the backtest trade-execution loop.

Run with:
    python3 -m unittest discover -s tests -v
"""

import sys
import os
import unittest
from unittest.mock import patch

import pandas as pd

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, 'stubs'))

# simulate_portfolio's app.py is already imported as `app` by
# test_simulate_portfolio.py under the same module name -- import this one
# under a distinct name to avoid clashing when running the whole suite together.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'backtest_app', os.path.join(REPO_ROOT, 'functions', 'backtest_strategy', 'app.py')
)
backtest_app = importlib.util.module_from_spec(_spec)
sys.modules['backtest_app'] = backtest_app
_spec.loader.exec_module(backtest_app)


class TestSmaSignals(unittest.TestCase):
    def test_detects_golden_and_death_cross(self):
        # Construct a price series where the short SMA clearly crosses above
        # then below the long SMA, so we can check both signal directions.
        prices = [100] * 5 + [100, 102, 104, 106, 108, 110, 112, 114, 116, 118] + [110, 105, 100, 95, 90, 85, 80]
        dates = pd.date_range('2020-01-01', periods=len(prices), freq='D')
        close = pd.Series(prices, index=dates)

        signals = backtest_app.compute_sma_signals(close, short_window=3, long_window=6)

        buy_signals = signals[signals == 'buy']
        sell_signals = signals[signals == 'sell']

        self.assertGreater(len(buy_signals), 0, "Expected at least one golden cross (buy) signal")
        self.assertGreater(len(sell_signals), 0, "Expected at least one death cross (sell) signal")
        # The first buy should occur before the first sell, given this price shape
        self.assertLess(buy_signals.index[0], sell_signals.index[0])


class TestRsiSignals(unittest.TestCase):
    def test_no_signals_on_flat_prices(self):
        # A perfectly flat price series has zero average gain/loss -> RSI is
        # neutral (filled to 50) the whole time -- no buy/sell should fire.
        dates = pd.date_range('2020-01-01', periods=30, freq='D')
        close = pd.Series([100] * 30, index=dates)

        signals = backtest_app.compute_rsi_signals(close, period=14, buy_threshold=30, sell_threshold=70)
        self.assertEqual(signals.dropna().shape[0], 0)

    def test_buy_signal_on_recovery_from_oversold(self):
        # Sharp drop (pushes RSI below 30) followed by a recovery back above
        # 30 should produce at least one buy signal.
        prices = [100] * 15 + [95, 90, 85, 80, 75, 70] + [75, 80, 85, 90, 95, 100, 105]
        dates = pd.date_range('2020-01-01', periods=len(prices), freq='D')
        close = pd.Series(prices, index=dates)

        signals = backtest_app.compute_rsi_signals(close, period=14, buy_threshold=30, sell_threshold=70)
        self.assertGreater((signals == 'buy').sum(), 0, "Expected a buy signal on recovery from oversold")


class TestRunBacktest(unittest.TestCase):
    def test_all_in_all_out_execution(self):
        dates = pd.date_range('2020-01-01', periods=5, freq='D')
        history = pd.DataFrame({
            'Open': [100, 100, 100, 100, 100],
            'Close': [100, 110, 120, 90, 100],
        }, index=dates)

        signals = pd.Series(index=dates, dtype=object)
        signals.loc[dates[1]] = 'buy'   # buy at $110
        signals.loc[dates[3]] = 'sell'  # sell at $90

        result = backtest_app.run_backtest(history, signals, starting_cash=1000)

        self.assertEqual(len(result['trades']), 2)
        self.assertEqual(result['trades'][0]['action'], 'buy')
        self.assertEqual(result['trades'][0]['price'], 110)
        self.assertEqual(result['trades'][1]['action'], 'sell')
        self.assertEqual(result['trades'][1]['price'], 90)

        # Bought 1000/110 shares, sold at 90 -> proceeds = (1000/110)*90
        expected_after_sale = (1000 / 110) * 90
        # Then holds cash (no more signals) through the final day
        self.assertAlmostEqual(result['final_value'], expected_after_sale, places=2)
        self.assertEqual(result['num_trades'], 1)  # one completed round-trip
        self.assertLess(result['win_rate_pct'], 1)  # the one trade was a loss (110 -> 90)
        self.assertFalse(result['still_holding_at_end'])

    def test_still_holding_at_end_if_no_sell_signal(self):
        dates = pd.date_range('2020-01-01', periods=3, freq='D')
        history = pd.DataFrame({'Open': [100, 100, 100], 'Close': [100, 110, 120]}, index=dates)

        signals = pd.Series(index=dates, dtype=object)
        signals.loc[dates[1]] = 'buy'

        result = backtest_app.run_backtest(history, signals, starting_cash=1000)
        self.assertTrue(result['still_holding_at_end'])
        self.assertEqual(result['num_trades'], 0)  # no completed (sold) trades yet
        # Final value should reflect the open position marked at the last close
        expected_value = (1000 / 110) * 120
        self.assertAlmostEqual(result['final_value'], expected_value, places=2)


if __name__ == '__main__':
    unittest.main()