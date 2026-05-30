const supabase = require('../config/database');

module.exports = async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(200).json({
        status: 'error',
        database: 'disconnected',
        message: error.message || '',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      message: '',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      status: 'error',
      database: 'disconnected',
      message: err.message || '',
      timestamp: new Date().toISOString(),
    });
  }
};
