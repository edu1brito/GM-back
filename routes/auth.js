const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { firebaseUserService } = require('../services/firebaseUserService');
const { auth, optionalAuth } = require('../middleware/firebaseAuth');

// Node 18+ já tem fetch nativo - não precisa de importação adicional

const router = express.Router();

// UTILITÁRIOS FIREBASE
const createCustomToken = async (uid, additionalClaims = {}) => {
  try {
    return await admin.auth().createCustomToken(uid, additionalClaims);
  } catch (error) {
    console.error('Erro ao criar custom token:', error);
    throw error;
  }
};

// @desc    Registrar usuário
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome deve ter entre 2 e 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome deve conter apenas letras e espaços'),
  
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email muito longo'),
  
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Senha deve ter entre 8 e 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Senha deve conter pelo menos: 1 minúscula, 1 maiúscula e 1 número'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Confirmação de senha não confere');
      }
      return true;
    }),
  
  body('acceptTerms')
    .equals('true')
    .withMessage('Você deve aceitar os termos de uso')
    
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }
    
    const { name, email, password } = req.body;
    
    // Verificar se usuário já existe no Firebase Auth
    let existingUser;
    try {
      existingUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      // Usuário não existe no Firebase Auth - isso é bom
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Este email já está sendo usado',
        code: 'EMAIL_EXISTS'
      });
    }
    
    // Verificar se existe usuário inativo no Firestore
    const inactiveUser = await firebaseUserService.getUserByEmail(email, false);
    
    if (inactiveUser) {
      // Reativar conta existente
      const updatedUser = await firebaseUserService.updateUser(inactiveUser.id, {
        name,
        isActive: true,
        security: {
          ...inactiveUser.security,
          emailVerified: false
        }
      });
      
      // Atualizar senha no Firebase Auth
      await admin.auth().updateUser(inactiveUser.id, {
        password,
        disabled: false
      });

      // Fazer login para obter idToken
      const authResult = await verifyFirebaseCredentials(email, password);

      if (!authResult.success) {
        // Caso falhe, retornar custom token como fallback
        const customToken = await createCustomToken(inactiveUser.id);
        return res.status(201).json({
          success: true,
          message: 'Conta reativada com sucesso! Bem-vindo de volta! 🎉',
          customToken,
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            subscription: updatedUser.subscription,
            createdAt: updatedUser.createdAt,
            emailVerified: updatedUser.security?.emailVerified || false
          }
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Conta reativada com sucesso! Bem-vindo de volta! 🎉',
        idToken: authResult.idToken,
        refreshToken: authResult.refreshToken,
        expiresIn: authResult.expiresIn,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          subscription: updatedUser.subscription,
          createdAt: updatedUser.createdAt,
          emailVerified: updatedUser.security?.emailVerified || false
        }
      });
    }
    
    // Gerar token de verificação de email
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    
    // Criar usuário no Firebase Auth
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      emailVerified: false
    });
    
    // Criar dados adicionais no Firestore
    const userData = {
      name,
      email: email.toLowerCase(),
      isActive: true,
      subscription: {
        plan: 'free',
        status: 'active',
        startDate: new Date(),
        planLimits: {
          plansPerMonth: 3,
          pdfExports: 1
        }
      },
      usage: {
        plansGenerated: 0,
        pdfExports: 0,
        lastPlanGenerated: null,
        currentMonthUsage: {
          plans: 0,
          pdfs: 0,
          month: new Date().getMonth(),
          year: new Date().getFullYear()
        }
      },
      security: {
        emailVerificationToken,
        emailVerified: false,
        loginAttempts: 0,
        lockUntil: null
      },
      profile: {
        firstName: '',
        lastName: '',
        phone: '',
        birthDate: null,
        gender: null,
        timezone: 'America/Sao_Paulo',
        language: 'pt-BR'
      },
      createdAt: new Date(),
      lastLogin: null
    };
    
    await firebaseUserService.createUser(firebaseUser.uid, userData);

    // Fazer login para obter idToken
    const authResult = await verifyFirebaseCredentials(email, password);

    if (!authResult.success) {
      // Caso falhe, retornar custom token como fallback
      const customToken = await createCustomToken(firebaseUser.uid);
      return res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso! Bem-vindo ao GymMind! 🎉',
        customToken,
        user: {
          id: firebaseUser.uid,
          name: userData.name,
          email: userData.email,
          subscription: userData.subscription,
          createdAt: userData.createdAt,
          emailVerified: userData.security.emailVerified
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso! Bem-vindo ao GymMind! 🎉',
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
      expiresIn: authResult.expiresIn,
      user: {
        id: firebaseUser.uid,
        name: userData.name,
        email: userData.email,
        subscription: userData.subscription,
        createdAt: userData.createdAt,
        emailVerified: userData.security.emailVerified
      }
    });
    
  } catch (error) {
    console.error('Erro no registro:', error);
    
    // Tratamento específico de erros Firebase
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        success: false,
        message: 'Email já está em uso',
        code: 'DUPLICATE_EMAIL'
      });
    }
    
    if (error.code === 'auth/weak-password') {
      return res.status(400).json({
        success: false,
        message: 'Senha muito fraca',
        code: 'WEAK_PASSWORD'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'REGISTER_ERROR'
    });
  }
});

