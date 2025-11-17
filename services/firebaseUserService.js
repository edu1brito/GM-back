// ====================================
// services/firebaseUserService.js - Substituto COMPLETO do models/User.js
// ====================================
const { admin, db, auth, FieldValue, Timestamp } = require('../config/firebase');
const validator = require('validator');

class FirebaseUserService {
  constructor() {
    this.collection = db.collection('users');
  }

  // ====================================
  // MÉTODOS PRINCIPAIS (equivalente ao Mongoose)
  // ====================================

  // Criar usuário (só dados no Firestore - Firebase Auth gerencia autenticação)
  async createUser(uid, userData) {
    try {
      // Validar dados
      const validation = this.validateUserData(userData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // Dados padrão do usuário
      const newUser = {
        email: userData.email.toLowerCase().trim(),
        name: userData.name.trim(),
        
        subscription: {
          plan: userData.subscription?.plan || 'free',
          status: 'active',
          startDate: FieldValue.serverTimestamp(),
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          planLimits: this.getPlanLimits(userData.subscription?.plan || 'free'),
          planHistory: []
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
        
        profile: {
          firstName: userData.profile?.firstName || '',
          lastName: userData.profile?.lastName || '',
          phone: userData.profile?.phone || '',
          birthDate: userData.profile?.birthDate || null,
          gender: userData.profile?.gender || null,
          timezone: userData.profile?.timezone || 'America/Sao_Paulo',
          language: userData.profile?.language || 'pt-BR'
        },
        
        privacy: {
          emailNotifications: userData.privacy?.emailNotifications ?? true,
          marketingEmails: userData.privacy?.marketingEmails ?? false,
          shareDataForResearch: userData.privacy?.shareDataForResearch ?? false
        },
        
        security: {
          emailVerified: userData.security?.emailVerified || false,
          emailVerificationToken: userData.security?.emailVerificationToken || null,
          passwordResetToken: null,
          passwordResetExpires: null,
          loginAttempts: 0,
          lockUntil: null
        },
        
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        isAdmin: userData.isAdmin || false,
        lastLogin: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Salvar no Firestore usando o UID do Firebase Auth
      await this.collection.doc(uid).set(newUser);
      
      // Buscar e retornar o documento criado
      const doc = await this.collection.doc(uid).get();
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      throw new Error('Erro ao criar usuário: ' + error.message);
    }
  }

  // Buscar usuário por ID (UID do Firebase)
  async getUserById(uid) {
    try {
      const doc = await this.collection.doc(uid).get();
      if (!doc.exists) return null;
      
      const userData = doc.data();
      
      // Converter timestamps Firestore para Date
      if (userData.createdAt && userData.createdAt.toDate) {
        userData.createdAt = userData.createdAt.toDate();
      }
      if (userData.updatedAt && userData.updatedAt.toDate) {
        userData.updatedAt = userData.updatedAt.toDate();
      }
      if (userData.lastLogin && userData.lastLogin.toDate) {
        userData.lastLogin = userData.lastLogin.toDate();
      }
      
      return { id: doc.id, ...userData };
    } catch (error) {
      console.error('Erro ao buscar usuário por ID:', error);
      return null;
    }
  }

  // Buscar usuário por email
  async getUserByEmail(email, activeOnly = true) {
    try {
      let query = this.collection.where('email', '==', email.toLowerCase());
      
      if (activeOnly) {
        query = query.where('isActive', '==', true);
      }
      
      const snapshot = await query.limit(1).get();
      
      if (snapshot.empty) return null;
      
      const doc = snapshot.docs[0];
      const userData = doc.data();
      
      // Converter timestamps
      if (userData.createdAt && userData.createdAt.toDate) {
        userData.createdAt = userData.createdAt.toDate();
      }
      if (userData.updatedAt && userData.updatedAt.toDate) {
        userData.updatedAt = userData.updatedAt.toDate();
      }
      
      return { id: doc.id, ...userData };
    } catch (error) {
      console.error('Erro ao buscar usuário por email:', error);
      return null;
    }
  }

  // Atualizar usuário
  async updateUser(uid, updateData) {
    try {
      // Verificar reset mensal automaticamente
      const user = await this.getUserById(uid);
      if (user) {
        updateData = this.checkMonthlyReset(user, updateData);
      }

      // Preparar dados para atualização (suporte a nested fields)
      const updates = this.flattenUpdateData({
        ...updateData,
        updatedAt: FieldValue.serverTimestamp()
      });

      await this.collection.doc(uid).update(updates);
      return await this.getUserById(uid);
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw new Error('Erro ao atualizar usuário: ' + error.message);
    }
  }

  // Desativar usuário
  async deactivateUser(uid, reason = '') {
    try {
      await this.collection.doc(uid).update({
        isActive: false,
        deactivatedAt: FieldValue.serverTimestamp(),
        deactivationReason: reason,
        updatedAt: FieldValue.serverTimestamp()
      });
      
      // Desabilitar no Firebase Auth também
      await auth.updateUser(uid, { disabled: true });
      
      return true;
    } catch (error) {
      console.error('Erro ao desativar usuário:', error);
      throw new Error('Erro ao desativar usuário: ' + error.message);
    }
  }

  // ====================================
  // MÉTODOS DE VERIFICAÇÃO E VALIDAÇÃO
  // ====================================

  // Verificar se pode gerar plano
  canGeneratePlan(user) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Reset contador se mudou o mês
    let usage = { ...user.usage };
    if (usage.currentMonthUsage.month !== currentMonth || usage.currentMonthUsage.year !== currentYear) {
      usage.currentMonthUsage = {
        plans: 0,
        pdfs: 0,
        month: currentMonth,
        year: currentYear
      };
    }
    
    // Verificar se assinatura está ativa
    if (user.subscription?.status !== 'active') {
      return { 
        canGenerate: false, 
        reason: 'Assinatura inativa',
        currentStatus: user.subscription?.status || 'unknown'
      };
    }
    
    const plan = user.subscription?.plan || 'free';
    const planLimits = user.subscription?.planLimits || this.getPlanLimits(plan);
    
    // Usuários premium/pro = ilimitado
    if (planLimits.plansPerMonth === -1) {
      return { 
        canGenerate: true, 
        unlimited: true,
        plan
      };
    }
    
    // Verificar limite mensal
    const used = usage.currentMonthUsage.plans;
    const remaining = Math.max(0, planLimits.plansPerMonth - used);
    
    return { 
      canGenerate: remaining > 0,
      remaining,
      limit: planLimits.plansPerMonth,
      used,
      plan,
      resetDate: new Date(currentYear, currentMonth + 1, 1) // Primeiro dia do próximo mês
    };
  }

  // Incrementar uso de planos
  async incrementPlanUsage(uid) {
    try {
      const user = await this.getUserById(uid);
      if (!user) return false;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      let updates = {
        'usage.plansGenerated': FieldValue.increment(1),
        'usage.lastPlanGenerated': FieldValue.serverTimestamp(),
        'usage.currentMonthUsage.plans': FieldValue.increment(1)
      };

      // Reset se mudou o mês
      if (user.usage.currentMonthUsage.month !== currentMonth || user.usage.currentMonthUsage.year !== currentYear) {
        updates = {
          'usage.plansGenerated': FieldValue.increment(1),
          'usage.lastPlanGenerated': FieldValue.serverTimestamp(),
          'usage.currentMonthUsage': {
            plans: 1,
            pdfs: user.usage.currentMonthUsage.pdfs || 0,
            month: currentMonth,
            year: currentYear
          }
        };
      }

      await this.updateUser(uid, updates);
      return true;
    } catch (error) {
      console.error('Erro ao incrementar uso de planos:', error);
      return false;
    }
  }

  // Incrementar uso de PDFs
  async incrementPdfUsage(uid) {
    try {
      const user = await this.getUserById(uid);
      if (!user) return false;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      let updates = {
        'usage.pdfExports': FieldValue.increment(1),
        'usage.currentMonthUsage.pdfs': FieldValue.increment(1)
      };

      // Reset se mudou o mês
      if (user.usage.currentMonthUsage.month !== currentMonth || user.usage.currentMonthUsage.year !== currentYear) {
        updates = {
          'usage.pdfExports': FieldValue.increment(1),
          'usage.currentMonthUsage': {
            plans: user.usage.currentMonthUsage.plans || 0,
            pdfs: 1,
            month: currentMonth,
            year: currentYear
          }
        };
      }

      await this.updateUser(uid, updates);
      return true;
    } catch (error) {
      console.error('Erro ao incrementar uso de PDFs:', error);
      return false;
    }
  }

  // Verificar se conta está bloqueada
  isAccountLocked(user) {
    if (!user.security?.lockUntil) return false;
    
    const lockUntil = user.security.lockUntil.toDate ? user.security.lockUntil.toDate() : new Date(user.security.lockUntil);
    return new Date() < lockUntil;
  }

  // Incrementar tentativas de login
  async incrementLoginAttempts(uid) {
    try {
      const user = await this.getUserById(uid);
      if (!user) return false;

      const maxAttempts = 5;
      const lockDuration = 30 * 60 * 1000; // 30 minutos
      
      let updates = {
        'security.loginAttempts': FieldValue.increment(1)
      };

      // Se já passou do tempo de bloqueio, reset
      if (user.security?.lockUntil) {
        const lockUntil = user.security.lockUntil.toDate ? user.security.lockUntil.toDate() : new Date(user.security.lockUntil);
        if (new Date() >= lockUntil) {
          updates = {
            'security.loginAttempts': 1,
            'security.lockUntil': FieldValue.delete()
          };
        }
      }

      // Se chegou no limite, bloquear
      const currentAttempts = user.security?.loginAttempts || 0;
      if (currentAttempts + 1 >= maxAttempts && !this.isAccountLocked(user)) {
        updates['security.lockUntil'] = new Date(Date.now() + lockDuration);
      }

      await this.updateUser(uid, updates);
      return true;
    } catch (error) {
      console.error('Erro ao incrementar tentativas de login:', error);
      return false;
    }
  }

  // Reset tentativas após login bem-sucedido
  async resetLoginAttempts(uid) {
    try {
      await this.updateUser(uid, {
        'security.loginAttempts': FieldValue.delete(),
        'security.lockUntil': FieldValue.delete(),
        lastLogin: FieldValue.serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Erro ao resetar tentativas de login:', error);
      return false;
    }
  }

  // ====================================
  // MÉTODOS UTILITÁRIOS
  // ====================================

  // Obter limites por plano
  getPlanLimits(plan) {
    const limits = {
      free: {
        plansPerMonth: 3,
        pdfExports: 1
      },
      basic: {
        plansPerMonth: 10,
        pdfExports: 5
      },
      premium: {
        plansPerMonth: -1, // Ilimitado
        pdfExports: -1     // Ilimitado
      },
      pro: {
        plansPerMonth: -1, // Ilimitado
        pdfExports: -1     // Ilimitado
      }
    };
    
    return limits[plan] || limits.free;
  }

  // Verificar reset mensal
  checkMonthlyReset(user, updateData) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    if (user.usage?.currentMonthUsage) {
      const userMonth = user.usage.currentMonthUsage.month;
      const userYear = user.usage.currentMonthUsage.year;
      
      if (userMonth !== currentMonth || userYear !== currentYear) {
        // Reset automático
        updateData['usage.currentMonthUsage'] = {
          plans: 0,
          pdfs: 0,
          month: currentMonth,
          year: currentYear
        };
      }
    }
    
    return updateData;
  }

  // Achatar dados para atualização (suporte a nested fields)
  flattenUpdateData(data, prefix = '') {
    const flattened = {};
    
    for (const key in data) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (data[key] && typeof data[key] === 'object' && !data[key].toDate && !data[key]._methodName) {
        // É um objeto comum (não Timestamp nem FieldValue)
        Object.assign(flattened, this.flattenUpdateData(data[key], fullKey));
      } else {
        flattened[fullKey] = data[key];
      }
    }
    
    return flattened;
  }

  // Validar dados do usuário
  validateUserData(userData) {
    const errors = [];

    // Email obrigatório e válido
    if (!userData.email) {
      errors.push('Email é obrigatório');
    } else if (!validator.isEmail(userData.email)) {
      errors.push('Email inválido');
    }

    // Nome obrigatório
    if (!userData.name) {
      errors.push('Nome é obrigatório');
    } else if (userData.name.trim().length < 2) {
      errors.push('Nome deve ter pelo menos 2 caracteres');
    } else if (userData.name.trim().length > 100) {
      errors.push('Nome muito longo');
    }

    // Validações opcionais
    if (userData.profile?.phone && !/^[\d\s\+\-\(\)]+$/.test(userData.profile.phone)) {
      errors.push('Telefone inválido');
    }

    if (userData.profile?.birthDate) {
      const age = (new Date() - new Date(userData.profile.birthDate)) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 13 || age > 120) {
        errors.push('Data de nascimento inválida');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Transformar dados para JSON (remover campos sensíveis)
  toSafeJSON(user) {
    const safeUser = { ...user };
    
    // Remover campos sensíveis
    if (safeUser.security) {
      const { emailVerificationToken, passwordResetToken, loginAttempts, lockUntil, ...safeSecurity } = safeUser.security;
      safeUser.security = safeSecurity;
    }
    
    return safeUser;
  }

  // Obter estatísticas
  async getStats() {
    try {
      const snapshot = await this.collection
        .where('isActive', '==', true)
        .get();

      const stats = {
        totalUsers: 0,
        byPlan: {},
        totalPlansGenerated: 0,
        totalPdfExports: 0
      };

      snapshot.forEach(doc => {
        const user = doc.data();
        const plan = user.subscription?.plan || 'free';
        
        stats.totalUsers++;
        stats.totalPlansGenerated += user.usage?.plansGenerated || 0;
        stats.totalPdfExports += user.usage?.pdfExports || 0;
        
        if (!stats.byPlan[plan]) {
          stats.byPlan[plan] = {
            count: 0,
            plansGenerated: 0,
            pdfExports: 0
          };
        }
        
        stats.byPlan[plan].count++;
        stats.byPlan[plan].plansGenerated += user.usage?.plansGenerated || 0;
        stats.byPlan[plan].pdfExports += user.usage?.pdfExports || 0;
      });

      return stats;
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return null;
    }
  }
}

// Exportar instância única
const firebaseUserService = new FirebaseUserService();
module.exports = { firebaseUserService };
