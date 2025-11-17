const express = require('express');
const { body, validationResult } = require('express-validator');
const { admin, db, FieldValue } = require('../config/firebase');
const { firebaseUserService } = require('../services/firebaseUserService');
const { auth, requirePlan } = require('../middleware/firebaseAuth');

const router = express.Router();

// Collections Firebase
const subscriptionsCollection = db.collection('subscriptions');
const transactionsCollection = db.collection('transactions');

// Planos disponíveis
const PLANS = {
  free: {
    name: 'Plano Gratuito',
    price: 0,
    currency: 'brl',
    interval: 'month',
    features: ['3 planos de dieta por mês', '1 export PDF', 'Suporte básico'],
    limits: {
      plansPerMonth: 3,
      pdfExports: 1
    }
  },
  basic: {
    name: 'Dieta Personalizada',
    price: 999,
    currency: 'brl',
    interval: 'month',
    features: ['10 planos por mês', '5 exports PDF', 'Suporte por email'],
    limits: {
      plansPerMonth: 10,
      pdfExports: 5
    }
  },
  premium: {
    name: 'Dieta + Treino',
    price: 1499,
    currency: 'brl',
    interval: 'month',
    features: ['Planos ilimitados', 'PDF ilimitado', 'Suporte prioritário', 'Treinos personalizados'],
    limits: {
      plansPerMonth: -1,
      pdfExports: -1
    }
  },
  pro: {
    name: 'Acompanhamento Nutricionista',
    price: 1999,
    currency: 'brl',
    interval: 'month',
    features: ['Tudo do Premium', 'Acompanhamento nutricional', 'Consultas por WhatsApp', 'Ajustes personalizados'],
    limits: {
      plansPerMonth: -1,
      pdfExports: -1
    }
  }
};

// @desc    Listar planos disponíveis
// @route   GET /api/payment/plans
// @access  Public
router.get('/plans', (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Planos disponíveis',
      data: PLANS
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Criar checkout session
// @route   POST /api/payment/create-checkout
// @access  Private
router.post('/create-checkout', auth, [
  body('planId')
    .isIn(Object.keys(PLANS))
    .withMessage('Plano inválido')
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

    const { planId } = req.body;
    const userId = req.user.id;
    const plan = PLANS[planId];

    // Verificar se não é downgrade inválido
    const currentPlan = req.user.subscription?.plan || 'free';
    const planHierarchy = { free: 0, basic: 1, premium: 2, pro: 3 };
    
    if (planHierarchy[planId] < planHierarchy[currentPlan]) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível fazer downgrade direto. Entre em contato com o suporte.',
        code: 'INVALID_DOWNGRADE'
      });
    }

    // Mock checkout session (em produção usar Stripe real)
    const mockSession = {
      id: 'cs_mock_' + Date.now(),
      url: `https://mock-checkout.stripe.com/${planId}`,
      planId: planId,
      planName: plan.name,
      amount: plan.price,
      userId: userId,
      createdAt: new Date().toISOString(),
      mode: 'subscription'
    };

    // Salvar sessão pendente no Firebase
    await db.collection('checkoutSessions').doc(mockSession.id).set({
      userId,
      planId,
      sessionData: mockSession,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Checkout criado com sucesso',
      data: mockSession,
      isDevelopment: process.env.NODE_ENV === 'development'
    });

  } catch (error) {
    console.error('Erro ao criar checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar pagamento'
    });
  }
});

// @desc    Webhook do Stripe (simulado)
// @route   POST /api/payment/webhook
// @access  Public
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    console.log('Webhook recebido:', { type, sessionId: data?.object?.id });
    
    if (type === 'checkout.session.completed') {
      const sessionId = data.object.id;
      
      // Buscar sessão no Firebase
      const sessionDoc = await db.collection('checkoutSessions').doc(sessionId).get();
      
      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data();
        const { userId, planId } = sessionData;
        
        // Atualizar assinatura do usuário
        await firebaseUserService.updateUser(userId, {
          'subscription.plan': planId,
          'subscription.status': 'active',
          'subscription.startDate': FieldValue.serverTimestamp(),
          'subscription.planLimits': PLANS[planId].limits,
          'subscription.stripeSubscriptionId': data.object.subscription
        });
        
        // Registrar transação
        await transactionsCollection.add({
          userId,
          planId,
          amount: PLANS[planId].price,
          currency: 'brl',
          status: 'completed',
          stripeSessionId: sessionId,
          type: 'subscription',
          createdAt: FieldValue.serverTimestamp()
        });
        
        // Marcar sessão como processada
        await db.collection('checkoutSessions').doc(sessionId).update({
          status: 'completed',
          processedAt: FieldValue.serverTimestamp()
        });
        
        console.log(`Assinatura ativada para usuário ${userId}, plano ${planId}`);
      }
    }
    
    res.json({
      success: true,
      received: true,
      message: 'Webhook processado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook'
    });
  }
});

