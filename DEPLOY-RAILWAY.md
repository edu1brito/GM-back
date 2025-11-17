# 🚂 Guia de Deploy - Railway

## ✅ Checklist Pré-Deploy

- [x] ✅ Firebase configurado
- [x] ✅ Código testado localmente
- [x] ✅ CORS configurado dinamicamente
- [x] ✅ .gitignore criado
- [ ] ⚠️ Variáveis de ambiente prontas
- [ ] ⚠️ Deploy realizado

---

## 🚀 Passo a Passo - Deploy no Railway

### 1️⃣ Criar Conta no Railway

1. Acesse: https://railway.app
2. Clique em **"Start a New Project"**
3. Login com GitHub

### 2️⃣ Conectar Repositório

1. **New Project** → **Deploy from GitHub repo**
2. Selecione: `edu1brito/GM-back`
3. Railway detecta automaticamente que é Node.js
4. Aguarde o primeiro deploy (vai falhar - é normal, faltam variáveis)

### 3️⃣ Configurar Variáveis de Ambiente

No painel do Railway:

1. Clique no seu projeto
2. Vá em **"Variables"**
3. Clique em **"New Variable"**
4. Adicione **TODAS** as variáveis abaixo:

```env
NODE_ENV=production
PORT=3003

FIREBASE_PROJECT_ID=gymmind-3250f
FIREBASE_PRIVATE_KEY_ID=7f7039a934591fd8c3822fa8c255c39b3350be07
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDbHbb6lPPMWCgH\nQc7D+6SXMa6cFZy3eQ9u8S2jEAKi2xRTWy5py9CBF6+pmfgoDfyvgG+LrRQ93gFl\nQDClX6z5gs1HjWjOQl6zdqZwzs5uQoaUNOcYsbzjzSYw8MBEvNPaoJOlBwU0Gil+\n/QmO5pPv5ED8TliFhSODh8uuvN1ZBPTHxp7tSL/Mkvv68L5hiTWgsvDdqpVAfEdK\ngvQwR6BsX6dHDzeFbxfkKN+kftrvEiQxwilKjm787POvOoZ5RooGvnVC/dWtVm21\nHRyyI8ZMEIg9B++Le+0TvhRL6g/5004bnc7PpPB+wQaXCZIRRMGfElvW5S/So0Vh\nz2q3hFezAgMBAAECggEABqwb+KYf2mwgzpUZbRcKRwmzQyYr/zDyNbL7Fx5osM7d\nCpYZ5AzZzOSMwSxixc155q+Ri1Ok7HwIgi3MjWyhbCOoiUeWwRknoG1k2hs3ZrIj\nPlDHbMAU0Wxbf7KvwtLBMhohBNh24cRI2TNutBRKEvcEvOoh1fGySCdoHhUQOc1X\nZ41X5pQsCoM0iD3SSijNlTe+HgcEc4+dxfNpHM8nu64SgVzEuVk1oofBokG9vv8U\npTDDCNVa4rPoS+wBwnj8ymMVz+lDCn/k+BQvBgxJk0x11lBe6XCVd2wGUrSBrB4N\nuRyg0vXBVjGXIZ7Yw2PBv/Gh/s0If6tVpKZQa1p2iQKBgQDzVmC3PMz3tG/GVr28\nY7DL6sbpDYVuhOt4y9yqag8LVsuOXc9ESgGhkpWWqjrfh6L/uK98aZNzoJtE2RCJ\nMnC8y4VnSrERC1M9iMHJ2p/7p3ddNz9eC94upQG8aQQURDJdtK7SwNsJLsvoG/jq\nVLWGq/k+D2D8tKQxKOYL1j2SHQKBgQDmhKwOyAjZwGgWzCJDdWN03j66EDlbmDHs\ncGMa7LZ7UlJaO/8on58FuVhBlBuz0NurNyvf22obS17Ec7Fy7nvuPHqUPBBa9mKG\nKmm4aIO2K+1NC5Jy6Do2VDRmwiqmJ1FtXcfeOMofP4EoKPhRlsdw3V68fTJyvQoo\nBZscuzFoDwKBgBY+lDLL/RS7yuf/r/KTzmqluK8/TC5ROlFdmXt+nId11L/b9YGR\nnlqN0tzmDOG4PX9Q+8HMyOzuBqOhkDBqiwHHPRe3LT6YoXBjmwt/z9Yqde/wh/tp\n7FKpROJbW0MbBNuqE70yYhOR0pQSUovhWILKH8u7jisrvEK+MWFtoU1FAoGAR8Wl\nIJENmGa8weRbAq/pAHk2BI6KnUccvCYd5UMwaeMuuuOVRVu1kn2ryfdITMtJqdxq\nr69MMSVdY0M2S7ePJJT2AXNWEExITsej1QPNhonUv7lLprVBcqrzCc+IoeT6CFg7\no6gA3ovSNePTtOuCO1Tha0R70ZekMuPT8LUj4+cCgYBojLa8DZ/utwWdzsZWxKOQ\n3U9Rp7ZzpLzFIiikg6LYVvhTBHtr3Y1eizwkg3dU6sCULEU5P9t9/IyxsSN9BQqf\nvuNqtqdMh3e2oOkNw56VLI5ftvyRmkZBfmz7U+cJulwn/GcTsim1C6ja9Fnoflfp\nVt19DRkQ4ig2SN3LLCMFNQ==\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@gymmind-3250f.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=112743569179305337855

OPENAI_API_KEY=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

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=edudbcprof@gmail.com
EMAIL_PASS=pnph xkca hhgw dwwy

STRIPE_SECRET_KEY=sk_test_51RydEF961zqGU1lkvEppA66uXspaPIHn7ATKnp6c8aXc7y5sOjOevdLM7pptDS3yJJSZ7qCcWTMFfhaVZGX2IHQr006IfKimiY
STRIPE_WEBHOOK_SECRET=whsec_zwF09njXeGbFnCZ8yDnPz8pGCL5qGeuO

PUPPETEER_SKIP_DOWNLOAD=true

# ⚠️ IMPORTANTE: Ajuste essas após deploy
FRONTEND_URL=https://seu-frontend.vercel.app
BACKEND_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

**💡 Dica:** Railway tem uma variável especial `${{RAILWAY_PUBLIC_DOMAIN}}` que pega automaticamente a URL do seu deploy!

### 4️⃣ Redeploy

Após adicionar as variáveis:

1. Vá em **"Deployments"**
2. Clique nos **3 pontinhos** do último deploy
3. **"Redeploy"**

Ou simplesmente faça um novo commit no GitHub que o Railway redeploy automaticamente.

### 5️⃣ Obter URL do Deploy

1. No painel do Railway, clique em **"Settings"**
2. Em **"Domains"**, clique em **"Generate Domain"**
3. Vai gerar algo tipo: `gymmind-back-production.up.railway.app`

**Copie essa URL!**

### 6️⃣ Atualizar FRONTEND_URL

1. Volte em **"Variables"**
2. Edite `FRONTEND_URL` com a URL do seu frontend
3. Exemplo: `https://gymmind.vercel.app`

