const nodemailer = require('nodemailer');
const fs = require('fs');

class EmailService {
  constructor() {
    // Apenas inicializar se as credenciais de email estiverem configuradas
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    } else {
      console.log('⚠️  Email não configurado - emails serão simulados');
      this.transporter = null;
    }
  }

  async sendPlanEmail(user, generatedPlan) {
    try {
      // Se não há configuração de email, simular envio
      if (!this.transporter) {
        console.log(`📧 [SIMULADO] Email enviado para ${user.email}: Seu plano está pronto!`);
        return {
          sent: true,
          sentAt: new Date(),
          attempts: 1,
          messageId: 'simulated-email-' + Date.now(),
          simulated: true
        };
      }

      const emailHtml = this.generateEmailTemplate(user, generatedPlan);
      
      const mailOptions = {
        from: `"GymMind" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: '🎉 Seu Plano Personalizado GymMind está pronto!',
        html: emailHtml,
        attachments: []
      };

      // Adicionar PDF como anexo se existir
      if (generatedPlan.pdf && generatedPlan.pdf.generated && generatedPlan.pdf.path && fs.existsSync(generatedPlan.pdf.path)) {
        mailOptions.attachments.push({
          filename: generatedPlan.pdf.filename,
          path: generatedPlan.pdf.path
        });
      }

      const result = await this.transporter.sendMail(mailOptions);

      return {
        sent: true,
        sentAt: new Date(),
        attempts: 1,
        messageId: result.messageId
      };

    } catch (error) {
      console.error('Erro ao enviar email:', error);
      
      return {
        sent: false,
        attempts: 1,
        error: error.message
      };
    }
  }

  generateEmailTemplate(user, generatedPlan) {
    const { content } = generatedPlan;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Seu Plano GymMind</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; }
            .section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stats { display: flex; justify-content: space-around; margin: 20px 0; }
            .stat { text-align: center; }
            .stat-number { font-size: 24px; font-weight: bold; color: #10b981; }
            .meal { margin: 15px 0; padding: 15px; background: #f3f4f6; border-radius: 6px; }
            .meal-title { font-weight: bold; color: #059669; margin-bottom: 10px; }
            .footer { background: #374151; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px; }
            .tips { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Seu Plano está Pronto!</h1>
                <p>Olá ${user.name}, sua jornada fitness personalizada começa agora!</p>
            </div>
            
            <div class="content">
                <div class="section">
                    <h2>📊 Seus Dados Calculados</h2>
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-number">${content.diet ? content.diet.bmr : 'N/A'}</div>
                            <div>BMR (kcal/dia)</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${content.diet ? content.diet.tdee : 'N/A'}</div>
                            <div>TDEE (kcal/dia)</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${content.diet ? content.diet.targetCalories : 'N/A'}</div>
                            <div>Meta Calórica</div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h2>🍽️ Resumo do Plano Alimentar</h2>
                    <p>${content.diet ? (content.diet.summary || 'Plano alimentar personalizado') : 'Plano alimentar personalizado'}</p>
                </div>

                ${content.workout ? `
                <div class="section">
                    <h2>💪 Resumo do Treino</h2>
                    <p>${content.workout.summary || 'Plano de treinos personalizado'}</p>
                    <ul>
                        <li><strong>Frequência:</strong> ${content.workout.frequency || 'N/A'}x por semana</li>
                        <li><strong>Duração:</strong> ${content.workout.duration || 'N/A'} minutos</li>
                    </ul>
                </div>
                ` : ''}

                <div class="tips">
                    <h3>💡 Dicas Importantes:</h3>
                    <ul>
                        <li>Beba pelo menos 2-3 litros de água por dia</li>
                        <li>Mantenha intervalos regulares entre as refeições</li>
                        <li>Inclua vegetais em pelo menos 2 refeições</li>
                        <li>Ajuste as porções conforme sua fome e saciedade</li>
                    </ul>
                </div>

                <div class="section" style="text-align: center;">
                    <h2>📎 Seu PDF Detalhado</h2>
                    <p>O plano completo com todos os detalhes está no arquivo PDF em anexo!</p>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">Acessar Dashboard</a>
                </div>
            </div>

            <div class="footer">
                <p><strong>GymMind</strong> - Seu parceiro na jornada fitness</p>
                <p>Dúvidas? Responda este email ou acesse nosso suporte.</p>
                <p style="font-size: 12px; color: #9ca3af;">
                    Este email foi enviado para ${user.email}. 
                    Se você não solicitou este plano, ignore este email.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Método para reenviar email em caso de falha
  async retryEmail(user, generatedPlan, attempt = 1) {
    if (attempt > 3) {
      throw new Error('Máximo de tentativas de email atingido');
    }

    try {
      const result = await this.sendPlanEmail(user, generatedPlan);
      result.attempts = attempt;
      return result;
    } catch (error) {
      console.log(`Tentativa ${attempt} falhou, tentando novamente...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Delay progressivo
      return this.retryEmail(user, generatedPlan, attempt + 1);
    }
  }
}

module.exports = new EmailService();