// Helper para verificar credenciais usando Firebase Auth REST API
async function verifyFirebaseCredentials(email, password) {
  const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY;

  if (!FIREBASE_API_KEY) {
    throw new Error('FIREBASE_WEB_API_KEY não configurada');
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Credenciais inválidas');
    }

    return {
      success: true,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn
    };
  } catch (error) {
    console.error('Erro ao verificar credenciais:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// @desc    Login usuário
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória'),

  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Lembrar de mim deve ser true ou false')

], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { email, password, rememberMe = false } = req.body;

    // Buscar usuário no Firestore
    const user = await firebaseUserService.getUserByEmail(email);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se conta está bloqueada
    if (user.security?.lockUntil) {
      const lockUntil = user.security.lockUntil.toDate ? user.security.lockUntil.toDate() : new Date(user.security.lockUntil);
      if (new Date() < lockUntil) {
        return res.status(423).json({
          success: false,
          message: 'Conta temporariamente bloqueada por tentativas de login inválidas.',
          code: 'ACCOUNT_LOCKED',
          lockUntil: lockUntil
        });
      }
    }

    // Verificar credenciais no Firebase Auth usando REST API
    const authResult = await verifyFirebaseCredentials(email, password);

    if (!authResult.success) {
      // Incrementar tentativas de login
      const loginAttempts = (user.security?.loginAttempts || 0) + 1;
      const maxAttempts = 5;

      let updateData = {
        'security.loginAttempts': loginAttempts
      };

      // Bloquear conta após muitas tentativas
      if (loginAttempts >= maxAttempts) {
        updateData['security.lockUntil'] = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
      }

      await firebaseUserService.updateUser(user.id, updateData);

      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se usuário está desabilitado no Firebase Auth
    try {
      const firebaseUser = await admin.auth().getUserByEmail(email);

      if (firebaseUser.disabled) {
        return res.status(401).json({
          success: false,
          message: 'Conta desabilitada',
          code: 'ACCOUNT_DISABLED'
        });
      }
    } catch (error) {
      console.error('Erro ao verificar usuário no Firebase Auth:', error);
    }

    // Reset tentativas de login em caso de sucesso
    await firebaseUserService.updateUser(user.id, {
      'security.loginAttempts': 0,
      'security.lockUntil': null,
      lastLogin: new Date()
    });

    // Retornar o ID token do Firebase diretamente
    res.json({
      success: true,
      message: 'Login realizado com sucesso! Bem-vindo de volta! 🚀',
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
      expiresIn: authResult.expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
        usage: user.usage,
        lastLogin: new Date(),
        emailVerified: user.security?.emailVerified || false
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'LOGIN_ERROR'
    });
  }
});

