import { Link } from 'react-router-dom';
import { FadeInSection } from '../components';

const TOOLS = [
  { path: '/simulation', label: 'Stock Simulator', emoji: '🎮' },
  { path: '/goal-planner', label: 'Goal Planner', emoji: '🎯' },
  { path: '/debt-payoff', label: 'Debt Payoff Calculator', emoji: '💳' },
  { path: '/monte-carlo', label: 'Monte Carlo Simulator', emoji: '🎲' },
  { path: '/options-payoff', label: 'Options Payoff Visualizer', emoji: '⚡' },
  { path: '/algo-backtester', label: 'Strategy Backtester', emoji: '🤖' },
];

function Conclusion({ totalCorrect, totalAnswered }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-cream-dark pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <FadeInSection>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-6">
              That's the fundamentals.
            </h1>
          </FadeInSection>

          <FadeInSection delay={0.2}>
            {totalAnswered > 0 && (
              <div className="bg-white rounded-2xl p-8 shadow-lg mb-8 inline-block">
                <p className="text-navy-light mb-2">Your Quiz Score</p>
                <p className="font-display text-5xl font-bold text-teal">
                  {totalCorrect} / {totalAnswered}
                </p>
                <p className="text-navy-light text-sm mt-2">
                  {totalCorrect === totalAnswered ? '🎉 Perfect!' : 
                   totalCorrect >= totalAnswered * 0.8 ? '👏 Great job!' : 
                   totalCorrect >= totalAnswered * 0.6 ? '👍 Good effort!' : 
                   'Keep learning!'}
                </p>
              </div>
            )}
          </FadeInSection>

          <FadeInSection delay={0.3}>
            <p className="text-xl text-navy-light mb-8">
              You've covered chart reading, key metrics, investor psychology, common mistakes, financial foundations, and the advanced track. This is a strong base — not the whole picture.
            </p>
          </FadeInSection>

          <FadeInSection delay={0.4}>
            <div className="bg-white rounded-2xl p-8 shadow-lg mb-8 text-left">
              <h3 className="font-display text-xl font-bold text-navy mb-4 text-center">Key points to remember:</h3>
              <ul className="space-y-3 text-navy-light">
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>Education reduces risk but never eliminates it</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>Start small, learn continuously, stay humble</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>Your emotions are often your worst enemy</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>Time in the market beats timing the market</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>Budget and emergency fund come before investing</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-teal">✓</span>
                  <span>When in doubt, diversified index funds are solid</span>
                </li>
              </ul>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.45}>
            <div className="bg-white rounded-2xl p-8 shadow-lg mb-12 text-left">
              <h3 className="font-display text-xl font-bold text-navy mb-4 text-center">Keep exploring the tools:</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {TOOLS.map(tool => (
                  <Link
                    key={tool.path}
                    to={tool.path}
                    className="flex flex-col items-center text-center p-4 bg-cream rounded-xl hover:bg-teal/10 transition-colors"
                  >
                    <span className="text-2xl mb-1">{tool.emoji}</span>
                    <span className="text-navy text-sm font-medium">{tool.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.5}>
            <div className="bg-amber/10 border-2 border-amber/30 rounded-2xl p-6 mb-12">
              <p className="text-navy">
                <span className="font-semibold">⚠️ Reminder:</span> This was educational content, not financial advice. Do your own research and consider consulting a financial advisor.
              </p>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.6}>
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <Link 
                to="/"
                className="px-6 py-3 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light transition-colors"
              >
                Back to Home
              </Link>
              <Link 
                to="/module/1"
                className="px-6 py-3 bg-teal text-white rounded-xl font-semibold hover:bg-teal-light transition-colors"
              >
                Review Modules
              </Link>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.7}>
            <div className="pt-12 border-t border-navy/10">
              <p className="font-display text-2xl font-bold text-emerald-400">Prometheus</p>
              <p className="text-navy-light text-sm mt-2">Financial education for everyone.</p>
            </div>
          </FadeInSection>
        </div>
      </div>
    </div>
  );
}

export default Conclusion;