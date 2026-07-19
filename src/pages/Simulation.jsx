import { FadeInSection } from '../components';
import StockSimulation from '../StockSimulation';
import { PageNavigation } from '../PageLayout';

function Simulation({ session }) {
  return (
    <div className="min-h-screen bg-cream-dark pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-teal/10 text-teal px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Final Challenge
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Test Your Knowledge
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Pick stocks using historical data. See how your portfolio would have performed.
            </p>
          </div>
        </FadeInSection>

        <FadeInSection delay={0.2}>
          <StockSimulation session={session} />
        </FadeInSection>

        <div className="max-w-4xl mx-auto">
          <PageNavigation 
            prevPath="/module/5" 
            prevLabel="Advanced Track"
            nextPath="/goal-planner" 
            nextLabel="Goal Planner"
          />
        </div>
      </div>
    </div>
  );
}

export default Simulation;