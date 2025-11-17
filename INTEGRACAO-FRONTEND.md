# 📋 Documentação de Integração - GymMind Backend

## ✅ Status do Backend
**Estado:** Pronto para deploy e integração
**Versão:** 1.0.0
**Database:** Firebase Firestore (100% persistente)

---

## 🗄️ Armazenamento de Dados

### Onde os dados são guardados?
**Todos os dados são persistidos no Firebase Firestore** (banco de dados NoSQL em nuvem):

- ✅ **Usuários** → Coleção `users`
- ✅ **Planos de Dieta** → Coleção `dietPlans`
- ✅ **Planos de Treino** → Coleção `workoutPlans`
- ✅ **Transações/Pagamentos** → Coleção `transactions`
- ✅ **Preferências** → Coleção `preferences`
- ✅ **PDFs** → Armazenados localmente em `/uploads/pdfs/` (temporários)

**Importante:** Nenhum dado é armazenado em memória. Tudo é persistido em tempo real no Firebase.

---

## 🌐 Informações do Servidor

### URLs
```
Desenvolvimento: http://localhost:3003
Produção: [A ser definido após deploy]
```

### Health Check
```bash
GET /api/health
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "GymMind Backend está funcionando! 🚀",
  "database": "Conectado",
  "services": {
    "ai": "Configurado",
    "firebase": "Conectado",
    "pdf": "Disponível"
  }
}
```

---

## 🔐 Autenticação (Firebase Auth)

### Sistema de Autenticação
O backend usa **Firebase Authentication** para gerenciar usuários.

### Endpoints de Autenticação

