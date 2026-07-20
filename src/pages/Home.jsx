import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FadeInSection } from '../components';
import { API_BASE_URL } from '../config';
import Animation from './Animation';

function Home({ totalQuizzes }) {
  const [spyQuote, setSpyQuote] = useState(null);
  const [spyError, setSpyError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/stats?symbol=SPY`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || data?.error) return;
        // Different yfinance fields carry the current price depending on
        // market state; try the common ones in order of reliability.
        const price = data.regularMarketPrice ?? data.currentPrice ?? data.previousClose ?? null;
        const prevClose = data.previousClose ?? null;
        if (price != null) {
          const change = prevClose != null ? price - prevClose : null;
          const changePct = prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : null;
          setSpyQuote({ price, change, changePct });
        } else {
          setSpyError(true);
        }
      })
      .catch(() => { if (!cancelled) setSpyError(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Hero Section */}
      <section id="hero" className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-teal/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-amber/20 rounded-full blur-3xl" />
        </div>

        {/* Background column - 25% width */}
        <div className="absolute left-0 top-0 w-1/4 min-h-screen bg-black z-0">
          <Animation />
        </div>

        <div className="relative min-h-screen">
          <div className="absolute left-0 top-1/2 z-10" style={{ transform: 'translateY(-50%) translateX(-30%) rotate(-90deg)', transformOrigin: 'center' }}>
            <FadeInSection>
              <h2 className="font-display text-[10vw] font-bold text-emerald-400 tracking-tight whitespace-nowrap">
                Prometheus 
              </h2>
            </FadeInSection>
          </div>
        </div>

        <div className="container mx-auto px-6 py-20 text-right relative z-10">
          <FadeInSection delay={0.2}>
            <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-teal mb-6 leading-tight">
              Can we talk about the
              <span className="block text-emerald-400">financial and economic state</span>
              of the world right now?
            </h1>
          </FadeInSection>
          
          <FadeInSection delay={0.4}>
            <p className="text-xl md:text-2xl text-cream max-w-2xl ml-auto mb-12 text-right">
              Around 62% of Gen Z is not financially literate.
              
              <span className= "block text-emerald-400"> Together, we can change that. </span>
              <span className= "block text-cream"> For free.</span>

            </p>
          </FadeInSection>
          
          <FadeInSection delay={0.6}>
            <a 
              href="#problem"
              className="inline-flex items-center gap-3 bg-teal text-cream px-8 py-4 rounded-full font-semibold text-lg hover:bg-emerald-400 transition-colors shadow-lg hover:shadow-xl"
            >
              Let's talk.
              <span className="text-xl">↓</span>
            </a>
          </FadeInSection>

          <FadeInSection delay={0.7}>
            <div className="mt-6 text-right">
              <Link
                to="/start"
                className="text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-4"
              >
                Not sure where to begin? Take our 1-minute quiz →
              </Link>
            </div>
          </FadeInSection>

          <FadeInSection delay={0.8}>
            <div className="mt-20 flex flex-wrap justify-end gap-8 text-white">
              <div>5 Modules</div>
              <div>{totalQuizzes} Questions</div>
              <div>~30 min</div>
            </div>
          </FadeInSection>

          {spyQuote && (
            <FadeInSection delay={0.9}>
              <div className="mt-6 flex justify-end">
                <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur px-4 py-2 rounded-full text-sm">
                  <span className="text-cream/70">S&P 500 right now</span>
                  <span className="font-semibold text-white">${spyQuote.price.toFixed(2)}</span>
                  {spyQuote.changePct != null && (
                    <span className={spyQuote.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {spyQuote.changePct >= 0 ? '▲' : '▼'} {Math.abs(spyQuote.changePct).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </FadeInSection>
          )}

        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-20 md:py-32 bg-navy text-cream">
        <div className="container mx-auto px-6">
          <FadeInSection>
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-16 text-center">
              The problem
            </h2>
          </FadeInSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
            <FadeInSection delay={0.1}>
              <div className="bg-navy-light/50 rounded-2xl p-8 text-center">
                <div className="text-5xl md:text-6xl font-display font-bold text-amber mb-2">61%</div>
                <p className="text-cream/80">of Americans own stocks, but most don't understand what they own</p>
              </div>
            </FadeInSection>
            
            <FadeInSection delay={0.2}>
              <div className="bg-navy-light/50 rounded-2xl p-8 text-center">
                <div className="text-5xl md:text-6xl font-display font-bold text-coral mb-2">90%</div>
                <p className="text-cream/80">of day traders lose money, largely due to lack of education</p>
              </div>
            </FadeInSection>
            
            <FadeInSection delay={0.3}>
              <div className="bg-navy-light/50 rounded-2xl p-8 text-center">
                <div className="text-5xl md:text-6xl font-display font-bold text-teal-light mb-2">73%</div>
                <p className="text-cream/80">make investment decisions based on tips from friends or family</p>
              </div>
            </FadeInSection>
          </div>

          <FadeInSection delay={0.4}>
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-xl text-cream/80 mb-8">
                Financial education is often gatekept behind expensive courses, confusing jargon, or inaccessible institutions. 
                Yet understanding money is fundamental to building a secure future.
              
              </p>
              <p className="text-amber font-semibold text-lg">
                We want to offer the tools to understanding finances for free to a generation that needs it with a value based approach. 
                Not one based on vibes or emotions.
              </p>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* Mission Section */}
      <section id="mission" className="py-20 md:py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <FadeInSection>
              <div className="text-center mb-16">
                <span className="inline-block bg-amber/10 text-amber px-4 py-1 rounded-full text-sm font-semibold mb-4">
                  Our Mission
                </span>
                <h2 className="font-display text-3xl md:text-5xl font-bold text-cream/80 mb-4">
                  Democratizing Financial Literacy
                </h2>
                <p className="text-xl text-cream/80 max-w-2xl mx-auto">
                  Free, accessible education for anyone who wants to understand how money and markets work.
                </p>
              </div>
            </FadeInSection>

            <div className="grid md:grid-cols-3 gap-6">
              <FadeInSection delay={0.1}>
                <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
                  <span className="text-4xl mb-4 block">🎯</span>
                  <h3 className="font-display text-xl font-bold text-navy mb-2">Practical</h3>
                  <p className="text-navy-light">Real concepts you can use immediately, not abstract theory.</p>
                </div>
              </FadeInSection>
              
              <FadeInSection delay={0.2}>
                <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
                  <span className="text-4xl mb-4 block">📚</span>
                  <h3 className="font-display text-xl font-bold text-navy mb-2">Approachable</h3>
                  <p className="text-navy-light">For those unexperienced in finances. Plain language explanations.</p>
                </div>
              </FadeInSection>
              
              <FadeInSection delay={0.3}>
                <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
                  <span className="text-4xl mb-4 block">⚠️</span>
                  <h3 className="font-display text-xl font-bold text-navy mb-2">Honest</h3>
                  <p className="text-navy-light">We show you risks and limitations, not just opportunities.</p>
                </div>
              </FadeInSection>
              
            </div>

            <div className="container mx-auto px-6 py-20 text-center relative z-10">
              <FadeInSection delay={0.6}>
                <Link
                  to="/module/1"
                  className="inline-flex items-center gap-3 bg-teal text-cream px-8 py-4 rounded-full font-semibold text-lg text-center hover:bg-emerald-400 transition-colors shadow-lg hover:shadow-xl"
                >
                  Let's start.
                  <span className="text-xl">💭</span>
                </Link>
              </FadeInSection>

              <FadeInSection delay={0.7}>
                <p className="mt-4">
                  <Link
                    to="/start"
                    className="text-amber hover:text-amber/80 font-medium underline underline-offset-4"
                  >
                    Not sure where to start? Answer a few questions →
                  </Link>
                </p>
              </FadeInSection>
            </div>

            <FadeInSection delay={0.5}>
              <div className="bg-amber/10 border-2 border-amber/30 rounded-2xl w-full p-6 shadow-lg text-center mt-0">
                <p className="text-cream">
                  <span className="font-semibold">⚠️ Reminder:</span> This is educational content, not financial advice. Do your own research and consider consulting a financial advisor.
                </p>
              </div>
            </FadeInSection>

          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;