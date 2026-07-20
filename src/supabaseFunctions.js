import { supabase } from './supabaseClient';

// Check if username is already taken (for signup validation)
export async function isUsernameTaken(username) {
  if (!username || !username.trim()) return true;
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('username', username.trim())
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// CREATE USER & PORTFOLIO AFTER SIGNUP (username required for new signups)
export async function createUserAndPortfolio(email, username = null) {
  try {
    const displayName = username?.trim() || email.split('@')[0];

    if (username != null && username !== '') {
      const taken = await isUsernameTaken(username);
      if (taken) {
        throw new Error('Username already taken. Please choose another.');
      }
    }

    // Check if user already exists by email
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return existingUser;
    }

    // Create new user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: email,
        username: displayName,
        display_name: displayName
      })
      .select()
      .single();

    if (userError) throw userError;

    // Create portfolio for user
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .insert({
        user_id: user.id,
        starting_balance: 10000.00,
        current_balance: 10000.00,
        cash_available: 10000.00
      })
      .select()
      .single();

    if (portfolioError) throw portfolioError;

    console.log('User and portfolio created!');
    return { user, portfolio };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// GET USER DATA WITH PORTFOLIO
export async function getUserData(email) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        portfolios (
          *,
          holdings (*)
        )
      `)
      .eq('email', email)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

// BUY STOCK
export async function buyStock(portfolioId, ticker, quantity, price) {
  try {
    const totalCost = quantity * price;

    // Check cash
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('cash_available')
      .eq('id', portfolioId)
      .single();

    if (portfolio.cash_available < totalCost) {
      throw new Error('Insufficient funds');
    }

    // Record trade
    await supabase.from('trades').insert({
      portfolio_id: portfolioId,
      ticker: ticker.toUpperCase(),
      action: 'buy',
      quantity,
      price,
      total_amount: totalCost
    });

    // Update or create holding
    const { data: existingHolding } = await supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    if (existingHolding) {
      const newQty = existingHolding.quantity + quantity;
      const newAvg = ((existingHolding.average_cost * existingHolding.quantity) + (price * quantity)) / newQty;

      await supabase
        .from('holdings')
        .update({ 
          quantity: newQty, 
          average_cost: newAvg, 
          current_price: price 
        })
        .eq('id', existingHolding.id);
    } else {
      await supabase.from('holdings').insert({
        portfolio_id: portfolioId,
        ticker: ticker.toUpperCase(),
        quantity,
        average_cost: price,
        current_price: price
      });
    }

    // Update cash
    await supabase
      .from('portfolios')
      .update({ cash_available: portfolio.cash_available - totalCost })
      .eq('id', portfolioId);

    console.log('Stock purchased!');
    return { success: true };
  } catch (error) {
    console.error('Error buying stock:', error);
    throw error;
  }
}

// SELL STOCK
export async function sellStock(portfolioId, ticker, quantity, price) {
  try {
    const totalRevenue = quantity * price;

    // Check holding
    const { data: holding } = await supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    if (!holding || holding.quantity < quantity) {
      throw new Error('Insufficient shares');
    }

    // Record trade
    await supabase.from('trades').insert({
      portfolio_id: portfolioId,
      ticker: ticker.toUpperCase(),
      action: 'sell',
      quantity,
      price,
      total_amount: totalRevenue
    });

    // Update or delete holding
    if (holding.quantity === quantity) {
      await supabase.from('holdings').delete().eq('id', holding.id);
    } else {
      await supabase
        .from('holdings')
        .update({ quantity: holding.quantity - quantity })
        .eq('id', holding.id);
    }

    // Update cash
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('cash_available')
      .eq('id', portfolioId)
      .single();

    await supabase
      .from('portfolios')
      .update({ cash_available: portfolio.cash_available + totalRevenue })
      .eq('id', portfolioId);

    console.log('Stock sold!');
    return { success: true };
  } catch (error) {
    console.error('Error selling stock:', error);
    throw error;
  }
}

// UPDATE PORTFOLIO FROM SIMULATION (saves chosen starting amount, year, and result for leaderboard)
export async function updatePortfolioFromSimulation(portfolioId, { starting_balance, current_balance, investment_year }) {
  try {
    const payload = {
      starting_balance: Number(starting_balance),
      current_balance: Number(current_balance),
      cash_available: Number(current_balance),
    };
    if (investment_year != null && investment_year !== '') {
      payload.investment_year = Number(investment_year);
    }
    const { error } = await supabase
      .from('portfolios')
      .update(payload)
      .eq('id', portfolioId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating portfolio from simulation:', error);
    throw error;
  }
}

// GET LEADERBOARD
export async function getLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    throw error;
  }
}

// GET TRADE HISTORY
export async function getTradeHistory(portfolioId) {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting trades:', error);
    throw error;
  }
}

// GET HOLDINGS
export async function getHoldings(portfolioId) {
  try {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting holdings:', error);
    throw error;
  }
}

// SAVE QUIZ PROGRESS (upsert -- one row per user, keyed by users.id)
export async function saveProgress(userId, quizScores, totalCorrect, totalAnswered) {
  try {
    const { error } = await supabase
      .from('user_progress')
      .upsert({
        user_id: userId,
        quiz_scores: quizScores,
        total_correct: totalCorrect,
        total_answered: totalAnswered,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error saving progress:', error);
    throw error;
  }
}

// LOAD QUIZ PROGRESS -- returns null if this user has never saved any
export async function loadProgress(userId) {
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error loading progress:', error);
    throw error;
  }
}

// SAVE A SIMULATION SCENARIO
export async function saveScenario(userId, scenario) {
  try {
    const { data, error } = await supabase
      .from('saved_scenarios')
      .insert({
        user_id: userId,
        label: scenario.label,
        invested: scenario.invested,
        final_value: scenario.finalValue,
        roi_percent: scenario.roiPercent,
        sharpe: scenario.sharpe,
        max_drawdown: scenario.maxDrawdown,
        points: scenario.points,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving scenario:', error);
    throw error;
  }
}

// LOAD ALL SAVED SCENARIOS FOR A USER, oldest first (matches display order)
export async function loadScenarios(userId) {
  try {
    const { data, error } = await supabase
      .from('saved_scenarios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error loading scenarios:', error);
    throw error;
  }
}

// DELETE ONE SAVED SCENARIO
export async function deleteScenario(scenarioId) {
  try {
    const { error } = await supabase.from('saved_scenarios').delete().eq('id', scenarioId);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting scenario:', error);
    throw error;
  }
}

// CLEAR ALL SAVED SCENARIOS FOR A USER
export async function clearScenarios(userId) {
  try {
    const { error } = await supabase.from('saved_scenarios').delete().eq('user_id', userId);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error clearing scenarios:', error);
    throw error;
  }
}