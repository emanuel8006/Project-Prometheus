import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Storage } from './utils';
import { metrics, psychologyTopics, beginnerMistakes, foundationsTopics } from './educationalData';
import { TopNav } from './PageLayout';

import Home from './pages/Home';
import Module1 from './pages/Module1';
import Module2 from './pages/Module2';
import Module3 from './pages/Module3';
import Module4 from './pages/Module4';
import Simulation from './pages/Simulation';
import GoalPlanner from './pages/GoalPlanner';
import DebtPayoff from './pages/DebtPayoff';
import MonteCarlo from './pages/MonteCarlo';
import Conclusion from './pages/Conclusion';
import SignInModal from './pages/SignInModal';
import SignUpModal from './pages/SignUpModal';
import Dashboard from './pages/Dashboard';

function ScrollToTop() {
  const { pathname } = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  
  return null;
}

function App() {
  const [soundEnabled, setSoundEnabled] = useState(() => Storage.load('soundEnabled', true));
  const [quizScores, setQuizScores] = useState(() => Storage.load('quizScores', {}));
  const [totalCorrect, setTotalCorrect] = useState(() => Storage.load('totalCorrect', 0));
  const [totalAnswered, setTotalAnswered] = useState(() => Storage.load('totalAnswered', 0));

  const totalQuizzes = metrics.length + psychologyTopics.length + beginnerMistakes.length + foundationsTopics.length;

  useEffect(() => {
    Storage.save('quizScores', quizScores);
    Storage.save('totalCorrect', totalCorrect);
    Storage.save('totalAnswered', totalAnswered);
  }, [quizScores, totalCorrect, totalAnswered]);

  useEffect(() => {
    Storage.save('soundEnabled', soundEnabled);
  }, [soundEnabled]);

  const handleQuizComplete = (quizId, correct, selectedIndex) => {
    if (quizScores[quizId] === undefined) {
      setQuizScores(prev => ({ ...prev, [quizId]: { correct, selectedIndex } }));
      setTotalAnswered(prev => prev + 1);
      if (correct) setTotalCorrect(prev => prev + 1);
    }
  };

  const resetProgress = () => {
    setQuizScores({});
    setTotalCorrect(0);
    setTotalAnswered(0);
    Storage.clear('quizScores');
    Storage.clear('totalCorrect');
    Storage.clear('totalAnswered');
  };

  const [session, setSession] = useState(null);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [signUpModalOpen, setSignUpModalOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // When visiting /login, open sign-in modal and go home
  useEffect(() => {
    if (pathname === '/login') {
      setSignInModalOpen(true);
      setSignUpModalOpen(false);
      navigate('/', { replace: true });
    }
  }, [pathname, navigate]);

  const showSignInModal = signInModalOpen || (pathname === '/dashboard' && !session);
  const closeSignInModal = () => {
    setSignInModalOpen(false);
    if (pathname === '/dashboard' && !session) navigate('/');
  };
  const openSignUpModal = () => {
    setSignInModalOpen(false);
    setSignUpModalOpen(true);
  };
  const closeSignUpModal = () => setSignUpModalOpen(false);
  const onAuthSuccess = () => {
    setSignInModalOpen(false);
    setSignUpModalOpen(false);
    if (pathname === '/dashboard' && !session) navigate('/');
  };

  return (
    <div className="min-h-screen bg-cream">
      <ScrollToTop />
      <TopNav 
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        totalCorrect={totalCorrect}
        totalAnswered={totalAnswered}
        resetProgress={resetProgress}
        quizScores={quizScores}
        session={session}
        onOpenAuth={() => setSignInModalOpen(true)}
      />
      <SignInModal
        isOpen={showSignInModal}
        onClose={closeSignInModal}
        onSuccess={onAuthSuccess}
        onOpenSignUp={openSignUpModal}
      />
      <SignUpModal
        isOpen={signUpModalOpen}
        onClose={closeSignUpModal}
        onSuccess={onAuthSuccess}
      />
      <Routes>
        <Route path="/" element={<Home totalQuizzes={totalQuizzes} />} />
        <Route path="/module/1" element={
          <Module1 
            onQuizComplete={handleQuizComplete} 
            soundEnabled={soundEnabled}
            quizScores={quizScores}
          />
        } />
        <Route path="/module/2" element={
          <Module2 
            onQuizComplete={handleQuizComplete} 
            soundEnabled={soundEnabled}
            quizScores={quizScores}
          />
        } />
        <Route path="/module/3" element={
          <Module3 
            onQuizComplete={handleQuizComplete} 
            soundEnabled={soundEnabled}
            quizScores={quizScores}
          />
        } />
        <Route path="/module/4" element={
          <Module4
            onQuizComplete={handleQuizComplete}
            soundEnabled={soundEnabled}
            quizScores={quizScores}
          />
        } />
        <Route path="/simulation" element={<Simulation session={session} />} />
        <Route path="/goal-planner" element={<GoalPlanner />} />
        <Route path="/debt-payoff" element={<DebtPayoff />} />
        <Route path="/monte-carlo" element={<MonteCarlo />} />
        <Route path="/conclusion" element={
          <Conclusion 
            totalCorrect={totalCorrect}
            totalAnswered={totalAnswered}
          />
        } />
        <Route path="/login" element={null} />
        <Route path="/dashboard" element={
          session ? <Dashboard session={session} /> : null
        } />
      </Routes>
    </div>
  );
}

export default App;