#### 1. Registro de Usuário
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "senha123",
  "name": "Nome do Usuário"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Usuário criado com sucesso",
  "data": {
    "user": {
      "id": "uid-firebase",
      "email": "usuario@exemplo.com",
      "name": "Nome do Usuário",
      "subscription": {
        "plan": "free",
        "status": "active"
      }
    },
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 2. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "senha123"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Login realizado com sucesso",
  "data": {
    "user": {
      "id": "uid-firebase",
      "email": "usuario@exemplo.com",
      "name": "Nome do Usuário",
      "subscription": {
        "plan": "free",
        "status": "active"
      }
    },
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 3. Verificar Token
```http
POST /api/auth/verify-token
Authorization: Bearer {token}
```

#### 4. Obter Perfil do Usuário
```http
GET /api/auth/profile
Authorization: Bearer {token}
```

---

## 🍎 Endpoints Principais

### 1. Gerar Dieta Completa
```http
POST /api/generate-diet
Content-Type: application/json

{
  "userId": "uid-opcional",
  "personal": {
    "nome": "João Silva",
    "peso": "70",
    "altura": "175",
    "idade": "25",
    "objetivo": "emagrecer",
    "calorias": "2000"
  },
  "gender": "masculino",
  "meals": {
    "cafe": ["🥣 Tapioca", "🍎 Fruta"],
    "lanche-manha": ["🥛 Whey", "🍌 Banana"],
    "almoco": ["🍗 Frango", "🍚 Arroz"],
    "lanche-tarde": ["🥤 Whey"],
    "jantar": ["🐟 Salmão", "🥗 Salada"]
  }
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "data": {
    "dietPlan": "Texto completo do plano de dieta gerado pela IA...",
    "pdf": {
      "filename": "dieta-2025-11-17.pdf",
      "downloadUrl": "/api/files/pdfs/dieta-2025-11-17.pdf",
      "size": 245678
    },
    "metadata": {
      "generatedAt": "2025-11-17T18:30:00.000Z",
      "tokens": 1500,
      "model": "gpt-4"
    }
  }
}
```

**Importante:**
- ✅ Dados salvos automaticamente no Firebase
- ✅ PDF gerado e disponível para download
- ✅ Uso do usuário incrementado automaticamente

### 2. Processar Pagamento (Simulado)
```http
POST /api/process-payment
Content-Type: application/json

{
  "planType": "dieta-treino",
  "userData": {
    "userId": "uid-opcional",
    "personal": { /* mesmo formato acima */ },
    "gender": "masculino",
    "meals": { /* mesmo formato acima */ }
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "paymentApproved": true,
  "data": {
    "dietPlan": "Plano gerado...",
    "pdf": {
      "filename": "dieta-premium.pdf",
      "downloadUrl": "/api/files/pdfs/dieta-premium.pdf"
    },
    "planType": "dieta-treino",
    "generatedAt": "2025-11-17T18:30:00.000Z"
  }
}
```

### 3. Buscar Dietas do Usuário (Autenticado)
```http
GET /api/my-diets
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "doc-id-firebase",
      "planType": "custom",
      "createdAt": "2025-11-17T18:30:00.000Z",
      "pdfInfo": {
        "filename": "dieta.pdf",
        "url": "/api/files/pdfs/dieta.pdf"
      },
      "hasContent": true
    }
  ],
  "count": 1
}
```

### 4. Testar IA
```http
POST /api/test-ai
Content-Type: application/json
```

**Sem body necessário.** Testa se a IA está funcionando.

---

## 📦 Planos e Assinaturas

### Endpoints de Planos

#### Listar Planos Disponíveis
```http
GET /api/plans/health
```

#### Obter Status da Assinatura
```http
GET /api/payment/subscription-status
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "plan": "free",
    "planName": "Plano Gratuito",
    "status": "active",
    "limits": {
      "plansPerMonth": 3,
      "pdfExports": 1
    },
    "usage": {
      "plansGenerated": 1,
      "pdfExports": 1
    },
    "canGenerate": true
  }
}
```

#### Criar Checkout (Simulado)
```http
POST /api/payment/create-checkout
Authorization: Bearer {token}
Content-Type: application/json

{
  "planId": "premium"
}
```

#### Simular Pagamento (Desenvolvimento)
```http
POST /api/payment/simulate-payment
Authorization: Bearer {token}
Content-Type: application/json

{
  "planId": "premium",
  "action": "success"
}
```

---

## 🎯 Objetivos Disponíveis

Para o campo `objetivo` nas dietas:
- `emagrecer` - Perda de peso
- `emagrecer-massa` - Perda de peso com ganho de massa
- `ganhar-massa` - Ganho de massa muscular
- `definicao-massa` - Definição muscular

---

## 📊 Planos Disponíveis

| Plano | ID | Preço (R$) | Limites |
|-------|----|-----------:|---------|
| Gratuito | `free` | 0,00 | 3 planos/mês, 1 PDF |
| Dieta Personalizada | `basic` | 9,99 | 10 planos/mês, 5 PDFs |
| Dieta + Treino | `premium` | 14,99 | Ilimitado |
| Nutricionista | `pro` | 19,99 | Ilimitado + Suporte |

---

## 🔒 Headers Obrigatórios

### Para rotas autenticadas:
```http
Authorization: Bearer {seu-token-firebase}
Content-Type: application/json
```

### CORS
O backend aceita requisições das seguintes origens:
- `http://localhost:3000`
- `http://localhost:5500`
- `http://localhost:5501`
- `http://127.0.0.1:5500`
- `http://127.0.0.1:5501`

**Para produção:** Adicionar URL do frontend nas variáveis de ambiente:
```env
FRONTEND_URL=https://seu-frontend.com
```

---

## ⚠️ Tratamento de Erros

### Formato de Erro Padrão
```json
{
  "success": false,
  "error": "Mensagem de erro legível",
  "details": "Detalhes técnicos (apenas em desenvolvimento)"
}
```

### Códigos HTTP Comuns
- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Requisição inválida (dados incorretos)
- `401` - Não autenticado (token inválido ou ausente)
- `403` - Não autorizado (sem permissão)
- `404` - Não encontrado
- `500` - Erro interno do servidor

---

## 🚀 Fluxo de Integração Recomendado

### 1. Autenticação
```javascript
// 1. Registrar ou fazer login
const response = await fetch('http://localhost:3003/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    password: 'senha123'
  })
});

const { data } = await response.json();
const token = data.token; // Salvar no localStorage/sessionStorage
```

### 2. Gerar Dieta
```javascript
// 2. Gerar uma dieta
const dietResponse = await fetch('http://localhost:3003/api/generate-diet', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // Opcional para usuários anônimos
  },
  body: JSON.stringify({
    userId: data.user.id, // Opcional
    personal: {
      nome: "João",
      peso: "70",
      altura: "175",
      idade: "25",
      objetivo: "emagrecer",
      calorias: "2000"
    },
    gender: "masculino",
    meals: {
      cafe: ["Tapioca", "Fruta"],
      almoco: ["Frango", "Arroz"]
      // ...
    }
  })
});

const dietData = await dietResponse.json();
console.log(dietData.data.dietPlan); // Plano gerado
console.log(dietData.data.pdf.downloadUrl); // URL do PDF
```

### 3. Buscar Histórico
```javascript
// 3. Buscar dietas salvas do usuário
const historyResponse = await fetch('http://localhost:3003/api/my-diets', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const history = await historyResponse.json();
console.log(history.data); // Array de dietas
```

---

## 🔥 Firebase - Persistência Garantida

### ✅ Confirmações de Persistência

1. **Inicialização do Servidor:**
```
🔥 Firebase Admin SDK inicializado com sucesso!
📦 Projeto: gymmind-3250f
Firebase: ✅ Conectado e persistindo dados corretamente!
Firebase: ✅ Leitura confirmada
```

2. **Ao Salvar Dados:**
```
💾 Plano salvo no Firebase com ID: abc123xyz
📊 Uso incrementado para usuário: uid-123
```

### ⚠️ Se Firebase Falhar
O sistema **NÃO permite** continuar sem persistência:
```json
{
  "success": false,
  "error": "Sistema de armazenamento não disponível. Configure o Firebase."
}
```

---

## 📝 Variáveis de Ambiente Necessárias

Para deploy, configure:

```env
# Servidor
NODE_ENV=production
PORT=3003

# Firebase (OBRIGATÓRIO para persistência)
FIREBASE_PROJECT_ID=gymmind-3250f
FIREBASE_PRIVATE_KEY_ID=xxxxx
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@gymmind-3250f.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=xxxxx

# IA (pelo menos uma necessária)
OPENAI_API_KEY=sk-proj-xxxxx

# URLs
FRONTEND_URL=https://seu-frontend.com
BACKEND_URL=https://seu-backend.com

# Stripe (para pagamentos reais)
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

---

## 📚 Coleções Firebase (Estrutura de Dados)

### `users` Collection
```javascript
{
  email: "usuario@exemplo.com",
  name: "Nome do Usuário",
  subscription: {
    plan: "free", // free, basic, premium, pro
    status: "active",
    planLimits: {
      plansPerMonth: 3,
      pdfExports: 1
    }
  },
  usage: {
    plansGenerated: 5,
    pdfExports: 2,
    currentMonthUsage: {
      plans: 2,
      pdfs: 1,
      month: 10,
      year: 2025
    }
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `dietPlans` Collection
```javascript
{
  userId: "uid-123",
  userData: { /* dados enviados */ },
  dietPlan: "Texto completo do plano...",
  pdfInfo: {
    filename: "dieta.pdf",
    url: "/api/files/pdfs/dieta.pdf",
    size: 245678
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `transactions` Collection
```javascript
{
  userId: "uid-123",
  planType: "premium",
  paymentStatus: "approved",
  amount: 14.99,
  createdAt: Timestamp
}
```

---

## 🎨 Exemplo Completo de Integração

```javascript
class GymMindAPI {
  constructor() {
    this.baseURL = 'http://localhost:3003';
    this.token = localStorage.getItem('gymMindToken');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers
    });

    return response.json();
  }

  // Autenticação
  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data.success) {
      this.token = data.data.token;
      localStorage.setItem('gymMindToken', this.token);
    }

    return data;
  }

  async register(email, password, name) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });

    if (data.success) {
      this.token = data.data.token;
      localStorage.setItem('gymMindToken', this.token);
    }

    return data;
  }

  // Dietas
  async generateDiet(userData) {
    return this.request('/api/generate-diet', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  async getMyDiets() {
    return this.request('/api/my-diets');
  }

  // Planos
  async getSubscriptionStatus() {
    return this.request('/api/payment/subscription-status');
  }
}

// Uso
const api = new GymMindAPI();

// Login
await api.login('usuario@exemplo.com', 'senha123');

// Gerar dieta
const diet = await api.generateDiet({
  personal: {
    nome: "João",
    peso: "70",
    altura: "175",
    idade: "25",
    objetivo: "emagrecer",
    calorias: "2000"
  },
  gender: "masculino",
  meals: { /* ... */ }
});

console.log(diet.data.dietPlan);
```

---

## 📞 Suporte e Dúvidas

Para dúvidas sobre a integração:
1. Verifique `/api/health` para confirmar que o backend está rodando
2. Consulte os logs do servidor para erros detalhados
3. Todos os erros retornam mensagens descritivas em português

---

## ✅ Checklist de Integração

- [ ] Backend rodando e respondendo em `/api/health`
- [ ] Firebase configurado e persistindo dados
- [ ] Endpoints de autenticação funcionando
- [ ] Consegue gerar dieta e receber PDF
- [ ] CORS configurado para URL do frontend
- [ ] Tokens sendo salvos e enviados corretamente
- [ ] Tratamento de erros implementado
- [ ] Deploy realizado com variáveis de ambiente corretas

---

**Última atualização:** 17/11/2025
**Versão do documento:** 1.0
**Status:** ✅ Pronto para integração
