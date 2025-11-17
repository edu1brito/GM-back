const express = require('express');
const { body, validationResult } = require('express-validator');
const { admin, db, FieldValue } = require('../config/firebase');
const { firebaseUserService } = require('../services/firebaseUserService');
const { auth, canGeneratePlan, requirePlan } = require('../middleware/firebaseAuth');

const router = express.Router();

// Collections Firebase
const dietPlansCollection = db.collection('dietPlans');
const workoutPlansCollection = db.collection('workoutPlans');

// @desc    Gerar plano de dieta personalizado
// @route   POST /api/plans/diet
// @access  Private
router.post('/diet', auth, canGeneratePlan, [
  body('personalData.weight')
    .isNumeric()
    .withMessage('Peso deve ser um número'),
  body('personalData.height')
    .isNumeric()
    .withMessage('Altura deve ser um número'),
  body('personalData.age')
    .isInt({ min: 13, max: 120 })
    .withMessage('Idade deve estar entre 13 e 120 anos'),
  body('personalData.gender')
    .isIn(['masculino', 'feminino'])
    .withMessage('Gênero deve ser masculino ou feminino'),
  body('personalData.goal')
    .isIn(['emagrecer', 'emagrecer-massa', 'definicao-massa', 'ganhar-massa'])
    .withMessage('Objetivo inválido')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { personalData, preferences, targetCalories } = req.body;
    const userId = req.user.id;
    
    const { weight, height, age, gender, goal } = personalData;
    
    // Calcular TMB se não foi fornecido targetCalories
    let calories = targetCalories;
    if (!calories) {
      let bmr;
      if (gender === 'masculino') {
        bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
      } else {
        bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
      }
      
      const tdee = bmr * 1.55;
      
      switch(goal) {
        case 'emagrecer':
          calories = tdee - 500;
          break;
        case 'emagrecer-massa':
          calories = tdee - 300;
          break;
        case 'definicao-massa':
          calories = tdee;
          break;
        case 'ganhar-massa':
          calories = tdee + 300;
          break;
        default:
          calories = tdee;
      }
    }
    
    // Distribuição de calorias por refeição
    const mealDistribution = {
      'cafe': { percentage: 0.25, name: 'Café da Manhã' },
      'lanche-manha': { percentage: 0.15, name: 'Lanche da Manhã' },
      'almoco': { percentage: 0.35, name: 'Almoço' },
      'lanche-tarde': { percentage: 0.15, name: 'Lanche da Tarde' },
      'jantar': { percentage: 0.30, name: 'Jantar' }
    };
    
    const dietPlan = {
      userId,
      personalData,
      totalCalories: Math.round(calories),
      goal,
      meals: {},
      planType: 'diet',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // Gerar cada refeição
    Object.entries(mealDistribution).forEach(([mealType, config]) => {
      const mealCalories = Math.round(calories * config.percentage);
      const userFoods = preferences?.meals?.[mealType] || [];
      
      // Selecionar 3-4 alimentos das preferências do usuário
      const selectedFoods = selectRandomFoods(userFoods, 3, 4);
      
      dietPlan.meals[mealType] = {
        name: config.name,
        targetCalories: mealCalories,
        foods: selectedFoods,
        suggestions: getMealSuggestions(mealType, mealCalories),
        macros: calculateMealMacros(mealCalories, mealType)
      };
    });
    
    // Salvar plano no Firestore
    const docRef = await dietPlansCollection.add(dietPlan);
    
    // Incrementar uso do usuário
    await firebaseUserService.incrementPlanUsage(userId);
    
    // Buscar o documento criado
    const createdDoc = await docRef.get();
    const createdPlan = { id: createdDoc.id, ...createdDoc.data() };
    
    // Converter timestamp para Date
    if (createdPlan.createdAt && createdPlan.createdAt.toDate) {
      createdPlan.createdAt = createdPlan.createdAt.toDate();
    }
    
    res.status(201).json({
      success: true,
      message: 'Plano de dieta criado com sucesso',
      data: createdPlan,
      usage: req.planLimits // Limites atualizados do middleware
    });
    
  } catch (error) {
    console.error('Erro ao gerar plano de dieta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// @desc    Gerar plano de treino personalizado
// @route   POST /api/plans/workout
// @access  Private
router.post('/workout', auth, canGeneratePlan, [
  body('personalData.goal')
    .isIn(['emagrecer', 'ganhar-massa', 'definicao-massa'])
    .withMessage('Objetivo inválido'),
  body('fitnessLevel')
    .optional()
    .isIn(['iniciante', 'intermediario', 'avancado'])
    .withMessage('Nível de condicionamento inválido')
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

    const { personalData, preferences, fitnessLevel } = req.body;
    const userId = req.user.id;
    
    const { goal, age, gender } = personalData;
    const level = fitnessLevel || 'iniciante';
    
    const workoutPlan = {
      userId,
      personalData,
      fitnessLevel: level,
      goal,
      weeklyPlan: generateWeeklyWorkout(goal, level, age, gender),
      guidelines: getWorkoutGuidelines(level, goal),
      planType: 'workout',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // Salvar plano no Firestore
    const docRef = await workoutPlansCollection.add(workoutPlan);
    
    // Incrementar uso do usuário
    await firebaseUserService.incrementPlanUsage(userId);
    
    // Buscar o documento criado
    const createdDoc = await docRef.get();
    const createdPlan = { id: createdDoc.id, ...createdDoc.data() };
    
    // Converter timestamp
    if (createdPlan.createdAt && createdPlan.createdAt.toDate) {
      createdPlan.createdAt = createdPlan.createdAt.toDate();
    }
    
    res.status(201).json({
      success: true,
      message: 'Plano de treino criado com sucesso',
      data: createdPlan,
      usage: req.planLimits
    });
    
  } catch (error) {
    console.error('Erro ao gerar plano de treino:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// @desc    Obter plano de dieta por ID
// @route   GET /api/plans/diet/:id
// @access  Private
router.get('/diet/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const doc = await dietPlansCollection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Plano de dieta não encontrado'
      });
    }
    
    const plan = { id: doc.id, ...doc.data() };
    
    // Verificar se o plano pertence ao usuário
    if (plan.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Converter timestamps
    if (plan.createdAt && plan.createdAt.toDate) {
      plan.createdAt = plan.createdAt.toDate();
    }
    if (plan.updatedAt && plan.updatedAt.toDate) {
      plan.updatedAt = plan.updatedAt.toDate();
    }
    
    res.json({
      success: true,
      data: plan
    });
    
  } catch (error) {
    console.error('Erro ao buscar plano de dieta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Obter plano de treino por ID
// @route   GET /api/plans/workout/:id
// @access  Private
router.get('/workout/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const doc = await workoutPlansCollection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Plano de treino não encontrado'
      });
    }
    
    const plan = { id: doc.id, ...doc.data() };
    
    // Verificar se o plano pertence ao usuário
    if (plan.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Converter timestamps
    if (plan.createdAt && plan.createdAt.toDate) {
      plan.createdAt = plan.createdAt.toDate();
    }
    
    res.json({
      success: true,
      data: plan
    });
    
  } catch (error) {
    console.error('Erro ao buscar plano de treino:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Listar planos do usuário
// @route   GET /api/plans/user
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, limit = 10, offset = 0 } = req.query;
    
    let plans = [];
    
    if (!type || type === 'diet') {
      // Buscar planos de dieta
      const dietSnapshot = await dietPlansCollection
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset))
        .get();
      
      dietSnapshot.forEach(doc => {
        const data = doc.data();
        plans.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date()
        });
      });
    }
    
    if (!type || type === 'workout') {
      // Buscar planos de treino
      const workoutSnapshot = await workoutPlansCollection
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset))
        .get();
      
      workoutSnapshot.forEach(doc => {
        const data = doc.data();
        plans.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date()
        });
      });
    }
    
    // Ordenar por data de criação
    plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Separar por tipo para estatísticas
    const dietPlans = plans.filter(p => p.planType === 'diet');
    const workoutPlans = plans.filter(p => p.planType === 'workout');
    
    res.json({
      success: true,
      data: {
        plans,
        dietPlans,
        workoutPlans,
        totalPlans: plans.length,
        stats: {
          diet: dietPlans.length,
          workout: workoutPlans.length,
          total: plans.length
        }
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar planos do usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Atualizar plano
// @route   PUT /api/plans/:type/:id
// @access  Private
router.put('/:type/:id', auth, [
  body('status')
    .optional()
    .isIn(['active', 'paused', 'completed'])
    .withMessage('Status inválido')
], async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;
    
    // Validar tipo
    if (!['diet', 'workout'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de plano inválido. Use "diet" ou "workout"'
      });
    }
    
    const collection = type === 'diet' ? dietPlansCollection : workoutPlansCollection;
    
    // Verificar se o plano existe e pertence ao usuário
    const doc = await collection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: `Plano de ${type === 'diet' ? 'dieta' : 'treino'} não encontrado`
      });
    }
    
    const planData = doc.data();
    if (planData.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Atualizar plano
    const updates = {
      ...updateData,
      updatedAt: FieldValue.serverTimestamp()
    };
    
    await collection.doc(id).update(updates);
    
    // Buscar plano atualizado
    const updatedDoc = await collection.doc(id).get();
    const updatedPlan = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.json({
      success: true,
      message: `Plano de ${type === 'diet' ? 'dieta' : 'treino'} atualizado com sucesso`,
      data: updatedPlan
    });
    
  } catch (error) {
    console.error('Erro ao atualizar plano:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Deletar plano
// @route   DELETE /api/plans/:type/:id
// @access  Private
router.delete('/:type/:id', auth, async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    
    // Validar tipo
    if (!['diet', 'workout'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de plano inválido. Use "diet" ou "workout"'
      });
    }
    
    const collection = type === 'diet' ? dietPlansCollection : workoutPlansCollection;
    
    // Verificar se o plano existe e pertence ao usuário
    const doc = await collection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: `Plano de ${type === 'diet' ? 'dieta' : 'treino'} não encontrado`
      });
    }
    
    const planData = doc.data();
    if (planData.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Deletar plano
    await collection.doc(id).delete();
    
    res.json({
      success: true,
      message: `Plano de ${type === 'diet' ? 'dieta' : 'treino'} deletado com sucesso`
    });
    
  } catch (error) {
    console.error('Erro ao deletar plano:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @desc    Verificar limites do usuário
// @route   GET /api/plans/limits
// @access  Private
router.get('/limits', auth, async (req, res) => {
  try {
    const user = req.user;
    const canGenerate = firebaseUserService.canGeneratePlan(user);
    
    res.json({
      success: true,
      data: canGenerate,
      user: {
        plan: user.subscription?.plan || 'free',
        status: user.subscription?.status || 'active'
      }
    });
    
  } catch (error) {
    console.error('Erro ao verificar limites:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    // Contar planos no Firebase
    const dietSnapshot = await dietPlansCollection.limit(1).get();
    const workoutSnapshot = await workoutPlansCollection.limit(1).get();
    
    res.json({
      success: true,
      message: 'Serviço de planos funcionando com Firebase',
      timestamp: new Date().toISOString(),
      database: 'Firebase Firestore',
      collections: {
        dietPlans: 'Conectado',
        workoutPlans: 'Conectado'
      },
      endpoints: {
        'POST /diet': 'Criar plano de dieta',
        'POST /workout': 'Criar plano de treino',
        'GET /diet/:id': 'Obter plano de dieta',
        'GET /workout/:id': 'Obter plano de treino',
        'GET /user': 'Listar planos do usuário',
        'PUT /:type/:id': 'Atualizar plano',
        'DELETE /:type/:id': 'Deletar plano',
        'GET /limits': 'Verificar limites do usuário'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar saúde do serviço',
      error: error.message
    });
  }
});

// Funções auxiliares (mantidas iguais)
function selectRandomFoods(foods, min, max) {
  if (!foods || foods.length === 0) return [];
  
  const shuffled = [...foods].sort(() => 0.5 - Math.random());
  const count = Math.min(max, Math.max(min, foods.length));
  return shuffled.slice(0, count);
}

function getMealSuggestions(mealType, calories) {
  const suggestions = {
    'cafe': [
      `${Math.round(calories * 0.3)} kcal - Proteína: ovos, iogurte ou whey`,
      `${Math.round(calories * 0.4)} kcal - Carboidrato: pães, tapioca ou frutas`,
      `${Math.round(calories * 0.3)} kcal - Gordura: castanhas, abacate ou azeite`,
      'Líquido: café, chá ou suco natural (200-300ml)'
    ],
    'lanche-manha': [
      `${Math.round(calories * 0.4)} kcal - Fruta ou whey protein`,
      `${Math.round(calories * 0.3)} kcal - Castanhas ou iogurte`,
      `${Math.round(calories * 0.3)} kcal - Biscoitos integrais (opcional)`,
      'Hidratação: água ou chá verde'
    ],
    'almoco': [
      `${Math.round(calories * 0.35)} kcal - Proteína: 150-200g de carne/peixe`,
      `${Math.round(calories * 0.40)} kcal - Carboidrato: arroz, batata ou macarrão`,
      `${Math.round(calories * 0.15)} kcal - Leguminosa: feijão, lentilha`,
      `${Math.round(calories * 0.10)} kcal - Vegetais: salada à vontade`
    ],
    'lanche-tarde': [
      `${Math.round(calories * 0.4)} kcal - Lanche: fruta, pão ou tapioca`,
      `${Math.round(calories * 0.3)} kcal - Proteína: queijo, ovo ou whey`,
      `${Math.round(calories * 0.3)} kcal - Complemento: castanhas ou iogurte`,
      'Bebida: água, chá ou suco natural'
    ],
    'jantar': [
      `${Math.round(calories * 0.40)} kcal - Proteína magra: 120-150g`,
      `${Math.round(calories * 0.25)} kcal - Carboidrato: batata doce ou quinoa`,
      `${Math.round(calories * 0.35)} kcal - Vegetais: salada e legumes`,
      'Tempero: azeite, limão e ervas naturais'
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

function generateWeeklyWorkout(goal, level, age, gender) {
  const baseWorkout = {
    'iniciante': {
      daysPerWeek: 3,
      duration: '45-60 min',
      restBetweenSets: '60-90 segundos'
    },
    'intermediario': {
      daysPerWeek: 4,
      duration: '60-75 min',
      restBetweenSets: '45-60 segundos'
    },
    'avancado': {
      daysPerWeek: 5,
      duration: '60-90 min',
      restBetweenSets: '30-45 segundos'
    }
  };
  
  const workoutStructure = baseWorkout[level] || baseWorkout['iniciante'];
  
  const exercises = {
    'emagrecer': {
      cardio: 70,
      strength: 30,
      focus: 'Queima de gordura e condicionamento'
    },
    'ganhar-massa': {
      cardio: 20,
      strength: 80,
      focus: 'Hipertrofia muscular'
    },
    'definicao-massa': {
      cardio: 40,
      strength: 60,
      focus: 'Definição e manutenção muscular'
    }
  };
  
  const exerciseDistribution = exercises[goal] || exercises['definicao-massa'];
  
  return {
    ...workoutStructure,
    ...exerciseDistribution,
    weeklySchedule: generateSchedule(workoutStructure.daysPerWeek, goal),
    ageAdjustments: age > 40 ? 'Aquecimento prolongado e recuperação extra' : 'Protocolo padrão'
  };
}

function generateSchedule(daysPerWeek, goal) {
  const schedules = {
    3: ['Segunda', 'Quarta', 'Sexta'],
    4: ['Segunda', 'Terça', 'Quinta', 'Sexta'],
    5: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
  };
  
  const days = schedules[daysPerWeek] || schedules[3];
  
  return days.map(day => ({
    day,
    type: goal === 'emagrecer' ? 'Cardio + Funcional' : 'Musculação + Cardio leve',
    duration: '45-60 min'
  }));
}

function getWorkoutGuidelines(level, goal) {
  return [
    'Sempre faça aquecimento antes dos exercícios (10-15 min)',
    'Mantenha boa hidratação durante o treino',
    'Respeite os dias de descanso para recuperação',
    'Procure orientação profissional para exercícios novos',
    'Monitore a intensidade e ajuste conforme necessário',
    level === 'iniciante' ? 'Foque na execução correta antes de aumentar cargas' : 'Varie os exercícios para evitar platô',
    goal === 'emagrecer' ? 'Combine exercícios aeróbicos com anaeróbicos' : 'Priorize exercícios compostos e multiarticulares'
  ];
}

module.exports = router;