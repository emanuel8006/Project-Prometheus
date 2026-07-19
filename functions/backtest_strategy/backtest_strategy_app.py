import json
from typing import Any, Dict, List, Optional
import yfinance as yf
import pandas as pd

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

VALID_STRATEGIES = {'sma_crossover', 'rsi'}


def compute_sma_signals(close: pd.Series, short_window: int, long_window: int) -> pd.Series:
    """
    Returns a Series of 'buy' / 'sell' / None signals: 'buy' the day the
    short-window SMA crosses above the long-window SMA, 'sell' the day it
    crosses back below.
    """
    short_sma = close.rolling(window=short_window).mean()
    long_sma = close.rolling(window=long_window).mean()
    above = short_sma > long_sma

    signals = pd.Series(index=close.index, dtype=object)
    prev_above = None
    for date in close.index:
        cur_above = above.loc[date]
        if pd.isna(cur_above):
            prev_above = None
            continue
        if prev_above is not None:
            if cur_above and not prev_above:
                signals.loc[date] = 'buy'
            elif not cur_above and prev_above:
                signals.loc[date] = 'sell'
        prev_above = cur_above
    return signals


def compute_rsi_signals(close: pd.Series, period: int, buy_threshold: float, sell_threshold: float) -> pd.Series:
    """
    Classic RSI (Wilder's method, simplified with a rolling mean rather than
    the smoothed moving average -- close enough for an educational tool).
    Signals 'buy' when RSI crosses below buy_threshold (oversold) then back
    above it, and 'sell' when RSI crosses above sell_threshold (overbought)
    then back below it -- i.e. buy on the recovery out of oversold, sell on
    the pullback out of overbought, not on the extreme itself.
    """
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.fillna(50)  # neutral before enough data exists

    signals = pd.Series(index=close.index, dtype=object)
    was_oversold = False
    was_overbought = False
    for date in close.index:
        val = rsi.loc[date]
        if pd.isna(val):
            continue
        if val < buy_threshold:
            was_oversold = True
        elif was_oversold and val >= buy_threshold:
            signals.loc[date] = 'buy'
            was_oversold = False

        if val > sell_threshold:
            was_overbought = True
        elif was_overbought and val <= sell_threshold:
            signals.loc[date] = 'sell'
            was_overbought = False
    return signals


