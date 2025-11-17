// ====================================
// services/aiService.js - Serviço de IA Integrado
// ====================================
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configurar Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class AIService {
  // Gerar plano completo usando dados reais do frontend
  async generatePlan(userData) {
    try {
      console.log('Gerando plano com dados:', JSON.stringify(userData, null, 2));
      
      const prompt = this.buildPromptFromFrontendData(userData);
      
      // Usar Claude por ser mais barato e bom para textos longos
      const response = await this.callClaude(prompt);
      
      // Processar resposta e estruturar dados
      const content = this.parseAIResponse(response, userData);
      
      return {
        content,
        userData: userData, // Manter dados originais
        metadata: {
          prompt: prompt.substring(0, 500),
          response: response.substring(0, 1000),
          model: 'claude-3-haiku',
          tokens: response.length / 4,
          cost: (response.length / 4) * 0.00025 / 1000,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Erro na geração com IA:', error);
      throw new Error('Falha na geração do plano: ' + error.message);
    }
  }

  // Construir prompt usando dados do frontend (localStorage)
  buildPromptFromFrontendData(userData) {
    const { personal, training, meals, gender } = userData;
    
    // Calcular BMR e TDEE usando dados reais
    const bmr = this.calculateBMR({
      weight: parseFloat(personal.peso),
      height: parseFloat(personal.altura),
      age: parseInt(personal.idade),
      gender: gender
    });
    
    const tdee = this.calculateTDEE(bmr, training.rotina || 'moderado');
    const targetCalories = this.calculateTargetCalories(tdee, personal.objetivo);

    // Mapear alimentos selecionados por refeição
    const alimentosSelecionados = {
      'Café da Manhã': meals.cafe || [],
      'Lanche da Manhã': meals['lanche-manha'] || [],
      'Almoço': meals.almoco || [],
      'Lanche da Tarde': meals['lanche-tarde'] || [],
      'Jantar': meals.jantar || []
    };

    // Mapear informações de treino
    const infoTreino = {
      rotina: this.mapRotinaText(training.rotina),
      local: this.mapLocalText(training.local),
      experiencia: this.mapExperienciaText(training.experiencia),
      preferencias: training.preferencias?.map(pref => this.mapPreferenciaText(pref)) || []
    };

    return `
Você é um nutricionista e personal trainer brasileiro experiente. Crie um plano personalizado DETALHADO e PRÁTICO.

DADOS PESSOAIS:
- Nome: ${personal.nome || 'Cliente'}
- Gênero: ${gender === 'masculino' ? 'Masculino' : 'Feminino'}
- Idade: ${personal.idade} anos
- Peso: ${personal.peso}kg
- Altura: ${personal.altura}cm
- Objetivo: ${this.mapObjetivoText(personal.objetivo)}
- Calorias desejadas: ${personal.calorias === 'nao-sei' ? 'Calcular automaticamente' : personal.calorias + ' kcal'}
- Horários das refeições: ${personal.horarios}

DADOS CALCULADOS:
- BMR (Metabolismo Basal): ${Math.round(bmr)} kcal/dia
- TDEE (Gasto Total): ${Math.round(tdee)} kcal/dia
- Meta Calórica Recomendada: ${Math.round(targetCalories)} kcal/dia

INFORMAÇÕES DE TREINO:
- Rotina: ${infoTreino.rotina}
- Local de treino: ${infoTreino.local}
- Experiência: ${infoTreino.experiencia}
- Tipos de exercício preferidos: ${infoTreino.preferencias.join(', ') || 'Nenhuma preferência específica'}

ALIMENTOS PREFERIDOS SELECIONADOS (USE APENAS ESTES):
${Object.entries(alimentosSelecionados).map(([refeicao, alimentos]) => {
  return `• ${refeicao}: ${alimentos.length > 0 ? alimentos.join(', ') : 'Nenhum alimento específico selecionado'}`;
}).join('\n')}

INSTRUÇÕES IMPORTANTES:
1. Use SOMENTE os alimentos que o usuário selecionou como preferidos
2. Se uma refeição tem poucos alimentos, seja criativo combinando eles
3. Inclua quantidades ESPECÍFICAS (gramas, unidades, colheres)
4. Distribua as calorias nos horários escolhidos pelo usuário
5. Ajuste as porções para bater a meta calórica
6. Inclua dicas práticas sobre preparo e organização
7. Se treina, ajuste proteínas e carboidratos adequadamente
8. Use linguagem brasileira e coloquial
9. Seja motivacional e prático

FORMATO DA RESPOSTA (JSON válido):
{
  "resumo": "Texto resumindo o plano criado especificamente para ${personal.nome || 'esta pessoa'}",
  "objetivos": {
    "principal": "${personal.objetivo}",
    "calorias_diarias": ${Math.round(targetCalories)},
    "distribuicao_macros": {
      "proteinas": "${Math.round(targetCalories * 0.25 / 4)}g por dia",
      "carboidratos": "${Math.round(targetCalories * 0.50 / 4)}g por dia", 
      "gorduras": "${Math.round(targetCalories * 0.25 / 9)}g por dia"
    }
  },
  "plano_alimentar": {
    "total_calorias": ${Math.round(targetCalories)},
    "refeicoes": [
      ${personal.horarios.split(',').map((horario, index) => {
        const nomeRefeicoes = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar'];
        const refeicao = nomeRefeicoes[index];
        const alimentos = alimentosSelecionados[refeicao] || [];
        const percentuais = [0.25, 0.15, 0.35, 0.15, 0.30];
        const calorias = Math.round(targetCalories * (percentuais[index] || 0.20));
        
        return `{
        "nome": "${refeicao}",
        "horario": "${horario.trim()}",
        "calorias": ${calorias},
        "alimentos_com_quantidades": [
          "Especifique os alimentos: ${alimentos.join(', ')} com quantidades exatas"
        ],
        "macros": {
          "proteinas": "${Math.round(calorias * 0.25 / 4)}g",
          "carboidratos": "${Math.round(calorias * 0.50 / 4)}g",
          "gorduras": "${Math.round(calorias * 0.25 / 9)}g"
        },
        "dicas_preparo": "Como preparar esta refeição"
      }`;
      }).join(',\n      ')}
    ]
  },
  "dicas_gerais": [
    "Dica específica baseada no objetivo de ${personal.nome || 'esta pessoa'}",
    "Dica sobre hidratação",
    "Dica sobre timing das refeições",
    "Dica motivacional personalizada"
  ],
  "observacoes_importantes": [
    "Observação sobre as escolhas alimentares",
    "Como ajustar porções conforme fome",
    "Quando consultar nutricionista"
  ]
}

Crie um plano DETALHADO, PRÁTICO e totalmente personalizado para ${personal.nome || 'esta pessoa'} usando os alimentos selecionados!`;
  }

  // Chamar Claude API
  async callClaude(prompt) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Erro na chamada Claude:', error);
      
      // Fallback para OpenAI se Claude falhar
      return await this.callOpenAI(prompt);
    }
  }

  // Fallback para OpenAI
  async callOpenAI(prompt) {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Você é um nutricionista e personal trainer brasileiro experiente que cria planos detalhados usando apenas os alimentos que o usuário selecionou.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 3500,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  }

  // Processar resposta da IA
  parseAIResponse(response, userData) {
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validar estrutura básica
        if (parsed.plano_alimentar && parsed.resumo) {
          return parsed;
        }
      }
      
      // Se não conseguir parsear, criar estrutura básica
      return this.createFallbackStructure(response, userData);
    } catch (error) {
      console.error('Erro ao parsear resposta IA:', error);
      console.log('Resposta recebida:', response.substring(0, 500));
      return this.createFallbackStructure(response, userData);
    }
  }

  // Estrutura de fallback usando dados reais do frontend
  createFallbackStructure(response, userData) {
    const { personal, training, meals, gender } = userData;
    
    const bmr = this.calculateBMR({
      weight: parseFloat(personal.peso),
      height: parseFloat(personal.altura), 
      age: parseInt(personal.idade),
      gender: gender
    });
    
    const tdee = this.calculateTDEE(bmr, training.rotina || 'moderado');
    const targetCalories = this.calculateTargetCalories(tdee, personal.objetivo);

    const horarios = personal.horarios.split(',');
    const nomeRefeicoes = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar'];
    const percentuais = [0.25, 0.15, 0.35, 0.15, 0.30];

    const refeicoes = horarios.map((horario, index) => {
      const nomeRefeicao = nomeRefeicoes[index];
      const calorias = Math.round(targetCalories * (percentuais[index] || 0.20));
      const alimentosEscolhidos = this.getAlimentosRefeicao(nomeRefeicao, meals);
      
      return {
        nome: nomeRefeicao,
        horario: horario.trim(),
        calorias: calorias,
        alimentos_com_quantidades: alimentosEscolhidos.map(alimento => `${alimento} (quantidade adequada)`),
        macros: {
          proteinas: Math.round(calorias * 0.25 / 4) + 'g',
          carboidratos: Math.round(calorias * 0.50 / 4) + 'g',
          gorduras: Math.round(calorias * 0.25 / 9) + 'g'
        },
        dicas_preparo: `Prepare ${alimentosEscolhidos.join(', ')} de forma saudável e saborosa`
      };
    });

    return {
      resumo: `Plano alimentar personalizado para ${personal.nome || 'você'} visando ${this.mapObjetivoText(personal.objetivo).toLowerCase()} com ${Math.round(targetCalories)} kcal/dia, usando seus alimentos favoritos.`,
      objetivos: {
        principal: personal.objetivo,
        calorias_diarias: Math.round(targetCalories),
        distribuicao_macros: {
          proteinas: Math.round(targetCalories * 0.25 / 4) + 'g por dia',
          carboidratos: Math.round(targetCalories * 0.50 / 4) + 'g por dia',
          gorduras: Math.round(targetCalories * 0.25 / 9) + 'g por dia'
        }
      },
      plano_alimentar: {
        total_calorias: Math.round(targetCalories),
        refeicoes: refeicoes
      },
      dicas_gerais: [
        'Beba pelo menos 2-3 litros de água ao longo do dia',
        'Mantenha os horários das refeições consistentes',
        'Ajuste as porções conforme sua fome e saciedade',
        'Inclua atividade física regular na sua rotina'
      ],
      observacoes_importantes: [
        'Este plano foi criado com base nos alimentos que você selecionou',
        'Consulte um nutricionista para acompanhamento personalizado',
        'Monitore seu progresso e ajuste conforme necessário'
      ]
    };
  }

  // Mapear alimentos por refeição usando dados do frontend
  getAlimentosRefeicao(nomeRefeicao, meals) {
    const mapeamento = {
      'Café da Manhã': meals.cafe || [],
      'Lanche da Manhã': meals['lanche-manha'] || [],
      'Almoço': meals.almoco || [],
      'Lanche da Tarde': meals['lanche-tarde'] || [],
      'Jantar': meals.jantar || []
    };
    
    return mapeamento[nomeRefeicao] || ['Opção saudável'];
  }

  // Funções auxiliares para mapear textos do frontend
  mapObjetivoText(objetivo) {
    const mapeamento = {
      'emagrecer': 'Emagrecer',
      'emagrecer-massa': 'Emagrecer e Ganhar Massa Muscular',
      'definicao-massa': 'Definição Muscular e Ganho de Massa',
      'ganhar-massa': 'Ganhar Massa Muscular'
    };
    return mapeamento[objetivo] || objetivo;
  }

  mapRotinaText(rotina) {
    const mapeamento = {
      'sedentario': 'Sedentário (nenhum exercício)',
      'leve': 'Leve (1-3 vezes por semana)',
      'moderado': 'Moderado (3-5 vezes por semana)', 
      'intenso': 'Intenso (6-7 vezes por semana)',
      'muito-intenso': 'Muito Intenso (2x por dia ou atleta)'
    };
    return mapeamento[rotina] || 'Não informado';
  }

  mapLocalText(local) {
    const mapeamento = {
      'academia': 'Academia',
      'casa': 'Em casa',
      'parque': 'Parque/Ar livre',
      'misto': 'Academia e casa',
      'nao-treino': 'Não treina ainda'
    };
    return mapeamento[local] || 'Não informado';
  }

  mapExperienciaText(meses) {
    if (!meses || meses === 0) return 'Iniciante';
    if (meses <= 6) return `${meses} meses de experiência`;
    if (meses <= 12) return `${meses} meses de experiência`;
    if (meses <= 24) return `${Math.floor(meses/12)} ano(s) de experiência`;
    return `${Math.floor(meses/12)} anos de experiência`;
  }

  mapPreferenciaText(pref) {
    const mapeamento = {
      'musculacao': 'Musculação',
      'cardio': 'Exercícios cardiovasculares',
      'funcional': 'Treino funcional',
      'natacao': 'Natação',
      'yoga': 'Yoga/Pilates',
      'lutas': 'Artes marciais/Lutas',
      'danca': 'Dança',
      'crossfit': 'CrossFit'
    };
    return mapeamento[pref] || pref;
  }

  // Calcular BMR usando dados reais
  calculateBMR({ weight, height, age, gender }) {
    if (gender === 'masculino') {
      return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }
  }

  // Calcular TDEE usando dados de treino reais
  calculateTDEE(bmr, rotina) {
    const factors = {
      'sedentario': 1.2,
      'leve': 1.375, 
      'moderado': 1.55,
      'intenso': 1.725,
      'muito-intenso': 1.9
    };
    
    return bmr * (factors[rotina] || 1.55);
  }

  // Calcular calorias alvo baseado no objetivo real
  calculateTargetCalories(tdee, objetivo) {
    switch (objetivo) {
      case 'emagrecer':
        return tdee - 500;
      case 'emagrecer-massa':
        return tdee - 300;
      case 'definicao-massa':
        return tdee;
      case 'ganhar-massa':
        return tdee + 300;
      default:
        return tdee;
    }
  }
}

module.exports = new AIService();