// @desc    Verificar token Firebase
// @route   POST /api/auth/verify-token
// @access  Public
router.post('/verify-token', [
  body('idToken')
    .notEmpty()
    .withMessage('Token é obrigatório')
], async (req, res) => {
  try {
    const { idToken } = req.body;
    
    // Verificar token Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Buscar dados do usuário no Firestore
    const user = await firebaseUserService.getUserById(decodedToken.uid);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado ou inativo',
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      message: 'Token válido',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
        usage: user.usage,
        emailVerified: decodedToken.email_verified || false
      }
    });
    
  } catch (error) {
    console.error('Erro na verificação do token:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Token inválido',
      code: 'INVALID_TOKEN'
    });
  }
});

// @desc    Obter perfil do usuário
// @route   GET /api/auth/profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await firebaseUserService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Remover dados sensíveis
    const { security, ...userProfile } = user;
    const safeUser = {
      ...userProfile,
      emailVerified: security?.emailVerified || false
    };
    
    res.json({
      success: true,
      user: safeUser
    });
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'PROFILE_ERROR'
    });
  }
});

// @desc    Atualizar perfil do usuário
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', auth, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome deve ter entre 2 e 100 caracteres'),
  
  body('profile.firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Nome inválido'),
    
  body('profile.lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Sobrenome inválido'),
    
  body('profile.phone')
    .optional()
    .isMobilePhone('pt-BR')
    .withMessage('Telefone inválido'),
    
  body('profile.birthDate')
    .optional()
    .isISO8601()
    .withMessage('Data de nascimento inválida'),
    
  body('profile.gender')
    .optional()
    .isIn(['masculino', 'feminino', 'outro'])
    .withMessage('Gênero inválido')
    
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }
    
    const allowedFields = [
      'name', 
      'profile.firstName', 
      'profile.lastName', 
      'profile.phone',
      'profile.birthDate',
      'profile.gender',
      'profile.timezone',
      'profile.language'
    ];
    
    const updates = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    const updatedUser = await firebaseUserService.updateUser(req.user.id, updates);
    
    // Atualizar displayName no Firebase Auth se o nome foi alterado
    if (updates.name) {
      await admin.auth().updateUser(req.user.id, {
        displayName: updates.name
      });
    }
    
    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso! ✅',
      user: updatedUser
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'UPDATE_ERROR'
    });
  }
});

// @desc    Verificar se pode gerar plano
// @route   GET /api/auth/can-generate
// @access  Private
router.get('/can-generate', auth, async (req, res) => {
  try {
    const user = await firebaseUserService.getUserById(req.user.id);
    const canGenerate = firebaseUserService.canGeneratePlan(user);
    
    res.json({
      success: true,
      ...canGenerate,
      subscription: user.subscription,
      usage: user.usage
    });
  } catch (error) {
    console.error('Erro ao verificar limite:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
});

// @desc    Logout usuário
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Com Firebase, o logout é feito no frontend
    // Mas podemos revogar tokens se necessário
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Alterar senha
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', auth, [
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('Nova senha deve ter entre 8 e 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Nova senha deve conter pelo menos: 1 minúscula, 1 maiúscula e 1 número')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }
    
    const { newPassword } = req.body;
    
    // Atualizar senha no Firebase Auth
    await admin.auth().updateUser(req.user.id, {
      password: newPassword
    });
    
    res.json({
      success: true,
      message: 'Senha alterada com sucesso! 🔒'
    });
    
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Desativar conta do usuário
// @route   DELETE /api/auth/deactivate
// @access  Private
router.delete('/deactivate', auth, [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Motivo muito longo')
], async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Desativar no Firestore
    await firebaseUserService.updateUser(req.user.id, {
      isActive: false,
      deactivatedAt: new Date(),
      deactivationReason: reason
    });
    
    // Desabilitar no Firebase Auth
    await admin.auth().updateUser(req.user.id, {
      disabled: true
    });
    
    res.json({
      success: true,
      message: 'Conta desativada com sucesso. Sentiremos sua falta! 😢'
    });
    
  } catch (error) {
    console.error('Erro ao desativar conta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;