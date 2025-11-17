const jwt = require('jsonwebtoken');
const User = require('../services/firebaseUserService');

// MIDDLEWARE DE AUTENTICAÇÃO PRINCIPAL
const auth = async (req, res, next) => {
  try {
    let token;
    
    // 1. VERIFICAR SE O TOKEN EXISTS NO HEADER
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // ✅ ADICIONEI: Também verificar em cookies (caso use)
    else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Acesso negado. Token não fornecido.',
        code: 'NO_TOKEN'
      });
    }
    
    // 2. VERIFICAR SE O TOKEN É VÁLIDO
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // ✅ MELHOREI: Tratamento específico de cada tipo de erro JWT
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expirado. Faça login novamente.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token malformado.',
          code: 'INVALID_TOKEN'
        });
      }
      
      if (jwtError.name === 'NotBeforeError') {
        return res.status(401).json({
          success: false,
          message: 'Token ainda não é válido.',
          code: 'TOKEN_NOT_ACTIVE'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
        code: 'TOKEN_ERROR'
      });
    }
    
    // 3. VERIFICAR SE O USUÁRIO AINDA EXISTE
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado. Token pode ter sido comprometido.',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 4. VERIFICAR SE O USUÁRIO ESTÁ ATIVO
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o suporte.',
        code: 'ACCOUNT_DISABLED'
      });
    }
    
    // ✅ ADICIONEI: Verificar se a conta está bloqueada por tentativas de login
    if (user.isLocked && user.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Conta temporariamente bloqueada por tentativas de login inválidas.',
        code: 'ACCOUNT_LOCKED',
        lockUntil: user.security?.lockUntil
      });
    }
    
    // ✅ ADICIONEI: Verificar se a assinatura ainda está válida (para endpoints premium)
    if (user.subscription.status === 'expired') {
      // Não bloquear, mas adicionar informação
      user._subscriptionExpired = true;
    }
    
    // 5. TUDO OK! Adicionar usuário ao request
    req.user = user;
    req.token = token; // ✅ ADICIONEI: Também salvar o token para possível uso
    
    next();
    
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor na autenticação',
      code: 'AUTH_ERROR'
    });
  }
};

// ✅ ADICIONEI: MIDDLEWARE OPCIONAL - Só pega o usuário SE tiver token, mas não bloqueia
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive && (!user.isLocked || !user.isLocked())) {
          req.user = user;
          req.token = token;
        }
      } catch (error) {
        // Token inválido, mas não bloqueia - apenas ignora
        console.log('Token inválido no optionalAuth:', error.message);
      }
    }
    
    // Sempre prossegue, mesmo sem token válido
    next();
    
  } catch (error) {
    console.error('Erro no optionalAuth:', error);
    next(); // Mesmo com erro, não bloqueia
  }
};

// ✅ ADICIONEI: MIDDLEWARE PARA VERIFICAR PLANOS ESPECÍFICOS
const requirePlan = (requiredPlans) => {
  // Validar entrada
  if (!Array.isArray(requiredPlans)) {
    requiredPlans = [requiredPlans];
  }
  
  return (req, res, next) => {
    // Primeiro verificar se está autenticado
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Verificar se tem o plano necessário
    if (!requiredPlans.includes(req.user.subscription.plan)) {
      return res.status(403).json({
        success: false,
        message: `Esta funcionalidade requer plano: ${requiredPlans.join(' ou ')}`,
        currentPlan: req.user.subscription.plan,
        requiredPlans,
        code: 'PLAN_REQUIRED',
        upgradeUrl: '/plans' // URL para upgrade
      });
    }
    
    // Verificar se a assinatura está ativa
    if (req.user.subscription.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Assinatura inativa. Renove seu plano para continuar.',
        currentStatus: req.user.subscription.status,
        code: 'SUBSCRIPTION_INACTIVE',
        renewUrl: '/plans'
      });
    }
    
    next();
  };
};

// ✅ ADICIONEI: MIDDLEWARE PARA VERIFICAR SE PODE GERAR PLANOS
const canGeneratePlan = async (req, res, next) => {
  try {
    // Verificar se está autenticado
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Verificar se pode gerar plano
    const canGenerate = req.user.canGeneratePlan();
    
    if (!canGenerate.canGenerate) {
      return res.status(403).json({
        success: false,
        message: 'Limite de planos atingido para seu plano atual',
        ...canGenerate,
        code: 'PLAN_LIMIT_REACHED',
        upgradeUrl: '/plans'
      });
    }
    
    // Adicionar informações de limite ao request
    req.planLimits = canGenerate;
    next();
    
  } catch (error) {
    console.error('Erro ao verificar limite de planos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar limite de planos',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
};

// ✅ ADICIONEI: MIDDLEWARE PARA VERIFICAR PROPRIEDADE (usuário só acessa seus próprios dados)
const checkOwnership = (resourceIdField = 'id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const resourceId = req.params[resourceIdField];
    const userId = req.user.id || req.user._id;
    
    // Para alguns recursos, verificar se o usuário é dono
    if (resourceId && resourceId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Você só pode acessar seus próprios dados.',
        code: 'ACCESS_DENIED'
      });
    }
    
    next();
  };
};

// ✅ ADICIONEI: MIDDLEWARE PARA VERIFICAR ROLE DE ADMIN (para futuras funcionalidades)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Autenticação necessária',
      code: 'AUTH_REQUIRED'
    });
  }
  
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a administradores',
      code: 'ADMIN_REQUIRED'
    });
  }
  
  next();
};

// ✅ ADICIONEI: MIDDLEWARE PARA RATE LIMITING POR USUÁRIO
const userRateLimit = (maxRequests = 100, windowMs = 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next(); // Se não está autenticado, deixa o rate limit global cuidar
    }
    
    const userId = req.user.id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Limpar requests antigos
    if (userRequests.has(userId)) {
      const requests = userRequests.get(userId);
      userRequests.set(userId, requests.filter(time => time > windowStart));
    }
    
    const currentRequests = userRequests.get(userId) || [];
    
    if (currentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: `Muitas requisições. Máximo ${maxRequests} por minuto.`,
        code: 'USER_RATE_LIMIT',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Adicionar nova request
    currentRequests.push(now);
    userRequests.set(userId, currentRequests);
    
    next();
  };
};

module.exports = {
  auth,
  optionalAuth,
  requirePlan,
  canGeneratePlan,
  checkOwnership,
  requireAdmin,
  userRateLimit
};