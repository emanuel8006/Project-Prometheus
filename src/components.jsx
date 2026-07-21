import { useState, useEffect, useRef } from 'react';
import { SoundEffects } from './utils';
import { API_BASE_URL } from './config';

const CHAT_MAX_MESSAGES = 5;

const TopicChat = ({ topicContext }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || messagesUsed >= CHAT_MAX_MESSAGES) return;

    const newMessages = [...messages, { role: 'user', text }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const historyText = newMessages
      .map(m => `${m.role === 'user' ? 'Student' : 'Educator'}: ${m.text}`)
      .join('\n\n');

    const prompt = `You are a friendly financial educator helping a beginner learn about investing. Stay focused on the topic below and keep each answer under 120 words.

TOPIC CONTEXT:
${topicContext}

CONVERSATION:
${historyText}

Educator:`;

    try {
      const res = await fetch(`${API_BASE_URL}/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: 'assistant', text: data.output }]);
      setMessagesUsed(prev => prev + 1);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const remaining = CHAT_MAX_MESSAGES - messagesUsed;

  return (
    <div className="mt-6 border-2 border-teal/20 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-teal/5 border-b border-teal/20">
        <span className="font-semibold text-navy text-sm">🤖 Ask Gemini</span>
        <span className="text-xs text-navy-light">{remaining} message{remaining !== 1 ? 's' : ''} left this session</span>
      </div>
      <div ref={scrollContainerRef} className="h-52 overflow-y-auto p-4 space-y-3 bg-white">
        {messages.length === 0 && (
          <p className="text-navy-light text-sm text-center pt-8">Ask anything about this topic!</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
              msg.role === 'user'
                ? 'bg-teal text-white rounded-br-sm'
                : 'bg-cream text-navy rounded-bl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-cream text-navy-light px-3 py-2 rounded-xl rounded-bl-sm text-sm animate-pulse">
              Thinking...
            </div>
          </div>
        )}
      </div>
      <div className="p-3 bg-cream-dark border-t border-teal/20">
        {messagesUsed >= CHAT_MAX_MESSAGES ? (
          <p className="text-navy-light text-xs text-center py-1">
            Session limit reached ({CHAT_MAX_MESSAGES} messages). Close and reopen to start fresh.
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about this topic..."
              disabled={isLoading}
              className="flex-1 px-3 py-2 rounded-lg text-sm border border-cream-dark bg-white text-navy focus:border-teal focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const FadeInSection = ({ children, className = "", delay = 0 }) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`fade-in ${isVisible ? 'visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
};

export const Quiz = ({ quiz, onComplete, soundEnabled = true, answered = false, wasCorrect = false, savedSelectedIndex = null, learnMoreUrl = null, topicContext = null }) => {
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Reset local state when answered prop changes (e.g., when reset is pressed)
  useEffect(() => {
    if (answered) {
      setSelected(savedSelectedIndex !== null && savedSelectedIndex !== undefined ? savedSelectedIndex : (wasCorrect ? quiz.correct : null));
      setShowResult(true);
    } else {
      setSelected(null);
      setShowResult(false);
    }
  }, [answered, wasCorrect, savedSelectedIndex, quiz.correct]);

  const handleSelect = (index) => {
    if (showResult) return;
    setSelected(index);
    setShowResult(true);
    const isCorrect = index === quiz.correct;
    
    if (soundEnabled) {
      isCorrect ? SoundEffects.correct() : SoundEffects.incorrect();
    }
    
    setTimeout(() => onComplete && onComplete(isCorrect, index), 500);
  };

  return (
    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-cream-dark">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="font-display text-lg font-semibold text-navy">
          {answered ? '✓ Completed' : '❓ Check Your Understanding'}
        </span>
        <div className="flex items-center gap-3">
          {topicContext && (
            <button
              onClick={() => setChatOpen(o => !o)}
              className={`text-sm font-medium flex items-center gap-1 transition-colors ${chatOpen ? 'text-teal' : 'text-navy-light hover:text-teal'}`}
            >
              🤖 Ask Gemini
            </button>
          )}
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal hover:text-teal-light text-sm font-medium flex items-center gap-1 transition-colors"
            >
              📚 Learn More
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
      <p className="text-navy mb-6 font-medium" id={`quiz-question-${quiz.question.slice(0, 20).replace(/\s/g, '-')}`}>{quiz.question}</p>
      <div className="space-y-3" role="radiogroup" aria-label={quiz.question}>
        {quiz.options.map((option, index) => {
          let optionClass = "quiz-option border-2 border-cream-dark p-4 rounded-xl w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal";
          if (!answered) optionClass += " cursor-pointer";
          
          if (showResult) {
            if (index === quiz.correct) {
              optionClass += " bg-sage/20 border-sage";
            } else if (index === selected && index !== quiz.correct) {
              optionClass += " bg-coral/20 border-coral";
            }
          }

          const isCorrectAnswer = showResult && index === quiz.correct;
          const isWrongSelection = showResult && index === selected && index !== quiz.correct;
          const optionLabel = `${String.fromCharCode(65 + index)}. ${option}${isCorrectAnswer ? ' (correct answer)' : isWrongSelection ? ' (your answer, incorrect)' : ''}`;

          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={selected === index}
              aria-label={optionLabel}
              className={optionClass}
              onClick={() => !answered && handleSelect(index)}
              disabled={answered && showResult}
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  showResult && index === quiz.correct ? 'bg-sage text-white' :
                  showResult && index === selected && index !== quiz.correct ? 'bg-coral text-white' :
                  'bg-cream-dark text-navy'
                }`} aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-navy">{option}</span>
              </div>
            </button>
          );
        })}
      </div>
      {showResult && (
        <div
          className={`mt-6 p-4 rounded-xl ${quiz.correct === selected || (answered && wasCorrect) ? 'bg-sage/20' : 'bg-amber/20'}`}
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold text-navy mb-1">
            {(answered && wasCorrect) || quiz.correct === selected ? '✓ Correct!' : '✗ Not quite'}
          </p>
          <p className="text-navy-light text-sm">{quiz.explanation}</p>
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-teal hover:text-teal-light text-sm font-medium"
            >
              → Want to dive deeper? Read more about this topic
            </a>
          )}
        </div>
      )}
      {topicContext && chatOpen && <TopicChat topicContext={topicContext} />}
    </div>
  );
};

/**
 * PortfolioChart
 *
 * If `valueHistory` (array of { date, value } from the /simulate lambda) is
 * provided, the "Your Portfolio" line plots those real, month-by-month
 * combined values -- actual shares held x actual close prices, no
 * randomness. If it's not provided (older cached results, or a failure to
 * fetch it), the component falls back to a deterministic straight-line
 * interpolation between startValue and endValue (no more Math.random()
 * noise -- what you see is either real or an honest straight line, never a
 * fabricated "realistic-looking" wiggle).
 *
 * The S&P 500 and savings-account comparison lines are always deterministic
 * curves built from the final comparison totals, since we don't have a
 * real month-by-month index/APY series wired up (a good next extension
 * would be simulating those the same way, using SPY history).
 */
export const PortfolioChart = ({ startYear, endYear, startValue, endValue, comparisons, valueHistory, benchmarkHistory, panicHistory, feeFreeHistory, realValueHistory }) => {
  const chartRef = useRef(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.3 }
    );

    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const hasRealHistory = Array.isArray(valueHistory) && valueHistory.length > 1;
  const hasRealBenchmark = Array.isArray(benchmarkHistory) && benchmarkHistory.length > 1;

  const years = endYear - startYear;
  const fallbackPoints = Math.min(years + 1, 12);
  const points = hasRealHistory ? valueHistory.length : fallbackPoints;

  // Deterministic straight-line interpolation -- used as a fallback only,
  // when real history isn't available for a line.
  const generatePath = (start, end, numPoints) => {
    const data = [];
    for (let i = 0; i < numPoints; i++) {
      const progress = numPoints === 1 ? 1 : i / (numPoints - 1);
      data.push(start + (end - start) * progress);
    }
    data[data.length - 1] = end;
    return data;
  };

  const portfolioData = hasRealHistory
    ? valueHistory.map(v => v.value)
    : generatePath(startValue, endValue, points);

  // Real SPY-based benchmark history is resampled onto the same point count
  // as the portfolio line (both come from the same monthly snapshot cadence
  // on the backend, so lengths normally already match).
  const sp500Data = hasRealBenchmark && benchmarkHistory.length === points
    ? benchmarkHistory.map(v => v.value)
    : generatePath(startValue, comparisons.sp500, points);

  const bankData = generatePath(startValue, comparisons.bank, points);

  const hasPanicHistory = Array.isArray(panicHistory) && panicHistory.length === points;
  const panicData = hasPanicHistory ? panicHistory.map(v => v.value) : null;

  const hasFeeFreeHistory = Array.isArray(feeFreeHistory) && feeFreeHistory.length === points;
  const feeFreeData = hasFeeFreeHistory ? feeFreeHistory.map(v => v.value) : null;

  const hasRealValueHistory = Array.isArray(realValueHistory) && realValueHistory.length === points;
  const realValueData = hasRealValueHistory ? realValueHistory.map(v => v.value) : null;

  // Derive axis year labels from real dates when we have them, otherwise
  // fall back to the passed startYear/endYear range.
  const displayStartYear = hasRealHistory ? new Date(valueHistory[0].date).getFullYear() : startYear;
  const displayEndYear = hasRealHistory
    ? new Date(valueHistory[valueHistory.length - 1].date).getFullYear()
    : endYear;
  const displayYears = Math.max(displayEndYear - displayStartYear, 1);

  const width = 500;
  const height = 200;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const allValues = [...portfolioData, ...sp500Data, ...bankData, ...(panicData || []), ...(feeFreeData || []), ...(realValueData || []), startValue];
  const maxValue = Math.max(...allValues) * 1.1;
  const minValue = Math.min(...allValues) * 0.9;

  const xScale = (i) => padding + (i / (points - 1)) * chartWidth;
  const yScale = (v) => padding + chartHeight - ((v - minValue) / (maxValue - minValue)) * chartHeight;
  const createPath = (data) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ');

  return (
    <div ref={chartRef} className="bg-white rounded-2xl p-6 shadow-lg">
      <h4 className="font-display text-xl font-bold text-navy mb-4">📈 Portfolio Growth Over Time</h4>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img" aria-labelledby="portfolio-chart-title portfolio-chart-desc">
        <title id="portfolio-chart-title">Portfolio growth over time</title>
        <desc id="portfolio-chart-desc">
          {hasRealHistory
            ? `Your portfolio went from $${portfolioData[0].toLocaleString(undefined, { maximumFractionDigits: 0 })} to $${portfolioData[portfolioData.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 })}${hasRealBenchmark ? `, compared to the S&P 500's result of $${sp500Data[sp500Data.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''}.`
            : 'Estimated portfolio growth chart.'}
        </desc>
        {[0, 0.5, 1].map((pct, i) => {
          const y = padding + pct * chartHeight;
          const value = maxValue - pct * (maxValue - minValue);
          return (
            <g key={i}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
              <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">${(value / 1000).toFixed(0)}k</text>
            </g>
          );
        })}

        {[0, 0.5, 1].map((pct, i) => {
          const x = padding + pct * chartWidth;
          const year = Math.round(displayStartYear + pct * displayYears);
          return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">{year}</text>;
        })}

        {animated && (
          <>
            <path d={createPath(bankData)} fill="none" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4" className="chart-line" style={{ animationDelay: '0s' }} />
            <path d={createPath(sp500Data)} fill="none" stroke="#E8A54B" strokeWidth="2.5" className="chart-line" style={{ animationDelay: '0.3s' }} />
            {hasPanicHistory && (
              <path d={createPath(panicData)} fill="none" stroke="#D9534F" strokeWidth="2" strokeDasharray="6 3" className="chart-line" style={{ animationDelay: '0.45s' }} />
            )}
            {hasFeeFreeHistory && (
              <path d={createPath(feeFreeData)} fill="none" stroke="#5B8C5A" strokeWidth="2" strokeDasharray="2 3" className="chart-line" style={{ animationDelay: '0.5s' }} />
            )}
            {hasRealValueHistory && (
              <path d={createPath(realValueData)} fill="none" stroke="#C08A2E" strokeWidth="2" strokeDasharray="1 4" className="chart-line" style={{ animationDelay: '0.55s' }} />
            )}
            <path d={createPath(portfolioData)} fill="none" stroke="#3D8B8B" strokeWidth="3" className="chart-line" style={{ animationDelay: '0.6s' }} />
            <circle cx={xScale(points - 1)} cy={yScale(bankData[points - 1])} r="4" fill="#9CA3AF" className="chart-dot" style={{ animationDelay: '2s' }} />
            <circle cx={xScale(points - 1)} cy={yScale(sp500Data[points - 1])} r="5" fill="#E8A54B" className="chart-dot" style={{ animationDelay: '2.2s' }} />
            {hasPanicHistory && (
              <circle cx={xScale(points - 1)} cy={yScale(panicData[points - 1])} r="5" fill="#D9534F" className="chart-dot" style={{ animationDelay: '2.3s' }} />
            )}
            {hasFeeFreeHistory && (
              <circle cx={xScale(points - 1)} cy={yScale(feeFreeData[points - 1])} r="5" fill="#5B8C5A" className="chart-dot" style={{ animationDelay: '2.35s' }} />
            )}
            {hasRealValueHistory && (
              <circle cx={xScale(points - 1)} cy={yScale(realValueData[points - 1])} r="5" fill="#C08A2E" className="chart-dot" style={{ animationDelay: '2.37s' }} />
            )}
            <circle cx={xScale(points - 1)} cy={yScale(portfolioData[points - 1])} r="6" fill="#3D8B8B" className="chart-dot" style={{ animationDelay: '2.4s' }} />
          </>
        )}
      </svg>

      <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2"><div className="w-4 h-1 bg-teal rounded"></div><span className="text-navy">Your Portfolio {hasRealHistory ? '' : '(est.)'}</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-1 bg-amber rounded"></div><span className="text-navy">S&P 500 {hasRealBenchmark ? '' : '(est.)'}</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-gray-400 rounded"></div><span className="text-navy">Savings Account (est.)</span></div>
        {hasPanicHistory && (
          <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#D9534F] rounded"></div><span className="text-navy">If You Panic-Sold</span></div>
        )}
        {hasFeeFreeHistory && (
          <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#5B8C5A] rounded"></div><span className="text-navy">Without Fees</span></div>
        )}
        {hasRealValueHistory && (
          <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#C08A2E] rounded"></div><span className="text-navy">Real (Inflation-Adjusted)</span></div>
        )}
      </div>
    </div>
  );
};

/**
 * ScenarioComparisonChart
 *
 * Overlays multiple saved simulation runs on one chart, even when they cover
 * different date ranges, different tickers, or different starting amounts.
 * Since the underlying periods differ, the x-axis is normalized to "months
 * since each scenario's own start" rather than calendar dates -- this makes
 * shape and relative performance comparable side by side. Each scenario's
 * y-values are its own real value_history, not re-scaled or faked.
 *
 * scenarios: [{ label, color, points: [{ date, value }, ...] }]
 */
export const ScenarioComparisonChart = ({ scenarios }) => {
  const chartRef = useRef(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.3 }
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const validScenarios = (scenarios || []).filter(s => Array.isArray(s.points) && s.points.length > 1);
  if (validScenarios.length === 0) return null;

  const maxPoints = Math.max(...validScenarios.map(s => s.points.length));
  const allValues = validScenarios.flatMap(s => s.points.map(p => p.value));
  const maxValue = Math.max(...allValues) * 1.1;
  const minValue = Math.min(0, ...allValues) * (Math.min(...allValues) < 0 ? 1.1 : 0.9);

  const width = 500;
  const height = 220;
  const padding = 44;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const xScale = (i, len) => padding + (len <= 1 ? 0 : (i / (maxPoints - 1)) * chartWidth);
  const yScale = (v) => padding + chartHeight - ((v - minValue) / (maxValue - minValue || 1)) * chartHeight;
  const createPath = (points) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i, points.length)} ${yScale(p.value)}`).join(' ');

  return (
    <div ref={chartRef} className="bg-white rounded-2xl p-6 shadow-lg">
      <h4 className="font-display text-xl font-bold text-navy mb-1">⚖️ Scenario Comparison</h4>
      <p className="text-navy-light text-sm mb-4">
        Each line is real simulated data, aligned by months since that scenario's own start (not calendar date), since scenarios can cover different periods.
      </p>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img" aria-labelledby="scenario-chart-title scenario-chart-desc">
        <title id="scenario-chart-title">Comparison of saved simulation scenarios</title>
        <desc id="scenario-chart-desc">
          {validScenarios.map(s => `${s.label}: ended at $${s.points[s.points.length - 1].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`).join('. ')}
        </desc>
        {[0, 0.5, 1].map((pct, i) => {
          const y = padding + pct * chartHeight;
          const value = maxValue - pct * (maxValue - minValue);
          return (
            <g key={i}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1a2744" strokeOpacity="0.1" />
              <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#1a2744" opacity="0.5">${(value / 1000).toFixed(0)}k</text>
            </g>
          );
        })}

        {[0, 0.5, 1].map((pct, i) => {
          const x = padding + pct * chartWidth;
          const monthLabel = Math.round(pct * (maxPoints - 1));
          return <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#1a2744" opacity="0.5">mo {monthLabel}</text>;
        })}

        {animated && validScenarios.map((s, i) => (
          <g key={i}>
            <path
              d={createPath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              className="chart-line"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
            <circle
              cx={xScale(s.points.length - 1, s.points.length)}
              cy={yScale(s.points[s.points.length - 1].value)}
              r="5"
              fill={s.color}
              className="chart-dot"
              style={{ animationDelay: `${1.5 + i * 0.2}s` }}
            />
          </g>
        ))}
      </svg>

      <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
        {validScenarios.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-4 h-1 rounded" style={{ backgroundColor: s.color }}></div>
            <span className="text-navy">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};