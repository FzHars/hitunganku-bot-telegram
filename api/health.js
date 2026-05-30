const supabase = require('../config/database');

module.exports = async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('count(*)', { count: 'exact', head: true });
    if (error) throw error;

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};
