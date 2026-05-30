const supabase = require('../config/database');

module.exports = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({
        status: 'error',
        database: 'disconnected',
        message: error.message || 'Unknown database error',
        details: error,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      users_count: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: err.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
};
