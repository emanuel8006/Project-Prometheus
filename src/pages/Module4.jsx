import { FadeInSection, Quiz } from '../components';
import { foundationsTopics } from '../educationalData';
import { PageNavigation } from '../PageLayout';

function Module4({ onQuizComplete, soundEnabled, quizScores }) {
  const getAnsweredCount = () => {
    let count = 0;
    for (let i = 0; i < foundationsTopics.length; i++) {
      if (quizScores[`foundation-${i}`] !== undefined) count++;
      else break;
    }
    return count;
  };

  const answeredCount = getAnsweredCount();
  const allAnswered = answeredCount >= foundationsTopics.length;

  return (
    <div className="min-h-screen bg-sage/80 pt-20 pb-32 md:pb-12">
      <div className="container mx-auto px-6">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block bg-cream text-sage px-4 py-1 rounded-full text-sm font-semibold mb-4">
              Module 4
            </span>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-navy mb-4">
              Foundations First
            </h1>
            <p className="text-xl text-navy-light max-w-2xl mx-auto">
              Before you invest a single dollar, this is what actually gatekeeps building wealth.
            </p>
          </div>
        </FadeInSection>

        <div className="max-w-4xl mx-auto space-y-12">
          {foundationsTopics.map((topic, index) => {
            const quizId = `foundation-${index}`;
            const isAnswered = quizScores[quizId] !== undefined;
            const isVisible = index <= answeredCount;
            const wasCorrect = quizScores[quizId]?.correct === true;
            const savedSelectedIndex = quizScores[quizId]?.selectedIndex;

            if (!isVisible) return null;

            return (
              <FadeInSection key={index} delay={0.1}>
                <div className="bg-cream rounded-2xl p-6 md:p-10 shadow-lg border-l-4 border-sage">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{topic.emoji}</span>
                    <div>
                      <h3 className="font-display text-2xl font-bold text-navy">{topic.name}</h3>
                      <p className="text-navy-light italic">{topic.subtitle}</p>
                    </div>
                  </div>

                  <div className="space-y-4 my-6">
                    <p className="text-navy">{topic.description}</p>

                    <div className="bg-sage/10 rounded-xl p-4">
                      <span className="font-semibold text-sage">Key points:</span>
                      <ul className="mt-2 space-y-1 list-disc list-inside text-navy">
                        {topic.keyPoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="font-semibold text-navy">Why it matters:</span>
                      <p className="text-navy-light mt-1">{topic.insight}</p>
                    </div>

                    <div className="bg-amber/10 rounded-xl p-4">
                      <span className="font-semibold text-amber">Real example:</span>
                      <p className="text-navy mt-1">{topic.realExample}</p>
                    </div>

                    <div className="bg-teal/10 rounded-xl p-4">
                      <span className="font-semibold text-teal">Takeaway:</span>
                      <p className="text-navy mt-1">{topic.keyTakeaway}</p>
                    </div>
                  </div>

                  <Quiz
                    quiz={topic.quiz}
                    onComplete={(correct, selectedIndex) => onQuizComplete(quizId, correct, selectedIndex)}
                    soundEnabled={soundEnabled}
                    answered={isAnswered}
                    wasCorrect={wasCorrect}
                    savedSelectedIndex={savedSelectedIndex}
                    learnMoreUrl={topic.learnMoreUrl}
                    topicContext={[
                      `Topic: ${topic.name} — ${topic.subtitle}`,
                      `Description: ${topic.description}`,
                      `Key Points:\n${topic.keyPoints.map(p => `  - ${p}`).join('\n')}`,
                      `Why It Matters: ${topic.insight}`,
                      `Real Example: ${topic.realExample}`,
                      `Takeaway: ${topic.keyTakeaway}`,
                      `Quiz Question: ${topic.quiz.question}`,
                      `Quiz Options:\n${topic.quiz.options.map((o, i) => `  ${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`,
                      `Correct Answer: ${String.fromCharCode(65 + topic.quiz.correct)}. ${topic.quiz.options[topic.quiz.correct]}`,
                      `Explanation: ${topic.quiz.explanation}`,
                    ].join('\n')}
                  />
                </div>
              </FadeInSection>
            );
          })}

          <PageNavigation
            prevPath="/module/3"
            prevLabel="Mistakes"
            nextPath="/module/5"
            nextLabel="Advanced Track"
            nextDisabled={!allAnswered}
          />
        </div>
      </div>
    </div>
  );
}

export default Module4;