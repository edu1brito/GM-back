const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import Firebase configuration (deve ser primeiro!)
require('./config/firebase');
const { admin, db } = require('./config/firebase');

// Import services COM TRY/CATCH para debug
let aiService;
let pdfService;
let firebaseUserService;

try {
  aiService = require('./services/aiService');
  console.log('✅ aiService importado:', typeof aiService);
  console.log('✅ generatePlan:', typeof aiService.generatePlan);
} catch (error) {
  console.error('❌ Erro ao importar aiService:', error.message);
  process.exit(1);
}

try {
  pdfService = require('./services/pdfService');
  console.log('✅ pdfService importado:', typeof pdfService);
} catch (error) {
  console.error('❌ Erro ao importar pdfService:', error.message);
  process.exit(1);
}

try {
  firebaseUserService = require('./services/firebaseUserService');
  console.log('✅ firebaseUserService importado:', typeof firebaseUserService);
} catch (error) {
  console.error('❌ Erro ao importar firebaseUserService:', error.message);
  process.exit(1);
}

// Import routes (agora com Firebase)
const authRoutes = require('./routes/auth');
const preferencesRoutes = require('./routes/preferences'); 
const plansRoutes = require('./routes/plans');
const paymentRoutes = require('./routes/payment');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ====================================
// MIDDLEWARES DE SEGURANÇA
// ====================================

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Muitas tentativas. Tente novamente em 15 minutos.'
  }
});

// Rate limiting para geração de dietas (mais restritivo)
const dietLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // máximo 10 gerações por hora por IP
  message: {
    error: 'Muitas gerações de dieta. Tente novamente em 1 hora.'
  }
});

// Rate limiting para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
  }
});

