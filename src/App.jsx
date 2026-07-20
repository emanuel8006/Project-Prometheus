import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { supabase } from './supabaseClient';
import { createUserAndPortfolio, getUserData, saveProgress, loadProgress } from './supabaseFunctions';
import { Storage } from './utils';
import { metrics, psychologyTopics, beginnerMistakes, foundationsTopics, advancedTopics } from './educationalData';
import { TopNav } from './PageLayout';

import Home from './pages/Home';
import StartHere from './pages/StartHere';
import Module1 from './pages/Module1';
import Module2 from './pages/Module2';
import Module3 from './pages/Module3';
import Module4 from './pages/Module4';
import Module5 from './pages/Module5';
import Simulation from './pages/Simulation';
import GoalPlanner from './pages/GoalPlanner';
import DebtPayoff from './pages/DebtPayoff';
import MonteCarlo from './pages/MonteCarlo';
import OptionsPayoff from './pages/OptionsPayoff';
import AlgoBacktester from './pages/AlgoBacktester';
import LifePathSimulator from './pages/LifePathSimulator';
import Conclusion from './pages/Conclusion';
import SignInModal from './pages/SignInModal';
import SignUpModal from './pages/SignUpModal';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './pages/ErrorBoundary';

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

  const totalQuizzes = metrics.length + psychologyTopics.length + beginnerMistakes.length + foundationsTopics.length + advancedTopics.length;

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
    if (dbUserId) {
      saveProgress(dbUserId, {}, 0, 0).catch(err => console.warn('Could not reset progress in account:', err));
    }
  };

  const [session, setSession] = useState(null);
  const [dbUserId, setDbUserId] = useState(null);
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

  // When signed in, resolve the users-table row (same one used for the
  // leaderboard/portfolio) and sync quiz progress against it -- the DB
  // becomes the source of truth once signed in, but a guest's existing
  // localStorage progress is migrated up on first sign-in instead of lost.
  useEffect(() => {
    if (!session?.user?.email) {
      setDbUserId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const email = session.user.email;
        const username = session.user.user_metadata?.username;
        await createUserAndPortfolio(email, username || undefined);
        const userData = await getUserData(email);
        if (cancelled || !userData?.id) return;
        setDbUserId(userData.id);

        const remoteProgress = await loadProgress(userData.id);
        if (cancelled) return;

        const hasRemoteProgress = remoteProgress && remoteProgress.total_answered > 0;
        const hasLocalProgress = totalAnswered > 0;

        if (hasRemoteProgress) {
          // DB progress exists (this device or another) -- it wins.
          setQuizScores(remoteProgress.quiz_scores || {});
          setTotalCorrect(remoteProgress.total_correct || 0);
          setTotalAnswered(remoteProgress.total_answered || 0);
        } else if (hasLocalProgress) {
          // First sign-in with existing guest progress on this device --
          // push it up instead of silently discarding it.
          await saveProgress(userData.id, quizScores, totalCorrect, totalAnswered);
        }
      } catch (err) {
        console.warn('Could not sync progress with account:', err);
      }
    })();

    return () => { cancelled = true; };
    // Deliberately only re-run when the session's user identity changes,
    // not on every quizScores update (that's handled by the save effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Save to the DB whenever progress changes, once signed in
  useEffect(() => {
    if (!dbUserId) return;
    saveProgress(dbUserId, quizScores, totalCorrect, totalAnswered).catch(err =>
      console.warn('Could not save progress to account:', err)
    );
  }, [dbUserId, quizScores, totalCorrect, totalAnswered]);


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
      <Analytics />
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
        <Route path="/" element={<ErrorBoundary title="Something went wrong on the home page"><Home totalQuizzes={totalQuizzes} /></ErrorBoundary>} />
        <Route path="/start" element={<ErrorBoundary title="Something went wrong with the starting quiz"><StartHere /></ErrorBoundary>} />
        <Route path="/module/1" element={
          <ErrorBoundary title="Something went wrong in this module">
            <Module1 
              onQuizComplete={handleQuizComplete} 
              soundEnabled={soundEnabled}
              quizScores={quizScores}
            />
          </ErrorBoundary>
        } />
        <Route path="/module/2" element={
          <ErrorBoundary title="Something went wrong in this module">
            <Module2 
              onQuizComplete={handleQuizComplete} 
              soundEnabled={soundEnabled}
              quizScores={quizScores}
            />
          </ErrorBoundary>
        } />
        <Route path="/module/3" element={
          <ErrorBoundary title="Something went wrong in this module">
            <Module3 
              onQuizComplete={handleQuizComplete} 
              soundEnabled={soundEnabled}
              quizScores={quizScores}
            />
          </ErrorBoundary>
        } />
        <Route path="/module/4" element={
          <ErrorBoundary title="Something went wrong in this module">
            <Module4
              onQuizComplete={handleQuizComplete}
              soundEnabled={soundEnabled}
              quizScores={quizScores}
            />
          </ErrorBoundary>
        } />
        <Route path="/module/5" element={
          <ErrorBoundary title="Something went wrong in this module">
            <Module5
              onQuizComplete={handleQuizComplete}
              soundEnabled={soundEnabled}
              quizScores={quizScores}
            />
          </ErrorBoundary>
        } />
        <Route path="/simulation" element={<ErrorBoundary title="Something went wrong with the simulator"><Simulation session={session} /></ErrorBoundary>} />
        <Route path="/goal-planner" element={<ErrorBoundary title="Something went wrong with the Goal Planner"><GoalPlanner /></ErrorBoundary>} />
        <Route path="/debt-payoff" element={<ErrorBoundary title="Something went wrong with the Debt Payoff Calculator"><DebtPayoff /></ErrorBoundary>} />
        <Route path="/monte-carlo" element={<ErrorBoundary title="Something went wrong with the Monte Carlo simulator"><MonteCarlo /></ErrorBoundary>} />
        <Route path="/options-payoff" element={<ErrorBoundary title="Something went wrong with the Options Payoff Visualizer"><OptionsPayoff /></ErrorBoundary>} />
        <Route path="/algo-backtester" element={<ErrorBoundary title="Something went wrong with the Strategy Backtester"><AlgoBacktester /></ErrorBoundary>} />
        <Route path="/life-path" element={<ErrorBoundary title="Something went wrong with the Life Path Simulator"><LifePathSimulator /></ErrorBoundary>} />
        <Route path="/conclusion" element={
          <ErrorBoundary title="Something went wrong on this page">
            <Conclusion 
              totalCorrect={totalCorrect}
              totalAnswered={totalAnswered}
            />
          </ErrorBoundary>
        } />
        <Route path="/login" element={null} />
        <Route path="/dashboard" element={
          session ? <ErrorBoundary title="Something went wrong on your dashboard"><Dashboard session={session} /></ErrorBoundary> : null
        } />
      </Routes>
    </div>
  );
}

export default App;