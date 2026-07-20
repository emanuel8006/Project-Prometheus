import { useState, useMemo, useEffect } from 'react';
import { API_BASE_URL, SIMULATION_CONFIG, CATEGORIES, SP500_DATA, FUN_PURCHASES } from './config';
import { STOCKS_DATA, SECTOR_NAMES } from './stockData';
import { PortfolioChart, ScenarioComparisonChart } from './components';
import { getUserData, updatePortfolioFromSimulation, saveScenario, loadScenarios, deleteScenario, clearScenarios } from './supabaseFunctions';

function formatMarketCap(value) {
  if (!value) return null;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value}`;
}

const StockSimulation = ({ session }) => {
  // Load saved state from localStorage
  const [step, setStep] = useState(() => 
    localStorage.getItem('sim_step') || 'setup'
  );
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('sim_config');
    return saved ? JSON.parse(saved) : {
      year: SIMULATION_CONFIG.defaultYear,
      investment: SIMULATION_CONFIG.defaultInvestment,
      customInvestment: '',
      numCategories: 3,
      stocksPerCategory: 2,
      investmentStrategy: 'lump',
      dcaMonthly: 500,
      panicSellDate: '',
      rebalanceFrequency: 'none',
      useCustomDates: false,
      customStartDate: '',
      customEndDate: '',
      useCustomWeights: false,
      annualFeePct: 0,
      useWithdrawal: false,
      withdrawalStartDate: '',
      withdrawalAmount: 500,
      taxTreatment: 'none',
      taxRate: 15,
    };
  });
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = localStorage.getItem('sim_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedStocks, setSelectedStocks] = useState(() => {
    const saved = localStorage.getItem('sim_stocks');
    return saved ? JSON.parse(saved) : {};
  });
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(() => {
    const saved = localStorage.getItem('sim_categoryIndex');
    return saved ? parseInt(saved) : 0;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ peMin: '', peMax: '', betaMin: '', betaMax: '', dividendMin: '', dividendMax: '' });

  // Live stats from /stats lambda: { [ticker]: { pe, marketCap, beta } }
  const [liveStats, setLiveStats] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);

  // Simulation result from /simulate lambda
  const [simulationResult, setSimulationResult] = useState(() => {
    const saved = localStorage.getItem('sim_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState(null);
  const [stockWeights, setStockWeights] = useState({});

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('sim_step', step);
  }, [step]);

  useEffect(() => {
    localStorage.setItem('sim_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('sim_categories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  useEffect(() => {
    localStorage.setItem('sim_stocks', JSON.stringify(selectedStocks));
  }, [selectedStocks]);

  useEffect(() => {
    localStorage.setItem('sim_categoryIndex', currentCategoryIndex.toString());
  }, [currentCategoryIndex]);

  useEffect(() => {
    if (simulationResult) {
      localStorage.setItem('sim_result', JSON.stringify(simulationResult));
    }
  }, [simulationResult]);
  // Gemini AI analysis
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // AI crash walkthrough (only relevant when a panic-sell scenario is picked)
  const [crashAnalysis, setCrashAnalysis] = useState(null);
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashError, setCrashError] = useState(null);
  const [showCrashModal, setShowCrashModal] = useState(false);
  const [shareStatus, setShareStatus] = useState(''); // '', 'copied', 'shared', 'error'

  // Saved scenarios for side-by-side comparison
  const [savedScenarios, setSavedScenarios] = useState(() => {
    const saved = localStorage.getItem('sim_scenarios');
    return saved ? JSON.parse(saved) : [];
  });
  const [scenarioLabel, setScenarioLabel] = useState('');
  const [dbUserId, setDbUserId] = useState(null);

  useEffect(() => {
    localStorage.setItem('sim_scenarios', JSON.stringify(savedScenarios));
  }, [savedScenarios]);

  // When signed in, resolve the users-table row and sync saved scenarios
  // against the DB instead of only this browser's localStorage. Existing
  // local scenarios from before sign-in get migrated up once, rather than
  // silently lost.
  useEffect(() => {
    if (!session?.user?.email) {
      setDbUserId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const userData = await getUserData(session.user.email);
        if (cancelled || !userData?.id) return;
        setDbUserId(userData.id);

        const remote = await loadScenarios(userData.id);
        if (cancelled) return;

        if (remote && remote.length > 0) {
          setSavedScenarios(remote.map(r => ({
            id: r.id,
            label: r.label,
            invested: r.invested,
            finalValue: r.final_value,
            roiPercent: r.roi_percent,
            sharpe: r.sharpe,
            maxDrawdown: r.max_drawdown,
            points: r.points || [],
          })));
        } else if (savedScenarios.length > 0) {
          // Migrate this device's guest-saved scenarios up to the account
          const migrated = [];
          for (const s of savedScenarios) {
            try {
              const saved = await saveScenario(userData.id, s);
              migrated.push({ ...s, id: saved.id });
            } catch {
              migrated.push(s); // keep local copy if one row fails to migrate
            }
          }
          setSavedScenarios(migrated);
        }
      } catch (err) {
        console.warn('Could not sync scenarios with account:', err);
      }
    })();

    return () => { cancelled = true; };
    // Only re-sync when the signed-in identity changes, not on every scenario edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  const SCENARIO_COLORS = ['#3D8B8B', '#E8A54B', '#D9534F', '#6B5CA5'];
  const MAX_SCENARIOS = 4;

  const defaultScenarioLabel = () => {
    const tickerList = Object.values(selectedStocks).flat().map(s => s.ticker).join('+');
    const period = config.useCustomDates ? config.customStartDate : config.year;
    const strategy = config.investmentStrategy === 'dca' ? 'DCA' : 'Lump';
    return `${tickerList} · ${period} · ${strategy}`;
  };

  const handleSaveScenario = async () => {
    if (!simulationResult || savedScenarios.length >= MAX_SCENARIOS) return;
    const label = scenarioLabel.trim() || defaultScenarioLabel();
    const newScenario = {
      id: Date.now(),
      label,
      invested: simulationResult.total_contributed ?? simulationResult.starting_cash,
      finalValue: simulationResult.final_cash,
      roiPercent: simulationResult.roi_percent,
      sharpe: simulationResult.risk_metrics?.sharpe_ratio ?? null,
      maxDrawdown: simulationResult.risk_metrics?.max_drawdown_pct ?? null,
      points: simulationResult.value_history || [],
    };
    setSavedScenarios(prev => [...prev, newScenario]);
    setScenarioLabel('');

    if (dbUserId) {
      try {
        const saved = await saveScenario(dbUserId, newScenario);
        // Swap the temporary local id for the real DB id so remove/clear work against it
        setSavedScenarios(prev => prev.map(s => s.id === newScenario.id ? { ...s, id: saved.id } : s));
      } catch (err) {
        console.warn('Could not save scenario to account:', err);
      }
    }
  };

  const handleRemoveScenario = (id) => {
    setSavedScenarios(prev => prev.filter(s => s.id !== id));
    if (dbUserId) {
      deleteScenario(id).catch(err => console.warn('Could not delete scenario from account:', err));
    }
  };

  const handleClearScenarios = () => {
    setSavedScenarios([]);
    localStorage.removeItem('sim_scenarios');
    if (dbUserId) {
      clearScenarios(dbUserId).catch(err => console.warn('Could not clear scenarios from account:', err));
    }
  };

  const getAvailableStocks = () => STOCKS_DATA[selectedCategories[currentCategoryIndex]] || [];

  // Fetch /stats for all tickers in the current category (skip already cached).
  // Requests are batched (5 at a time) to avoid yfinance rate-limiting.
  useEffect(() => {
    if (step !== 'stocks') return;
    const stocks = getAvailableStocks();
    const uncached = stocks.map(s => s.ticker).filter(t => !liveStats[t]);
    if (!uncached.length) return;

    const fetchOne = (ticker) =>
      fetch(`${API_BASE_URL}/stats?symbol=${ticker}`)
        .then(r => r.json())
        .then(data => ({ ticker, data }))
        .catch(() => ({ ticker, data: null }));

    const processResult = ({ ticker, data }) => {
      if (!data || data.error) return null;
      const pe = data.trailingPE ?? data.forwardPE ?? null;
      const eps = data.trailingEps ?? data.epsTrailingTwelveMonths ?? data.forwardEps ?? null;
      const beta = data.beta ?? null;
      let dividendYield = null;
      if (data.dividendYield != null) {
        const pct = +data.dividendYield.toFixed(2);
        dividendYield = (pct >= 0 && pct <= 25) ? pct : null;
      }
      return [ticker, {
        pe: (pe != null && pe > -1000 && pe < 10000) ? +pe.toFixed(1) : null,
        eps: (eps != null && Math.abs(eps) < 10000) ? +eps.toFixed(2) : null,
        marketCap: formatMarketCap(data.marketCap),
        beta: (beta != null && beta > -10 && beta < 10) ? +beta.toFixed(2) : null,
        dividendYield,
      }];
    };

    const BATCH_SIZE = 5;
    const runBatches = async () => {
      setStatsLoading(true);
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        const batch = uncached.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(fetchOne));
        const newStats = {};
        results.forEach(r => {
          const entry = processResult(r);
          if (entry) newStats[entry[0]] = entry[1];
        });
        if (Object.keys(newStats).length) {
          setLiveStats(prev => ({ ...prev, ...newStats }));
        }
        if (i + BATCH_SIZE < uncached.length) {
          await new Promise(res => setTimeout(res, 300));
        }
      }
      setStatsLoading(false);
    };

    runBatches();
  }, [step, currentCategoryIndex]);

  const handleConfigSubmit = () => setStep('categories');

  const handleCategorySelect = (categoryId) => {
    if (selectedCategories.includes(categoryId)) {
      setSelectedCategories(selectedCategories.filter(c => c !== categoryId));
    } else if (selectedCategories.length < config.numCategories) {
      setSelectedCategories([...selectedCategories, categoryId]);
    }
  };

  const handleCategoriesSubmit = () => {
    setStep('stocks');
    setCurrentCategoryIndex(0);
    setSearchQuery('');
    setFilters({ peMin: '', peMax: '', betaMin: '', betaMax: '', dividendMin: '', dividendMax: '' });
  };

  const handleStockSelect = (stock) => {
    const categoryId = selectedCategories[currentCategoryIndex];
    const currentStocks = selectedStocks[categoryId] || [];

    if (currentStocks.find(s => s.ticker === stock.ticker)) {
      setSelectedStocks({ ...selectedStocks, [categoryId]: currentStocks.filter(s => s.ticker !== stock.ticker) });
    } else if (currentStocks.length < config.stocksPerCategory) {
      setSelectedStocks({ ...selectedStocks, [categoryId]: [...currentStocks, stock] });
    }
  };

  const runSimulation = async (weightsMap) => {
    setStep('results');
    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationResult(null);
    try {
      const allTickers = Object.values(selectedStocks).flat().map(s => s.ticker);
      const isDca = config.investmentStrategy === 'dca';

      const res = await fetch(`${API_BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Pure DCA runs have no lump sum; a tiny nonzero value keeps the
          // backend's per-ticker cash split well-defined.
          starting_cash: isDca ? 0.01 : config.investment,
          start_year: config.year,
          end_year: new Date().getFullYear(),
          start_date: config.useCustomDates ? config.customStartDate : null,
          end_date: config.useCustomDates ? config.customEndDate : null,
          tickers: allTickers,
          contribution_amount: isDca ? config.dcaMonthly : 0,
          contribution_frequency: isDca ? 'monthly' : 'none',
          panic_sell_date: config.panicSellDate || null,
          rebalance_frequency: config.rebalanceFrequency || 'none',
          weights: weightsMap || null,
          annual_fee_pct: config.annualFeePct || 0,
          withdrawal_start_date: config.useWithdrawal ? config.withdrawalStartDate : null,
          withdrawal_amount: config.useWithdrawal ? config.withdrawalAmount : 0,
          tax_treatment: config.taxTreatment || 'none',
          tax_rate: config.taxTreatment !== 'none' ? config.taxRate : 0,
        }),
      });
      const data = await res.json();
      setSimulationResult(data);

      // When signed in, save simulation to DB so leaderboard shows user's amount, year, balance, profit, ROI
      if (session?.user?.email && data?.final_cash != null) {
        try {
          const userData = await getUserData(session.user.email);
          const portfolioId = userData?.portfolios?.[0]?.id;
          const startingBalance = isDca ? (data.total_contributed ?? 0) : data.starting_cash;
          if (portfolioId) {
            await updatePortfolioFromSimulation(portfolioId, {
              starting_balance: startingBalance,
              current_balance: data.final_cash,
              investment_year: config.year,
            });
          }
        } catch (saveErr) {
          console.warn('Could not save simulation to leaderboard:', saveErr);
        }
      }
    } catch (err) {
      setSimulationError(err.message);
    } finally {
      setSimulationLoading(false);
    }
  };

  const handleStocksSubmit = () => {
    if (currentCategoryIndex < selectedCategories.length - 1) {
      setCurrentCategoryIndex(currentCategoryIndex + 1);
      setSearchQuery('');
      setFilters({ peMin: '', peMax: '', betaMin: '', betaMax: '', dividendMin: '', dividendMax: '' });
    } else if (config.useCustomWeights) {
      // Initialize equal weights as a starting point, then let the user adjust
      const allTickers = Object.values(selectedStocks).flat().map(s => s.ticker);
      const equalShare = +(100 / allTickers.length).toFixed(2);
      const initial = {};
      allTickers.forEach(t => { initial[t] = equalShare; });
      setStockWeights(initial);
      setStep('weights');
    } else {
      runSimulation(null);
    }
  };

  const handleWeightsSubmit = () => {
    runSimulation(stockWeights);
  };

  const handleReset = () => {
    setStep('setup');
    setSelectedCategories([]);
    setSelectedStocks({});
    setCurrentCategoryIndex(0);
    setSearchQuery('');
    setStockWeights({});
    setFilters({ peMin: '', peMax: '', betaMin: '', betaMax: '', dividendMin: '', dividendMax: '' });
    setConfig({
      year: SIMULATION_CONFIG.defaultYear,
      investment: SIMULATION_CONFIG.defaultInvestment,
      customInvestment: '',
      numCategories: 3,
      stocksPerCategory: 2,
      investmentStrategy: 'lump',
      dcaMonthly: 500,
      panicSellDate: '',
      rebalanceFrequency: 'none',
      useCustomDates: false,
      customStartDate: '',
      customEndDate: '',
      useCustomWeights: false,
      annualFeePct: 0,
      useWithdrawal: false,
      withdrawalStartDate: '',
      withdrawalAmount: 500,
      taxTreatment: 'none',
      taxRate: 15,
    });
    setSimulationResult(null);
    // Clear localStorage
    localStorage.removeItem('sim_step');
    localStorage.removeItem('sim_config');
    localStorage.removeItem('sim_categories');
    localStorage.removeItem('sim_stocks');
    localStorage.removeItem('sim_categoryIndex');
    localStorage.removeItem('sim_result');
  };

  const getResults = () => {
    if (!simulationResult) return null;

    // Prefer the exact dates the backend actually used (accurate for custom
    // date ranges); fall back to the old year-based approximation for older
    // cached results that don't have start_date/end_date.
    const yearsHeld = simulationResult.start_date && simulationResult.end_date
      ? Math.max((new Date(simulationResult.end_date) - new Date(simulationResult.start_date)) / (1000 * 60 * 60 * 24 * 365.25), 0.01)
      : new Date().getFullYear() - config.year + (new Date().getMonth() / 12);
    const monthsHeld = Math.max(1, Math.floor(yearsHeld * 12));
    const allStocks = Object.values(selectedStocks).flat();
    const isDca = config.investmentStrategy === 'dca';

    // Both lump-sum and DCA results now come straight from the backend, which
    // walks real daily price history and buys shares on the actual trading
    // day of each contribution period -- no more linear-interpolation guess.
    const totalInvested = isDca
      ? (simulationResult.total_contributed ?? 0)
      : simulationResult.starting_cash;
    const totalValue = simulationResult.final_cash;

    const stockResults = allStocks.map(stock => {
      const b = simulationResult.ticker_breakdown?.[stock.ticker];
      if (!b || b.error) {
        return { ...stock, invested: totalInvested / allStocks.length, shares: 0, currentValue: 0, gain: 0, gainPercent: 0 };
      }
      const invested = isDca
        ? (b.total_contributed || 0)
        : b.initial_investment;
      return {
        ...stock,
        invested,
        shares: b.final_shares,
        currentValue: b.final_value,
        gain: b.final_value - invested,
        gainPercent: invested > 0 ? ((b.final_value - invested) / invested) * 100 : 0,
      };
    });

    const bankValue = !isDca
      ? config.investment * Math.pow(1 + SIMULATION_CONFIG.bankInterestRate, yearsHeld)
      : (() => {
          let bankTotal = 0;
          const monthlyRate = SIMULATION_CONFIG.bankInterestRate / 12;
          for (let m = 0; m < monthsHeld; m++) bankTotal = (bankTotal + config.dcaMonthly) * (1 + monthlyRate);
          return bankTotal;
        })();

    const realBenchmark = simulationResult.benchmark && !simulationResult.benchmark.error
      ? simulationResult.benchmark
      : null;

    const sp500Value = realBenchmark
      ? realBenchmark.final_value
      : !isDca
        ? config.investment * (1 + sp500Return)
        : (() => {
            let sp500Total = 0;
            const monthlyReturn = Math.pow(1 + sp500Return, 1 / monthsHeld) - 1;
            for (let m = 0; m < monthsHeld; m++) sp500Total = (sp500Total + config.dcaMonthly) * (1 + monthlyReturn);
            return sp500Total;
          })();

    const panicSell = simulationResult.panic_sell || null;
    const rebalanceCount = simulationResult.rebalance_events?.length || 0;

    return {
      stockResults,
      totalValue,
      totalInvested,
      totalGain: totalValue - totalInvested,
      totalGainPercent: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
      comparisons: { mattress: totalInvested, bank: bankValue, sp500: sp500Value },
      yearsHeld: yearsHeld.toFixed(1),
      strategy: config.investmentStrategy,
      panicSell,
      rebalanceCount,
    };
  };

  const handleAiAnalysis = async () => {
    const results = getResults();
    if (!results) return;

    setShowAiModal(true);
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    const stockLines = results.stockResults.map(s =>
      `- ${s.ticker} (${s.name}): invested $${s.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}, now worth $${s.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}, ${s.gainPercent >= 0 ? '+' : ''}${s.gainPercent.toFixed(1)}%`
    ).join('\n');

    const prompt = `You are a friendly financial educator helping beginners understand their stock portfolio simulation.

The user simulated investing $${results.totalInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })} starting in ${config.year} using a ${results.strategy === 'dca' ? 'dollar-cost averaging' : 'lump sum'} strategy.

Portfolio result: $${results.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total (${results.totalGainPercent >= 0 ? '+' : ''}${results.totalGainPercent.toFixed(1)}% overall)

Individual stocks:
${stockLines}

Comparisons:
- Mattress (no investment): $${results.comparisons.mattress.toLocaleString(undefined, { maximumFractionDigits: 0 })}
- Savings account: $${results.comparisons.bank.toLocaleString(undefined, { maximumFractionDigits: 0 })}
- S&P 500 index: $${results.comparisons.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })}
${simulationResult.correlation_matrix ? `\nDiversification note: the correlation between the picked stocks' daily returns ranges from ${Math.min(...simulationResult.correlation_matrix.matrix.flat().filter(v => v < 0.999)).toFixed(2)} to ${Math.max(...simulationResult.correlation_matrix.matrix.flat().filter(v => v < 0.999)).toFixed(2)} (1.0 = always move together, -1.0 = always move opposite).` : ''}

Please provide a concise, beginner-friendly analysis with:
1. 3-4 pros of this portfolio/strategy based on the results
2. 3-4 cons or risks of this portfolio/strategy based on the results
3. One short takeaway lesson

Keep it encouraging, clear, and under 300 words. Use simple language, no jargon.`;

    try {
      const res = await fetch(`${API_BASE_URL}/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiAnalysis(data.output);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCrashWalkthrough = async () => {
    const panicSell = simulationResult?.panic_sell;
    if (!panicSell) return;

    setShowCrashModal(true);
    setCrashLoading(true);
    setCrashError(null);
    setCrashAnalysis(null);

    // Pull real value_history points from a window around the sale date so
    // Gemini narrates from actual numbers, not general knowledge.
    const saleDate = new Date(panicSell.actual_sale_date);
    const fullHistory = simulationResult.value_history || [];
    const windowMonths = 6;
    const nearby = fullHistory.filter(pt => {
      const d = new Date(pt.date);
      const monthsDiff = (d.getFullYear() - saleDate.getFullYear()) * 12 + (d.getMonth() - saleDate.getMonth());
      return Math.abs(monthsDiff) <= windowMonths;
    });

    const historyLines = nearby.map(pt => `- ${pt.date}: $${pt.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`).join('\n');
    const heldFinal = simulationResult.final_cash;
    const panicFinal = panicSell.final_value;

    const prompt = `You are a financial educator walking a beginner through a real historical market downturn using their own simulated portfolio's actual monthly values.

The user's portfolio (tickers: ${simulationResult.tickers.join(', ')}) was sold entirely on ${panicSell.actual_sale_date}, converting to cash at $${panicSell.value_at_sale.toLocaleString(undefined, { maximumFractionDigits: 0 })}.

Real month-by-month portfolio value around that date:
${historyLines}

If they had held instead of selling, the portfolio ended at $${heldFinal.toLocaleString(undefined, { maximumFractionDigits: 0 })} by ${simulationResult.end_year}.
If they sold on ${panicSell.actual_sale_date} and stayed in cash, they ended at $${panicFinal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.

Narrate this like a financial advisor walking someone through what actually happened, using the real numbers above:
1. Describe the emotional moment of the drop that led to the sale (2-3 sentences, grounded in the real numbers, not generic "the market crashed" language)
2. Walk through what happened to the portfolio in the months after, using the actual values given
3. State the concrete cost or benefit of the decision in dollars
4. End with one grounded lesson about behavior during downturns (not a cliché, something specific to this data)

Keep it under 280 words, plain language, no jargon, and stay strictly grounded in the numbers given -- don't invent news events or details not present in the data.`;

    try {
      const res = await fetch(`${API_BASE_URL}/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCrashAnalysis(data.output);
    } catch (err) {
      setCrashError(err.message);
    } finally {
      setCrashLoading(false);
    }
  };

  const handleShareResults = async () => {
    const results = getResults();
    if (!results || !simulationResult) return;

    const allTickers = Object.values(selectedStocks).flat().map(s => s.ticker).join(', ');
    const period = config.useCustomDates
      ? `${config.customStartDate} to ${config.customEndDate}`
      : `${config.year} to now`;
    const isProfit = results.totalGain >= 0;

    const text = [
      `📊 Prometheus Simulation Results`,
      ``,
      `Picks: ${allTickers}`,
      `Period: ${period}`,
      `Invested: $${results.totalInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      `Now worth: $${results.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      `${isProfit ? '+' : ''}${results.totalGainPercent.toFixed(1)}% (${isProfit ? '+' : ''}$${results.totalGain.toLocaleString(undefined, { maximumFractionDigits: 0 })})`,
      ``,
      `Try it yourself on Prometheus`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Prometheus Simulation', text });
        setShareStatus('shared');
      } catch (err) {
        // User cancelled the native share sheet -- not a real error, stay quiet
        if (err.name !== 'AbortError') setShareStatus('error');
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus('copied');
        setTimeout(() => setShareStatus(''), 2500);
      } catch (err) {
        setShareStatus('error');
      }
    }
  };

  const handleExportCsv = () => {
    if (!simulationResult) return;

    const rows = [];
    rows.push(['Metric', 'Value']);
    rows.push(['Tickers', Object.values(selectedStocks).flat().map(s => s.ticker).join(' + ')]);
    rows.push(['Start Date', simulationResult.start_date || config.year]);
    rows.push(['End Date', simulationResult.end_date || 'now']);
    rows.push(['Strategy', config.investmentStrategy === 'dca' ? 'Dollar-Cost Averaging' : 'Lump Sum']);
    rows.push(['Total Invested', simulationResult.total_contributed ?? simulationResult.starting_cash]);
    rows.push(['Final Value', simulationResult.final_cash]);
    rows.push(['ROI %', simulationResult.roi_percent]);
    if (simulationResult.risk_metrics) {
      rows.push(['Annualized Return %', simulationResult.risk_metrics.annualized_return_pct]);
      rows.push(['Annualized Volatility %', simulationResult.risk_metrics.annualized_volatility_pct]);
      rows.push(['Sharpe Ratio', simulationResult.risk_metrics.sharpe_ratio]);
      rows.push(['Max Drawdown %', simulationResult.risk_metrics.max_drawdown_pct]);
    }
    rows.push([]);
    rows.push(['Month-by-Month Value History']);
    rows.push(['Date', 'Value']);
    (simulationResult.value_history || []).forEach(pt => rows.push([pt.date, pt.value]));

    const csvContent = rows
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prometheus-simulation-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter and search stocks — numeric filters use liveStats since stockData has no metrics
  const filteredStocks = useMemo(() => {
    let stocks = getAvailableStocks();

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      stocks = stocks.filter(s =>
        s.ticker.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query)
      );
    }

    if (filters.peMin !== '') {
      stocks = stocks.filter(s => {
        const pe = liveStats[s.ticker]?.pe;
        return pe != null && pe >= parseFloat(filters.peMin);
      });
    }
    if (filters.peMax !== '') {
      stocks = stocks.filter(s => {
        const pe = liveStats[s.ticker]?.pe;
        return pe != null && pe <= parseFloat(filters.peMax);
      });
    }

    if (filters.betaMin !== '') {
      stocks = stocks.filter(s => {
        const beta = liveStats[s.ticker]?.beta;
        return beta != null && beta >= parseFloat(filters.betaMin);
      });
    }
    if (filters.betaMax !== '') {
      stocks = stocks.filter(s => {
        const beta = liveStats[s.ticker]?.beta;
        return beta != null && beta <= parseFloat(filters.betaMax);
      });
    }

    if (filters.dividendMin !== '') {
      stocks = stocks.filter(s => {
        const div = liveStats[s.ticker]?.dividendYield;
        return div != null && div >= parseFloat(filters.dividendMin);
      });
    }
    if (filters.dividendMax !== '') {
      stocks = stocks.filter(s => {
        const div = liveStats[s.ticker]?.dividendYield;
        return div != null && div <= parseFloat(filters.dividendMax);
      });
    }

    return stocks;
  }, [currentCategoryIndex, selectedCategories, config.year, searchQuery, filters, liveStats]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({ peMin: '', peMax: '', betaMin: '', betaMax: '', dividendMin: '', dividendMax: '' });
  };

  // Setup Step
  if (step === 'setup') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h3 className="font-display text-2xl font-bold text-navy mb-6">Configure Your Simulation</h3>

          <div className="space-y-6">
            <div>
              <label className="block text-navy font-medium mb-2">Time Period</label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setConfig({ ...config, useCustomDates: false })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    !config.useCustomDates ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  By Year
                </button>
                <button
                  onClick={() => setConfig({ ...config, useCustomDates: true })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    config.useCustomDates ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  Exact Dates
                </button>
              </div>

              {!config.useCustomDates ? (
                <>
                  <p className="text-navy-light text-sm mb-3">Pick a year. You'll see stock data from that time and choose what to "invest" in.</p>
                  <select
                    value={config.year}
                    onChange={(e) => setConfig({ ...config, year: parseInt(e.target.value) })}
                    className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none cursor-pointer"
                  >
                    {SIMULATION_CONFIG.availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <p className="text-navy-light text-xs mt-2">
                    Try 2020 for pandemic crash, 2022 for tech downturn, or 2023 for AI boom.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-navy-light text-sm mb-3">
                    Pick exact start and end dates — e.g. the week before COVID hit, instead of just "2020."
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-navy-light text-xs mb-1">Start date</label>
                      <input
                        type="date"
                        value={config.customStartDate}
                        onChange={(e) => setConfig({ ...config, customStartDate: e.target.value })}
                        max={config.customEndDate || undefined}
                        className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-navy-light text-xs mb-1">End date</label>
                      <input
                        type="date"
                        value={config.customEndDate}
                        onChange={(e) => setConfig({ ...config, customEndDate: e.target.value })}
                        min={config.customStartDate || undefined}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-navy-light text-xs mt-2">
                    Try 2020-02-19 to 2020-03-23 to simulate exactly the COVID crash.
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Investment Amount</label>
              <div className="flex gap-1 md:gap-2 mb-3">
                {[50, 100, 500, 1000, 5000, 10000, 50000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setConfig({ ...config, investment: amount, customInvestment: '' })}
                    className={`px-2 md:px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      config.investment === amount && !config.customInvestment
                        ? 'bg-teal text-white' 
                        : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    ${amount.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-navy-light text-sm">Custom:</span>
                <div className="relative flex-1 max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                  <input
                    type="text"
                    placeholder="Enter amount"
                    value={config.customInvestment || ''}
                    onChange={(e) => {
                      // Remove non-digits, then format with commas
                      const rawValue = e.target.value.replace(/[^\d]/g, '');
                      const numValue = parseInt(rawValue) || 0;
                      
                      // Enforce min/max
                      if (numValue > 1000000) return;
                      
                      // Format with commas
                      const formatted = numValue > 0 ? numValue.toLocaleString() : '';
                      
                      setConfig({ 
                        ...config, 
                        customInvestment: formatted,
                        investment: numValue >= 50 ? numValue : config.investment
                      });
                    }}
                    className={`w-full p-2 pl-7 rounded-lg border-2 text-navy font-medium focus:outline-none ${
                      config.customInvestment 
                        ? 'border-teal bg-teal/10' 
                        : 'border-cream-dark bg-white'
                    }`}
                  />
                </div>
                <span className="text-navy-light text-xs">($50 - $1,000,000)</span>
              </div>
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Investment Strategy</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfig({ ...config, investmentStrategy: 'lump' })}
                  className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${
                    config.investmentStrategy === 'lump'
                      ? 'border-teal bg-teal/10'
                      : 'border-cream-dark hover:border-teal/50'
                  }`}
                >
                  <div className="font-semibold text-navy">Lump Sum</div>
                  <div className="text-sm text-navy-light">Invest everything at once</div>
                </button>
                <button
                  onClick={() => setConfig({ ...config, investmentStrategy: 'dca' })}
                  className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${
                    config.investmentStrategy === 'dca'
                      ? 'border-teal bg-teal/10'
                      : 'border-cream-dark hover:border-teal/50'
                  }`}
                >
                  <div className="font-semibold text-navy">Dollar-Cost Average</div>
                  <div className="text-sm text-navy-light">Invest monthly over time</div>
                </button>
              </div>
              
              {config.investmentStrategy === 'dca' && (
                <div className="mt-4">
                  <label className="block text-navy text-sm font-medium mb-2">Monthly Investment</label>
                  <div className="flex flex-wrap gap-2">
                    {[100, 250, 500, 1000].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setConfig({ ...config, dcaMonthly: amount })}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          config.dcaMonthly === amount 
                            ? 'bg-teal text-white' 
                            : 'bg-cream-dark text-navy hover:bg-teal/20'
                        }`}
                      >
                        ${amount}/mo
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Simulate Panic-Selling? (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                Pick a real crash. We'll show you what selling everything that day — and sitting in cash — would've cost you, versus holding.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'None', value: '' },
                  { label: '2008 Financial Crisis', value: '2008-10-01' },
                  { label: '2020 COVID Crash', value: '2020-03-23' },
                  { label: '2022 Selloff', value: '2022-06-16' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setConfig({ ...config, panicSellDate: opt.value })}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      config.panicSellDate === opt.value
                        ? 'bg-coral text-white'
                        : 'bg-cream-dark text-navy hover:bg-coral/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Rebalancing (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                If you pick multiple stocks, periodically sell winners and buy laggards back to equal weight.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Never', value: 'none' },
                  { label: 'Yearly', value: 'yearly' },
                  { label: 'Quarterly', value: 'quarterly' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setConfig({ ...config, rebalanceFrequency: opt.value })}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      config.rebalanceFrequency === opt.value
                        ? 'bg-teal text-white'
                        : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Custom Allocation (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                If you pick multiple stocks, set exact percentages instead of splitting your cash equally.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfig({ ...config, useCustomWeights: false })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    !config.useCustomWeights ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  Equal Split
                </button>
                <button
                  onClick={() => setConfig({ ...config, useCustomWeights: true })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    config.useCustomWeights ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  Custom %
                </button>
              </div>
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Annual Fee / Expense Ratio (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                Simulate a fund's expense ratio, deducted monthly and compounding against your balance over time.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {[0, 0.1, 0.5, 1, 1.5].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setConfig({ ...config, annualFeePct: pct })}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      config.annualFeePct === pct ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <p className="text-navy-light text-xs">
                Index funds often run 0.03-0.20%. Actively managed funds can run 1%+. We'll show you exactly what the difference costs over your timeframe.
              </p>
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Withdrawals in Retirement (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                Simulate pulling a fixed amount out monthly starting on a chosen date, using real prices for that period — this shows whether the money would have actually lasted.
              </p>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setConfig({ ...config, useWithdrawal: false })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    !config.useWithdrawal ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  No Withdrawals
                </button>
                <button
                  onClick={() => setConfig({ ...config, useWithdrawal: true })}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    config.useWithdrawal ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                  }`}
                >
                  Simulate Withdrawals
                </button>
              </div>

              {config.useWithdrawal && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-navy-light text-xs mb-1">Start withdrawing on</label>
                    <input
                      type="date"
                      value={config.withdrawalStartDate}
                      onChange={(e) => setConfig({ ...config, withdrawalStartDate: e.target.value })}
                      min={config.useCustomDates ? config.customStartDate : `${config.year}-01-01`}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-navy-light text-xs mb-1">Monthly withdrawal</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy">$</span>
                      <input
                        type="number"
                        value={config.withdrawalAmount}
                        onChange={(e) => setConfig({ ...config, withdrawalAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-full p-3 pl-7 rounded-lg border-2 border-cream-dark bg-white text-navy font-medium focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-navy font-medium mb-2">Capital Gains Tax Estimate (optional)</label>
              <p className="text-navy-light text-sm mb-3">
                Estimate what you'd owe on the gain when you sell. This is a simplified flat-rate estimate, not real per-lot tax accounting or tax advice.
              </p>
              <div className="flex gap-2 mb-3">
                {[
                  { label: 'None', value: 'none' },
                  { label: 'Long-Term (held 1yr+)', value: 'long_term' },
                  { label: 'Short-Term (held <1yr)', value: 'short_term' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setConfig({ ...config, taxTreatment: opt.value, taxRate: opt.value === 'short_term' ? 24 : 15 })}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      config.taxTreatment === opt.value ? 'bg-teal text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {config.taxTreatment !== 'none' && (
                <div className="flex flex-wrap gap-2">
                  {(config.taxTreatment === 'long_term' ? [0, 15, 20] : [12, 22, 24, 32, 35, 37]).map(rate => (
                    <button
                      key={rate}
                      onClick={() => setConfig({ ...config, taxRate: rate })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        config.taxRate === rate ? 'bg-navy text-white' : 'bg-cream-dark text-navy hover:bg-teal/20'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-navy font-medium mb-2">Categories to Pick</label>
                <select
                  value={config.numCategories}
                  onChange={(e) => setConfig({ ...config, numCategories: parseInt(e.target.value) })}
                  className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy focus:border-teal focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'category' : 'categories'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-navy font-medium mb-2">Stocks per Category</label>
                <select
                  value={config.stocksPerCategory}
                  onChange={(e) => setConfig({ ...config, stocksPerCategory: parseInt(e.target.value) })}
                  className="w-full p-3 rounded-lg border-2 border-cream-dark bg-white text-navy focus:border-teal focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'stock' : 'stocks'}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleConfigSubmit}
              disabled={config.investment < 50 || (config.useCustomDates && (!config.customStartDate || !config.customEndDate || config.customStartDate >= config.customEndDate))}
              className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                config.investment >= 50 && !(config.useCustomDates && (!config.customStartDate || !config.customEndDate || config.customStartDate >= config.customEndDate))
                  ? 'bg-teal text-white hover:bg-teal-light'
                  : 'bg-cream-dark text-navy-light cursor-not-allowed'
              }`}
            >
              {config.investment < 50
                ? 'Minimum investment is $50'
                : (config.useCustomDates && (!config.customStartDate || !config.customEndDate))
                  ? 'Pick a start and end date'
                  : (config.useCustomDates && config.customStartDate >= config.customEndDate)
                    ? 'Start date must be before end date'
                    : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Categories Step
  if (step === 'categories') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h3 className="font-display text-2xl font-bold text-navy mb-2">Choose Sectors</h3>
          <p className="text-navy-light mb-6">Select {config.numCategories} {config.numCategories === 1 ? 'sector' : 'sectors'} to invest in.</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {CATEGORIES.map(cat => {
              const isSelected = selectedCategories.includes(cat.id);
              const isDisabled = !isSelected && selectedCategories.length >= config.numCategories;

              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  disabled={isDisabled}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    isSelected 
                      ? 'border-teal bg-teal/10' 
                      : isDisabled
                        ? 'border-cream-dark opacity-50 cursor-not-allowed'
                        : 'border-cream-dark hover:border-teal/50'
                  }`}
                >
                  <span className="text-3xl block mb-2">{cat.icon}</span>
                  <span className="font-medium text-navy">{cat.name}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleCategoriesSubmit}
            disabled={selectedCategories.length !== config.numCategories}
            className={`w-full py-3 rounded-xl font-semibold transition-colors ${
              selectedCategories.length === config.numCategories
                ? 'bg-navy text-white hover:bg-navy-light'
                : 'bg-cream-dark text-navy-light cursor-not-allowed'
            }`}
          >
            Continue to Stock Selection
          </button>
        </div>
      </div>
    );
  }

  // Stocks Step
  if (step === 'stocks') {
    const categoryId = selectedCategories[currentCategoryIndex];
    const category = CATEGORIES.find(c => c.id === categoryId);
    const currentSelections = selectedStocks[categoryId] || [];

    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-navy-light text-sm">Category {currentCategoryIndex + 1} of {selectedCategories.length}</p>
              <h3 className="font-display text-2xl font-bold text-navy">
                {category?.icon} {SECTOR_NAMES[categoryId] || category?.name}
              </h3>
              <p className="text-navy-light">
                Select {config.stocksPerCategory} stocks • Data from {config.useCustomDates ? config.customStartDate : `January ${config.year}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-teal">{currentSelections.length}/{config.stocksPerCategory}</div>
              <div className="text-sm text-navy-light">selected</div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="mb-6 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search by ticker or company name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-3 pl-10 rounded-lg border-2 border-cream-dark bg-white text-navy focus:border-teal focus:outline-none"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-light">🔍</span>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                  showFilters || Object.values(filters).some(v => v !== '')
                    ? 'border-teal bg-teal/10 text-teal'
                    : 'border-cream-dark text-navy hover:border-teal/50'
                }`}
              >
                ⚙️ Filters
              </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="p-4 bg-cream rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-navy">Filter Stocks</span>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-teal hover:underline"
                  >
                    Clear all
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* P/E Ratio */}
                  <div>
                    <label className="block text-sm text-navy-light mb-1">P/E Ratio</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.peMin}
                        onChange={(e) => setFilters({ ...filters, peMin: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.peMax}
                        onChange={(e) => setFilters({ ...filters, peMax: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  {/* Beta */}
                  <div>
                    <label className="block text-sm text-navy-light mb-1">Beta (Volatility)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Min"
                        value={filters.betaMin}
                        onChange={(e) => setFilters({ ...filters, betaMin: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Max"
                        value={filters.betaMax}
                        onChange={(e) => setFilters({ ...filters, betaMax: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  {/* Dividend Yield */}
                  <div>
                    <label className="block text-sm text-navy-light mb-1">Dividend Yield %</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Min"
                        value={filters.dividendMin}
                        onChange={(e) => setFilters({ ...filters, dividendMin: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Max"
                        value={filters.dividendMax}
                        onChange={(e) => setFilters({ ...filters, dividendMax: e.target.value })}
                        className="w-full p-2 rounded border border-cream-dark text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-navy-light">
                  💡 Tip: Low P/E may indicate value stocks, high beta means more volatility, dividend yield shows income potential.
                </p>
              </div>
            )}
          </div>

          {/* Stock Count */}
          <div className="mb-4 text-sm text-navy-light">
            Showing {filteredStocks.length} of {getAvailableStocks().length} stocks
            {(searchQuery || Object.values(filters).some(v => v !== '')) && (
              <button onClick={clearFilters} className="ml-2 text-teal hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {/* Stock List */}
          <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
            {filteredStocks.length === 0 ? (
              <div className="text-center py-8 text-navy-light">
                No stocks match your criteria. Try adjusting your filters.
              </div>
            ) : (
              filteredStocks.map(stock => {
                const isSelected = currentSelections.find(s => s.ticker === stock.ticker);
                const isDisabled = !isSelected && currentSelections.length >= config.stocksPerCategory;
                
                return (
                  <button
                    key={stock.ticker}
                    onClick={() => handleStockSelect(stock)}
                    disabled={isDisabled}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-teal bg-teal/10' 
                        : isDisabled
                          ? 'border-cream-dark opacity-50 cursor-not-allowed'
                          : 'border-cream-dark hover:border-teal/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-bold text-navy text-lg">{stock.ticker}</span>
                        <span className="text-navy-light ml-2 text-sm truncate">{stock.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs md:text-sm">
                        {statsLoading && !liveStats[stock.ticker] ? (
                          <span className="text-navy-light animate-pulse">Loading stats...</span>
                        ) : (() => {
                          const live = liveStats[stock.ticker];
                          const na = <span className="font-semibold text-navy-light">N/A</span>;
                          return (<>
                            <div className="bg-cream px-2 py-1 rounded">
                              <span className="text-navy-light">P/E: </span>
                              {live?.pe != null ? <span className="font-semibold text-navy">{live.pe}</span> : na}
                            </div>
                            <div className="bg-cream px-2 py-1 rounded">
                              <span className="text-navy-light">EPS: </span>
                              {live?.eps != null ? <span className="font-semibold text-navy">${live.eps}</span> : na}
                            </div>
                            <div className="bg-cream px-2 py-1 rounded">
                              <span className="text-navy-light">Beta: </span>
                              {live?.beta != null ? <span className="font-semibold text-navy">{live.beta}</span> : na}
                            </div>
                            <div className="bg-cream px-2 py-1 rounded">
                              <span className="text-navy-light">Div: </span>
                              {live?.dividendYield != null ? <span className="font-semibold text-navy">{live.dividendYield}%</span> : na}
                            </div>
                            <div className="bg-cream px-2 py-1 rounded hidden md:block">
                              <span className="text-navy-light">Cap: </span>
                              {live?.marketCap ? <span className="font-semibold text-navy">{live.marketCap}</span> : na}
                            </div>
                          </>);
                        })()}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={handleStocksSubmit}
            disabled={currentSelections.length !== config.stocksPerCategory}
            className={`w-full py-3 rounded-xl font-semibold transition-colors ${
              currentSelections.length === config.stocksPerCategory
                ? 'bg-navy text-white hover:bg-navy-light'
                : 'bg-cream-dark text-navy-light cursor-not-allowed'
            }`}
          >
            {currentCategoryIndex < selectedCategories.length - 1
              ? 'Next Category'
              : config.useCustomWeights ? 'Set Allocation' : 'See Results'}
          </button>
        </div>
      </div>
    );
  }

  // Weights Step (only reached when config.useCustomWeights is true)
  if (step === 'weights') {
    const allStocks = Object.values(selectedStocks).flat();
    const totalPct = Object.values(stockWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const isCloseTo100 = Math.abs(totalPct - 100) < 0.5;

    const updateWeight = (ticker, value) => {
      setStockWeights(prev => ({ ...prev, [ticker]: value }));
    };

    const distributeEqually = () => {
      const equalShare = +(100 / allStocks.length).toFixed(2);
      const initial = {};
      allStocks.forEach(s => { initial[s.ticker] = equalShare; });
      setStockWeights(initial);
    };

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h3 className="font-display text-2xl font-bold text-navy mb-2">Set Your Allocation</h3>
          <p className="text-navy-light mb-6">
            Assign a percentage of your cash to each pick. Doesn't need to be exact — we'll normalize to 100%.
          </p>

          <div className="space-y-3 mb-6">
            {allStocks.map(stock => (
              <div key={stock.ticker} className="flex items-center gap-4">
                <span className="font-semibold text-navy w-20">{stock.ticker}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={stockWeights[stock.ticker] || 0}
                  onChange={(e) => updateWeight(stock.ticker, parseFloat(e.target.value))}
                  className="flex-1 accent-teal"
                />
                <div className="relative w-20">
                  <input
                    type="number"
                    value={stockWeights[stock.ticker] || 0}
                    onChange={(e) => updateWeight(stock.ticker, e.target.value)}
                    className="w-full p-2 pr-6 rounded-lg border-2 border-cream-dark text-navy text-sm text-right focus:border-teal focus:outline-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-light text-xs">%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-6">
            <button onClick={distributeEqually} className="text-teal hover:text-teal-light text-sm font-medium">
              Reset to equal split
            </button>
            <p className={`text-sm font-semibold ${isCloseTo100 ? 'text-sage' : 'text-coral'}`}>
              Total: {totalPct.toFixed(1)}%
            </p>
          </div>

          <button
            onClick={handleWeightsSubmit}
            disabled={totalPct <= 0}
            className={`w-full py-3 rounded-xl font-semibold transition-colors ${
              totalPct > 0 ? 'bg-navy text-white hover:bg-navy-light' : 'bg-cream-dark text-navy-light cursor-not-allowed'
            }`}
          >
            See Results
          </button>
        </div>
      </div>
    );
  }

  // Results Step
  if (step === 'results') {
    if (simulationLoading) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-12 shadow-lg text-center">
            <div className="text-4xl mb-4 animate-bounce">📊</div>
            <p className="text-navy font-semibold text-lg">Crunching the numbers...</p>
            <p className="text-navy-light mt-2">Fetching real historical data for your portfolio</p>
          </div>
        </div>
      );
    }

    if (simulationError || !simulationResult) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-12 shadow-lg text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-navy font-semibold text-lg">Failed to load simulation</p>
            <p className="text-navy-light mt-2">{simulationError || 'Unknown error'}</p>
            <button
              onClick={handleReset}
              className="mt-6 bg-navy text-white px-6 py-2 rounded-xl font-semibold hover:bg-navy-light transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    const results = getResults();
    if (!results) return null;
    const isProfit = results.totalGain >= 0;

    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Main Result */}
        <div className={`rounded-2xl p-8 text-center ${isProfit ? 'bg-sage/20' : 'bg-coral/20'}`}>
          <p className="text-navy-light mb-2">
            {results.strategy === 'dca' 
              ? `Your $${config.dcaMonthly}/month since ${config.useCustomDates ? simulationResult.start_date : config.year} ($${results.totalInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })} total) would now be worth`
              : `Your $${results.totalInvested.toLocaleString()} invested ${config.useCustomDates ? `on ${simulationResult.start_date}` : `in ${config.year}`} would now be worth`
            }
          </p>
          <p className="font-display text-5xl md:text-6xl font-bold text-navy mb-2">
            ${results.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className={`text-xl font-semibold ${isProfit ? 'text-sage' : 'text-coral'}`}>
            {isProfit ? '+' : ''}{results.totalGainPercent.toFixed(1)}% ({isProfit ? '+' : ''}${results.totalGain.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </p>
          {results.rebalanceCount > 0 && (
            <p className="text-navy-light text-sm mt-2">
              Rebalanced back to equal weight {results.rebalanceCount} time{results.rebalanceCount !== 1 ? 's' : ''} along the way.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button
              onClick={handleShareResults}
              className="inline-flex items-center gap-2 px-5 py-2 bg-white text-navy rounded-lg font-semibold text-sm hover:bg-cream-dark transition-colors shadow"
            >
              {shareStatus === 'copied' ? '✓ Copied to clipboard' : shareStatus === 'shared' ? '✓ Shared' : '📤 Share These Results'}
            </button>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-5 py-2 bg-white text-navy rounded-lg font-semibold text-sm hover:bg-cream-dark transition-colors shadow"
            >
              📥 Download CSV
            </button>
          </div>
        </div>

        {/* Panic Sell Comparison */}
        {results.panicSell && (
          <div className="rounded-2xl p-8 bg-coral/10 border-2 border-coral">
            <h4 className="font-display text-xl font-bold text-navy mb-1">😱 What If You'd Panic-Sold?</h4>
            <p className="text-navy-light text-sm mb-6">
              If you'd sold everything on {results.panicSell.actual_sale_date} and sat in cash instead of holding...
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">You held on</p>
                <p className="font-display text-3xl font-bold text-sage">
                  ${results.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">You panic-sold</p>
                <p className="font-display text-3xl font-bold text-coral">
                  ${results.panicSell.final_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
            <p className="text-navy font-semibold mt-4 text-center">
              Panic-selling would have cost you{' '}
              ${Math.max(results.totalValue - results.panicSell.final_value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {results.totalValue < results.panicSell.final_value && ' (in this case, selling actually would have done better — markets don\'t always recover on schedule)'}
            </p>
            <div className="text-center mt-6">
              <button
                onClick={handleCrashWalkthrough}
                disabled={crashLoading}
                className={`px-6 py-2 rounded-xl font-semibold transition-colors ${
                  crashLoading
                    ? 'bg-cream-dark text-navy-light cursor-not-allowed'
                    : 'bg-coral text-white hover:bg-coral/90'
                }`}
              >
                {crashLoading ? 'Walking through it...' : '🕰️ Walk Me Through The Crash'}
              </button>
            </div>
          </div>
        )}

        {/* Portfolio Growth Chart */}
        <PortfolioChart
          startYear={config.year}
          endYear={new Date().getFullYear()}
          startValue={results.strategy === 'dca' ? 0 : results.totalInvested}
          endValue={results.totalValue}
          comparisons={results.comparisons}
          valueHistory={simulationResult.value_history}
          benchmarkHistory={simulationResult.benchmark?.value_history}
          panicHistory={results.panicSell?.value_history}
          feeFreeHistory={simulationResult.fee_comparison?.value_history_without_fee}
        />

        {/* Stock Breakdown */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h4 className="font-display text-xl font-bold text-navy mb-4">Your Portfolio Breakdown</h4>
          <div className="space-y-3">
            {results.stockResults.map((stock, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between p-3 bg-cream rounded-lg gap-2">
                <div>
                  <span className="font-bold text-navy">{stock.ticker}</span>
                  <span className="text-navy-light text-sm ml-2">({stock.shares.toFixed(2)} shares)</span>
                  {simulationResult.weights?.[stock.ticker] != null && (
                    <span className="text-navy-light text-xs ml-2 bg-cream-dark px-2 py-0.5 rounded-full">
                      {simulationResult.weights[stock.ticker]}% allocated
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-semibold text-navy">${stock.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className={`ml-2 text-sm ${stock.gain >= 0 ? 'text-sage' : 'text-coral'}`}>
                    {stock.gain >= 0 ? '+' : ''}{stock.gainPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparisons */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h4 className="font-display text-xl font-bold text-navy mb-4">What If You Had...</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-cream rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🛏️</span>
                <span className="text-navy">Kept it under the mattress</span>
              </div>
              <span className="font-semibold text-navy">${results.comparisons.mattress.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-cream rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏦</span>
                <span className="text-navy">Savings account ({(SIMULATION_CONFIG.bankInterestRate * 100).toFixed(1)}% APY)</span>
              </div>
              <span className="font-semibold text-navy">${results.comparisons.bank.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-cream rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📈</span>
                <span className="text-navy">Invested in the S&P 500</span>
              </div>
              <span className="font-semibold text-navy">${results.comparisons.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>

            <div className={`flex items-center justify-between p-4 rounded-lg ${isProfit ? 'bg-teal/10 border-2 border-teal' : 'bg-coral/10 border-2 border-coral'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">💼</span>
                <span className="text-navy font-semibold">Your portfolio</span>
              </div>
              <span className="font-bold text-navy">${results.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        {/* Fun Comparisons */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h4 className="font-display text-xl font-bold text-navy mb-4">What Your {isProfit ? 'Gains' : 'Portfolio'} Could Buy</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {FUN_PURCHASES.map((item, i) => {
              const amount = isProfit ? results.totalGain : results.totalValue;
              const quantity = Math.floor(amount / item.unitPrice);
              if (quantity <= 0) return null;

              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-cream rounded-lg">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-navy">
                    <strong>{quantity.toLocaleString()}</strong> {item.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diversification Check: Correlation Matrix */}
        {simulationResult.correlation_matrix && (
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <h4 className="font-display text-xl font-bold text-navy mb-1">🧩 Diversification Check</h4>
            <p className="text-navy-light text-sm mb-6">
              How much your picks actually move together, based on real daily price data. Closer to +1 means they rise and fall together — less true diversification than it might look.
            </p>
            <div className="overflow-x-auto">
              <table className="border-collapse mx-auto">
                <thead>
                  <tr>
                    <th className="p-2"></th>
                    {simulationResult.correlation_matrix.tickers.map(t => (
                      <th key={t} className="p-2 text-sm font-semibold text-navy">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.correlation_matrix.matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="p-2 text-sm font-semibold text-navy text-right pr-3">
                        {simulationResult.correlation_matrix.tickers[i]}
                      </td>
                      {row.map((value, j) => {
                        const intensity = Math.abs(value);
                        const isDiagonal = i === j;
                        const bg = isDiagonal
                          ? '#3D8B8B'
                          : value >= 0
                            ? `rgba(217, 83, 79, ${0.15 + intensity * 0.6})`
                            : `rgba(61, 139, 139, ${0.15 + intensity * 0.6})`;
                        return (
                          <td
                            key={j}
                            className={`p-2 text-sm text-center rounded ${isDiagonal ? 'text-white font-semibold' : 'text-navy'}`}
                            style={{ backgroundColor: bg }}
                          >
                            {value.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-navy-light text-xs mt-4 text-center">
              Red = tend to move together (less diversified) · Blue = move independently or opposite (more diversified)
            </p>
          </div>
        )}

        {/* Withdrawal Simulation Outcome */}
        {simulationResult.withdrawal_start_date && simulationResult.withdrawal_amount > 0 && (
          <div className={`rounded-2xl p-8 ${simulationResult.depletion_date ? 'bg-coral/20 border-2 border-coral' : 'bg-sage/20 border-2 border-sage'}`}>
            <h4 className="font-display text-xl font-bold text-navy mb-1">
              {simulationResult.depletion_date ? '⚠️ Money Ran Out' : '✅ Withdrawals Held Up'}
            </h4>
            <p className="text-navy-light text-sm mb-6">
              Withdrawing ${simulationResult.withdrawal_amount.toLocaleString()}/month starting {simulationResult.withdrawal_start_date}, using real prices for that period.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">Total withdrawn</p>
                <p className="font-display text-2xl font-bold text-navy">
                  ${simulationResult.total_withdrawn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">
                  {simulationResult.depletion_date ? 'Ran out on' : 'Remaining balance'}
                </p>
                <p className={`font-display text-2xl font-bold ${simulationResult.depletion_date ? 'text-coral' : 'text-sage'}`}>
                  {simulationResult.depletion_date
                    ? simulationResult.depletion_date
                    : `$${simulationResult.final_cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            </div>
            {simulationResult.depletion_date && (
              <p className="text-navy text-sm mt-4 text-center">
                This is real sequence-of-returns risk — the actual order and timing of market moves during withdrawal matters, not just the average return. The same average return with different timing could have lasted much longer.
              </p>
            )}
          </div>
        )}

        {/* Capital Gains Tax Estimate */}
        {simulationResult.tax_estimate && (
          <div className="rounded-2xl p-8 bg-navy/5 border-2 border-navy/20">
            <h4 className="font-display text-xl font-bold text-navy mb-1">🏛️ Capital Gains Tax Estimate</h4>
            <p className="text-navy-light text-sm mb-6">
              Simplified estimate at a flat {simulationResult.tax_estimate.tax_rate_pct}% {simulationResult.tax_estimate.treatment === 'long_term' ? 'long-term capital gains' : 'short-term (ordinary income)'} rate on the gain — not real per-lot tax accounting, and not tax advice.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-xl text-center">
                <p className="text-navy-light text-sm mb-1">Gain Taxed</p>
                <p className="font-display text-xl font-bold text-navy">
                  ${simulationResult.tax_estimate.gain_taxed.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-white rounded-xl text-center">
                <p className="text-navy-light text-sm mb-1">Estimated Tax Owed</p>
                <p className="font-display text-xl font-bold text-coral">
                  ${simulationResult.tax_estimate.tax_owed.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-white rounded-xl text-center">
                <p className="text-navy-light text-sm mb-1">After-Tax Value</p>
                <p className="font-display text-xl font-bold text-sage">
                  ${simulationResult.tax_estimate.after_tax_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Fee Drag Comparison */}
        {simulationResult.fee_comparison && (
          <div className="rounded-2xl p-8 bg-amber/10 border-2 border-amber">
            <h4 className="font-display text-xl font-bold text-navy mb-1">💸 What Fees Actually Cost You</h4>
            <p className="text-navy-light text-sm mb-6">
              Same simulation, run twice — once with your {simulationResult.fee_comparison.annual_fee_pct}% annual fee, once at 0%.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">Without fees</p>
                <p className="font-display text-3xl font-bold text-sage">
                  ${simulationResult.fee_comparison.final_value_without_fee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-white rounded-xl">
                <p className="text-navy-light text-sm mb-1">With {simulationResult.fee_comparison.annual_fee_pct}% annual fee</p>
                <p className="font-display text-3xl font-bold text-amber">
                  ${simulationResult.fee_comparison.final_value_with_fee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
            <p className="text-navy font-semibold mt-4 text-center">
              That {simulationResult.fee_comparison.annual_fee_pct}% fee cost you ${simulationResult.fee_comparison.cost_of_fees.toLocaleString(undefined, { maximumFractionDigits: 0 })} over this period —
              a small-looking annual number that compounds into something much bigger over time.
            </p>
          </div>
        )}

        {/* Risk & Performance Metrics */}
        {simulationResult.risk_metrics && (
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <h4 className="font-display text-xl font-bold text-navy mb-1">📊 Risk & Performance Metrics</h4>
            <p className="text-navy-light text-sm mb-6">
              Computed from real monthly portfolio values — the same math real financial tools use.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Annualized Return', value: `${simulationResult.risk_metrics.annualized_return_pct >= 0 ? '+' : ''}${simulationResult.risk_metrics.annualized_return_pct}%`, bench: simulationResult.benchmark?.risk_metrics?.annualized_return_pct },
                { label: 'Volatility', value: `${simulationResult.risk_metrics.annualized_volatility_pct}%`, bench: simulationResult.benchmark?.risk_metrics?.annualized_volatility_pct },
                { label: 'Sharpe Ratio', value: simulationResult.risk_metrics.sharpe_ratio ?? 'N/A', bench: simulationResult.benchmark?.risk_metrics?.sharpe_ratio },
                { label: 'Max Drawdown', value: `${simulationResult.risk_metrics.max_drawdown_pct}%`, bench: simulationResult.benchmark?.risk_metrics?.max_drawdown_pct },
              ].map((metric, i) => (
                <div key={i} className="p-4 bg-cream rounded-lg text-center">
                  <p className="text-navy-light text-xs mb-1">{metric.label}</p>
                  <p className="font-display text-xl font-bold text-navy">{metric.value}</p>
                  {metric.bench != null && (
                    <p className="text-navy-light text-xs mt-1">S&P 500: {metric.bench}{metric.label === 'Sharpe Ratio' ? '' : '%'}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-navy-light text-xs mt-4">
              Sharpe ratio measures return per unit of risk (higher is better). Max drawdown is the largest peak-to-trough drop your portfolio experienced.
            </p>
          </div>
        )}

        {/* Save & Compare Scenarios */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h4 className="font-display text-xl font-bold text-navy mb-1">⚖️ Save & Compare Scenarios</h4>
          <p className="text-navy-light text-sm mb-2">
            Save this run, then try different picks or a different period, and compare them side by side.
          </p>
          <p className="text-navy-light text-xs mb-6">
            {dbUserId ? '✓ Synced to your account — available on any device' : 'Saved to this browser only — sign in to sync across devices'}
          </p>

          {savedScenarios.length < MAX_SCENARIOS ? (
            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <input
                type="text"
                value={scenarioLabel}
                onChange={(e) => setScenarioLabel(e.target.value)}
                placeholder={defaultScenarioLabel()}
                className="flex-1 p-3 rounded-lg border-2 border-cream-dark bg-white text-navy focus:border-teal focus:outline-none"
              />
              <button
                onClick={handleSaveScenario}
                className="px-6 py-3 bg-teal text-white rounded-xl font-semibold hover:bg-teal-light transition-colors whitespace-nowrap"
              >
                💾 Save This Scenario
              </button>
            </div>
          ) : (
            <p className="text-navy-light text-sm mb-6">
              You've saved the max of {MAX_SCENARIOS} scenarios. Remove one below to save another.
            </p>
          )}

          {savedScenarios.length > 0 && (
            <>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-dark">
                      <th className="text-left p-2 text-navy-light font-medium">Scenario</th>
                      <th className="text-right p-2 text-navy-light font-medium">Invested</th>
                      <th className="text-right p-2 text-navy-light font-medium">Final Value</th>
                      <th className="text-right p-2 text-navy-light font-medium">ROI</th>
                      <th className="text-right p-2 text-navy-light font-medium">Sharpe</th>
                      <th className="text-right p-2 text-navy-light font-medium">Max Drawdown</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedScenarios.map((s, i) => (
                      <tr key={s.id} className="border-b border-cream-dark/50">
                        <td className="p-2 text-navy font-medium">
                          <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }}></span>
                          {s.label}
                        </td>
                        <td className="p-2 text-right text-navy">${s.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="p-2 text-right text-navy font-semibold">${s.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className={`p-2 text-right font-semibold ${s.roiPercent >= 0 ? 'text-sage' : 'text-coral'}`}>
                          {s.roiPercent >= 0 ? '+' : ''}{s.roiPercent?.toFixed(1)}%
                        </td>
                        <td className="p-2 text-right text-navy">{s.sharpe != null ? s.sharpe.toFixed(2) : 'N/A'}</td>
                        <td className="p-2 text-right text-navy">{s.maxDrawdown != null ? `${s.maxDrawdown.toFixed(1)}%` : 'N/A'}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => handleRemoveScenario(s.id)}
                            className="text-navy-light hover:text-coral text-lg leading-none"
                            title="Remove"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {savedScenarios.length >= 2 && (
                <ScenarioComparisonChart
                  scenarios={savedScenarios.map((s, i) => ({
                    label: s.label,
                    color: SCENARIO_COLORS[i % SCENARIO_COLORS.length],
                    points: s.points,
                  }))}
                />
              )}

              <div className="text-center mt-4">
                <button
                  onClick={handleClearScenarios}
                  className="text-navy-light hover:text-coral text-sm font-medium"
                >
                  Clear all saved scenarios
                </button>
              </div>
            </>
          )}
        </div>

        {/* AI Analysis Button */}
        <div className="text-center">
          <button
            onClick={handleAiAnalysis}
            disabled={aiLoading}
            className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
              aiLoading
                ? 'bg-cream-dark text-navy-light cursor-not-allowed'
                : 'bg-teal text-white hover:bg-teal-light'
            }`}
          >
            {aiLoading ? 'Analyzing...' : '✨ Get AI Analysis'}
          </button>
          <p className="text-navy-light text-sm mt-2">Powered by Gemini — see pros, cons & lessons from your picks</p>
        </div>

        {/* Try Again */}
        <div className="text-center">
          <button
            onClick={handleReset}
            className="bg-navy text-white px-8 py-3 rounded-xl font-semibold hover:bg-navy-light transition-colors"
          >
            Try Different Picks
          </button>
        </div>

        {/* AI Analysis Modal */}
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-navy/50"
              onClick={() => setShowAiModal(false)}
            />
            {/* Modal */}
            <div className="relative bg-cream rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8">
              <button
                onClick={() => setShowAiModal(false)}
                className="absolute top-4 right-4 text-navy-light hover:text-navy text-2xl leading-none"
              >
                ×
              </button>
              <h3 className="font-display text-2xl font-bold text-navy mb-1">✨ AI Portfolio Analysis</h3>
              <p className="text-navy-light text-sm mb-6">Powered by Gemini</p>

              {aiLoading && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3 animate-bounce">🤖</div>
                  <p className="text-navy font-semibold">Analyzing your portfolio...</p>
                  <p className="text-navy-light text-sm mt-1">Gemini is crunching your results</p>
                </div>
              )}

              {aiError && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">⚠️</div>
                  <p className="text-navy font-semibold">Analysis failed</p>
                  <p className="text-navy-light text-sm mt-1">{aiError}</p>
                  <button
                    onClick={handleAiAnalysis}
                    className="mt-4 bg-teal text-white px-6 py-2 rounded-xl font-semibold hover:bg-teal-light transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {aiAnalysis && (
                <div className="text-navy whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                  {aiAnalysis}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Crash Walkthrough Modal */}
        {showCrashModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-navy/50"
              onClick={() => setShowCrashModal(false)}
            />
            <div className="relative bg-cream rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8">
              <button
                onClick={() => setShowCrashModal(false)}
                className="absolute top-4 right-4 text-navy-light hover:text-navy text-2xl leading-none"
              >
                ×
              </button>
              <h3 className="font-display text-2xl font-bold text-navy mb-1">🕰️ Crash Walkthrough</h3>
              <p className="text-navy-light text-sm mb-6">Powered by Gemini, grounded in your real simulated data</p>

              {crashLoading && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3 animate-bounce">📉</div>
                  <p className="text-navy font-semibold">Walking through the numbers...</p>
                  <p className="text-navy-light text-sm mt-1">Gemini is reviewing your real portfolio history</p>
                </div>
              )}

              {crashError && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">⚠️</div>
                  <p className="text-navy font-semibold">Walkthrough failed</p>
                  <p className="text-navy-light text-sm mt-1">{crashError}</p>
                  <button
                    onClick={handleCrashWalkthrough}
                    className="mt-4 bg-coral text-white px-6 py-2 rounded-xl font-semibold hover:bg-coral/90 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {crashAnalysis && (
                <div className="text-navy whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                  {crashAnalysis}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default StockSimulation;