// Aplicar middlewares
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(cors({
  origin: process.env.FRONTEND_URL ? 
    process.env.FRONTEND_URL.split(',') : 
    [
      'http://localhost:3000', 
      'http://127.0.0.1:5500', 
      'http://localhost:5500', 
      'http://localhost:8000',
      'http://127.0.0.1:5501',
      'http://localhost:5501'
    ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  maxAge: 86400 // 24 horas
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// Servir arquivos estáticos (PDFs)
app.use('/api/files', express.static(path.join(__dirname, 'uploads')));

// Disponibilizar Firebase para as rotas (compatibilidade)
app.locals.db = db;
app.locals.admin = admin;

// ====================================
// ROTAS PRINCIPAIS DO SISTEMA
// ====================================

// Rota para gerar dieta completa (CORRIGIDA)
app.post('/api/generate-diet', dietLimiter, async (req, res) => {
  try {
    console.log('📨 Recebendo dados para geração de dieta...');
    
    // VERIFICAÇÃO EXTRA DO aiService
    if (!aiService || typeof aiService.generatePlan !== 'function') {
      console.error('❌ aiService não está disponível ou generatePlan não é uma função');
      console.log('aiService:', aiService);
      console.log('generatePlan type:', typeof aiService?.generatePlan);
      
      return res.status(500).json({
        success: false,
        error: 'Serviço de IA não está disponível',
        details: 'aiService.generatePlan não é uma função'
      });
    }
    
    const userData = req.body;
    
    // Validar dados essenciais
    if (!userData || typeof userData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Dados do usuário são obrigatórios'
      });
    }

    if (!userData.personal || !userData.meals || !userData.gender) {
      return res.status(400).json({
        success: false,
        error: 'Dados insuficientes para gerar dieta',
        missing: {
          personal: !userData.personal,
          meals: !userData.meals,
          gender: !userData.gender
        }
      });
    }

    console.log('🤖 Gerando dieta com IA...');
    console.log('Usando aiService:', typeof aiService);
    console.log('Método generatePlan:', typeof aiService.generatePlan);
    
    // Gerar plano com IA - COM VERIFICAÇÃO EXTRA
    const generatedPlan = await aiService.generatePlan(userData);
    
    console.log('📄 Gerando PDF...');
    // Gerar PDF
    const pdfInfo = await pdfService.generatePDF(generatedPlan, userData);
    
    // Salvar no Firebase usando o novo service
    if (db) {
      try {
        await db.collection('dietPlans').add({
          userId: userData.userId || 'anonymous-' + Date.now(),
          userData,
          dietPlan: generatedPlan.content,
          pdfInfo,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('💾 Plano salvo no Firebase');
        
        // Se for usuário autenticado, incrementar uso
        if (userData.userId && firebaseUserService && typeof firebaseUserService.incrementPlanUsage === 'function') {
          await firebaseUserService.incrementPlanUsage(userData.userId);
          console.log('📊 Uso incrementado para usuário:', userData.userId);
        }
      } catch (saveError) {
        console.log('⚠️ Erro ao salvar no Firebase:', saveError.message);
      }
    }
    
    console.log('✅ Dieta gerada com sucesso!');
    
    // Retornar resposta completa
    res.json({
      success: true,
      data: {
        dietPlan: generatedPlan.content,
        pdf: {
          filename: pdfInfo.filename,
          downloadUrl: pdfInfo.url,
          size: pdfInfo.size
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          tokens: generatedPlan.metadata?.tokens || 0,
          model: generatedPlan.metadata?.model || 'unknown'
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao gerar dieta:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor ao gerar dieta',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Entre em contato com o suporte'
    });
  }
});

// Rota para simular pagamento e gerar dieta (CORRIGIDA)
app.post('/api/process-payment', async (req, res) => {
  try {
    const { userData, planType } = req.body;
    
    console.log('💳 Processando pagamento simulado...');
    console.log('Plano selecionado:', planType);
    
    // Validar dados
    if (!userData || !planType) {
      return res.status(400).json({
        success: false,
        paymentApproved: false,
        error: 'Dados do usuário e tipo de plano são obrigatórios'
      });
    }
    
    // VERIFICAÇÃO DO aiService
    if (!aiService || typeof aiService.generatePlan !== 'function') {
      return res.status(500).json({
        success: false,
        paymentApproved: false,
        error: 'Serviço de IA não está disponível'
      });
    }
    
    // Simular processamento de pagamento
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Gerar dieta após "pagamento aprovado"
    console.log('🤖 Gerando dieta após pagamento...');
    const generatedPlan = await aiService.generatePlan(userData);
    const pdfInfo = await pdfService.generatePDF(generatedPlan, userData);
    
    // Salvar transação no Firebase
    if (db) {
      try {
        const transactionData = {
          userId: userData.userId || 'anonymous-' + Date.now(),
          planType,
          userData,
          dietPlan: generatedPlan.content,
          pdfInfo,
          paymentStatus: 'approved',
          amount: getPlanPrice(planType),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('transactions').add(transactionData);
        console.log('💾 Transação salva no Firebase');
        
        // Se for usuário autenticado, incrementar uso
        if (userData.userId && firebaseUserService && typeof firebaseUserService.incrementPlanUsage === 'function') {
          await firebaseUserService.incrementPlanUsage(userData.userId);
        }
      } catch (saveError) {
        console.log('⚠️ Erro ao salvar transação:', saveError.message);
      }
    }
    
    res.json({
      success: true,
      paymentApproved: true,
      data: {
        dietPlan: generatedPlan.content,
        pdf: {
          filename: pdfInfo.filename,
          downloadUrl: pdfInfo.url,
          size: pdfInfo.size
        },
        planType: planType,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    res.status(500).json({
      success: false,
      paymentApproved: false,
      error: 'Erro ao processar pagamento',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Tente novamente'
    });
  }
});

// Rota para buscar dietas do usuário autenticado
app.get('/api/my-diets', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação necessário'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verificar token Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    
    if (!db) {
      return res.json({
        success: true,
        message: 'Firebase não configurado',
        data: []
      });
    }

    const snapshot = await db.collection('dietPlans')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const diets = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      diets.push({
        id: doc.id,
        planType: data.planType || 'custom',
        createdAt: data.createdAt?.toDate?.() || new Date(),
        pdfInfo: data.pdfInfo,
        hasContent: !!data.dietPlan
      });
    });

    res.json({
      success: true,
      data: diets,
      count: diets.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar dietas do usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar suas dietas'
    });
  }
});

// Rota para testar IA (CORRIGIDA)
app.post('/api/test-ai', async (req, res) => {
  try {
    // VERIFICAÇÃO DO aiService
    if (!aiService || typeof aiService.generatePlan !== 'function') {
      return res.status(500).json({
        success: false,
        error: 'aiService não está disponível',
        debug: {
          aiService: typeof aiService,
          generatePlan: typeof aiService?.generatePlan,
          methods: aiService ? Object.getOwnPropertyNames(aiService) : 'aiService is null'
        }
      });
    }
    
    const testData = {
      personal: {
        nome: "João Silva",
        peso: "70",
        altura: "175", 
        idade: "25",
        objetivo: "emagrecer",
        calorias: "2000",
        horarios: "07:30,10:30,12:00,15:00,19:00"
      },
      gender: "masculino",
      training: {
        rotina: "moderado",
        local: "academia",
        experiencia: 6,
        preferencias: ["musculacao", "cardio"]
      },
      meals: {
        cafe: ["🥣 Tapioca + Frango", "🍎 Fruta", "☕ Café Preto"],
        "lanche-manha": ["🥛 Whey", "🍌 Banana"],
        almoco: ["🍗 Frango", "🍚 Arroz", "🫘 Feijão", "🥗 Salada"],
        "lanche-tarde": ["🥤 Whey", "🍌 Fruta"],
        jantar: ["🐟 Salmão", "🥗 Salada Completa", "🥕 Legumes Refogados"]
      }
    };

    console.log('🧪 Testando IA com dados de exemplo...');
    const result = await aiService.generatePlan(testData);
    
    res.json({
      success: true,
      testResult: result.content,
      metadata: result.metadata,
      message: 'IA funcionando corretamente!'
    });

  } catch (error) {
    console.error('❌ Erro no teste de IA:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Verifique se as chaves de API estão configuradas no .env',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ====================================
// ROTAS EXISTENTES (FIREBASE)
// ====================================
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/payment', paymentRoutes);

// Rota de saúde
app.get('/api/health', async (req, res) => {
  const firebaseStatus = db ? 'Conectado' : 'Não configurado';
  
  // Testar conexão com Firebase
  let dbTest = 'Não testado';
  if (db) {
    try {
      await db.collection('_health').doc('test').set({ 
        timestamp: admin.firestore.FieldValue.serverTimestamp() 
      });
      dbTest = 'Funcionando';
    } catch (error) {
      dbTest = 'Erro: ' + error.message;
    }
  }
  
  res.json({
    success: true,
    message: 'GymMind Backend está funcionando! 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: firebaseStatus,
    databaseTest: dbTest,
    services: {
      ai: process.env.OPENAI_API_KEY ? 'Configurado' : 'Não configurado',
      anthropic: process.env.ANTHROPIC_API_KEY ? 'Configurado' : 'Não configurado',
      firebase: firebaseStatus,
      firebaseUserService: firebaseUserService ? 'Disponível' : 'Não disponível',
      pdf: 'Disponível',
      aiService: aiService && typeof aiService.generatePlan === 'function' ? 'Funcionando' : 'Com problemas'
    },
    port: process.env.PORT || 5000,
    uptime: process.uptime()
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bem-vindo ao GymMind API! 🏋️‍♂️',
    version: '1.0.0',
    database: 'Firebase Firestore',
    authentication: 'Firebase Auth',
    endpoints: {
      health: '/api/health',
      generateDiet: '/api/generate-diet (POST)',
      processPayment: '/api/process-payment (POST)',
      myDiets: '/api/my-diets (GET) - Autenticado',
      testAI: '/api/test-ai (POST)',
      files: '/api/files/*',
      auth: '/api/auth/*',
      preferences: '/api/preferences/*',
      plans: '/api/plans/*',
      payment: '/api/payment/*'
    }
  });
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// ====================================
// FUNÇÕES AUXILIARES
// ====================================

function getPlanPrice(planType) {
  const prices = {
    'emagrecimento': 9.99,
    'dieta-treino': 14.99,
    'nutricionista': 19.99,
    'emagrecer-massa': 10.99,
    'ganho-massa': 15.99,
    'definicao-massa': 16.99
  };
  return prices[planType] || 0;
}

// ====================================
// INICIALIZAR SERVIDOR
// ====================================
const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('🚀  GYMMIND BACKEND INICIADO!');
  console.log('🚀 ================================');
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 URL: http://localhost:${PORT}`);
  console.log(`🔍 Health: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Teste IA: http://localhost:${PORT}/api/test-ai`);
  console.log(`🔥 Database: Firebase Firestore`);
  console.log(`🔐 Auth: Firebase Authentication`);
  console.log('🚀 ================================');
  console.log('');
  console.log('📋 ENDPOINTS PRINCIPAIS:');
  console.log('   POST /api/generate-diet - Gerar dieta completa');
  console.log('   POST /api/process-payment - Simular pagamento');
  console.log('   GET  /api/my-diets - Dietas do usuário autenticado');
  console.log('   POST /api/test-ai - Testar IA');
  console.log('   GET  /api/files/pdfs/* - Download PDFs');
  console.log('   GET  /api/health - Status do servidor');
  console.log('');
  console.log('🔐 AUTENTICAÇÃO:');
  console.log('   POST /api/auth/register - Registro');
  console.log('   POST /api/auth/login - Login');
  console.log('   POST /api/auth/verify-token - Verificar token');
  console.log('   GET  /api/auth/profile - Perfil do usuário');
  console.log('');
});

// Tratamento de erro da porta
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('❌ ================================');
    console.error(`❌  PORTA ${PORT} JÁ ESTÁ EM USO!`);
    console.error('❌ ================================');
    console.error('💡 Soluções:');
    console.error(`   1. Mude a porta no .env: PORT=3001`);
    console.error(`   2. Mate o processo: netstat -ano | findstr :${PORT}`);
    console.error(`   3. Use outra porta: PORT=3001 npm run dev`);
    console.error('❌ ================================');
    console.error('');
    process.exit(1);
  } else {
    console.error('Erro no servidor:', err);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Desligando servidor...');
  server.close(() => {
    console.log('✅ Servidor desligado com sucesso');
    process.exit(0);
  });
});

// Log de inicialização dos serviços
setTimeout(async () => {
  console.log('🔧 Verificando configurações...');
  console.log(`   OpenAI: ${process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   Firebase: ${db ? '✅ Conectado' : '❌ Não configurado'}`);
  console.log(`   Firebase User Service: ${firebaseUserService ? '✅ Disponível' : '❌ Não disponível'}`);
  console.log(`   AI Service: ${aiService && typeof aiService.generatePlan === 'function' ? '✅ Funcionando' : '❌ Com problemas'}`);
  
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️ ATENÇÃO: Configure pelo menos uma chave de IA no .env');
  }
  if (!db) {
    console.log('⚠️ ATENÇÃO: Configure Firebase para salvar dados');
  }
  if (!aiService || typeof aiService.generatePlan !== 'function') {
    console.log('⚠️ ATENÇÃO: aiService não está funcionando corretamente');
  }
  console.log('');
}, 1000);


module.exports = app;
