"""
Test-only stub for the `yfinance` package.

app.py does `import yfinance as yf` and calls `yf.Ticker(symbol).history(...)`.
The real package isn't available in this environment (and even if it were,
real unit tests for the simulator's math shouldn't depend on live network
calls to Yahoo Finance). This stub lets app.py import successfully; each
test then monkeypatches `Ticker` to return controlled, synthetic price data.
"""


class Ticker:
    def __init__(self, symbol):
        self.symbol = symbol

    def history(self, start=None, end=None, auto_adjust=False):
        raise NotImplementedError(
            "Ticker.history() must be monkeypatched in tests -- "
            "the real yfinance package is not used in the test suite."
        )