---

## 🧪 Testar Deploy

```bash
# Substitua pela sua URL do Railway
curl https://seu-projeto.railway.app/api/health

# Deve retornar:
{
  "success": true,
  "message": "GymMind Backend está funcionando! 🚀",
  "database": "Conectado",
  "services": {
    "firebase": "Conectado"
  }
}
```

---

## 🔧 Comandos Úteis Railway

```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Ver logs em tempo real
railway logs

# Abrir painel
railway open

# Conectar a um projeto existente
railway link

# Ver variáveis
railway variables

# Executar comando no ambiente Railway
railway run node server.js
```

---

## ⚠️ Problemas Comuns

### ❌ "Application failed to respond"
**Solução:** Verifique se a variável `PORT` está configurada como `3003` ou remova (Railway usa `PORT` dinâmica)

### ❌ "Firebase not configured"
**Solução:** Verifique se TODAS as variáveis do Firebase foram copiadas corretamente (principalmente `FIREBASE_PRIVATE_KEY` com as quebras de linha `\n`)

### ❌ "CORS error" no frontend
**Solução:**
1. Verifique se `FRONTEND_URL` está configurada com a URL correta
2. Certifique-se que a URL não tem `/` no final
3. Exemplo correto: `https://gymmind.vercel.app`
4. Exemplo errado: `https://gymmind.vercel.app/`

### ❌ "Module not found"
**Solução:** Railway deve rodar `npm install` automaticamente. Se não:
1. Vá em **Settings** → **Build Command**
2. Adicione: `npm install`

---

## 📊 Monitoramento

### Ver Logs
No painel do Railway:
1. **"Deployments"** → Clique no deploy ativo
2. **"View Logs"**

### Métricas
Railway mostra automaticamente:
- CPU usage
- RAM usage
- Network
- Requests

---

## 💰 Custos

Railway oferece:
- ✅ **$5 grátis por mês** (trial)
- ✅ Depois: **$0.000463/GB-hora** (RAM)
- ✅ Depois: **$0.000231/vCPU-hora** (CPU)

**Estimativa para este backend:**
- ~512MB RAM = **~$3-5/mês**
- Bem mais barato que Heroku!

---

## 🔄 Atualizações Automáticas

Railway faz deploy automático a cada push no GitHub:

```bash
git add .
git commit -m "feat: nova funcionalidade"
git push

# Railway detecta e faz deploy automaticamente! 🚀
```

---

## 🌐 Domínio Customizado (Opcional)

Se tiver um domínio próprio:

1. Railway → **Settings** → **Domains**
2. **Custom Domain**
3. Adicione: `api.gymmind.com`
4. Configure DNS (CNAME) no seu provedor:
   - Name: `api`
   - Value: `seu-projeto.railway.app`

---

## ✅ Checklist Final

Após deploy:

- [ ] ✅ Health check funcionando: `https://seu-backend.railway.app/api/health`
- [ ] ✅ Firebase conectado (logs mostram "Firebase: ✅ Conectado")
- [ ] ✅ FRONTEND_URL configurada corretamente
- [ ] ✅ Frontend consegue fazer requisições sem erro CORS
- [ ] ✅ Geração de dieta funciona
- [ ] ✅ Login/registro funciona
- [ ] ✅ PDFs sendo gerados

---

## 📞 Recursos

- **Railway Docs:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **Status Page:** https://railway.app/legal/fair-use

---

**Última atualização:** 17/11/2025
**Versão:** 1.0 - Railway
