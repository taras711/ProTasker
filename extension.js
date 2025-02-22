const vscode = require('vscode');
const { NotesExplorer } = require('./src/dataManager');
const path = require("path")

function activate(context) {
    console.log('ProTasker extension activated');
    const provider = new NotesExplorer();
    const treeView = vscode.window.registerTreeDataProvider('sidebar_protasker_id1', provider);
    

    console.log("🔍 Регистрируем обработчик onDidChangeActiveTextEditor...", provider.activeDecorationType);

    if (vscode.window.activeTextEditor) {
        
        console.log("🚀 Инициализация: Запускаем подсветку при старте...");
        highlightCommentedLines(vscode.window.activeTextEditor, provider);
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        //const editor = vscode.window.activeTextEditor;
        console.log("📌 Сменился активный редактор:", editor?.document?.uri.fsPath || "❌ Нет активного редактора");
    
        if (!editor) {
            setTimeout(() => {
                if (editor) {
                    console.log("🔄 Повторный вызов после задержки:", editor.document.uri.fsPath);
                    highlightCommentedLines(editor, provider);
                }
            }, 500); // 500 мс задержка
            return;
        }
    
        highlightCommentedLines(editor, provider);
    });

    vscode.workspace.onDidOpenTextDocument(doc => {
        console.log("📌 Открыт файл:", doc.uri.fsPath);
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            highlightCommentedLines(editor, provider);
        }
    });

    function lineHasNote() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return false;
    
        const lineNumber = editor.selection.active.line + 1; // Строка, на которой стоит курсор
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Нормализуем путь файла
    
        console.log(`Проверяем наличие заметок для файла: ${filePath}, строка: ${lineNumber}`);
    
        const notesForFile = provider.notesData.lines[filePath] || [];  // Получаем все заметки для файла
        const notesOnLine = notesForFile.filter(note => note.line === lineNumber);  // Ищем заметки на строке
    
        console.log(`Найдено заметок на строке ${lineNumber}:`, notesOnLine);
    highlightCommentedLines(editor, provider);
        return notesOnLine.length > 0;  // Если заметки найдены, возвращаем true
        
    }
    
    
    // Универсальная команда для добавления заметки
    context.subscriptions.push(vscode.commands.registerCommand('protasker.addNote', async () => {
        const editor = vscode.window.activeTextEditor;
        // Запрашиваем текст заметки
        const noteContent = await vscode.window.showInputBox({ placeHolder: 'Введите текст заметки' });
        if (!noteContent) return;  // Если текст не введен, прекращаем выполнение

        // Запрашиваем, где добавлять заметку
        const selection = await vscode.window.showQuickPick(['File', 'Directory', 'Line'], {
            placeHolder: 'Выберите, где добавить заметку'
        });

        if (!selection) return;  // Если выбор не сделан, прекращаем выполнение

        // Запрашиваем тип записи (заметка, комментарий, чек-лист и т.д.)
        const entryType = await vscode.window.showQuickPick(['Note', 'Comment', 'Checklist', 'Event'], {
            placeHolder: 'Выберите тип записи'
        });

        if (!entryType) return;  // Если тип записи не выбран, прекращаем выполнение

        // Определяем путь для записи
        let filePath = await getTargetPath(selection);
        if (!filePath) return;

        // Добавляем запись в файл, папку или строку
        if (selection === 'File') {
            await provider.addEntry(filePath, false, entryType, noteContent); // Текст заметки передаем сюда
        } else if (selection === 'Directory') {
            await provider.addEntry(filePath, true, entryType, noteContent); // Текст заметки передаем сюда
        } else if (selection === 'Line') {
            const lineNumber = editor ? editor.selection.active.line + 1 : 0;
            await provider.addNoteToLine(filePath, lineNumber, entryType, noteContent); // Текст заметки передаем сюда
        }
        highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    }));

    // Регистрируем команды для удаления заметок
    context.subscriptions.push(vscode.commands.registerCommand('protasker.deleteNote', async (treeItem) => {
        const editor = vscode.window.activeTextEditor;
        console.log("Удаляем заметку", treeItem);
        const filePath = treeItem.parent || treeItem.path;
        if (!filePath) {
            console.error("Ошибка: файл или папка не найдены");
            return;
        }

        const isDirectory = provider.notesData.directories[filePath] !== undefined;
        const target = isDirectory ? provider.notesData.directories[filePath] : provider.notesData.files[filePath];
        
        if (!target || !target.notes) {
            console.error("Ошибка: нет заметок в файле/директории", filePath);
            return;
        }

        const noteIndex = target.notes.findIndex(n => n.content.trim() === treeItem.label.trim());
        if (noteIndex === -1) {
            console.error("Ошибка: заметка не найдена", treeItem.label);
            return;
        }

        target.notes.splice(noteIndex, 1);
        await provider.saveNotesToFile();
        provider.refresh();
        highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    }));

    context.subscriptions.push(vscode.commands.registerCommand("protasker.openComment", async () => {
        const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("❌ Нет активного редактора.");
        return;
    }

    let filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Приводим путь в формат notesData.json path.normalize(originalPath).replace(/\\/g, "/").toLowerCase();
    const line = editor.selection.active.line +1; // VS Code считает строки с 0, поэтому +1

    console.log(`📌 Открываем комментарии для: ${filePath}, строка: ${line}`);
    console.log(`📌 Доступные файлы в notesData.json:`, Object.keys(provider.notesData.lines));

    if (!provider.notesData.lines[filePath]) {
        vscode.window.showErrorMessage("❌ Файл отсутствует в базе заметок.");
        return;
    }

    // Получаем массив всех записей для файла
    const allNotes = provider.notesData.lines[filePath] || [];
    console.log(`📌 Найдено ${allNotes.length} записей для файла:`, allNotes);

    // 🛠 Фильтруем только те, что соответствуют текущей строке
    const lineNotes = allNotes.filter(note => {
        console.log(`🔍 Проверяем запись: ${note.line} - ${line}`, note);
        return note.line === line && typeof note.content === "string" && note.content.trim().length > 0;
    });

    console.log(`📌 Отфильтрованные записи для строки ${line}:`, lineNotes);

    if (lineNotes.length === 0) {
        vscode.window.showInformationMessage("📭 Для этой строки нет комментариев.");
        return;
    }

    // Объединяем все комментарии в один текст
    const fullText = lineNotes.map((note, index) => `Type: ${note.type}* \r\n Content: ${note.content}. \r\n Created: ${note.createdAt}`).join("\n\n");

    vscode.window.showInformationMessage(`📝 Комментарии для строки ${line}:\n\n${fullText}`, { modal: true });
    }));
