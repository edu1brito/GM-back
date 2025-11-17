const express = require('express');
const { body, validationResult } = require('express-validator');
const { admin, db, FieldValue } = require('../config/firebase');
const { firebaseUserService } = require('../services/firebaseUserService');
const { auth } = require('../middleware/firebaseAuth');

const router = express.Router();

// Collection Firebase
const preferencesCollection = db.collection('userPreferences');

// Middleware de validação
const validatePreferences = [
  body('personal.weight')
    .isFloat({ min: 30, max: 300 })
    .withMessage('Peso deve estar entre 30 e 300 kg'),
  body('personal.height')
    .isFloat({ min: 100, max: 250 })
    .withMessage('Altura deve estar entre 100 e 250 cm'),
  body('personal.age')
    .isInt({ min: 13, max: 100 })
    .withMessage('Idade deve estar entre 13 e 100 anos'),
  body('personal.gender')
    .isIn(['masculino', 'feminino'])
    .withMessage('Gênero deve ser "masculino" ou "feminino"')
];

// @desc    Salvar preferências do usuário
// @route   POST /api/preferences
// @access  Private
router.post('/', auth, validatePreferences, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const preferenceData = {
      userId,
      ...req.body,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // Salvar no Firestore usando o UID como ID do documento
    await preferencesCollection.doc(userId).set(preferenceData);
    
    // Buscar o documento criado
    const savedDoc = await preferencesCollection.doc(userId).get();
    const savedData = { id: savedDoc.id, ...savedDoc.data() };
    
    console.log(`Preferências salvas para usuário ${userId}`);
    
    res.status(201).json({
      success: true,
      message: 'Preferências salvas com sucesso',
      data: savedData
    });
    
  } catch (error) {
    console.error('Erro ao salvar preferências:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// @desc    Obter preferências do usuário
// @route   GET /api/preferences
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await preferencesCollection.doc(userId).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Preferências não encontradas'
      });
    }
    
    const preferences = { id: doc.id, ...doc.data() };
    
    // Converter timestamps
    if (preferences.createdAt && preferences.createdAt.toDate) {
      preferences.createdAt = preferences.createdAt.toDate();
    }
    if (preferences.updatedAt && preferences.updatedAt.toDate) {
      preferences.updatedAt = preferences.updatedAt.toDate();
    }
    
    res.json({
      success: true,
      message: 'Preferências encontradas',
      data: preferences
    });
    
  } catch (error) {
    console.error('Erro ao obter preferências:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Atualizar preferências do usuário
// @route   PUT /api/preferences
// @access  Private
router.put('/', auth, validatePreferences, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    
    // Verificar se existem preferências
    const doc = await preferencesCollection.doc(userId).get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Preferências não encontradas'
      });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // Atualizar documento
    await preferencesCollection.doc(userId).update(updateData);
    
    // Buscar documento atualizado
    const updatedDoc = await preferencesCollection.doc(userId).get();
    const updatedData = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.json({
      success: true,
      message: 'Preferências atualizadas com sucesso',
      data: updatedData
    });
    
  } catch (error) {
    console.error('Erro ao atualizar preferências:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Deletar preferências do usuário
// @route   DELETE /api/preferences
// @access  Private
router.delete('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Verificar se existem preferências
    const doc = await preferencesCollection.doc(userId).get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Preferências não encontradas'
      });
    }
    
    // Deletar documento
    await preferencesCollection.doc(userId).delete();
    
    res.json({
      success: true,
      message: 'Preferências deletadas com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao deletar preferências:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Calcular dados nutricionais
// @route   POST /api/preferences/calculate
// @access  Public
router.post('/calculate', [
  body('weight')
    .isFloat({ min: 30, max: 300 })
    .withMessage('Peso deve estar entre 30 e 300 kg'),
  body('height')
    .isFloat({ min: 100, max: 250 })
    .withMessage('Altura deve estar entre 100 e 250 cm'),
  body('age')
    .isInt({ min: 13, max: 100 })
    .withMessage('Idade deve estar entre 13 e 100 anos'),
  body('gender')
    .isIn(['masculino', 'feminino'])
    .withMessage('Gênero deve ser "masculino" ou "feminino"'),
  body('goal')
    .optional()
    .isIn(['emagrecer', 'emagrecer-massa', 'definicao-massa', 'ganhar-massa', 'manutencao'])
    .withMessage('Objetivo inválido')
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

    const { weight, height, age, gender, goal = 'manutencao' } = req.body;
    
    // Calcular TMB usando Harris-Benedict
    let bmr;
    if (gender === 'masculino') {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }
    
    // Calcular TDEE (assumindo atividade moderada)
    const tdee = bmr * 1.55;
    
    // Ajustar calorias baseado no objetivo
    let targetCalories = tdee;
    
    switch(goal) {
      case 'emagrecer':
        targetCalories = tdee - 500;
        break;
      case 'emagrecer-massa':
        targetCalories = tdee - 300;
        break;
      case 'definicao-massa':
        targetCalories = tdee;
        break;
      case 'ganhar-massa':
        targetCalories = tdee + 300;
        break;
      case 'manutencao':
        targetCalories = tdee;
        break;
    }
    
    // Calcular macronutrientes
    const macros = {
      protein: Math.round((targetCalories * 0.30) / 4), // 30% das calorias, 4 kcal/g
      carbs: Math.round((targetCalories * 0.40) / 4),   // 40% das calorias, 4 kcal/g
      fats: Math.round((targetCalories * 0.30) / 9)     // 30% das calorias, 9 kcal/g
    };
    
    // Distribuição por refeição
    const mealDistribution = {
      'cafe-manha': Math.round(targetCalories * 0.25),      // 25%
      'lanche-manha': Math.round(targetCalories * 0.10),    // 10%
      'almoco': Math.round(targetCalories * 0.35),          // 35%
      'lanche-tarde': Math.round(targetCalories * 0.10),    // 10%
      'jantar': Math.round(targetCalories * 0.20)           // 20%
    };
    
    const calculatedData = {
      personal: { weight, height, age, gender },
      goal,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      macros,
      mealDistribution,
      waterIntake: Math.round(weight * 35), // ml por dia
      calculatedAt: new Date().toISOString(),
      recommendations: getHealthyRecommendations(goal, age, gender)
    };
    
    // Salvar cálculo se usuário estiver autenticado
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        await db.collection('calculations').add({
          userId: decodedToken.uid,
          calculationData: calculatedData,
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (authError) {
        console.log('Usuário não autenticado, cálculo não salvo');
      }
    }
    
    res.json({
      success: true,
      message: 'Cálculos realizados com sucesso',
      data: calculatedData
    });
    
  } catch (error) {
    console.error('Erro ao calcular dados nutricionais:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// @desc    Gerar plano de dieta
// @route   POST /api/preferences/generate-diet
// @access  Public
router.post('/generate-diet', [
  body('preferences')
    .isObject()
    .withMessage('Preferências são obrigatórias'),
  body('targetCalories')
    .isInt({ min: 800, max: 5000 })
    .withMessage('Calorias alvo devem estar entre 800 e 5000')
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

    const { preferences, targetCalories } = req.body;
    
    // Distribuição de calorias por refeição
    const mealDistribution = {
      'cafe': 0.25,
      'lanche-manha': 0.15,
      'almoco': 0.35,
      'lanche-tarde': 0.15,
      'jantar': 0.30
    };
    
    const mealPlan = {};
    
    // Gerar plano para cada refeição
    for (const [mealType, percentage] of Object.entries(mealDistribution)) {
      const mealCalories = Math.round(targetCalories * percentage);
      
      mealPlan[mealType] = {
        name: getMealName(mealType),
        calories: mealCalories,
        foods: preferences[mealType] || [],
        suggestions: getMealSuggestions(mealType, mealCalories),
        macros: calculateMealMacros(mealCalories, mealType)
      };
    }
    
    const dietPlan = {
      totalCalories: targetCalories,
      mealPlan,
      generatedAt: new Date().toISOString(),
      nutritionalGuidelines: getNutritionalGuidelines()
    };
    
    // Salvar plano se usuário estiver autenticado
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        await db.collection('generatedDiets').add({
          userId: decodedToken.uid,
          dietPlan,
          preferences,
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (authError) {
        console.log('Usuário não autenticado, plano não salvo');
      }
    }
    
    res.json({
      success: true,
      message: 'Plano de dieta gerado com sucesso',
      data: dietPlan
    });
    
  } catch (error) {
    console.error('Erro ao gerar plano de dieta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Obter histórico de cálculos do usuário
// @route   GET /api/preferences/calculations
// @access  Private
router.get('/calculations', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    
    const snapshot = await db.collection('calculations')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const calculations = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      calculations.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date()
      });
    });
    
    res.json({
      success: true,
      data: calculations,
      count: calculations.length
    });
    
  } catch (error) {
    console.error('Erro ao buscar cálculos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Funções auxiliares
function getMealName(mealType) {
  const names = {
    'cafe': 'Café da Manhã',
    'lanche-manha': 'Lanche da Manhã',
    'almoco': 'Almoço',
    'lanche-tarde': 'Lanche da Tarde',
    'jantar': 'Jantar'
  };
  return names[mealType] || mealType;
}

function getMealSuggestions(mealType, calories) {
  const suggestions = {
    'cafe': [
      `${Math.round(calories * 0.3)} kcal - Proteína: ovos, iogurte ou whey`,
      `${Math.round(calories * 0.4)} kcal - Carboidrato: pães integrais, tapioca ou frutas`,
      `${Math.round(calories * 0.3)} kcal - Gordura saudável: castanhas, abacate`,
      'Hidratação: água, café ou chá (sem açúcar)'
    ],
    'lanche-manha': [
      `${Math.round(calories * 0.4)} kcal - Fruta ou whey protein`,
      `${Math.round(calories * 0.6)} kcal - Castanhas ou iogurte natural`,
      'Opção: biscoitos integrais com moderação'
    ],
    'almoco': [
      `${Math.round(calories * 0.35)} kcal - Proteína: 150-200g de carne magra ou peixe`,
      `${Math.round(calories * 0.40)} kcal - Carboidrato: arroz integral, batata doce`,
      `${Math.round(calories * 0.15)} kcal - Leguminosa: feijão, lentilha`,
      `${Math.round(calories * 0.10)} kcal - Vegetais: salada variada`
    ],
    'lanche-tarde': [
      `${Math.round(calories * 0.4)} kcal - Fruta ou pão integral`,
      `${Math.round(calories * 0.6)} kcal - Proteína: queijo branco, ovo`,
      'Hidratação adequada'
    ],
    'jantar': [
      `${Math.round(calories * 0.4)} kcal - Proteína magra: 120-150g`,
      `${Math.round(calories * 0.3)} kcal - Carboidrato: batata doce, quinoa`,
      `${Math.round(calories * 0.3)} kcal - Vegetais: salada e legumes refogados`
    ]
  };
  
  return suggestions[mealType] || [`${calories} kcal - Refeição balanceada`];
}

function calculateMealMacros(calories, mealType) {
  const macroDistribution = {
    'cafe': { protein: 0.25, carbs: 0.50, fats: 0.25 },
    'lanche-manha': { protein: 0.30, carbs: 0.45, fats: 0.25 },
    'almoco': { protein: 0.30, carbs: 0.45, fats: 0.25 },
    'lanche-tarde': { protein: 0.35, carbs: 0.40, fats: 0.25 },
    'jantar': { protein: 0.40, carbs: 0.30, fats: 0.30 }
  };
  
  const distribution = macroDistribution[mealType] || { protein: 0.30, carbs: 0.40, fats: 0.30 };
  
  return {
    protein: Math.round((calories * distribution.protein) / 4),
    carbs: Math.round((calories * distribution.carbs) / 4),
    fats: Math.round((calories * distribution.fats) / 9)
  };
}

function getHealthyRecommendations(goal, age, gender) {
  const baseRecommendations = [
    'Mantenha-se hidratado bebendo 2-3 litros de água por dia',
    'Faça refeições regulares a cada 3-4 horas',
    'Inclua proteínas de qualidade em todas as refeições',
    'Consuma variedade de frutas e vegetais coloridos',
    'Pratique atividade física regular conforme sua capacidade'
  ];

  const goalSpecific = {
    'emagrecer': [
      'Mantenha um déficit calórico sustentável',
      'Priorize alimentos com alta saciedade',
      'Evite dietas muito restritivas'
    ],
    'ganhar-massa': [
      'Mantenha um superávit calórico moderado',
      'Priorize proteínas de alta qualidade',
      'Combine com treinamento de força'
    ]
  };

  const ageSpecific = age > 50 ? [
    'Aumente o consumo de cálcio e vitamina D',
    'Mantenha-se ativo para preservar massa muscular'
  ] : [];

  return [
    ...baseRecommendations,
    ...(goalSpecific[goal] || []),
    ...ageSpecific
  ];
}

function getNutritionalGuidelines() {
  return [
    'Distribua as refeições ao longo do dia',
    'Varie as fontes de proteína',
    'Prefira carboidratos complexos',
    'Inclua gorduras saudáveis com moderação',
    'Limite açúcares e alimentos ultraprocessados',
    'Mastigue bem e coma devagar',
    'Ajuste as porções conforme sua fome e saciedade'
  ];
}

// Health check
router.get('/health', async (req, res) => {
  try {
    // Testar conexão Firebase
    let firebaseStatus = 'Desconectado';
    let totalPreferences = 0;
    
    try {
      await db.collection('_health').doc('preferences').set({ 
        timestamp: FieldValue.serverTimestamp() 
      });
      
      const snapshot = await preferencesCollection.limit(1).get();
      firebaseStatus = 'Conectado';
      
      // Contar total aproximado (limitado para performance)
      const countSnapshot = await preferencesCollection.limit(1000).get();
      totalPreferences = countSnapshot.size;
    } catch (error) {
      firebaseStatus = 'Erro: ' + error.message;
    }

    res.json({
      success: true,
      message: 'Serviço de preferências funcionando com Firebase',
      timestamp: new Date().toISOString(),
      database: 'Firebase Firestore',
      status: firebaseStatus,
      endpoints: {
        'GET /': 'Obter preferências do usuário',
        'POST /': 'Salvar preferências do usuário',
        'PUT /': 'Atualizar preferências do usuário',
        'DELETE /': 'Deletar preferências do usuário',
        'POST /calculate': 'Calcular dados nutricionais',
        'POST /generate-diet': 'Gerar plano de dieta',
        'GET /calculations': 'Histórico de cálculos'
      },
      stats: {
        totalPreferences,
        serverUptime: process.uptime() + ' segundos'
      },
      features: {
        firebaseIntegration: true,
        nutritionalCalculations: true,
        dietPlanGeneration: true,
        userHistory: true
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