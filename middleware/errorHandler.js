
// ====================================
// 8. middleware/errorHandler.js
// ====================================
const errorHandler = (err, req, res, next) => {
  console.error('Erro capturado:', err);
  
  let error = { ...err };
  error.message = err.message;
  
  // Erro de Cast do MongoDB (ID inválido)
  if (err.name === 'CastError') {
    const message = 'Recurso não encontrado';
    error = { message, statusCode: 404 };
  }
  
  // Erro de duplicação do MongoDB
  if (err.code === 11000) {
    const message = 'Dados duplicados detectados';
    error = { message, statusCode: 400 };
  }
  
  // Erro de validação do MongoDB
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }
  
  // Erro JWT
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token inválido';
    error = { message, statusCode: 401 };
  }
  
  // Erro JWT expirado
  if (err.name === 'TokenExpiredError') {
    const message = 'Token expirado';
    error = { message, statusCode: 401 };
  }
  
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
