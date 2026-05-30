const supabase = require('../config/database');

module.exports = async (req, res) => {
  try {
    const urlOk = !!process.env.SUPABASE_URL;
    const keyOk = !!process.env.SUPABASE_KEY;

    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({
        status: 'error',
        database: 'disconnected',
        env_url_set: urlOk,
        env_key_set: keyOk,
        error_code: error.code,
        error_message: error.message,
        error_details: error.details,
        error_hint: error.hint,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      users_count: count,
      env_url_set: urlOk,
      env_key_set: keyOk,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      env_url_set: !!process.env.SUPABASE_URL,
      env_key_set: !!process.env.SUPABASE_KEY,
      error_message: err.message,
      error_name: err.name,
      error_stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
};
