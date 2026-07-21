import json
from typing import Any, Dict, List, Optional, Tuple
import yfinance as yf
import pandas as pd
from datetime import datetime, date

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

VALID_FREQUENCIES = {'none', 'monthly', 'yearly'}
VALID_REBALANCE_FREQUENCIES = {'none', 'quarterly', 'yearly', 'threshold'}
BENCHMARK_TICKER = 'SPY'


def simulate_ticker(
    symbol: str,
    start_date: str,
    end_date: str,
    cash: float,
    contribution_amount: float,
    contribution_frequency: str,
    annual_fee_pct: float = 0.0,
    withdrawal_start_date: Optional[str] = None,
    withdrawal_amount: float = 0.0,
) -> Dict[str, Any]:
    """
    Simulate buying `symbol` with an initial lump sum `cash` (may be 0) plus
    optional recurring contributions, reinvesting dividends along the way.
    If annual_fee_pct > 0, an expense-ratio-style fee is deducted from
    shares once per month (annual_fee_pct / 12), compounding against the
    balance the same way a real fund's expense ratio does.

    If withdrawal_start_date is set, contributions stop and a fixed monthly
    withdrawal_amount is instead sold off starting that month (using real
    prices for that date), continuing until end_date or until the balance
    is depleted -- whichever comes first. This captures real sequence-of-
    returns risk instead of assuming a smooth average return through
    retirement.

    Returns a dict with breakdown fields plus 'shares_series' and
    'close_series' (pandas Series) so the caller can build a real
    month-by-month value history. On failure, returns {'error': ...}.
    """
    try:
        tk = yf.Ticker(symbol)
        history = tk.history(start=start_date, end=end_date, auto_adjust=False)

        if history.empty:
            return {'error': 'No price data available for this period'}

        # Normalize to tz-naive so snapshot comparisons work cleanly
        if history.index.tz is not None:
            history.index = history.index.tz_localize(None)

        buy_price = float(history['Open'].iloc[0])
        buy_date = history.index[0].date().isoformat()

        if buy_price <= 0:
            return {'error': 'Invalid buy price'}

        recurring_enabled = contribution_amount > 0 and contribution_frequency != 'none'
        shares = cash / buy_price if cash > 0 else 0.0

        withdrawal_start_ts = None
        if withdrawal_start_date and withdrawal_amount > 0:
            try:
                withdrawal_start_ts = pd.to_datetime(withdrawal_start_date)
            except Exception:
                withdrawal_start_ts = None

        # Record every point in time where share count changes, so we can
        # later reconstruct real portfolio value at any date.
        share_events: List[Tuple[Any, float]] = [(history.index[0], shares)]

        total_dividends_reinvested = 0.0
        total_contributed = 0.0
        contribution_count = 0
        total_withdrawn = 0.0
        last_contribution_period = (history.index[0].year, history.index[0].month)
        last_withdrawal_period = (history.index[0].year, history.index[0].month)
        last_fee_period = (history.index[0].year, history.index[0].month)
        monthly_fee_rate = (annual_fee_pct / 100.0) / 12.0
        total_fees_paid = 0.0

        for i, (row_date, row) in enumerate(history.iterrows()):
            if i == 0:
                continue  # that's the initial buy day

            current_period = (row_date.year, row_date.month)
            in_withdrawal_phase = withdrawal_start_ts is not None and row_date >= withdrawal_start_ts

            if monthly_fee_rate > 0 and current_period != last_fee_period:
                close_price = float(row['Close'])
                if close_price > 0 and shares > 0:
                    fee_shares = shares * monthly_fee_rate
                    shares -= fee_shares
                    total_fees_paid += fee_shares * close_price
                    share_events.append((row_date, shares))
                last_fee_period = current_period

            # Contributions only apply before the withdrawal phase starts --
            # you don't keep contributing once you've started drawing down.
            if recurring_enabled and not in_withdrawal_phase:
                period_changed = (
                    current_period[0] != last_contribution_period[0]
                    if contribution_frequency == 'yearly'
                    else current_period != last_contribution_period
                )
                if period_changed:
                    close_price = float(row['Close'])
                    if close_price > 0:
                        shares += contribution_amount / close_price
                        total_contributed += contribution_amount
                        contribution_count += 1
                        share_events.append((row_date, shares))
                    last_contribution_period = current_period

            if in_withdrawal_phase:
                period_changed = current_period != last_withdrawal_period
                if period_changed:
                    close_price = float(row['Close'])
                    if close_price > 0 and shares > 0:
                        desired_shares = withdrawal_amount / close_price
                        actual_shares = min(desired_shares, shares)
                        shares -= actual_shares
                        total_withdrawn += actual_shares * close_price
                        share_events.append((row_date, shares))
                    last_withdrawal_period = current_period

            div = float(row['Dividends']) if 'Dividends' in history.columns else 0.0
            if div > 0 and shares > 0:
                close_price = float(row['Close'])
                if close_price > 0:
                    dividend_cash = shares * div
                    shares += dividend_cash / close_price
                    total_dividends_reinvested += dividend_cash
                    share_events.append((row_date, shares))

        sell_price = float(history['Close'].iloc[-1])
        sell_date = history.index[-1].date().isoformat()
        proceeds = shares * sell_price

        invested = cash + total_contributed
        roi = (proceeds - invested) / invested if invested > 0 else 0.0

        shares_series = pd.Series(
            [e[1] for e in share_events],
            index=pd.to_datetime([e[0] for e in share_events])
        ).sort_index()

        return {
            'buy_date': buy_date,
            'buy_price': round(buy_price, 4),
            'sell_date': sell_date,
            'sell_price': round(sell_price, 4),
            'final_shares': round(shares, 6),
            'dividends_reinvested': round(total_dividends_reinvested, 2),
            'initial_investment': round(cash, 2),
            'total_contributed': round(total_contributed, 2),
            'contribution_count': contribution_count,
            'final_value': round(proceeds, 2),
            'roi': round(roi, 6),
            'total_fees_paid': round(total_fees_paid, 2),
            'total_withdrawn': round(total_withdrawn, 2),
            'shares_series': shares_series,
            'close_series': history['Close'],
        }

    except Exception as err:
        return {'error': str(err)}


