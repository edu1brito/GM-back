const fs = require('fs');
const path = require('path');

console.log('\n🧹 ================================');
console.log('🧹  LIMPEZA DO BACKEND GYMMIND');
console.log('🧹 ================================\n');

// Verificar se está na pasta correta
if (!fs.existsSync('server.js')) {
    console.log('❌ Erro: Execute este script na pasta backend');
    console.log('💡 Use: cd backend && node cleanup.js\n');
    process.exit(1);
}

// Arquivos a serem removidos
const filesToRemove = [
    'config/database.js',
    'config/openai.js'
];

const foldersToRemove = [
    'models'
];

// Arquivos para verificar manualmente
const filesToCheck = [
    'services/emailService.js',
    'utils/helpers.js'
];

const foldersToCheck = [
    'templates'
];

console.log('📋 Este script irá remover:');
filesToRemove.forEach(file => console.log(`   ❌ ${file}`));
foldersToRemove.forEach(folder => console.log(`   ❌ ${folder}/`));
console.log('');

// Criar backup
const backupDir = `backup_${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;
console.log('🔄 Criando backup...');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

let backedUpCount = 0;

// Backup de arquivos
filesToRemove.forEach(file => {
    if (fs.existsSync(file)) {
        const dir = path.dirname(file);
        const backupPath = path.join(backupDir, dir);
        
        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }
        
        fs.copyFileSync(file, path.join(backupDir, file));
        backedUpCount++;
    }
});

// Backup de pastas
foldersToRemove.forEach(folder => {
    if (fs.existsSync(folder)) {
        copyFolderRecursive(folder, path.join(backupDir, folder));
        backedUpCount++;
    }
});

console.log(`✅ Backup criado em: ${backupDir}`);
console.log(`   📊 Itens salvos: ${backedUpCount}\n`);

// Remover arquivos
console.log('🗑️ Removendo arquivos...\n');

let removedCount = 0;

filesToRemove.forEach(file => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`   ✅ Removido: ${file}`);
        removedCount++;
    } else {
        console.log(`   ⚠️ Não encontrado: ${file}`);
    }
});

foldersToRemove.forEach(folder => {
    if (fs.existsSync(folder)) {
        fs.rmSync(folder, { recursive: true, force: true });
        console.log(`   ✅ Removido: ${folder}/`);
        removedCount++;
    } else {
        console.log(`   ⚠️ Não encontrado: ${folder}/`);
    }
});

console.log('\n✨ Limpeza concluída!');
console.log(`   📊 Itens removidos: ${removedCount}\n`);

// Verificar arquivos opcionais
console.log('🔍 Verificando arquivos opcionais...\n');

const optionalToRemove = [];

filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`⚠️ Encontrado: ${file}`);
        
        const isUsed = checkIfFileIsUsed(file);
        
        if (isUsed) {
            console.log(`   ✅ Este arquivo ESTÁ sendo usado\n`);
        } else {
            console.log(`   ❌ Este arquivo NÃO está sendo usado\n`);
            optionalToRemove.push({ type: 'file', path: file });
        }
    }
});

foldersToCheck.forEach(folder => {
    if (fs.existsSync(folder)) {
        console.log(`⚠️ Encontrado: ${folder}/`);
        
        const isUsed = checkIfFolderIsUsed(folder);
        
        if (isUsed) {
            console.log(`   ✅ Esta pasta ESTÁ sendo usada\n`);
        } else {
            console.log(`   ❌ Esta pasta NÃO está sendo usada\n`);
            optionalToRemove.push({ type: 'folder', path: folder });
        }
    }
});

// Sugestões
if (optionalToRemove.length > 0) {
    console.log('📝 Arquivos/pastas que podem ser removidos:\n');
    
    optionalToRemove.forEach(item => {
        console.log(`   ⚠️ ${item.path}`);
        
        if (item.type === 'file') {
            console.log(`      Para remover: del ${item.path.replace(/\//g, '\\')}`);
        } else {
            console.log(`      Para remover: rmdir /s /q ${item.path.replace(/\//g, '\\')}`);
        }
        console.log('');
    });
}

// Instruções finais
console.log('📋 Próximos passos:\n');
console.log('1. Teste o servidor:');
console.log('   npm run dev\n');
console.log('2. Teste as rotas principais:');
console.log('   curl http://localhost:8000/api/health');
console.log('   curl -X POST http://localhost:8000/api/test-ai\n');
console.log('3. Se tudo funcionar, commit:');
console.log('   git add .');
console.log('   git commit -m "chore: remove arquivos não utilizados (MongoDB legacy)"\n');
console.log('4. Se algo der errado, restaure o backup:');
console.log(`   Copie os arquivos de ${backupDir}/ de volta\n`);

console.log('✅ Limpeza concluída com sucesso!\n');

// ====================================
// FUNÇÕES AUXILIARES
// ====================================

function copyFolderRecursive(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const files = fs.readdirSync(source);

    files.forEach(file => {
        const sourcePath = path.join(source, file);
        const targetPath = path.join(target, file);

        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderRecursive(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    });
}

function checkIfFileIsUsed(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Pastas para verificar
    const foldersToSearch = ['routes', 'services', 'middleware'];
    
    for (const folder of foldersToSearch) {
        if (!fs.existsSync(folder)) continue;
        
        const files = getAllJsFiles(folder);
        
        for (const file of files) {
            if (file === filePath) continue; // Pular o próprio arquivo
            
            const content = fs.readFileSync(file, 'utf8');
            
            // Verificar se o arquivo é importado
            if (content.includes(`require('./${filePath}')`) ||
                content.includes(`require('../${filePath}')`) ||
                content.includes(`require('../../${filePath}')`) ||
                content.includes(fileName)) {
                return true;
            }
        }
    }
    
    return false;
}

function checkIfFolderIsUsed(folderPath) {
    const foldersToSearch = ['routes', 'services', 'middleware'];
    
    for (const folder of foldersToSearch) {
        if (!fs.existsSync(folder)) continue;
        
        const files = getAllJsFiles(folder);
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            
            // Verificar se a pasta é referenciada
            if (content.includes(folderPath)) {
                return true;
            }
        }
    }
    
    return false;
}

function getAllJsFiles(dir) {
    let results = [];
    
    if (!fs.existsSync(dir)) return results;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.lstatSync(filePath);
        
        if (stat.isDirectory()) {
            results = results.concat(getAllJsFiles(filePath));
        } else if (path.extname(file) === '.js') {
            results.push(filePath);
        }
    });
    
    return results;
}