def run_backtest(
    history: pd.DataFrame,
    signals: pd.Series,
    starting_cash: float,
) -> Dict[str, Any]:
    """
    Walks the signal series day by day: 'buy' goes all-in (100% of cash into
    shares) if not already holding, 'sell' goes all-out (100% of shares back
    to cash) if currently holding. No partial positions, no shorting.
    """
    cash = starting_cash
    shares = 0.0
    holding = False
    trades: List[Dict[str, Any]] = []
    equity_curve: List[Dict[str, Any]] = []
    entry_price = None
    entry_date = None

    for date, row in history.iterrows():
        close_price = float(row['Close'])
        signal = signals.get(date)

        if signal == 'buy' and not holding and close_price > 0:
            shares = cash / close_price
            cash = 0.0
            holding = True
            entry_price = close_price
            entry_date = date
            trades.append({'date': date.date().isoformat(), 'action': 'buy', 'price': round(close_price, 2)})

        elif signal == 'sell' and holding and close_price > 0:
            proceeds = shares * close_price
            trade_return_pct = ((close_price - entry_price) / entry_price) * 100 if entry_price else 0
            trades.append({
                'date': date.date().isoformat(),
                'action': 'sell',
                'price': round(close_price, 2),
                'trade_return_pct': round(trade_return_pct, 2),
            })
            cash = proceeds
            shares = 0.0
            holding = False
            entry_price = None
            entry_date = None

        total_value = cash + shares * close_price
        equity_curve.append({'date': date.date().isoformat(), 'value': round(total_value, 2)})

    final_value = cash + shares * float(history['Close'].iloc[-1])

    # If still holding at the end, treat as an unrealized (open) position
    # for the trade log, but it's already reflected in final_value above.
    completed_trades = [t for t in trades if t['action'] == 'sell']
    wins = [t for t in completed_trades if t.get('trade_return_pct', 0) > 0]
    win_rate = (len(wins) / len(completed_trades) * 100) if completed_trades else None

    # Max drawdown on the strategy's own equity curve
    values = [pt['value'] for pt in equity_curve]
    running_max = values[0]
    max_dd = 0.0
    for v in values:
        running_max = max(running_max, v)
        if running_max > 0:
            dd = (v - running_max) / running_max
            max_dd = min(max_dd, dd)

    return {
        'final_value': round(final_value, 2),
        'total_return_pct': round(((final_value - starting_cash) / starting_cash) * 100, 2) if starting_cash > 0 else 0,
        'num_trades': len(completed_trades),
        'win_rate_pct': round(win_rate, 1) if win_rate is not None else None,
        'max_drawdown_pct': round(max_dd * 100, 2),
        'trades': trades,
        'equity_curve': equity_curve,
        'still_holding_at_end': holding,
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Backtests a simple rules-based strategy (SMA crossover or RSI) against
    real historical daily prices for one ticker, and compares it to plain
    buy-and-hold over the same period.

    Expected event body (JSON):
    {
      "ticker": "AAPL",
      "start_date": "2018-01-01",
      "end_date": "2023-12-31",
      "starting_cash": 10000,
      "strategy": "sma_crossover",           // or "rsi"
      "short_window": 20, "long_window": 50, // for sma_crossover
      "rsi_period": 14, "buy_threshold": 30, "sell_threshold": 70  // for rsi
    }

    Returns:
    {
      "strategy_result": { final_value, total_return_pct, num_trades,
                            win_rate_pct, max_drawdown_pct, trades,
                            equity_curve, still_holding_at_end },
      "buy_hold_result": { final_value, total_return_pct, equity_curve }
    }
    """
    try:
        body: Dict[str, Any] = {}
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        elif isinstance(event.get('body'), dict):
            body = event['body']
        else:
            body = event

        ticker: Optional[str] = body.get('ticker')
        start_date: Optional[str] = body.get('start_date')
        end_date: Optional[str] = body.get('end_date')
        starting_cash: float = float(body.get('starting_cash') or 10000)
        strategy: str = (body.get('strategy') or '').lower()

        if not ticker or not start_date or not end_date:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required fields: ticker, start_date, end_date'})
            }

        if strategy not in VALID_STRATEGIES:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f"strategy must be one of {sorted(VALID_STRATEGIES)}"})
            }

        if starting_cash <= 0:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'starting_cash must be positive'})
            }

        ticker = ticker.upper().strip()
        tk = yf.Ticker(ticker)
        history = tk.history(start=start_date, end=end_date, auto_adjust=False)

        if history.empty:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f'No price data available for {ticker} in this period'})
            }

        if history.index.tz is not None:
            history.index = history.index.tz_localize(None)

        close = history['Close']

        if strategy == 'sma_crossover':
            short_window = int(body.get('short_window') or 20)
            long_window = int(body.get('long_window') or 50)
            if short_window < 2 or long_window < 2 or short_window >= long_window:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': 'short_window must be >= 2 and less than long_window'})
                }
            if len(close) < long_window + 2:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': f'Not enough trading days ({len(close)}) for a {long_window}-day window'})
                }
            signals = compute_sma_signals(close, short_window, long_window)
            strategy_params = {'short_window': short_window, 'long_window': long_window}
        else:
            rsi_period = int(body.get('rsi_period') or 14)
            buy_threshold = float(body.get('buy_threshold') or 30)
            sell_threshold = float(body.get('sell_threshold') or 70)
            if rsi_period < 2:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': 'rsi_period must be >= 2'})
                }
            if not (0 < buy_threshold < sell_threshold < 100):
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': 'Require 0 < buy_threshold < sell_threshold < 100'})
                }
            signals = compute_rsi_signals(close, rsi_period, buy_threshold, sell_threshold)
            strategy_params = {'rsi_period': rsi_period, 'buy_threshold': buy_threshold, 'sell_threshold': sell_threshold}

        strategy_result = run_backtest(history, signals, starting_cash)

        # Buy-and-hold baseline over the identical period, for honest comparison
        buy_price = float(history['Open'].iloc[0])
        bh_shares = starting_cash / buy_price if buy_price > 0 else 0
        bh_equity_curve = [
            {'date': d.date().isoformat(), 'value': round(bh_shares * float(row['Close']), 2)}
            for d, row in history.iterrows()
        ]
        bh_final_value = bh_shares * float(history['Close'].iloc[-1])
        buy_hold_result = {
            'final_value': round(bh_final_value, 2),
            'total_return_pct': round(((bh_final_value - starting_cash) / starting_cash) * 100, 2) if starting_cash > 0 else 0,
            'equity_curve': bh_equity_curve,
        }

        result = {
            'ticker': ticker,
            'strategy': strategy,
            'strategy_params': strategy_params,
            'start_date': history.index[0].date().isoformat(),
            'end_date': history.index[-1].date().isoformat(),
            'starting_cash': round(starting_cash, 2),
            'strategy_result': strategy_result,
            'buy_hold_result': buy_hold_result,
        }

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(result, indent=2)
        }

    except Exception as e:
        print(f"Error processing request: {e}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }