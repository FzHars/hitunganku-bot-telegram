const supabase = require('../config/database');

function isToday(date) {
  const now = new Date();
  const d = new Date(date);
  const wib = 7 * 60 * 60 * 1000;
  return Math.floor((now.getTime() + wib) / 86400000) === Math.floor((d.getTime() + wib) / 86400000);
}

async function checkQuota(user) {
  if (!isToday(user.ai_last_reset)) {
    const { data, error } = await supabase
      .from('users')
      .update({ ai_usage_today: 0, ai_last_reset: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();

    if (!error && data) {
      user.ai_usage_today = 0;
      user.ai_last_reset = data.ai_last_reset;
    }
  }

  if (user.ai_usage_today >= user.daily_ai_limit) {
    return { allowed: false, message: `Kuota AI hari ini habis (${user.daily_ai_limit}/hari). Pakai /keluar atau /masuk manual.` };
  }

  return { allowed: true };
}

async function incrementUsage(user) {
  const { data, error } = await supabase
    .from('users')
    .update({ ai_usage_today: user.ai_usage_today + 1 })
    .eq('id', user.id)
    .select()
    .single();

  if (!error && data) {
    user.ai_usage_today = data.ai_usage_today;
  }
}

module.exports = { checkQuota, incrementUsage };