function highlightCommentedLines(editor, provider) {
    if (!editor) return;

    const originalPath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase();
    const normalizedPath = path.normalize(originalPath).replace(/\\/g, "/").toLowerCase();

    console.log("📌 Оригинальный путь:", originalPath);
    console.log("📌 Нормализованный путь:", normalizedPath);

    const matchedPath = Object.keys(provider.notesData.lines).find(key =>
        path.basename(key).toLowerCase() === path.basename(normalizedPath)
    );

    if (!matchedPath) {
        console.log("❌ Не найден соответствующий путь в notesData.");
        return;
    }

    console.log("✅ Найден путь:", matchedPath);

    // Загружаем строки с комментариями
    const fileNotes = provider.notesData.lines[matchedPath] || [];
    console.log("📌 Найденные строки с заметками:", fileNotes);

    const MAX_LENGTH = 50; // Максимальная длина отображаемого текста

    const decorationsArray = [];
    const linesWithNotes = new Set();

    fileNotes.forEach(note => {
        let lineNumber = note.line; // Номер строки из заметки
        let tooltipText = note.content; // Полный текст в tooltip

        // Обрезаем длинный текст и добавляем "..."
        if (tooltipText.length > MAX_LENGTH) {
            tooltipText = tooltipText.substring(0, MAX_LENGTH) + "...";
        }

        // Добавляем строку в Set для отслеживания, чтобы не дублировать декорации
        if (!linesWithNotes.has(lineNumber)) {
            linesWithNotes.add(lineNumber);
            decorationsArray.push({
                range: new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 100),
                hoverMessage: new vscode.MarkdownString(`📌 **Комментарий:** ${note.content}  \n **Тип:** ${note.type}  \n **Создан:** ${note.createdAt}`),
                renderOptions: {
                    before: {
                        contentText: "📌",
                        color: "red",
                        fontWeight: "bold",
                        margin: "0 10px 0 0"
                    },
                    light: {
                        after: {
                            contentText: ` 📜 ${tooltipText}`, // Полный текст в tooltip
                            color: "#03a9f4",
                            fontSize: "12px"
                        }
                    },
                    dark: {
                        after: {
                            contentText: ` ${tooltipText}`,
                            color: "lightgray",
                            fontSize: "12px"
                        }
                    },
                    backgroundColor: "rgba(255, 255, 0, 0.3)" // Жёлтая подсветка
                }
            });
        }
    });

    // **Очищаем старые декорации перед установкой новых**
    if (provider.activeDecorationType) {
        console.log("📌 Очищаем старые декорации...");
        editor.setDecorations(provider.activeDecorationType, []); // Очистка старых
    }

    // Логирование декораций, которые были до очистки
    console.log("📌 Текущие декорации перед очисткой:", decorationsArray);

    // **Создаём новый тип декорации и применяем**
    provider.activeDecorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true
    });

    // Применяем новые декорации
    editor.setDecorations(provider.activeDecorationType, decorationsArray);
    console.log("📌 Применена подсветка с комментариями:", decorationsArray);
}
    

    // Команда для добавления заметки
    vscode.commands.registerCommand('protasker.addNoteToLine', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
    
        const noteContent = await vscode.window.showInputBox({
            placeHolder: 'Введите текст заметки'
        });
    
        if (noteContent) {
            const lineNumber = editor.selection.active.line + 1;  // Строка, на которой вставляется заметка
            const filePath = editor.document.uri.fsPath;  // Путь к текущему файлу
    
            // Добавляем заметку на эту строку
            provider.addNoteToLine(filePath, lineNumber, "line", noteContent); // Обновляем заметки в данных
            highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
        }
    });
    
    // Команда для редактирования заметки
    context.subscriptions.push(vscode.commands.registerCommand('protasker.editNote', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
    
        const lineNumber = editor.selection.active.line + 1;  // Получаем строку
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase();
    
        if (!lineHasNote()) {
            vscode.window.showInformationMessage("На этой строке нет заметок.");
            return;
        }
    
        const notesForFile = provider.notesData.lines[filePath] || [];
        const notesOnLine = notesForFile.filter(note => note.line === lineNumber);
    
        if (notesOnLine.length === 0) {
            vscode.window.showInformationMessage("На этой строке нет заметок.");
            return;
        }
    
        const noteToEdit = notesOnLine[0];  // Редактируем первую заметку на строке
        const editedContent = await vscode.window.showInputBox({
            value: noteToEdit.content,
            placeHolder: "Редактируйте заметку"
        });
        console.log(`строка: ${lineNumber}, запись: ${noteToEdit.content} `)
    
        if (editedContent) {
            noteToEdit.content = editedContent;
            await provider.saveNotesToFile();
            provider.refresh();
            vscode.window.showInformationMessage("Заметка успешно отредактирована.");
        }
        highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    }));
    
    
    // Команда для удаления заметки
        context.subscriptions.push(vscode.commands.registerCommand("protasker.deleteNoteFromLine", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
        
            const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/");
            const lineNumber = editor.selection.active.line + 1; // Текущая строка (1-based index)
        
            console.log("📌 Удаление заметки - Файл:", filePath, "Строка:", lineNumber);
            console.log("📌 Проверяем все пути в notesData.lines:", Object.keys(provider.notesData.lines));
        
            // Находим путь с учетом нормализации
            const matchedPath = Object.keys(provider.notesData.lines).find(key =>
                path.normalize(key).replace(/\\/g, "/").toLowerCase() === filePath.toLowerCase()
            );
        
            if (!matchedPath) {
                vscode.window.showWarningMessage("❌ No notes found for this file.");
                return;
            }
        
            console.log("✅ Найден путь:", matchedPath);
            console.log("📌 Проверяем заметки для файла:", provider.notesData.lines[matchedPath]);
        
            // Теперь notesData.lines[matchedPath] - это массив, фильтруем по line
            const notesOnLine = provider.notesData.lines[matchedPath].filter(note => Number(note.line) === lineNumber);
        
            console.log("📌 Найденные заметки на строке:", notesOnLine);
        
            if (notesOnLine.length === 0) {
                vscode.window.showWarningMessage("❌ No notes found on this line.");
                return;
            }
    
            
        
            // Позволяем пользователю выбрать, какую заметку удалить
            const selectedNote = await vscode.window.showQuickPick(
                notesOnLine.map(note => ({ label: note.content, id: note.id })), // Передаем id отдельно
                { placeHolder: "Select a note to delete" }
            );
    
            const noteObject = selectedNote[0]; // Берем первый элемент (если он есть)
    
        
            if (!selectedNote) {
                console.log("❌ Пользователь отменил удаление.");
                return;
            }
        
        
            // Фильтруем массив, оставляя все, кроме удаляемой заметки
            provider.notesData.lines[matchedPath] = provider.notesData.lines[matchedPath].filter(note => note.id !== selectedNote.id);
        
            // Если после удаления массив пуст, удаляем ключ из объекта
            if (provider.notesData.lines[matchedPath].length === 0) {
                delete provider.notesData.lines[matchedPath];
                
            }
        
            provider.saveNotesToFile();
            provider.refresh();
            
            vscode.window.showInformationMessage("✅ Note deleted successfully!");
            setTimeout(() => {
                highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
            }, 500);
            
            
        }));

    // const addNoteButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    // addNoteButton.text = '$(plus) Add Note';
    // addNoteButton.command = 'protasker.addNoteToLine';
    // addNoteButton.show();
    

    context.subscriptions.push(treeView);
}

async function getTargetPath(selection) {
    const editor = vscode.window.activeTextEditor;
    if (selection === 'Line') {
        
        return editor ? editor.document.uri.fsPath : null;
    }

    if (selection === 'Directory') {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Выберите папку для заметки'
        });
        return uri && uri.length > 0 ? uri[0].fsPath : null;
    }
    return editor ? editor.document.uri.fsPath : null;
}


function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
