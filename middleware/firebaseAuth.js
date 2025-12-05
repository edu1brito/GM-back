const { admin } = require('../config/firebase');
const { firebaseUserService } = require('../services/firebaseUserService');

// MIDDLEWARE DE AUTENTICAÇÃO USANDO FIREBASE
const auth = async (req, res, next) => {
  try {
    let idToken;

    // 1. EXTRAIR TOKEN DO HEADER
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      idToken = req.headers.authorization.split(' ')[1];
    }

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: 'Acesso negado. Token não fornecido.',
        code: 'NO_TOKEN'
      });
    }

    // 2. VERIFICAR TOKEN COM FIREBASE
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (firebaseError) {
      console.error('Erro ao verificar token Firebase:', firebaseError.code);

      if (firebaseError.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          message: 'Token expirado. Faça login novamente.',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (firebaseError.code === 'auth/argument-error') {
        return res.status(401).json({
          success: false,
          message: 'Token inválido ou malformado.',
          code: 'INVALID_TOKEN'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
        code: 'TOKEN_ERROR',
        details: firebaseError.message
      });
    }

    // 3. BUSCAR DADOS DO USUÁRIO NO FIRESTORE
    const uid = decodedToken.uid;
    const user = await firebaseUserService.getUserById(uid);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado.',
        code: 'USER_NOT_FOUND'
      });
    }

    // 4. VERIFICAR SE USUÁRIO ESTÁ ATIVO
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o suporte.',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // 5. VERIFICAR SE CONTA ESTÁ BLOQUEADA
    if (firebaseUserService.isAccountLocked(user)) {
      return res.status(423).json({
        success: false,
        message: 'Conta temporariamente bloqueada por tentativas de login inválidas.',
        code: 'ACCOUNT_LOCKED',
        lockUntil: user.security?.lockUntil
      });
    }

    // 6. ADICIONAR INFORMAÇÕES AO REQUEST
    req.user = user;
    req.uid = uid;
    req.token = idToken;

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

// MIDDLEWARE OPCIONAL - Só pega o usuário SE tiver token, mas não bloqueia
const optionalAuth = async (req, res, next) => {
  try {
    let idToken;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      idToken = req.headers.authorization.split(' ')[1];
    }

    if (idToken) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const user = await firebaseUserService.getUserById(decodedToken.uid);

        if (user && user.isActive && !firebaseUserService.isAccountLocked(user)) {
          req.user = user;
          req.uid = decodedToken.uid;
          req.token = idToken;
        }
      } catch (error) {
        console.log('Token inválido no optionalAuth:', error.message);
      }
    }

    next();

  } catch (error) {
    console.error('Erro no optionalAuth:', error);
    next();
  }
};

// MIDDLEWARE PARA VERIFICAR PLANOS ESPECÍFICOS
const requirePlan = (requiredPlans) => {
  if (!Array.isArray(requiredPlans)) {
    requiredPlans = [requiredPlans];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!requiredPlans.includes(req.user.subscription?.plan)) {
      return res.status(403).json({
        success: false,
        message: `Esta funcionalidade requer plano: ${requiredPlans.join(' ou ')}`,
        currentPlan: req.user.subscription?.plan,
        requiredPlans,
        code: 'PLAN_REQUIRED',
        upgradeUrl: '/plans'
      });
    }

    if (req.user.subscription?.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Assinatura inativa. Renove seu plano para continuar.',
        currentStatus: req.user.subscription?.status,
        code: 'SUBSCRIPTION_INACTIVE',
        renewUrl: '/plans'
      });
    }

    next();
  };
};

// MIDDLEWARE PARA VERIFICAR SE PODE GERAR PLANOS
const canGeneratePlan = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária',
        code: 'AUTH_REQUIRED'
      });
    }

    const canGenerate = firebaseUserService.canGeneratePlan(req.user);

    if (!canGenerate.canGenerate) {
      return res.status(403).json({
        success: false,
        message: 'Limite de planos atingido para seu plano atual',
        ...canGenerate,
        code: 'PLAN_LIMIT_REACHED',
        upgradeUrl: '/plans'
      });
    }

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

// MIDDLEWARE PARA VERIFICAR PROPRIEDADE
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
    const userId = req.user.id || req.uid;

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

// MIDDLEWARE PARA VERIFICAR ROLE DE ADMIN
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

module.exports = {
  auth,
  optionalAuth,
  requirePlan,
  canGeneratePlan,
  checkOwnership,
  requireAdmin
};
