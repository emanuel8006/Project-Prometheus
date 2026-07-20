import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FadeInSection } from '../components';

const QUESTIONS = [
  {
    id: 'debt',
    question: "Do you have high-interest debt (credit cards, etc.)?",
    options: [
      { label: "Yes, and it carries a balance month to month", value: 'high_debt' },
      { label: "No, or only low-interest debt (mortgage, student loans)", value: 'no_high_debt' },
    ],
  },
  {
    id: 'emergency_fund',
    question: "Do you have 3-6 months of expenses saved as an emergency fund?",
    options: [
      { label: "Not yet", value: 'no_fund' },
      { label: "Yes, I'm covered", value: 'has_fund' },
    ],
  },
  {
    id: 'experience',
    question: "Have you invested in stocks before?",
    options: [
      { label: "Never", value: 'never' },
      { label: "A little — I understand the basics", value: 'some' },
      { label: "Regularly — I'm comfortable with terminology like P/E, beta, etc.", value: 'experienced' },
    ],
  },
  {
    id: 'interest',
    question: "What are you most interested in right now?",
    options: [
      { label: "The absolute basics of investing", value: 'basics' },
      { label: "Understanding my own money habits and mistakes to avoid", value: 'psychology' },
      { label: "Advanced tools — options, technical analysis, backtesting", value: 'advanced' },
    ],
  },
];

function recommend(answers) {
  // Foundations come first if the basics of financial health aren't in place yet --
  // no point optimizing investment returns before that's handled.
  if (answers.debt === 'high_debt' || answers.emergency_fund === 'no_fund') {
    return {
      path: '/module/4',
      label: 'Start with Foundations',
      reason: answers.debt === 'high_debt'
        ? "High-interest debt usually costs more than investing gains — Foundations covers exactly this tradeoff first."
        : "An emergency fund is what keeps a bad month from forcing you to sell investments at a bad time. Foundations covers this before anything else.",
      fullPath: ['Foundations', 'Key Metrics', 'Psychology', 'Common Mistakes', 'Advanced Track', 'Simulator & Tools'],
    };
  }

  if (answers.experience === 'experienced' && answers.interest === 'advanced') {
    return {
      path: '/module/5',
      label: 'Jump to the Advanced Track',
      reason: "You already know the basics — Module 5 covers options, technical indicators, and portfolio math, each linked to a real tool.",
      fullPath: ['Advanced Track', 'Simulator & Tools', '(Key Metrics / Psychology / Mistakes as a refresher, optional)'],
    };
  }

  if (answers.interest === 'psychology') {
    return {
      path: '/module/2',
      label: 'Start with Psychology',
      reason: "Since behavior and mistakes are what you're most curious about, this module goes straight there.",
      fullPath: ['Psychology', 'Common Mistakes', 'Key Metrics', 'Foundations', 'Advanced Track', 'Simulator & Tools'],
    };
  }

  if (answers.experience === 'never' || answers.interest === 'basics') {
    return {
      path: '/module/1',
      label: 'Start with Key Metrics',
      reason: "Since you're newer to investing, this starts with the vocabulary and numbers everything else builds on.",
      fullPath: ['Key Metrics', 'Psychology', 'Common Mistakes', 'Foundations', 'Advanced Track', 'Simulator & Tools'],
    };
  }

  return {
    path: '/module/1',
    label: 'Start with Key Metrics',
    reason: "A solid default starting point covering the core vocabulary.",
    fullPath: ['Key Metrics', 'Psychology', 'Common Mistakes', 'Foundations', 'Advanced Track', 'Simulator & Tools'],
  };
}

function StartHere() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const handleAnswer = (questionId, value) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setStep(QUESTIONS.length); // results
    }
  };

  const handleRestart = () => {
    setAnswers({});
    setStep(0);
  };

  const isResults = step >= QUESTIONS.length;
  const result = isResults ? recommend(answers) : null;

  return (
    <div className="min-h-screen bg-teal/10 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-teal px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Find Your Starting Point
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Where Should You Start?
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              A few quick questions to point you at the right module first — no wrong answers.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-2xl mx-auto">
          {!isResults ? (
            <FadeInSection delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-lg">
                <p className="text-navy-light text-sm mb-2">Question {step + 1} of {QUESTIONS.length}</p>
                <h3 className="font-display text-2xl font-bold text-navy mb-6">{QUESTIONS[step].question}</h3>
                <div className="space-y-3">
                  {QUESTIONS[step].options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleAnswer(QUESTIONS[step].id, opt.value)}
                      className="w-full text-left p-4 rounded-xl border-2 border-cream-dark hover:border-teal hover:bg-teal/5 transition-all text-navy font-medium"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mt-8">
                  {QUESTIONS.map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-teal' : 'bg-cream-dark'}`} />
                  ))}
                </div>
              </div>
            </FadeInSection>
          ) : (
            <FadeInSection delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
                <p className="text-navy-light mb-2">Based on your answers:</p>
                <h3 className="font-display text-3xl font-bold text-navy mb-4">{result.label}</h3>
                <p className="text-navy-light mb-8">{result.reason}</p>

                <Link
                  to={result.path}
                  className="inline-block px-8 py-3 bg-teal text-white rounded-xl font-semibold hover:bg-teal-light transition-colors mb-8"
                >
                  Let's Go →
                </Link>

                <div className="bg-cream rounded-xl p-6 text-left">
                  <p className="font-semibold text-navy mb-3 text-center">Your suggested full path:</p>
                  <ol className="space-y-2">
                    {result.fullPath.map((step, i) => (
                      <li key={i} className="flex gap-3 text-navy-light">
                        <span className="font-semibold text-teal">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <button
                  onClick={handleRestart}
                  className="mt-6 text-navy-light hover:text-teal text-sm font-medium"
                >
                  Retake the quiz
                </button>
              </div>
            </FadeInSection>
          )}
        </div>
      </div>
    </div>
  );
}

export default StartHere;