// @desc    Status da assinatura do usuário
// @route   GET /api/payment/subscription-status
// @access  Private
router.get('/subscription-status', auth, async (req, res) => {
  try {
    const user = req.user;
    const subscription = user.subscription || {};
    
    const currentPlan = PLANS[subscription.plan] || PLANS.free;
    
    const subscriptionStatus = {
      plan: subscription.plan || 'free',
      planName: currentPlan.name,
      status: subscription.status || 'active',
      price: currentPlan.price,
      currency: currentPlan.currency,
      features: currentPlan.features,
      limits: currentPlan.limits,
      startDate: subscription.startDate?.toDate?.() || null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toDate?.() || null,
      usage: user.usage || {},
      canGenerate: firebaseUserService.canGeneratePlan(user)
    };

    res.json({
      success: true,
      message: 'Status da assinatura',
      data: subscriptionStatus
    });
    
  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Cancelar assinatura
// @route   POST /api/payment/cancel-subscription
// @access  Private
router.post('/cancel-subscription', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;
    
    // Atualizar status da assinatura
    await firebaseUserService.updateUser(userId, {
      'subscription.status': 'cancelled',
      'subscription.cancelledAt': FieldValue.serverTimestamp(),
      'subscription.cancellationReason': reason || 'User requested'
    });
    
    // Registrar cancelamento
    await transactionsCollection.add({
      userId,
      type: 'cancellation',
      reason: reason || 'User requested',
      previousPlan: req.user.subscription?.plan || 'free',
      createdAt: FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Assinatura cancelada com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao cancelar assinatura'
    });
  }
});

// @desc    Simular pagamento (desenvolvimento)
// @route   POST /api/payment/simulate-payment
// @access  Private
router.post('/simulate-payment', auth, [
  body('planId')
    .isIn(Object.keys(PLANS))
    .withMessage('Plano inválido'),
  body('action')
    .optional()
    .isIn(['success', 'fail'])
    .withMessage('Ação deve ser success ou fail')
], async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Simulação não disponível em produção'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }
    
    const { planId, action = 'success' } = req.body;
    const userId = req.user.id;
    const plan = PLANS[planId];
    
    if (action === 'fail') {
      return res.json({
        success: false,
        message: 'Pagamento simulado como falha',
        data: {
          status: 'failed',
          error: 'Cartão recusado'
        }
      });
    }
    
    // Simular pagamento bem-sucedido
    await firebaseUserService.updateUser(userId, {
      'subscription.plan': planId,
      'subscription.status': 'active',
      'subscription.startDate': FieldValue.serverTimestamp(),
      'subscription.planLimits': plan.limits
    });
    
    // Registrar transação simulada
    const transactionData = {
      userId,
      planId,
      amount: plan.price,
      currency: plan.currency,
      status: 'completed',
      type: 'simulation',
      simulationMode: true,
      createdAt: FieldValue.serverTimestamp()
    };
    
    const transactionRef = await transactionsCollection.add(transactionData);
    
    const result = {
      success: true,
      message: `Pagamento simulado com sucesso para o plano ${plan.name}`,
      data: {
        transactionId: transactionRef.id,
        planId: planId,
        planName: plan.name,
        amount: plan.price,
        currency: plan.currency,
        status: 'succeeded',
        timestamp: new Date().toISOString(),
        simulationMode: true
      }
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Erro na simulação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro na simulação de pagamento'
    });
  }
});

// @desc    Histórico de transações
// @route   GET /api/payment/transactions
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;
    
    const snapshot = await transactionsCollection
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .get();
    
    const transactions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date()
      });
    });
    
    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
    
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Health check
// @route   GET /api/payment/health
// @access  Public
router.get('/health', async (req, res) => {
  try {
    // Testar conexão Firebase
    let firebaseStatus = 'Desconectado';
    try {
      await db.collection('_health').doc('payment').set({ 
        timestamp: FieldValue.serverTimestamp() 
      });
      firebaseStatus = 'Conectado';
    } catch (error) {
      firebaseStatus = 'Erro: ' + error.message;
    }

    res.json({
      success: true,
      message: 'Serviço de pagamento funcionando com Firebase',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'Firebase Firestore',
      status: firebaseStatus,
      features: {
        firebaseIntegration: true,
        stripeIntegration: false,
        mockPayments: process.env.NODE_ENV === 'development',
        webhooks: true
      },
      endpoints: [
        'GET /plans - Listar planos disponíveis',
        'POST /create-checkout - Criar sessão de checkout',
        'POST /webhook - Webhook do Stripe',
        'GET /subscription-status - Status da assinatura',
        'POST /cancel-subscription - Cancelar assinatura',
        'POST /simulate-payment - Simular pagamento (dev)',
        'GET /transactions - Histórico de transações'
      ],
      plans: {
        available: Object.keys(PLANS),
        count: Object.keys(PLANS).length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro no health check',
      error: error.message
    });
  }
});

module.exports = router;