def simulate_portfolio_with_rebalancing(
    symbols: List[str],
    start_date: str,
    end_date: str,
    total_cash: float,
    contribution_amount: float,
    contribution_frequency: str,
    rebalance_frequency: str,
    weights: Optional[Dict[str, float]] = None,
    annual_fee_pct: float = 0.0,
    withdrawal_start_date: Optional[str] = None,
    withdrawal_amount: float = 0.0,
    rebalance_threshold_pct: float = 5.0,
) -> Dict[str, Any]:
    """
    Simulate a multi-ticker portfolio that periodically rebalances back to
    target weights across tickers (equal weight by default, or custom
    weights if provided). Unlike simulate_ticker (which runs each ticker in
    isolation), this walks all tickers together on a combined trading
    calendar so it can compare relative values at each rebalance date and
    sell winners / buy laggards back to target weight -- the same way a
    real rebalance works.

    rebalance_frequency: 'quarterly' or 'yearly' rebalance on a fixed
    calendar schedule regardless of how far allocations have drifted.
    'threshold' instead checks monthly and only rebalances when any
    ticker's actual weight has drifted more than rebalance_threshold_pct
    away from its target -- closer to how real robo-advisors operate.

    weights: optional {symbol: fraction} where fractions sum to ~1.0. If not
    provided, falls back to equal weighting across all valid symbols.

    Returns a dict with 'final_value', 'total_contributed',
    'ticker_breakdown', 'shares_series_map' (for value_history / panic-sell
    reuse), and 'rebalance_events' (dates rebalancing actually happened),
    plus 'failed_tickers' for any symbol with no data.
    """
    histories: Dict[str, Any] = {}
    for symbol in symbols:
        try:
            tk = yf.Ticker(symbol)
            h = tk.history(start=start_date, end=end_date, auto_adjust=False)
            if h.empty:
                continue
            if h.index.tz is not None:
                h.index = h.index.tz_localize(None)
            histories[symbol] = h
        except Exception:
            continue

    valid_symbols = list(histories.keys())
    failed_symbols = [s for s in symbols if s not in valid_symbols]

    if not valid_symbols:
        return {'error': 'No price data available for any ticker', 'failed_tickers': symbols}

    n = len(valid_symbols)
    all_dates = sorted(set().union(*[set(h.index) for h in histories.values()]))
    first_date = all_dates[0]

    # Resolve per-ticker target weight fractions. If custom weights were
    # given, re-normalize across only the symbols that actually have data
    # (a failed ticker's weight would otherwise silently vanish).
    if weights:
        valid_weight_sum = sum(weights.get(sym, 0.0) for sym in valid_symbols)
        if valid_weight_sum > 0:
            weight_fracs = {sym: weights.get(sym, 0.0) / valid_weight_sum for sym in valid_symbols}
        else:
            weight_fracs = {sym: 1.0 / n for sym in valid_symbols}
    else:
        weight_fracs = {sym: 1.0 / n for sym in valid_symbols}

    cash_per_ticker = {sym: total_cash * weight_fracs[sym] for sym in valid_symbols}
    shares: Dict[str, float] = {}
    share_events: Dict[str, List[Tuple[Any, float]]] = {}

    for sym in valid_symbols:
        h = histories[sym]
        # Use this ticker's own first trading day's open if it starts on the
        # overall first date, otherwise the first close price we have for it.
        if h.index[0] == first_date:
            buy_price = float(h['Open'].iloc[0])
        else:
            buy_price = float(h['Close'].iloc[0])
        shares[sym] = cash_per_ticker[sym] / buy_price if buy_price > 0 and cash_per_ticker[sym] > 0 else 0.0
        share_events[sym] = [(h.index[0], shares[sym])]

    recurring_enabled = contribution_amount > 0 and contribution_frequency != 'none'
    contribution_per_ticker = {sym: contribution_amount * weight_fracs[sym] for sym in valid_symbols} if recurring_enabled else {sym: 0.0 for sym in valid_symbols}
    total_contributed = total_cash
    total_withdrawn = 0.0

    withdrawal_start_ts = None
    if withdrawal_start_date and withdrawal_amount > 0:
        try:
            withdrawal_start_ts = pd.to_datetime(withdrawal_start_date)
        except Exception:
            withdrawal_start_ts = None
    withdrawal_per_ticker = {sym: withdrawal_amount * weight_fracs[sym] for sym in valid_symbols} if withdrawal_start_ts is not None else {sym: 0.0 for sym in valid_symbols}

    rebalance_enabled = rebalance_frequency in ('quarterly', 'yearly', 'threshold')
    rebalance_events: List[str] = []

    last_contribution_period = (first_date.year, first_date.month)
    last_withdrawal_period = (first_date.year, first_date.month)
    last_fee_period = (first_date.year, first_date.month)
    monthly_fee_rate = (annual_fee_pct / 100.0) / 12.0
    total_fees_paid = 0.0
    last_rebalance_period: Tuple[int, ...] = (
        (first_date.year, (first_date.month - 1) // 3) if rebalance_frequency == 'quarterly' else (first_date.year,)
    )

    def price_asof(sym: str, d: Any) -> Optional[float]:
        series = histories[sym]['Close']
        upto = series[series.index <= d]
        return float(upto.iloc[-1]) if not upto.empty else None

    for d in all_dates[1:]:
        current_period = (d.year, d.month)
        in_withdrawal_phase = withdrawal_start_ts is not None and d >= withdrawal_start_ts

        # Monthly expense-ratio-style fee decay, per ticker
        if monthly_fee_rate > 0 and current_period != last_fee_period:
            for sym in valid_symbols:
                price = price_asof(sym, d)
                if price and price > 0 and shares[sym] > 0:
                    fee_shares = shares[sym] * monthly_fee_rate
                    shares[sym] -= fee_shares
                    total_fees_paid += fee_shares * price
                    share_events[sym].append((d, shares[sym]))
            last_fee_period = current_period

        # Recurring contributions, split by weight -- only before withdrawal phase
        if recurring_enabled and not in_withdrawal_phase:
            period_changed = (
                current_period[0] != last_contribution_period[0]
                if contribution_frequency == 'yearly'
                else current_period != last_contribution_period
            )
            if period_changed:
                for sym in valid_symbols:
                    price = price_asof(sym, d)
                    if price and price > 0:
                        contribution = contribution_per_ticker[sym]
                        shares[sym] += contribution / price
                        total_contributed += contribution
                        share_events[sym].append((d, shares[sym]))
                last_contribution_period = current_period

        # Monthly withdrawals, split by weight, once the withdrawal phase starts
        if in_withdrawal_phase:
            period_changed = current_period != last_withdrawal_period
            if period_changed:
                for sym in valid_symbols:
                    price = price_asof(sym, d)
                    if price and price > 0 and shares[sym] > 0:
                        desired_shares = withdrawal_per_ticker[sym] / price
                        actual_shares = min(desired_shares, shares[sym])
                        shares[sym] -= actual_shares
                        total_withdrawn += actual_shares * price
                        share_events[sym].append((d, shares[sym]))
                last_withdrawal_period = current_period

        # Dividend reinvestment, per ticker, only on days that ticker trades
        for sym in valid_symbols:
            h = histories[sym]
            if d in h.index:
                row = h.loc[d]
                div = float(row['Dividends']) if 'Dividends' in h.columns else 0.0
                if div > 0 and shares[sym] > 0:
                    close_price = float(row['Close'])
                    if close_price > 0:
                        shares[sym] += (shares[sym] * div) / close_price
                        share_events[sym].append((d, shares[sym]))

        # Rebalancing back to each ticker's target weight (equal by default,
        # custom if weights were provided). Two modes: calendar-based
        # (quarterly/yearly, always rebalances on the period boundary
        # regardless of drift) or threshold-based (checks monthly, only
        # rebalances if actual weight has drifted too far from target).
        if rebalance_enabled:
            if rebalance_frequency == 'threshold':
                period_changed = current_period != last_rebalance_period
                if period_changed:
                    prices_today = {sym: price_asof(sym, d) for sym in valid_symbols}
                    if all(p and p > 0 for p in prices_today.values()):
                        total_value = sum(shares[sym] * prices_today[sym] for sym in valid_symbols)
                        if total_value > 0:
                            max_drift_pct = max(
                                abs((shares[sym] * prices_today[sym] / total_value) - weight_fracs[sym]) * 100
                                for sym in valid_symbols
                            )
                            if max_drift_pct > rebalance_threshold_pct:
                                for sym in valid_symbols:
                                    target_value = total_value * weight_fracs[sym]
                                    shares[sym] = target_value / prices_today[sym]
                                    share_events[sym].append((d, shares[sym]))
                                rebalance_events.append(d.date().isoformat())
                    last_rebalance_period = current_period
            else:
                current_rebalance_period = (
                    (d.year, (d.month - 1) // 3) if rebalance_frequency == 'quarterly' else (d.year,)
                )
                if current_rebalance_period != last_rebalance_period:
                    prices_today = {sym: price_asof(sym, d) for sym in valid_symbols}
                    if all(p and p > 0 for p in prices_today.values()):
                        total_value = sum(shares[sym] * prices_today[sym] for sym in valid_symbols)
                        for sym in valid_symbols:
                            target_value = total_value * weight_fracs[sym]
                            shares[sym] = target_value / prices_today[sym]
                            share_events[sym].append((d, shares[sym]))
                        rebalance_events.append(d.date().isoformat())
                last_rebalance_period = current_rebalance_period

    # Final sale at each ticker's own last close
    final_value = 0.0
    ticker_breakdown: Dict[str, Any] = {}
    for sym in valid_symbols:
        h = histories[sym]
        sell_price = float(h['Close'].iloc[-1])
        proceeds = shares[sym] * sell_price
        final_value += proceeds
        ticker_breakdown[sym] = {
            'buy_date': h.index[0].date().isoformat(),
            'sell_date': h.index[-1].date().isoformat(),
            'sell_price': round(sell_price, 4),
            'final_shares': round(shares[sym], 6),
            'final_value': round(proceeds, 2),
        }

    shares_series_map: Dict[str, Dict[str, Any]] = {}
    for sym in valid_symbols:
        s = pd.Series(
            [e[1] for e in share_events[sym]],
            index=pd.to_datetime([e[0] for e in share_events[sym]])
        ).sort_index()
        shares_series_map[sym] = {'shares_series': s, 'close_series': histories[sym]['Close']}

    return {
        'final_value': round(final_value, 2),
        'total_contributed': round(total_contributed, 2),
        'ticker_breakdown': ticker_breakdown,
        'shares_series_map': shares_series_map,
        'rebalance_events': rebalance_events,
        'failed_tickers': failed_symbols,
        'total_fees_paid': round(total_fees_paid, 2),
        'total_withdrawn': round(total_withdrawn, 2),
    }


def build_value_history(
    series_map: Dict[str, Dict[str, Any]],
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    """
    Given { symbol: {'shares_series': ..., 'close_series': ...} }, reconstruct
    a real combined month-by-month value history -- actual shares held times
    actual close prices, no randomness or interpolation.
    """
    if not series_map:
        return []

    snapshot_dates = list(pd.date_range(start=start_date, end=end_date, freq='MS'))
    last_date = max(s['close_series'].index.max() for s in series_map.values())
    if not snapshot_dates or snapshot_dates[-1] != last_date:
        snapshot_dates.append(last_date)

    value_history: List[Dict[str, Any]] = []
    for snap in snapshot_dates:
        total_value = 0.0
        counted = False
        for series in series_map.values():
            shares_upto = series['shares_series'][series['shares_series'].index <= snap]
            price_upto = series['close_series'][series['close_series'].index <= snap]
            if price_upto.empty:
                continue

            shares_val = float(shares_upto.iloc[-1]) if not shares_upto.empty else 0.0
            price_val = float(price_upto.iloc[-1])
            total_value += shares_val * price_val
            counted = True

        if counted:
            value_history.append({'date': snap.date().isoformat(), 'value': round(total_value, 2)})

    return value_history


def compute_risk_metrics(
    value_history: List[Dict[str, Any]],
    total_invested: float,
    final_value: float,
    risk_free_rate: float = 0.02,
) -> Optional[Dict[str, Any]]:
    """
    Compute real risk/performance metrics from a real value_history series:
    annualized return (CAGR), annualized volatility (std dev of monthly
    returns), Sharpe ratio, and max drawdown. No synthetic data -- these are
    exactly the metrics a real financial tool would compute from actual
    monthly portfolio values.
    """
    if not value_history or len(value_history) < 3 or total_invested <= 0:
        return None

    values = [pt['value'] for pt in value_history]
    dates = [pd.to_datetime(pt['date']) for pt in value_history]
    years = (dates[-1] - dates[0]).days / 365.25
    if years <= 0:
        return None

    series = pd.Series(values, index=dates)
    returns = series.pct_change().dropna()

    # A pure-DCA run starts from a near-zero value, which makes the very
    # first monthly return explode (e.g. from $0.01 to $200). Drop it so it
    # doesn't dominate the volatility estimate.
    if len(returns) > 2 and abs(returns.iloc[0]) > 5:
        returns = returns.iloc[1:]

    if returns.empty:
        return None

    annualized_vol = float(returns.std() * (12 ** 0.5))
    cagr = (final_value / total_invested) ** (1 / years) - 1
    sharpe = (cagr - risk_free_rate) / annualized_vol if annualized_vol > 0 else None

    running_max = series.cummax()
    drawdowns = (series - running_max) / running_max
    max_drawdown = float(drawdowns.min())

    return {
        'annualized_return_pct': round(cagr * 100, 2),
        'annualized_volatility_pct': round(annualized_vol * 100, 2),
        'sharpe_ratio': round(sharpe, 3) if sharpe is not None else None,
        'max_drawdown_pct': round(max_drawdown * 100, 2),
    }


def compute_correlation_matrix(
    ticker_series: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Compute a real pairwise correlation matrix of daily returns across the
    user's picked tickers, reusing the close-price series already fetched
    for the simulation. Values range from -1 (move opposite) to 1 (move
    identically). Ties directly into the diversification lesson: picking
    stocks that move together isn't as diversified as it might look.

    Returns None if there are fewer than 2 tickers with usable data.
    """
    if not ticker_series or len(ticker_series) < 2:
        return None

    price_df = pd.DataFrame({sym: series['close_series'] for sym, series in ticker_series.items()})
    price_df = price_df.sort_index().ffill().dropna()

    returns = price_df.pct_change().dropna()
    if returns.empty or len(returns) < 5:
        return None

    corr = returns.corr()
    tickers_list = list(corr.columns)
    matrix = [[round(float(v), 3) for v in row] for row in corr.values.tolist()]

    return {'tickers': tickers_list, 'matrix': matrix}


def find_depletion_date(value_history: List[Dict[str, Any]], threshold: float = 1.0) -> Optional[str]:
    """
    Scans a value_history series for the first point where the portfolio
    value drops at or below `threshold` (effectively zero). Used for
    withdrawal simulations to honestly report whether -- and when -- the
    money would have actually run out, instead of assuming it lasts.
    """
    for point in value_history:
        if point['value'] <= threshold:
            return point['date']
    return None


def compute_inflation_adjustment(
    value_history: List[Dict[str, Any]],
    annual_inflation_pct: float,
) -> Optional[Dict[str, Any]]:
    """
    Deflates a nominal value_history into "today's dollars" using a constant
    assumed annual inflation rate, compounded from the series' start date.
    This is the real-vs-nominal-returns distinction: the nominal final value
    is what the account statement would show; the real (inflation-adjusted)
    value is what that money can actually buy, in today's purchasing power.
    """
    if not value_history or annual_inflation_pct <= 0:
        return None

    start_date = pd.to_datetime(value_history[0]['date'])
    monthly_rate = annual_inflation_pct / 100.0

    real_history: List[Dict[str, Any]] = []
    for point in value_history:
        point_date = pd.to_datetime(point['date'])
        years_elapsed = (point_date - start_date).days / 365.25
        deflator = (1 + monthly_rate) ** years_elapsed
        real_value = point['value'] / deflator if deflator > 0 else point['value']
        real_history.append({'date': point['date'], 'value': round(real_value, 2)})

    nominal_final = value_history[-1]['value']
    real_final = real_history[-1]['value']
    purchasing_power_lost_pct = ((nominal_final - real_final) / nominal_final) * 100 if nominal_final > 0 else 0

    return {
        'annual_inflation_pct': annual_inflation_pct,
        'nominal_final_value': round(nominal_final, 2),
        'real_final_value': round(real_final, 2),
        'purchasing_power_lost_pct': round(purchasing_power_lost_pct, 2),
        'real_value_history': real_history,
    }


def compute_panic_sell(
    ticker_series: Dict[str, Dict[str, Any]],
    value_history: List[Dict[str, Any]],
    panic_sell_date: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Simulate selling the entire portfolio on `panic_sell_date` (the closest
    trading day at or before it) and sitting in cash -- no reinvestment --
    for the rest of the period. This is a teaching tool: it shows exactly
    what panic-selling during a downturn costs versus holding.

    Returns None if no panic_sell_date was given or no data is available.
    """
    if not panic_sell_date or not ticker_series:
        return None

    try:
        panic_date = pd.to_datetime(panic_sell_date)
    except Exception:
        return None

    total_at_sale = 0.0
    actual_sale_date = None
    per_ticker_sale: Dict[str, Any] = {}

    for symbol, series in ticker_series.items():
        shares_upto = series['shares_series'][series['shares_series'].index <= panic_date]
        price_upto = series['close_series'][series['close_series'].index <= panic_date]
        if price_upto.empty:
            continue

        shares_val = float(shares_upto.iloc[-1]) if not shares_upto.empty else 0.0
        price_val = float(price_upto.iloc[-1])
        total_at_sale += shares_val * price_val
        actual_sale_date = price_upto.index[-1]
        per_ticker_sale[symbol] = {
            'shares_sold': round(shares_val, 6),
            'sale_price': round(price_val, 4),
        }

    if actual_sale_date is None:
        return None

    # Reuse the already-computed monthly value_history: identical up to the
    # sale date, then flat (idle cash, no growth) afterward.
    panic_history: List[Dict[str, Any]] = []
    for point in value_history:
        point_date = pd.to_datetime(point['date'])
        if point_date <= actual_sale_date:
            panic_history.append({'date': point['date'], 'value': point['value']})
        else:
            panic_history.append({'date': point['date'], 'value': round(total_at_sale, 2)})

    return {
        'requested_date': panic_date.date().isoformat(),
        'actual_sale_date': actual_sale_date.date().isoformat(),
        'value_at_sale': round(total_at_sale, 2),
        'final_value': round(total_at_sale, 2),
        'per_ticker': per_ticker_sale,
        'value_history': panic_history,
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda function to simulate a portfolio over a date range, with optional
    recurring contributions (dollar-cost averaging), plus a real SPY-based
    S&P 500 benchmark simulated the same way.

    Expected event body (JSON):
    {
      "starting_cash": 10000,
      "start_year": 2015,
      "end_year": 2020,
      "tickers": ["AAPL", "MSFT", "GOOGL"],
      "contribution_amount": 200,        (optional, default 0)
      "contribution_frequency": "monthly" (optional: "none" | "monthly" | "yearly", default "none")
    }

    Returns:
    {
      "final_cash": 18500.00,
      "roi": 0.85,
      "total_contributed": 22000.00,
      "ticker_breakdown": { ... },
      "value_history": [ { "date": "...", "value": ... }, ... ],
      "benchmark": {
        "final_value": ...,
        "value_history": [ ... ]
      }
    }

    Simulation rules:
    - Starting cash is split equally across all tickers and invested at the
      open price on the first trading day of start_year. starting_cash may be
      0 if a recurring contribution is set (pure DCA, no initial lump sum).
    - If contribution_amount > 0, that amount is split equally across tickers
      and invested at the close price on the first trading day of each
      contribution period (month or year), starting the period AFTER the
      initial buy.
    - Dividends are reinvested: on each ex-dividend day, dividend cash buys
      additional shares at that day's closing price.
    - Shares are sold at the close price on the last trading day of end_year.
    - The benchmark applies the SAME total cash and contribution schedule to
      SPY (undivided), so it's a real apples-to-apples comparison, not an
      estimate.
    """
    try:
        # Parse body
        body: Dict[str, Any] = {}
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        elif isinstance(event.get('body'), dict):
            body = event['body']
        else:
            body = event  # direct invocation

        starting_cash: Optional[float] = body.get('starting_cash')
        start_year: Optional[int] = body.get('start_year')
        end_year: Optional[int] = body.get('end_year')
        tickers: Optional[List[str]] = body.get('tickers')
        contribution_amount: float = float(body.get('contribution_amount') or 0)
        contribution_frequency: str = (body.get('contribution_frequency') or 'none').lower()
        panic_sell_date: Optional[str] = body.get('panic_sell_date') or None
        rebalance_frequency: str = (body.get('rebalance_frequency') or 'none').lower()
        rebalance_threshold_pct: float = float(body.get('rebalance_threshold_pct') or 5.0)
        custom_start_date: Optional[str] = body.get('start_date') or None
        custom_end_date: Optional[str] = body.get('end_date') or None
        raw_weights: Optional[Dict[str, Any]] = body.get('weights') or None
        annual_fee_pct: float = float(body.get('annual_fee_pct') or 0)
        tax_treatment: str = (body.get('tax_treatment') or 'none').lower()
        tax_rate: float = float(body.get('tax_rate') or 0)
        inflation_rate_pct: float = float(body.get('inflation_rate_pct') or 0)
        withdrawal_start_date: Optional[str] = body.get('withdrawal_start_date') or None
        withdrawal_amount: float = float(body.get('withdrawal_amount') or 0)

        # Validate inputs
        if starting_cash is None or start_year is None or end_year is None or not tickers:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required fields: starting_cash, start_year, end_year, tickers'})
            }

        starting_cash = float(starting_cash)
        start_year = int(start_year)
        end_year = int(end_year)

        if start_year > end_year:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'start_year must be <= end_year'})
            }

        if contribution_frequency not in VALID_FREQUENCIES:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f"contribution_frequency must be one of {sorted(VALID_FREQUENCIES)}"})
            }

        if contribution_amount < 0:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'contribution_amount must be >= 0'})
            }

        if annual_fee_pct < 0 or annual_fee_pct > 5:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'annual_fee_pct must be between 0 and 5'})
            }

        if tax_treatment not in {'none', 'long_term', 'short_term'}:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': "tax_treatment must be one of ['none', 'long_term', 'short_term']"})
            }

        if tax_rate < 0 or tax_rate > 50:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'tax_rate must be between 0 and 50'})
            }

        if inflation_rate_pct < 0 or inflation_rate_pct > 20:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'inflation_rate_pct must be between 0 and 20'})
            }

        if withdrawal_amount < 0:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'withdrawal_amount must be >= 0'})
            }

        if withdrawal_amount > 0 and not withdrawal_start_date:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'withdrawal_start_date is required when withdrawal_amount is set'})
            }

        if rebalance_frequency not in VALID_REBALANCE_FREQUENCIES:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f"rebalance_frequency must be one of {sorted(VALID_REBALANCE_FREQUENCIES)}"})
            }

        if rebalance_threshold_pct <= 0 or rebalance_threshold_pct > 50:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'rebalance_threshold_pct must be between 0 and 50'})
            }

        recurring_enabled = contribution_amount > 0 and contribution_frequency != 'none'

        # starting_cash must be positive UNLESS recurring contributions are
        # enabled, in which case a pure-DCA run (no lump sum) is allowed.
        if starting_cash < 0 or (starting_cash <= 0 and not recurring_enabled):
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'starting_cash must be positive unless a recurring contribution is set'})
            }

        # Date range: exact start_date/end_date if provided (e.g. "invest the
        # week before COVID hit" instead of being locked to Jan 1 - Dec 31),
        # otherwise the full start_year to end_year range.
        if custom_start_date and custom_end_date:
            try:
                parsed_start = pd.to_datetime(custom_start_date)
                parsed_end = pd.to_datetime(custom_end_date)
            except Exception:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': 'start_date/end_date must be valid dates (YYYY-MM-DD)'})
                }
            if parsed_start >= parsed_end:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': 'start_date must be before end_date'})
                }
            start_date = parsed_start.date().isoformat()
            end_date = parsed_end.date().isoformat()
            # Keep start_year/end_year in sync for anything downstream that
            # still labels results by year (e.g. the response payload).
            start_year = parsed_start.year
            end_year = parsed_end.year
        else:
            start_date = f"{start_year}-01-01"
            end_date = f"{end_year}-12-31"

        clean_tickers = [t.upper().strip() for t in tickers]

        # Resolve target weight fractions across all requested tickers.
        # Falls back to equal weight if no custom weights were given, or if
        # the given weights don't sum to something usable.
        if raw_weights:
            clean_weights = {}
            for k, v in raw_weights.items():
                try:
                    clean_weights[k.upper().strip()] = float(v)
                except (TypeError, ValueError):
                    continue
            weight_sum = sum(clean_weights.get(t, 0.0) for t in clean_tickers)
            if weight_sum > 0:
                weight_fracs = {t: clean_weights.get(t, 0.0) / weight_sum for t in clean_tickers}
            else:
                weight_fracs = {t: 1.0 / len(clean_tickers) for t in clean_tickers}
        else:
            weight_fracs = {t: 1.0 / len(clean_tickers) for t in clean_tickers}

        cash_per_ticker = {t: starting_cash * weight_fracs[t] for t in clean_tickers}
        contribution_per_ticker = {t: (contribution_amount * weight_fracs[t]) if recurring_enabled else 0.0 for t in clean_tickers}

        def run_core_simulation(fee_pct: float) -> Dict[str, Any]:
            """
            Runs the actual portfolio simulation (rebalancing or independent
            per-ticker, whichever applies) at a given fee rate. Used once at
            the user's chosen fee for the primary result, and again at 0%
            fee to build an honest "what fees actually cost you" comparison.
            """
            core_ticker_breakdown: Dict[str, Any] = {}
            core_total_final_value = 0.0
            core_total_contributed = starting_cash
            core_failed_tickers: List[str] = []
            core_ticker_series: Dict[str, Dict[str, Any]] = {}
            core_rebalance_events: List[str] = []
            core_fees_paid = 0.0
            core_withdrawn = 0.0

            if rebalance_enabled:
                rb = simulate_portfolio_with_rebalancing(
                    clean_tickers, start_date, end_date, starting_cash,
                    contribution_amount, contribution_frequency, rebalance_frequency,
                    weights=weight_fracs, annual_fee_pct=fee_pct,
                    withdrawal_start_date=withdrawal_start_date, withdrawal_amount=withdrawal_amount,
                    rebalance_threshold_pct=rebalance_threshold_pct,
                )
                if 'error' in rb:
                    return {'error': rb['error']}
                core_ticker_breakdown = rb['ticker_breakdown']
                core_total_final_value = rb['final_value']
                core_total_contributed = rb['total_contributed']
                core_ticker_series = rb['shares_series_map']
                core_rebalance_events = rb['rebalance_events']
                core_failed_tickers = rb['failed_tickers']
                core_fees_paid = rb['total_fees_paid']
                core_withdrawn = rb['total_withdrawn']
            else:
                for symbol in clean_tickers:
                    sim = simulate_ticker(
                        symbol, start_date, end_date, cash_per_ticker[symbol],
                        contribution_per_ticker[symbol], contribution_frequency,
                        annual_fee_pct=fee_pct,
                        withdrawal_start_date=withdrawal_start_date,
                        withdrawal_amount=withdrawal_amount * weight_fracs[symbol] if withdrawal_amount > 0 else 0.0,
                    )
                    if 'error' in sim:
                        core_failed_tickers.append(symbol)
                        core_ticker_breakdown[symbol] = {'error': sim['error']}
                        continue
                    core_ticker_breakdown[symbol] = {k: v for k, v in sim.items() if k not in ('shares_series', 'close_series')}
                    core_total_final_value += sim['final_value']
                    if recurring_enabled:
                        core_total_contributed += sim['total_contributed']
                    core_ticker_series[symbol] = {'shares_series': sim['shares_series'], 'close_series': sim['close_series']}
                    core_fees_paid += sim['total_fees_paid']
                    core_withdrawn += sim['total_withdrawn']

                core_total_final_value += sum(cash_per_ticker[t] for t in core_failed_tickers)

            return {
                'ticker_breakdown': core_ticker_breakdown,
                'total_final_value': core_total_final_value,
                'total_contributed': core_total_contributed,
                'failed_tickers': core_failed_tickers,
                'ticker_series': core_ticker_series,
                'rebalance_events': core_rebalance_events,
                'fees_paid': core_fees_paid,
                'withdrawn': core_withdrawn,
            }

        rebalance_enabled = rebalance_frequency != 'none' and len(tickers) > 1

        primary = run_core_simulation(annual_fee_pct)
        if 'error' in primary:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': primary['error']})
            }

        ticker_breakdown = primary['ticker_breakdown']
        total_final_value = primary['total_final_value']
        total_contributed = primary['total_contributed']
        failed_tickers = primary['failed_tickers']
        ticker_series = primary['ticker_series']
        rebalance_events = primary['rebalance_events']
        fees_paid = primary['fees_paid']
        total_withdrawn = primary['withdrawn']

        value_history = build_value_history(ticker_series, start_date, end_date)
        panic_sell = compute_panic_sell(ticker_series, value_history, panic_sell_date)

        # Honest check: did the withdrawals actually deplete the portfolio
        # before end_date? Real sequence-of-returns risk means this can
        # happen even with a "reasonable-sounding" withdrawal amount.
        depletion_date = find_depletion_date(value_history) if withdrawal_amount > 0 else None
        inflation_adjustment = compute_inflation_adjustment(value_history, inflation_rate_pct)

        overall_roi = (total_final_value - total_contributed) / total_contributed if total_contributed > 0 else 0.0
        risk_metrics = compute_risk_metrics(value_history, total_contributed, total_final_value)

        # Simplified capital gains estimate: taxes the whole realized gain at
        # one flat rate. Real tax treatment is per-lot (each contribution has
        # its own purchase date and holding period, taxed separately as it's
        # sold) -- this is an educational approximation, not real tax advice.
        tax_estimate: Optional[Dict[str, Any]] = None
        if tax_treatment != 'none' and tax_rate > 0:
            gain_taxed = max(total_final_value - total_contributed, 0.0)
            tax_owed = gain_taxed * (tax_rate / 100.0)
            tax_estimate = {
                'treatment': tax_treatment,
                'tax_rate_pct': tax_rate,
                'gain_taxed': round(gain_taxed, 2),
                'tax_owed': round(tax_owed, 2),
                'after_tax_value': round(total_final_value - tax_owed, 2),
            }
        correlation_matrix = compute_correlation_matrix(ticker_series)

        # Honest fee-impact comparison: rerun the identical simulation at 0%
        # fees so the frontend can show exactly what the fee actually cost,
        # not an estimate.
        fee_comparison: Optional[Dict[str, Any]] = None
        if annual_fee_pct > 0:
            fee_free = run_core_simulation(0.0)
            if 'error' not in fee_free:
                fee_free_history = build_value_history(fee_free['ticker_series'], start_date, end_date)
                fee_comparison = {
                    'annual_fee_pct': annual_fee_pct,
                    'fees_paid': round(fees_paid, 2),
                    'final_value_without_fee': round(fee_free['total_final_value'], 2),
                    'final_value_with_fee': round(total_final_value, 2),
                    'cost_of_fees': round(fee_free['total_final_value'] - total_final_value, 2),
                    'value_history_without_fee': fee_free_history,
                }

        # Real SPY benchmark: same total cash + contribution schedule,
        # undivided, invested entirely in SPY. This replaces the old
        # straight-line "estimated" S&P 500 comparison with an actual
        # historical simulation.
        benchmark: Dict[str, Any] = {}
        spy_sim = simulate_ticker(BENCHMARK_TICKER, start_date, end_date, starting_cash, contribution_amount, contribution_frequency)
        if 'error' not in spy_sim:
            spy_series = {BENCHMARK_TICKER: {'shares_series': spy_sim['shares_series'], 'close_series': spy_sim['close_series']}}
            spy_value_history = build_value_history(spy_series, start_date, end_date)
            spy_total_invested = starting_cash + spy_sim['total_contributed']
            benchmark = {
                'ticker': BENCHMARK_TICKER,
                'final_value': spy_sim['final_value'],
                'total_contributed': round(spy_total_invested, 2),
                'value_history': spy_value_history,
                'risk_metrics': compute_risk_metrics(spy_value_history, spy_total_invested, spy_sim['final_value']),
            }
        else:
            benchmark = {'error': spy_sim['error']}

        result = {
            'starting_cash': round(starting_cash, 2),
            'total_contributed': round(total_contributed, 2),
            'final_cash': round(total_final_value, 2),
            'roi': round(overall_roi, 6),
            'roi_percent': round(overall_roi * 100, 4),
            'start_year': start_year,
            'end_year': end_year,
            'start_date': start_date,
            'end_date': end_date,
            'tickers': tickers,
            'contribution_amount': round(contribution_amount, 2),
            'contribution_frequency': contribution_frequency,
            'rebalance_frequency': rebalance_frequency,
            'rebalance_threshold_pct': rebalance_threshold_pct if rebalance_frequency == 'threshold' else None,
            'rebalance_events': rebalance_events,
            'weights': {t: round(weight_fracs[t] * 100, 2) for t in clean_tickers},
            'ticker_breakdown': ticker_breakdown,
            'value_history': value_history,
            'risk_metrics': risk_metrics,
            'correlation_matrix': correlation_matrix,
            'annual_fee_pct': annual_fee_pct,
            'fee_comparison': fee_comparison,
            'tax_estimate': tax_estimate,
            'inflation_adjustment': inflation_adjustment,
            'withdrawal_start_date': withdrawal_start_date,
            'withdrawal_amount': withdrawal_amount,
            'total_withdrawn': round(total_withdrawn, 2),
            'depletion_date': depletion_date,
            'benchmark': benchmark,
        }

        if panic_sell is not None:
            result['panic_sell'] = panic_sell

        if failed_tickers:
            result['failed_tickers'] = failed_tickers
            result['note'] = f"{len(failed_tickers)} ticker(s) failed; their cash allocation was returned unchanged."

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