const supabase = require('../config/database');

module.exports = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(200).json({
        status: 'error',
        database: 'disconnected',
        message: error.message || 'Unknown database error',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      message: '',
      timestamp: new Date().toISOString(),
    });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      status: 'error',
      database: 'disconnected',
      message: err.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
};
