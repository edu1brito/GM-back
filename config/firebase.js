// ====================================
// config/firebase.js - Configuração Firebase
// ====================================
const admin = require('firebase-admin');

// Verificar se Firebase já foi inicializado
if (!admin.apps.length) {
  // Configuração usando variáveis de ambiente
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
  });

  console.log('🔥 Firebase Admin SDK inicializado com sucesso!');
} else {
  console.log('🔥 Firebase Admin SDK já estava inicializado');
}

// Exportar instâncias
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

// Configurações do Firestore
db.settings({
  timestampsInSnapshots: true
});

module.exports = {
  admin,
  db,
  auth,
  storage,
  
  // Utilitários
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
  
  // Verificar se está configurado
  isConfigured: () => {
    return !!(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_CLIENT_EMAIL
    );
  }
};