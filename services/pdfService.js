// ====================================
// services/pdfService.js - PUPPETEER VERSION CORRIGIDO
// ====================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class PuppeteerPDFService {
  constructor() {
    this.templatePath = path.join(__dirname, 'templates', 'premium-diet-plan.html');
  }

  async generatePDF(generatedPlan, userData) {
    return this.generatePremiumPDF(generatedPlan, userData);
  }

  async generatePremiumPDF(generatedPlan, userData) {
    let browser;
    
    try {
      const { content } = generatedPlan;
      const userId = userData.timestamp || userData.id || Date.now();
      const filename = `gymmind-premium-${userId}.pdf`;
      const filepath = path.join(__dirname, '../uploads/pdfs', filename);
      
      // Garantir diretório
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('Pasta uploads/pdfs criada');
      }

      console.log('Gerando PDF Premium com Puppeteer:', filename);

      // Processar dados
      const processedData = this.processData(content, userData);
      
      // Gerar HTML
      const html = this.generateHTML(processedData);
      
      // Criar PDF com Puppeteer
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Configurar HTML
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Gerar PDF
      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm'
        }
      });

      const stats = fs.statSync(filepath);

      return {
        filename,
        path: filepath,
        url: `/api/files/pdfs/${filename}`,
        size: stats.size,
        generated: true,
        generatedAt: new Date(),
        premium: true
      };

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      throw new Error('Falha na geração do PDF: ' + error.message);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  processData(content, userData) {
    return {
      client: this.extractClientData(userData),
      nutrition: this.extractNutritionalData(content),
      meals: this.extractMeals(content),
      tips: this.extractTips(content),
      currentDate: new Date().toLocaleDateString('pt-BR'),
      shoppingList: this.generateShoppingList(content)
    };
  }

  extractClientData(userData) {
    // DEBUG para ver os dados
    console.log('=== DEBUG EXTRACT CLIENT DATA ===');
    console.log('userData:', JSON.stringify(userData, null, 2));
    console.log('userData.personal:', userData.personal);
    console.log('userData.personal?.nome:', userData.personal?.nome);
    
    // Calcular idade se tiver dados pessoais
    let age = 'N/A';
    if (userData.personal && userData.personal.idade) {
      age = `${userData.personal.idade} anos`;
    } else if (userData.profile?.birthDate) {
      const calculatedAge = this.calculateAge(userData.profile.birthDate);
      age = calculatedAge ? `${calculatedAge} anos` : 'N/A';
    }

    // Determinar gênero
    let gender = 'N/A';
    if (userData.gender) {
      gender = userData.gender === 'masculino' ? 'Masculino' : 'Feminino';
    } else if (userData.profile?.gender) {
      gender = userData.profile.gender === 'male' ? 'Masculino' : 'Feminino';
    }
    
    const clientData = {
      name: this.getClientName(userData),
      email: userData.email || 'N/A',
      age: age,
      gender: gender,
      plan: userData.subscription?.plan?.toUpperCase() || 'FREE'
    };

    console.log('Cliente final:', clientData);
    console.log('===========================');
    
    return clientData;
  }

  // FUNÇÃO CORRIGIDA PARA PEGAR O NOME
  getClientName(userData) {
    console.log('=== GET CLIENT NAME ===');
    
    // PRIORIDADE 1: Nome do formulário (userData.personal.nome)
    if (userData.personal && userData.personal.nome) {
      console.log('Nome encontrado em personal.nome:', userData.personal.nome);
      return userData.personal.nome;
    }
    
    // PRIORIDADE 2: Nome do Firebase (profile)
    if (userData.profile && userData.profile.firstName && userData.profile.lastName) {
      const fullName = `${userData.profile.firstName} ${userData.profile.lastName}`;
      console.log('Nome encontrado no Firebase:', fullName);
      return fullName;
    }
    
    // PRIORIDADE 3: Nome direto ou email
    if (userData.name) {
      console.log('Nome encontrado em userData.name:', userData.name);
      return userData.name;
    }
    
    if (userData.email) {
      console.log('Usando email como nome:', userData.email);
      return userData.email;
    }
    
    // ÚLTIMO RECURSO: Nome baseado no objetivo
    if (userData.personal && userData.personal.objetivo) {
      const objetivos = {
        'emagrecer': 'Cliente Emagrecer',
        'emagrecer-massa': 'Cliente Emagrecer+Massa',
        'definicao-massa': 'Cliente Definição',
        'ganhar-massa': 'Cliente Ganhar Massa'
      };
      const fallbackName = objetivos[userData.personal.objetivo] || 'Cliente GymMind';
      console.log('Usando nome baseado no objetivo:', fallbackName);
      return fallbackName;
    }
    
    console.log('Usando nome padrão: Cliente Premium');
    return 'Cliente Premium';
  }

  extractNutritionalData(content) {
    // Estrutura nova (GeneratedPlan.js)
    if (content?.diet) {
      return {
        calories: content.diet.targetCalories || 0,
        protein: `${content.diet.macros?.protein || 0}g`,
        carbs: `${content.diet.macros?.carbs || 0}g`,
        fats: `${content.diet.macros?.fats || 0}g`
      };
    }
    
    // Estrutura antiga
    if (content?.objetivos) {
      return {
        calories: content.objetivos.calorias_diarias || 0,
        protein: content.objetivos.distribuicao_macros?.proteinas || '0g',
        carbs: content.objetivos.distribuicao_macros?.carboidratos || '0g', 
        fats: content.objetivos.distribuicao_macros?.gorduras || '0g'
      };
    }
    
    return { calories: 0, protein: '0g', carbs: '0g', fats: '0g' };
  }

  extractMeals(content) {
    let meals = [];
    
    // Estrutura nova
    if (content?.diet?.meals) {
      meals = content.diet.meals;
    }
    // Estrutura antiga  
    else if (content?.plano_alimentar?.refeicoes) {
      meals = content.plano_alimentar.refeicoes;
    }

    return meals.map((meal, index) => ({
      name: meal.name || meal.nome || `Refeição ${index + 1}`,
      time: meal.time || meal.horario || `${8 + (index * 3)}:00`,
      calories: meal.calories || meal.calorias || 0,
      foods: this.extractFoodsFromMeal(meal),
      macros: {
        protein: this.getMacroValue(meal.macros, 'protein', 'proteinas'),
        carbs: this.getMacroValue(meal.macros, 'carbs', 'carboidratos'),
        fats: this.getMacroValue(meal.macros, 'fats', 'gorduras')
      }
    }));
  }

  extractFoodsFromMeal(meal) {
    let foods = [];

    // Estrutura nova
    if (meal.foods && Array.isArray(meal.foods)) {
      if (meal.portions && meal.portions.length === meal.foods.length) {
        foods = meal.foods.map((food, i) => `${food} (${meal.portions[i]})`);
      } else {
        foods = [...meal.foods];
      }
    }
    // Estrutura antiga - CORRIGIDO para separar alimentos em linhas
    else if (meal.alimentos_com_quantidades && Array.isArray(meal.alimentos_com_quantidades)) {
      foods = meal.alimentos_com_quantidades.map(food => {
        if (typeof food === 'string') {
          // Se vier como string única com múltiplos alimentos, separar
          if (food.includes(',')) {
            return food.split(',').map(item => item.trim());
          }
          return food;
        }
        
        if (typeof food === 'object' && food !== null) {
          if (food.alimento && food.quantidade) {
            return `${food.alimento} (${food.quantidade})`;
          }
          if (food.nome && food.quantidade) {
            return `${food.nome} (${food.quantidade})`;
          }
          if (food.alimento) return food.alimento;
          if (food.nome) return food.nome;
          
          // Extrair valores do objeto
          const values = Object.values(food).filter(v => 
            typeof v === 'string' && v.trim().length > 0
          );
          if (values.length > 0) {
            return values.join(' - ');
          }
        }
        
        return 'Alimento não especificado';
      });
      
      // Achatar array caso tenha sub-arrays (de quando separa por vírgula)
      foods = foods.flat();
    }

    return foods.filter(food => food && food.trim().length > 0);
  }

  getMacroValue(macros, newKey, oldKey) {
    if (!macros) return '0g';
    
    if (macros[newKey] !== undefined) {
      return typeof macros[newKey] === 'number' ? `${macros[newKey]}g` : macros[newKey];
    }
    
    return macros[oldKey] || '0g';
  }

  extractTips(content) {
    // Estrutura nova
    if (content?.diet?.tips) {
      return content.diet.tips;
    }
    // Estrutura antiga
    if (content?.dicas_gerais) {
      return content.dicas_gerais;
    }
    
    return [
      'Beba pelo menos 2,5L de água por dia',
      'Faça refeições a cada 3-4 horas',
      'Mastigue bem os alimentos',
      'Evite distrações durante as refeições',
      'Prepare os alimentos com antecedência'
    ];
  }

  generateShoppingList(content) {
    const meals = this.extractMeals(content);
    const allFoods = [];
    
    meals.forEach(meal => {
      meal.foods.forEach(foodItem => {
        // Separar e limpar cada alimento
        const cleanedFoods = this.separateAndCleanFoods(foodItem);
        allFoods.push(...cleanedFoods);
      });
    });

    const uniqueFoods = [...new Set(allFoods)];
    
    return this.categorizeFoods(uniqueFoods);
  }

  separateAndCleanFoods(foodText) {
    if (!foodText || typeof foodText !== 'string') return [];
    
    // Remover emojis e limpar
    let cleaned = foodText
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/[🥣🍎☕🥛🍌🍗🍚🫘🥗🥤🐟🥕]/g, '') // Remove emojis específicos
      .trim();

    // Separar por palavras conectoras e pontuação
    const separators = /\s+com\s+|\s+\+\s+|,\s*|\se\s|\s-\s/gi;
    const parts = cleaned.split(separators);
    
    const foods = [];
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        // Remover quantidades entre parênteses para a lista de compras
        const withoutQuantity = trimmed.replace(/\s*\([^)]*\)/g, '').trim();
        if (withoutQuantity.length > 2) {
          foods.push(withoutQuantity);
        }
      }
    });
    
    return foods;
  }

  categorizeFoods(foods) {
    const categories = {
      'Açougue': [],
      'Hortifruti': [],
      'Mercearia': [],
      'Laticínios': [],
      'Outros': []
    };

    foods.forEach(food => {
      if (!food || food.length < 2) return;
      
      const lowerFood = food.toLowerCase();
      let categorized = false;

      // Açougue - proteínas animais (verificação mais específica)
      if (!categorized && (
        lowerFood.startsWith('frango') || 
        lowerFood.startsWith('carne') || 
        lowerFood.startsWith('salmão') || 
        lowerFood.startsWith('peixe') || 
        lowerFood.startsWith('atum') ||
        lowerFood.startsWith('tilápia') ||
        lowerFood.startsWith('patinho') ||
        lowerFood.startsWith('alcatra') ||
        lowerFood === 'frango' ||
        lowerFood === 'salmão' ||
        lowerFood === 'peixe' ||
        lowerFood === 'carne'
      )) {
        categories['Açougue'].push(food);
        categorized = true;
      }

      // Hortifruti - frutas, verduras e legumes  
      if (!categorized && (
        lowerFood.startsWith('banana') ||
        lowerFood.startsWith('fruta') ||
        lowerFood.startsWith('maçã') ||
        lowerFood.startsWith('laranja') ||
        lowerFood.startsWith('salada') ||
        lowerFood.startsWith('alface') ||
        lowerFood.startsWith('tomate') ||
        lowerFood.startsWith('legume') ||
        lowerFood.startsWith('verdura') ||
        lowerFood === 'banana' ||
        lowerFood === 'fruta' ||
        lowerFood === 'salada' ||
        lowerFood === 'legumes'
      )) {
        categories['Hortifruti'].push(food);
        categorized = true;
      }

      // Mercearia - grãos, cereais, suplementos
      if (!categorized && (
        lowerFood.startsWith('arroz') ||
        lowerFood.startsWith('feijão') ||
        lowerFood.startsWith('whey') ||
        lowerFood.startsWith('protein') ||
        lowerFood.startsWith('aveia') ||
        lowerFood.startsWith('café') ||
        lowerFood.startsWith('tapioca') ||
        lowerFood === 'arroz' ||
        lowerFood === 'feijão' ||
        lowerFood === 'whey' ||
        lowerFood === 'café' ||
        lowerFood === 'tapioca'
      )) {
        categories['Mercearia'].push(food);
        categorized = true;
      }

      // Laticínios
      if (!categorized && (
        lowerFood.startsWith('leite') ||
        lowerFood.startsWith('queijo') ||
        lowerFood.startsWith('iogurte') ||
        lowerFood === 'leite' ||
        lowerFood === 'queijo'
      )) {
        categories['Laticínios'].push(food);
        categorized = true;
      }

      // Se não foi categorizado, vai para Outros
      if (!categorized) {
        categories['Outros'].push(food);
      }
    });

    // Remover categorias vazias e duplicatas
    const filteredCategories = {};
    Object.keys(categories).forEach(key => {
      const uniqueItems = [...new Set(categories[key])].filter(item => 
        item && item.trim().length > 1
      );
      if (uniqueItems.length > 0) {
        filteredCategories[key] = uniqueItems.sort();
      }
    });

    return filteredCategories;
  }

  generateHTML(data) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GymMind Premium - Plano Nutricional</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: white;
        }
        
        .page-break {
            page-break-after: always;
        }
        
        /* CAPA */
        .cover {
            height: 100vh;
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            color: white;
            position: relative;
        }
        
        .cover h1 {
            font-size: 4rem;
            font-weight: 700;
            margin-bottom: 1rem;
        }
        
        .cover .premium {
            font-size: 1.25rem;
            color: #fbbf24;
            letter-spacing: 0.2em;
            margin-bottom: 2rem;
        }
        
        .cover h2 {
            font-size: 2rem;
            font-weight: 400;
            margin-bottom: 3rem;
        }
        
        .client-card {
            background: white;
            color: #1f2937;
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 90%;
        }
        
        .client-card h3 {
            color: #1e40af;
            font-size: 1.1rem;
            margin-bottom: 1rem;
        }
        
        .client-name {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
        }
        
        .client-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            font-size: 0.9rem;
            color: #6b7280;
        }
        
        /* SEÇÕES */
        .section {
            margin: 3rem 0;
        }
        
        .section-header {
            background: #f8fafc;
            padding: 2rem;
            border-top: 4px solid #1e40af;
            margin-bottom: 2rem;
        }
        
        .section-header h2 {
            color: #1e40af;
            font-size: 1.75rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .section-header p {
            color: #6b7280;
            font-size: 1rem;
        }
        
        /* DASHBOARD NUTRICIONAL */
        .nutrition-dashboard {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .calories-card {
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            padding: 2rem;
            border-radius: 15px;
            border: 3px solid #1e40af;
            text-align: center;
        }
        
        .calories-number {
            font-size: 3rem;
            font-weight: 700;
            color: #1e40af;
            margin: 1rem 0;
        }
        
        .macros-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            margin-top: 2rem;
        }
        
        .macro-card {
            background: white;
            border: 2px solid;
            border-radius: 10px;
            padding: 1.5rem;
            text-align: center;
        }
        
        .macro-card.protein { border-color: #ef4444; }
        .macro-card.carbs { border-color: #3b82f6; }
        .macro-card.fats { border-color: #f59e0b; }
        
        .macro-card h4 {
            font-size: 0.8rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
        }
        
        .macro-card.protein h4 { color: #ef4444; }
        .macro-card.carbs h4 { color: #3b82f6; }
        .macro-card.fats h4 { color: #f59e0b; }
        
        .macro-value {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        /* REFEIÇÕES */
        .meal-card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 15px;
            margin-bottom: 2rem;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .meal-header {
            background: #1e40af;
            color: white;
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .meal-name {
            font-size: 1.25rem;
            font-weight: 600;
        }
        
        .meal-time {
            font-size: 1rem;
        }
        
        .meal-calories {
            font-size: 1.1rem;
            font-weight: 600;
        }
        
        .meal-content {
            padding: 2rem;
        }
        
        .foods-list {
            list-style: none;
            margin-bottom: 1.5rem;
        }
        
        .foods-list li {
            padding: 0.5rem 0;
            border-bottom: 1px solid #f3f4f6;
            position: relative;
            padding-left: 1.5rem;
        }
        
        .foods-list li::before {
            content: '•';
            color: #059669;
            position: absolute;
            left: 0;
            font-weight: bold;
        }
        
        .meal-macros {
            background: #f8fafc;
            padding: 1rem;
            border-radius: 8px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            text-align: center;
        }
        
        /* LISTA DE COMPRAS */
        .shopping-category {
            margin-bottom: 2rem;
        }
        
        .category-header {
            background: #059669;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px 8px 0 0;
            font-weight: 600;
        }
        
        .category-items {
            background: white;
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 8px 8px;
            padding: 1.5rem;
        }
        
        .shopping-item {
            display: flex;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #f3f4f6;
        }
        
        .shopping-item input[type="checkbox"] {
            margin-right: 1rem;
            transform: scale(1.2);
        }
        
        /* DICAS */
        .tips-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }
        
        .tip-card {
            background: #f0f9ff;
            border: 1px solid #0284c7;
            border-radius: 10px;
            padding: 1.5rem;
        }
        
        .tip-card h4 {
            color: #0284c7;
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        /* UTILITÁRIOS */
        .text-center { text-align: center; }
        .mb-2 { margin-bottom: 1rem; }
        .mb-4 { margin-bottom: 2rem; }
        .mt-4 { margin-top: 2rem; }
        
        .highlight-box {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            border-radius: 10px;
            padding: 1.5rem;
            margin: 2rem 0;
        }
        
        .highlight-box h4 {
            color: #d97706;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        @media print {
            .page-break {
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    <!-- CAPA -->
    <div class="cover">
        <h1>GymMind</h1>
        <div class="premium">P R E M I U M &nbsp;&nbsp; E D I T I O N</div>
        <h2>PLANO NUTRICIONAL PERSONALIZADO</h2>
        
        <div class="client-card">
            <h3>ELABORADO ESPECIALMENTE PARA:</h3>
            <div class="client-name">${data.client.name.toUpperCase()}</div>
            <div class="client-info">
                <div><strong>Data:</strong> ${data.currentDate}</div>
                <div><strong>Plano:</strong> ${data.client.plan}</div>
                <div><strong>Idade:</strong> ${data.client.age}</div>
                <div><strong>Sexo:</strong> ${data.client.gender}</div>
            </div>
        </div>
    </div>
    
    <div class="page-break"></div>
    
    <!-- DASHBOARD NUTRICIONAL -->
    <div class="section">
        <div class="section-header">
            <h2>DASHBOARD NUTRICIONAL</h2>
            <p>Suas necessidades calculadas com precisão</p>
        </div>
        
        <div class="nutrition-dashboard">
            <div class="calories-card">
                <h3>NECESSIDADE CALÓRICA DIÁRIA</h3>
                <div class="calories-number">${data.nutrition.calories}</div>
                <p>kcal/dia</p>
                <small>Baseado no seu perfil e objetivos</small>
            </div>
            
            <div>
                <h3 class="mb-2">DISTRIBUIÇÃO DE MACRONUTRIENTES</h3>
                <div class="macros-grid">
                    <div class="macro-card protein">
                        <h4>Proteínas</h4>
                        <div class="macro-value">${data.nutrition.protein}</div>
                        <small>Músculos e recuperação</small>
                    </div>
                    <div class="macro-card carbs">
                        <h4>Carboidratos</h4>
                        <div class="macro-value">${data.nutrition.carbs}</div>
                        <small>Energia e performance</small>
                    </div>
                    <div class="macro-card fats">
                        <h4>Gorduras</h4>
                        <div class="macro-value">${data.nutrition.fats}</div>
                        <small>Hormônios e vitaminas</small>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="highlight-box">
            <h4>💡 DICA PROFISSIONAL</h4>
            <p>Esta distribuição foi calculada especificamente para seus objetivos. Mantenha consistência por pelo menos 4 semanas para resultados ótimos.</p>
        </div>
    </div>
    
    <div class="page-break"></div>
    
    <!-- PLANO ALIMENTAR -->
    <div class="section">
        <div class="section-header">
            <h2>PLANO ALIMENTAR DETALHADO</h2>
            <p>Suas refeições organizadas para máximos resultados</p>
        </div>
        
        ${data.meals.map(meal => `
            <div class="meal-card">
                <div class="meal-header">
                    <div>
                        <div class="meal-name">${meal.name}</div>
                        <div class="meal-time">${meal.time}</div>
                    </div>
                    <div class="meal-calories">${meal.calories} kcal</div>
                </div>
                <div class="meal-content">
                    <h4 class="mb-2">🍽️ ALIMENTOS E QUANTIDADES:</h4>
                    <ul class="foods-list">
                        ${meal.foods.map(food => `<li>${food}</li>`).join('')}
                    </ul>
                    
                    <div class="meal-macros">
                        <div>
                            <strong>Proteínas</strong><br>
                            ${meal.macros.protein}
                        </div>
                        <div>
                            <strong>Carboidratos</strong><br>
                            ${meal.macros.carbs}
                        </div>
                        <div>
                            <strong>Gorduras</strong><br>
                            ${meal.macros.fats}
                        </div>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
    
    <div class="page-break"></div>
    
    <!-- LISTA DE COMPRAS -->
    <div class="section">
        <div class="section-header">
            <h2>LISTA DE COMPRAS INTELIGENTE</h2>
            <p>Organizada por setores do supermercado</p>
        </div>
        
        ${Object.entries(data.shoppingList).map(([category, items]) => `
            <div class="shopping-category">
                <div class="category-header">
                    ${this.getCategoryIcon(category)} ${category.toUpperCase()}
                </div>
                <div class="category-items">
                    ${items.map(item => `
                        <div class="shopping-item">
                            <input type="checkbox" /> ${item}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('')}
    </div>
    
    <div class="page-break"></div>
    
    <!-- HIDRATAÇÃO E DICAS -->
    <div class="section">
        <div class="section-header">
            <h2>HIDRATAÇÃO E DICAS PROFISSIONAIS</h2>
            <p>Maximize seus resultados</p>
        </div>
        
        <div class="highlight-box" style="background: #ecfeff; border-color: #0891b2;">
            <h4 style="color: #0891b2;">💧 HIDRATAÇÃO DIÁRIA: 2,5L</h4>
            <ul style="margin-top: 1rem;">
                <li>• 500ml ao acordar (jejum)</li>
                <li>• 250ml antes de cada refeição</li>
                <li>• 600ml durante exercícios</li>
                <li>• Monitore: urina clara = hidratado</li>
            </ul>
        </div>
        
        <h3 class="mt-4 mb-2">🎯 DICAS PARA O SUCESSO</h3>
        <div class="tips-grid">
            ${data.tips.map(tip => `
                <div class="tip-card">
                    <p>${tip}</p>
                </div>
            `).join('')}
        </div>
        
        <div class="highlight-box" style="background: #fef2f2; border-color: #dc2626; margin-top: 2rem;">
            <h4 style="color: #dc2626;">⚠️ IMPORTANTE</h4>
            <p>Este plano foi elaborado por profissionais especializados. Recomenda-se acompanhamento nutricional personalizado para melhores resultados.</p>
        </div>
    </div>
</body>
</html>`;
  }

  getCategoryIcon(category) {
    const icons = {
      'Hortifruti': '🥬',
      'Açougue': '🥩',
      'Padaria': '🍞', 
      'Laticínios': '🥛',
      'Mercearia': '🏪',
      'Outros': '📦'
    };
    return icons[category] || '📋';
  }

  calculateAge(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const now = new Date();
    return Math.floor((now - birth) / (365.25 * 24 * 60 * 60 * 1000));
  }
}

module.exports = new PuppeteerPDFService();