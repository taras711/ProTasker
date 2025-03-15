const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const jsdiff = require('diff'); // npm install diff

const historyFile = 'veredit.json';
const fileStates = {}; // Храним предыдущее состояние файлов

// Читаем предыдущий контент перед изменением
function readPreviousContent(filePath) {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
    }
    return '';
}

// Фиксируем изменение в JSON с diff
function logChange(filePath) {
    if (!fs.existsSync(historyFile)) {
        console.log('⚠️ История отсутствует, создаём новый файл.');
        fs.writeFileSync(historyFile, JSON.stringify({ changes: [] }, null, 2), 'utf8');
    }

    const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

    const newContent = fs.readFileSync(filePath, 'utf8');
    const oldContent = fileStates[filePath] || readPreviousContent(filePath);
    fileStates[filePath] = newContent; // Сохраняем новое состояние

    const changes = jsdiff.diffLines(oldContent, newContent); // Сравниваем строки
    const diffResult = changes.map((part, index) => ({
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
        line: index + 1,
        content: part.value.trim(),
    })).filter(change => change.type !== 'unchanged'); // Убираем неизменённые строки

    if (diffResult.length === 0) return; // Если изменений нет, не записываем

    console.log(`📝 Фиксируем изменение в файле: ${filePath}`);
    console.log(`📥 Изменённые строки:`, diffResult);

    history.changes.push({
        path: filePath,
        timestamp: new Date().toISOString(),
        modifications: diffResult
    });

    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
}

// Настраиваем слежение за изменениями
const watcher = chokidar.watch('src/**/*.js', { persistent: true });

watcher
    .on('change', logChange)
    .on('add', (filePath) => {
        console.log(`📂 Новый файл: ${filePath}`);
        fileStates[filePath] = readPreviousContent(filePath); // Сохраняем начальное состояние
    });

console.log('🚀 Следим за изменениями...');
