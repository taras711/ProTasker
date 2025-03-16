const vscode = require('vscode');
const { Main } = require("./src/main");
const { NotesExplorer } = require('./src/dataManager');
const { NotesExplorerProvider } = require('./src/notesExplorerProvider');
//const { Manager } = require('./src/manager');
const notifier = require('node-notifier');
let notifyInterval = null;

const path = require("path")
const notifiedDeadlines = new Set();
function activate(context) {
    console.log('ProTasker extension activated');
    const main = new Main(context);
    const provider = new NotesExplorer(context);
    const notesExplorerProvider = new NotesExplorerProvider(provider.notesData, context);
    //const notesExplorerProvider = new Manager("notesExplorer");

    const treeView = vscode.window.registerTreeDataProvider('sidebar_protasker_id1', provider);
    let lineHasNoteState = {edit:false, show: false, delete: false, add: true}; // Состояние наличия заметок на строке
    
    // const notesExplorerView = vscode.window.registerTreeDataProvider('notesExplorer', notesExplorerProvider);
    const notesExplorerView = vscode.window.registerTreeDataProvider('notesExplorer', notesExplorerProvider);
    context.subscriptions.push(notesExplorerView);

    console.log("🔍 Регистрируем обработчик onDidChangeActiveTextEditor...", provider.activeDecorationType);

    // Обработчик события изменения строки (курсор переместился)
        vscode.window.onDidChangeTextEditorSelection(async event => {
            await updateLineHasNoteState(event.textEditor, provider);
        });
    if (vscode.window.activeTextEditor) {
        
        console.log("🚀 Инициализация: Запускаем подсветку при старте...");
        highlightCommentedLines(vscode.window.activeTextEditor, provider);
    }
    
    vscode.window.onDidChangeActiveTextEditor(editor => {
        console.log("📌 Сменился активный редактор:", editor?.document?.uri.fsPath || "❌ Нет активного редактора");
    
        if (!editor) {
            setTimeout(() => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    console.log("🔄 Повторный вызов после задержки:", activeEditor.document.uri.fsPath);
                    highlightCommentedLines(activeEditor, provider);
                }
            }, 500); // 500 мс задержка
            return;
        }
    
        notesExplorerProvider.refresh();
        highlightCommentedLines(editor, provider);
    });
    

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('protasker')) {
            console.log("🔄 Настройки изменены, обновляем UI...");
    
            // Обновление контекста для inlineText
            const settings = vscode.workspace.getConfiguration('protasker');
            
            // Обновление UI или других компонентов, если нужно
            provider.refresh();
            updateNotifications(provider);
        }
    });
    
    

    // 🔥 Обработчик на открытие контекстного меню
    vscode.window.onDidChangeVisibleTextEditors(async () => {
         if (vscode.window.activeTextEditor) {
            
            updateLineHasNoteState(vscode.window.activeTextEditor, provider)
        }
    });
    
    // Если открыли файл, обновляем состояние
    vscode.workspace.onDidOpenTextDocument(doc => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.fsPath === doc.uri.fsPath) {
            
            highlightCommentedLines(editor, provider);
        }
    });

    async function updateLineHasNoteState(editor, provider) {
        if (!editor) return;

            console.time("⏳ setContext время выполнения");
            console.log(`📌 Обновление setContext: protasker.deleteNoteFromLine = `, JSON.stringify(lineHasNoteState));
            //await new Promise(resolve => setTimeout(resolve, 500));
            await lineHasNote();
            await vscode.commands.executeCommand('setContext', 'protasker.deleteNoteFromLine', lineHasNoteState.delete)
            await vscode.commands.executeCommand('setContext', 'protasker.openComment', lineHasNoteState.show)
            await vscode.commands.executeCommand('setContext', 'protasker.editNote', lineHasNoteState.edit)
            await vscode.commands.executeCommand('setContext', 'protasker.addNoteToLine', lineHasNoteState.add)
              // ⏳ Ждем, чтобы изменения применились перед открытием меню
            //await new Promise(resolve => setTimeout(resolve, 100));

            //await vscode.commands.executeCommand('editor.action.showContextMenu'); // Открываем меню
            console.timeEnd("⏳ setContext время выполнения");
            console.log("✅ setContext обновлён!");
    }

    async function lineHasNote() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return false;
    
        const lineNumber = editor.selection.active.line + 1; // Строка, на которой стоит курсор
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Нормализуем путь файла
    
        console.log(`Проверяем наличие заметок для файла: ${filePath}, строка: ${lineNumber}`);
    
        const notesForFile = await provider.notesData.lines[filePath] || [];  // Получаем все заметки для файла
        const notesOnLine = await notesForFile.filter(note => note.line === lineNumber);  // Ищем заметки на строке

        let newstate = await notesOnLine.length > 0 ? true : false;
        lineHasNoteState.edit = newstate;
        lineHasNoteState.delete = newstate;
        lineHasNoteState.show = newstate;
        lineHasNoteState.add = newstate ? false : true;
        return newstate;  // Если заметки найдены, возвращаем true
        
    }

    main.comands([
        'openSettings',
        'addNote',
        'addChecklistItem',
        'toggleChecklistItem',
        'removeChecklistItem',
        'deleteNote',
        'openComment',
        'addNoteToLine',
        'editNote',
        'deleteNoteFromList',
        'editNoteFromList',
        'searchNotes',
        'resetSearch',
        'filterNotes',
        'goToNote',
        'goToFile',
        'deleteAll',
    ]);

    main.set('openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'protasker');
    });

    main.set('addNote', async () => {
        const editor = vscode.window.activeTextEditor;
        const settings = getProTaskerSettings();
        let deadline = null;

        // 1️⃣ Запрашиваем тип записи
        const entryType = await vscode.window.showQuickPick(['Note', 'Comment', 'Checklist', 'Event', ...settings.customTypes], {
            placeHolder: 'Выберите тип записи'
        });
    
        if (!entryType) return;
    
        // 2️⃣ Запрашиваем место хранения
        const selection = await vscode.window.showQuickPick(['File', 'Directory'], {
            placeHolder: 'Выберите, где добавить запись'
        });
    
        if (!selection) return;
        
        // 4️⃣ Если это чек-лист или событие, спрашиваем про дедлайн
        if (entryType === 'Checklist' || entryType === 'Event') {
            const wantsDeadline = await vscode.window.showQuickPick(['Да', 'Нет'], {
                placeHolder: 'Добавить дедлайн?'
            });

            if (wantsDeadline === 'Да') {
                deadline = await vscode.window.showInputBox({ placeHolder: 'Введите дату (YYYY-MM-DD HH:MM)' });
                if (deadline) {
                    const parsedDate = new Date(deadline);
                    if (isNaN(parsedDate.getTime())) {
                        vscode.window.showErrorMessage('❌ Неверный формат даты. Используйте YYYY-MM-DD HH:MM');
                        return;
                    }
                    deadline = parsedDate.toISOString();
                    console.log(deadline)
                }
            }
        }

        let filePath = await getTargetPath(selection);
        if (!filePath){  
            vscode.window.showErrorMessage("No active editor.");
            return
        };
    
        // 3️⃣ Если это чек-лист, запрашиваем пункты
        if (entryType === 'Checklist') {
            let checklistItems = [];
            let addMore = true;

            const name = await vscode.window.showInputBox({placeHolder: 'Checklist name'});

            if (!name) return;
    
            while (addMore) {
                const item = await vscode.window.showInputBox({ placeHolder: 'Введите пункт чек-листа (оставьте пустым для завершения)' });
                if (!item) break;
                checklistItems.push({ text: item, done: false });
    
                addMore = await vscode.window.showQuickPick(['Добавить ещё', 'Завершить'], { placeHolder: 'Добавить ещё пункт?' }) === 'Добавить ещё';
            }
    
            if (checklistItems.length === 0) return;
    
            const checklistEntry = {
                id: Date.now(),
                name: name,
                type: 'checklist',
                items: checklistItems,
                createdAt: new Date().toISOString(),
                deadline: deadline
            };
    
            await provider.addEntry(filePath, selection === 'Directory', 'checklist', checklistEntry);
        } else {
            // 4️⃣ Для остальных типов — обычный ввод контента
            const noteContent = await vscode.window.showInputBox({ placeHolder: 'Введите текст записи' });
            if (!noteContent) return;
    
            if (selection === 'File') {
                await provider.addEntry(filePath, false, entryType.toLowerCase(), noteContent, deadline);
            } else if (selection === 'Directory') {
                await provider.addEntry(filePath, true, entryType.toLowerCase(), noteContent, deadline);
            } else if (selection === 'Line') {
                const lineNumber = editor ? editor.selection.active.line + 1 : 0;
                await provider.addNoteToLine(filePath, lineNumber, entryType.toLowerCase(), noteContent);
            }
        }
        provider.refresh();
        notesExplorerProvider.refresh();
    
        highlightCommentedLines(editor, provider);
    });

    main.set('addChecklistItem', async (treeItem) => {
        if (!treeItem || treeItem.context.type !== "checklist") return;

        const newItemText = await vscode.window.showInputBox({ placeHolder: 'Введите новый пункт' });
        if (!newItemText) return;
        console.log("🗑 Удаление элемента чеклиста:", treeItem);
        // Добавляем новый пункт в чек-лист
        treeItem.context.content.items.push({ text: newItemText, done: false });
        
        try {
            // Сохраняем данные через provider
            await provider.saveNotesToFile();

            // Обновляем UI
            provider.refresh();
            notesExplorerProvider.refresh();

            vscode.window.showInformationMessage(`✅ Пункт "${newItemText}" добавлен в чек-лист!`);
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Ошибка при сохранении: ${error.message}`);
        }
    });

    main.set('toggleChecklistItem', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
        if (!treeItem || typeof treeItem.data.done === "undefined") {
            console.log("❌ Ошибка: treeItem невалидный или done отсутствует", treeItem);
            return;
        }
        // Получаем filePath через findChecklistFilePath
        const filePath = findChecklistFilePath(treeItem.data.checklistId, treeItem.data.path);
        if (!filePath) {
            console.log(`❌ Ошибка: Не удалось найти файл для чек-листа ${treeItem.data.checklistId}`);
            return;
        }
    
        console.log("📂 Найден путь к файлу:", filePath);
    
        // Проверяем, есть ли файл в notesData
        const fileNotes = provider.notesData[treeItem.data.path][filePath];
        if (!fileNotes) {
            console.log(`❌ Ошибка: Файл ${filePath} не найден в notesData.files`);
            return;
        }
    
        console.log("📂 Найден файл:", fileNotes);
    
        // Проверяем, есть ли чек-листы
        if (!Array.isArray(fileNotes.checklists)) {
            console.log(`❌ Ошибка: В файле ${filePath} нет чек-листов`);
            return;
        }
    
        console.log("📌 Найденные чек-листы:", fileNotes.checklists);
    
        // Ищем чек-лист по ID
        const checklistIndex = fileNotes.checklists.findIndex(cl => cl.id === treeItem.data.checklistId);
        if (checklistIndex === -1) {
            console.log(`❌ Ошибка: Чек-лист с ID ${treeItem.data.checklistId} не найден`);
            return;
        }
    
        console.log("✅ Найден чек-лист:", fileNotes.checklists[checklistIndex]);
    
        // Проверяем, есть ли `items`
        if (!Array.isArray(fileNotes.checklists[checklistIndex].content.items)) {
            console.log(`❌ Ошибка: В чек-листе ${treeItem.data.checklistId} отсутствует массив items`);
            return;
        }
    
        // Ищем пункт чек-листа
        const checklistItemIndex = fileNotes.checklists[checklistIndex].content.items.findIndex(item => item.text === treeItem.data.text);
        if (checklistItemIndex === -1) {
            console.log(`❌ Ошибка: Пункт '${treeItem.data.text}' не найден в чек-листе`);
            return;
        }
    
        console.log("✏️ Изменяем статус для пункта:", fileNotes.checklists[checklistIndex].content.items[checklistItemIndex]);
    
        // Меняем статус выполнения пункта
        fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done = !fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done;
    
        console.log("✅ Новый статус пункта:", fileNotes.checklists[checklistIndex].content.items[checklistItemIndex]);
    
        // Обновляем данные в provider.notesData
        provider.notesData[treeItem.data.path][filePath] = { ...fileNotes };
    
        console.log("💾 Сохраняем изменения в provider.notesData:", provider.notesData);


    // Сохраняем изменения
            provider.saveNotesToFile();
    
            // Обновляем UI
            provider.refresh();
            notesExplorerProvider.refresh();

            // Разворачиваем чек-лист обратно
            vscode.window.showInformationMessage(`🔄 Пункт "${treeItem.data.text}" теперь ${treeItem.data.done ? "не выполнен ❌" : "выполнен ✅"}`);
    });

    main.set('removeChecklistItem', async (item) => {
        console.log("items:", item)
        if (!item || !item.context.checklistId || item.context.index === undefined) {
            vscode.window.showErrorMessage("❌ Невозможно удалить элемент: данные отсутствуют.");
            return;
        }

        const confirm = await vscode.window.showWarningMessage(`Удалить пункт чек-листа ${item.context.text}?`, "Да", "Нет");
        if (confirm !== "Да") return;

        console.log("🗑 Удаление элемента чеклиста:", item);

        // Получаем файл, в котором хранится чеклист
        const filePath = findChecklistFilePath(item.context.checklistId, item.context.path);
        if (!filePath) {
            vscode.window.showErrorMessage("❌ Файл с чеклистом не найден.");
            return;
        }

        // Загружаем данные чеклиста
        const checklist = provider.notesData[item.context.path][filePath].checklists.find(cl => cl.id === item.context.checklistId);
        if (!checklist) {
            vscode.window.showErrorMessage("❌ Чеклист не найден.");
            return;
        }
        // Удаляем элемент из чеклиста
        checklist.content.items.splice(item.context.index, 1);

        // Сохраняем обновленный чеклист
        await provider.saveNotesToFile();
        provider.refresh();
        notesExplorerProvider.refresh();
        vscode.window.showInformationMessage("✅ Элемент чеклиста удален.");
    });

    main.set('deleteNote', async (treeItem) => {
        const editor = vscode.window.activeTextEditor;
        console.log("Удаляем заметку", treeItem);
        const filePath = treeItem.parent || treeItem.path;
        if (!filePath) {
            console.error("Ошибка: файл или папка не найдены");
            return;
        }

        const confirm = await vscode.window.showWarningMessage("Удалить пункт чек-листа?", "Да", "Нет");
        if (confirm !== "Да") return;

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
        
        highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
        provider.refresh();
        notesExplorerProvider.refresh();
    });

    main.set('openComment', () => {
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
    });

    main.set('addNoteToLine', async () => {
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
            notesExplorerProvider.refresh();
        }
    });

    main.set('editNote', async () => {
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
            notesExplorerProvider.refresh()
            vscode.window.showInformationMessage("Заметка успешно отредактирована.");
        }
        highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    });

    main.set('deleteNoteFromList', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
        const settings = getProTaskerSettings();
        console.error("❌ Ошибка: Нет данных для удаления!", treeItem);
        if (!treeItem || !treeItem.data || !treeItem.data.id) {
            console.error("❌ Ошибка: Нет данных для удаления!", treeItem);
            vscode.window.showErrorMessage("Ошибка: Неверные данные для удаления.");
            return;
        }
    
        const confirm = await vscode.window.showWarningMessage(`Удалить запись ${treeItem.data.content} ?`, "Да", "Нет");
        if (confirm !== "Да") return;
    
        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase());
    
        const { id, type, prov, path, linepath } = treeItem.data;
        let targetCollection = null;
        let targetKey = null;
        let stillExists = true;

        if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
            targetCollection = provider.notesData[prov];
            targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
        }
        if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
            vscode.window.showErrorMessage("Ошибка: Не удалось найти запись.");
            return;
        }
    
        console.log(`✅ Найдена коллекция ${targetKey} для удаления.`);
    
        // Удаляем запись из нужного массива
        let categories = ["comments", "checklists", "events", "notes", ...customTypes];

        if(type == "line"){
            if (targetCollection[targetKey].length){
                targetCollection[targetKey] = targetCollection[targetKey].filter(note => note.id !== id)
            }

            stillExists = targetCollection[targetKey] && targetCollection[targetKey].length > 0
        }else{
            categories.forEach(category => {
                if (targetCollection[targetKey][category]) {
                    targetCollection[targetKey][category] = targetCollection[targetKey][category].filter(note => note.id !== id);
                }
            });

            // **Повторно проверяем, остались ли данные**
            stillExists = categories.some(category =>
                targetCollection[targetKey][category] && targetCollection[targetKey][category].length > 0
            );
        }
        
    
        
    
        if (!stillExists) {
            console.log(`✅ Успешно удалено all: id=${id}, type=${type}`);
            delete targetCollection[targetKey];
        } else {
            console.log(`✅ ${targetKey} НЕ пуст, оставляем.`);
        }
    
        provider.saveNotesToFile();
        provider.refresh();
        notesExplorerProvider.refresh();
        highlightCommentedLines(vscode.window.activeTextEditor, provider); // 🔄 Обновляем подсветку
        vscode.window.showInformationMessage("✅ Элемент удален.");
    });

    main.set('editNoteFromList', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
        const settings = getProTaskerSettings();
        if (!treeItem || !treeItem.data || !treeItem.data.id) {
            console.error("❌ Ошибка: Нет данных для изменения!", treeItem);
            vscode.window.showErrorMessage("Ошибка: Неверные данные для изменения.");
            return;
        }
        const { id, type, prov, path, linepath } = treeItem.data;
        let targetCollection = null;
        let targetKey = null;
        let targetEntry = null;

        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase())
    
        if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
            targetCollection = provider.notesData[prov];
            targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
        }
        if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
            vscode.window.showErrorMessage("Ошибка: Не удалось найти запись.");
            console.log("Warning: " + targetCollection + " " + targetKey)
            return;
        }

        if (prov == "lines") {
            // 🔹 Если запись в строках файла (lines), ищем напрямую в массиве
            targetEntry = targetCollection[targetKey].find(note => note.id === id);
        } else {
            // 🔹 Для файлов и директорий ищем в категориях (notes, comments, checklists, events)
            const categories = ["notes", "comments", "checklists", "events", ...customTypes];
            for (const category of categories) {
                if (Array.isArray(targetCollection[targetKey][category])) {
                    targetEntry = targetCollection[targetKey][category].find(note => note.id === id);
                    if (targetEntry) break;
                }
            }
        }
    
        if (!targetEntry) {
            vscode.window.showErrorMessage("Ошибка: Запись не найдена.");
            return;
        }
    
        // Запросить новый текст у пользователя
        const newText = await vscode.window.showInputBox({
            placeHolder: 'Введите новый текст записи',
            value: targetEntry.content
        });
    
        if (!newText || newText.trim() === "") {
            vscode.window.showErrorMessage("Ошибка: Текст не может быть пустым.");
            return;
        }
    
        // Обновляем запись
        targetEntry.content = newText;
    
        console.log(`✏️ Запись обновлена: id=${id}, type=${type}, newContent="${newText}"`);
        vscode.window.showInformationMessage("✅ Запись успешно обновлена.");
    
        // Сохраняем изменения и обновляем UI
        provider.saveNotesToFile();
        provider.refresh();
        notesExplorerProvider.refresh();
        highlightCommentedLines(vscode.window.activeTextEditor, provider); // 🔄 Обновляем подсветку
    });

    // vscode.commands.registerCommand('protasker.openSettings', () => {
    //     vscode.commands.executeCommand('workbench.action.openSettings', 'protasker');
    // });
    
    // Универсальная команда для добавления заметки
    // context.subscriptions.push(vscode.commands.registerCommand('protasker.addNote', async () => {
    //     const editor = vscode.window.activeTextEditor;
    //     const settings = getProTaskerSettings();
    //     let deadline = null;

    //     // 1️⃣ Запрашиваем тип записи
    //     const entryType = await vscode.window.showQuickPick(['Note', 'Comment', 'Checklist', 'Event', ...settings.customTypes], {
    //         placeHolder: 'Выберите тип записи'
    //     });
    
    //     if (!entryType) return;
    
    //     // 2️⃣ Запрашиваем место хранения
    //     const selection = await vscode.window.showQuickPick(['File', 'Directory'], {
    //         placeHolder: 'Выберите, где добавить запись'
    //     });
    
    //     if (!selection) return;
        
    //     // 4️⃣ Если это чек-лист или событие, спрашиваем про дедлайн
    //     if (entryType === 'Checklist' || entryType === 'Event') {
    //         const wantsDeadline = await vscode.window.showQuickPick(['Да', 'Нет'], {
    //             placeHolder: 'Добавить дедлайн?'
    //         });

    //         if (wantsDeadline === 'Да') {
    //             deadline = await vscode.window.showInputBox({ placeHolder: 'Введите дату (YYYY-MM-DD HH:MM)' });
    //             if (deadline) {
    //                 const parsedDate = new Date(deadline);
    //                 if (isNaN(parsedDate.getTime())) {
    //                     vscode.window.showErrorMessage('❌ Неверный формат даты. Используйте YYYY-MM-DD HH:MM');
    //                     return;
    //                 }
    //                 deadline = parsedDate.toISOString();
    //                 console.log(deadline)
    //             }
    //         }
    //     }

    //     let filePath = await getTargetPath(selection);
    //     if (!filePath){  
    //         vscode.window.showErrorMessage("No active editor.");
    //         return
    //     };
    
    //     // 3️⃣ Если это чек-лист, запрашиваем пункты
    //     if (entryType === 'Checklist') {
    //         let checklistItems = [];
    //         let addMore = true;

    //         const name = await vscode.window.showInputBox({placeHolder: 'Checklist name'});

    //         if (!name) return;
    
    //         while (addMore) {
    //             const item = await vscode.window.showInputBox({ placeHolder: 'Введите пункт чек-листа (оставьте пустым для завершения)' });
    //             if (!item) break;
    //             checklistItems.push({ text: item, done: false });
    
    //             addMore = await vscode.window.showQuickPick(['Добавить ещё', 'Завершить'], { placeHolder: 'Добавить ещё пункт?' }) === 'Добавить ещё';
    //         }
    
    //         if (checklistItems.length === 0) return;
    
    //         const checklistEntry = {
    //             id: Date.now(),
    //             name: name,
    //             type: 'checklist',
    //             items: checklistItems,
    //             createdAt: new Date().toISOString(),
    //             deadline: deadline
    //         };
    
    //         await provider.addEntry(filePath, selection === 'Directory', 'checklist', checklistEntry);
    //     } else {
    //         // 4️⃣ Для остальных типов — обычный ввод контента
    //         const noteContent = await vscode.window.showInputBox({ placeHolder: 'Введите текст записи' });
    //         if (!noteContent) return;
    
    //         if (selection === 'File') {
    //             await provider.addEntry(filePath, false, entryType.toLowerCase(), noteContent, deadline);
    //         } else if (selection === 'Directory') {
    //             await provider.addEntry(filePath, true, entryType.toLowerCase(), noteContent, deadline);
    //         } else if (selection === 'Line') {
    //             const lineNumber = editor ? editor.selection.active.line + 1 : 0;
    //             await provider.addNoteToLine(filePath, lineNumber, entryType.toLowerCase(), noteContent);
    //         }
    //     }
    //     provider.refresh();
    //     notesExplorerProvider.refresh();
    
    //     highlightCommentedLines(editor, provider);
    // }));

    // context.subscriptions.push(vscode.commands.registerCommand('protasker.addChecklistItem', async (treeItem) => {
    //     if (!treeItem || treeItem.data.type !== "checklist") return;

    //     const newItemText = await vscode.window.showInputBox({ placeHolder: 'Введите новый пункт' });
    //     if (!newItemText) return;
    //     console.log("🗑 Удаление элемента чеклиста:", treeItem);
    //     // Добавляем новый пункт в чек-лист
    //     treeItem.data.content.items.push({ text: newItemText, done: false });
        
    //     try {
    //         // Сохраняем данные через provider
    //         await provider.saveNotesToFile();

    //         // Обновляем UI
    //         provider.refresh();
    //         notesExplorerProvider.refresh();

    //         vscode.window.showInformationMessage(`✅ Пункт "${newItemText}" добавлен в чек-лист!`);
    //     } catch (error) {
    //         vscode.window.showErrorMessage(`❌ Ошибка при сохранении: ${error.message}`);
    //     }
    // }));
    
    // context.subscriptions.push(vscode.commands.registerCommand('protasker.toggleChecklistItem', async (treeItem) => {
        
    //     treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
    //     if (!treeItem || typeof treeItem.data.done === "undefined") {
    //         console.log("❌ Ошибка: treeItem невалидный или done отсутствует", treeItem);
    //         return;
    //     }
    //     // Получаем filePath через findChecklistFilePath
    //     const filePath = findChecklistFilePath(treeItem.data.checklistId, treeItem.data.path);
    //     if (!filePath) {
    //         console.log(`❌ Ошибка: Не удалось найти файл для чек-листа ${treeItem.data.checklistId}`);
    //         return;
    //     }
    
    //     console.log("📂 Найден путь к файлу:", filePath);
    
    //     // Проверяем, есть ли файл в notesData
    //     const fileNotes = provider.notesData[treeItem.data.path][filePath];
    //     if (!fileNotes) {
    //         console.log(`❌ Ошибка: Файл ${filePath} не найден в notesData.files`);
    //         return;
    //     }
    
    //     console.log("📂 Найден файл:", fileNotes);
    
    //     // Проверяем, есть ли чек-листы
    //     if (!Array.isArray(fileNotes.checklists)) {
    //         console.log(`❌ Ошибка: В файле ${filePath} нет чек-листов`);
    //         return;
    //     }
    
    //     console.log("📌 Найденные чек-листы:", fileNotes.checklists);
    
    //     // Ищем чек-лист по ID
    //     const checklistIndex = fileNotes.checklists.findIndex(cl => cl.id === treeItem.data.checklistId);
    //     if (checklistIndex === -1) {
    //         console.log(`❌ Ошибка: Чек-лист с ID ${treeItem.data.checklistId} не найден`);
    //         return;
    //     }
    
    //     console.log("✅ Найден чек-лист:", fileNotes.checklists[checklistIndex]);
    
    //     // Проверяем, есть ли `items`
    //     if (!Array.isArray(fileNotes.checklists[checklistIndex].content.items)) {
    //         console.log(`❌ Ошибка: В чек-листе ${treeItem.data.checklistId} отсутствует массив items`);
    //         return;
    //     }
    
    //     // Ищем пункт чек-листа
    //     const checklistItemIndex = fileNotes.checklists[checklistIndex].content.items.findIndex(item => item.text === treeItem.data.text);
    //     if (checklistItemIndex === -1) {
    //         console.log(`❌ Ошибка: Пункт '${treeItem.data.text}' не найден в чек-листе`);
    //         return;
    //     }
    
    //     console.log("✏️ Изменяем статус для пункта:", fileNotes.checklists[checklistIndex].content.items[checklistItemIndex]);
    
    //     // Меняем статус выполнения пункта
    //     fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done = !fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done;
    
    //     console.log("✅ Новый статус пункта:", fileNotes.checklists[checklistIndex].content.items[checklistItemIndex]);
    
    //     // Обновляем данные в provider.notesData
    //     provider.notesData[treeItem.data.path][filePath] = { ...fileNotes };
    
    //     console.log("💾 Сохраняем изменения в provider.notesData:", provider.notesData);


    // // Сохраняем изменения
    //         provider.saveNotesToFile();
    
    //         // Обновляем UI
    //         provider.refresh();
    //         notesExplorerProvider.refresh();

    //         // Разворачиваем чек-лист обратно
    //         vscode.window.showInformationMessage(`🔄 Пункт "${treeItem.data.text}" теперь ${treeItem.data.done ? "не выполнен ❌" : "выполнен ✅"}`);

    
        
    // }));
    
    // context.subscriptions.push(
    //     vscode.commands.registerCommand("protasker.removeChecklistItem", async (item) => {
    //         //console.log(item)
    //         if (!item || !item.data.checklistId || item.data.index === undefined) {
    //             vscode.window.showErrorMessage("❌ Невозможно удалить элемент: данные отсутствуют.");
    //             return;
    //         }

    //         const confirm = await vscode.window.showWarningMessage("Удалить пункт чек-листа?", "Да", "Нет");
    //         if (confirm !== "Да") return;
    
    //         console.log("🗑 Удаление элемента чеклиста:", item);
    
    //         // Получаем файл, в котором хранится чеклист
    //         const filePath = findChecklistFilePath(item.data.checklistId, item.data.path);
    //         if (!filePath) {
    //             vscode.window.showErrorMessage("❌ Файл с чеклистом не найден.");
    //             return;
    //         }
    
    //         // Загружаем данные чеклиста
    //         const checklist = provider.notesData[item.data.path][filePath].checklists.find(cl => cl.id === item.data.checklistId);
    //         if (!checklist) {
    //             vscode.window.showErrorMessage("❌ Чеклист не найден.");
    //             return;
    //         }
    //         // Удаляем элемент из чеклиста
    //         checklist.content.items.splice(item.index, 1);
    
    //         // Сохраняем обновленный чеклист
    //         await provider.saveNotesToFile();
    //         provider.refresh();
    //         notesExplorerProvider.refresh();
    //         vscode.window.showInformationMessage("✅ Элемент чеклиста удален.");
    //     })
    // );
    
    function findChecklistFilePath(checklistId, type = "files") {
        //const editor = vscode.window.activeTextEditor;
        const file = provider.notesData[type];
        
        
        for (const filePath in file) {
            const normalizedPath = filePath.toLowerCase()
            
            const fileData = file[filePath];
            if (fileData.checklists) {
                const checklist = fileData.checklists.find(cl => cl.id === checklistId);
                if (checklist) {
                    return filePath;
                }
            }
        }
        return null;
    }


    // Регистрируем команды для удаления заметок
    // context.subscriptions.push(vscode.commands.registerCommand('protasker.deleteNote', async (treeItem) => {
    //     const editor = vscode.window.activeTextEditor;
    //     console.log("Удаляем заметку", treeItem);
    //     const filePath = treeItem.parent || treeItem.path;
    //     if (!filePath) {
    //         console.error("Ошибка: файл или папка не найдены");
    //         return;
    //     }

    //     const confirm = await vscode.window.showWarningMessage("Удалить пункт чек-листа?", "Да", "Нет");
    //     if (confirm !== "Да") return;

    //     const isDirectory = provider.notesData.directories[filePath] !== undefined;
    //     const target = isDirectory ? provider.notesData.directories[filePath] : provider.notesData.files[filePath];
        
    //     if (!target || !target.notes) {
    //         console.error("Ошибка: нет заметок в файле/директории", filePath);
    //         return;
    //     }

    //     const noteIndex = target.notes.findIndex(n => n.content.trim() === treeItem.label.trim());
    //     if (noteIndex === -1) {
    //         console.error("Ошибка: заметка не найдена", treeItem.label);
    //         return;
    //     }

    //     target.notes.splice(noteIndex, 1);
    //     await provider.saveNotesToFile();
        
    //     highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    //     provider.refresh();
    //     notesExplorerProvider.refresh();
        
    // }));

    // context.subscriptions.push(vscode.commands.registerCommand("protasker.openComment", async () => {
    //     const editor = vscode.window.activeTextEditor;
    // if (!editor) {
    //     vscode.window.showErrorMessage("❌ Нет активного редактора.");
    //     return;
    // }

    // let filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Приводим путь в формат notesData.json path.normalize(originalPath).replace(/\\/g, "/").toLowerCase();
    // const line = editor.selection.active.line +1; // VS Code считает строки с 0, поэтому +1

    // console.log(`📌 Открываем комментарии для: ${filePath}, строка: ${line}`);
    // console.log(`📌 Доступные файлы в notesData.json:`, Object.keys(provider.notesData.lines));

    // if (!provider.notesData.lines[filePath]) {
    //     vscode.window.showErrorMessage("❌ Файл отсутствует в базе заметок.");
    //     return;
    // }

    // // Получаем массив всех записей для файла
    // const allNotes = provider.notesData.lines[filePath] || [];
    // console.log(`📌 Найдено ${allNotes.length} записей для файла:`, allNotes);

    // // 🛠 Фильтруем только те, что соответствуют текущей строке
    // const lineNotes = allNotes.filter(note => {
    //     console.log(`🔍 Проверяем запись: ${note.line} - ${line}`, note);
    //     return note.line === line && typeof note.content === "string" && note.content.trim().length > 0;
    // });

    // console.log(`📌 Отфильтрованные записи для строки ${line}:`, lineNotes);

    // if (lineNotes.length === 0) {
    //     vscode.window.showInformationMessage("📭 Для этой строки нет комментариев.");
    //     return;
    // }

    // // Объединяем все комментарии в один текст
    // const fullText = lineNotes.map((note, index) => `Type: ${note.type}* \r\n Content: ${note.content}. \r\n Created: ${note.createdAt}`).join("\n\n");

    // vscode.window.showInformationMessage(`📝 Комментарии для строки ${line}:\n\n${fullText}`, { modal: true });
    // }));

    function highlightCommentedLines(editor, provider) {
        if (!editor || !editor.document) {
            console.warn("❌ Нет активного редактора или документа!");
            return;
        }
        const settings = getProTaskerSettings();

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
                const decoration = {
                    range: new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 100),
                    hoverMessage: new vscode.MarkdownString(`**Комментарий:** ${note.content}  \n **Тип:** ${note.type}  \n **Создан:** ${provider.timeago.format(new Date(note.createdAt))}`),
                    renderOptions: {}
                };

                if (settings.noteDisplay === "icon") {
                    decoration.renderOptions.before = {
                        contentText: "📌",
                        color: "red",
                        fontWeight: "bold",
                        margin: "0 10px 0 0"
                    };
                } else if (settings.noteDisplay === "highlight") {
                    decoration.renderOptions.backgroundColor = settings.highlightColor;
                    decoration.renderOptions.after = {
                        contentText:  `// ${tooltipText}`,
                        color: settings.inlineTextColor || " #03a9f4",
                        fontSize: "12px",
                        backgroundColor: settings.highlightColor,
                        margin: "0 0 0 5px",
                        width: "100%",
                        height: "100%"
                    }
                } else if (settings.noteDisplay === "inlineText") {
                    decoration.renderOptions.after = {
                        contentText: `📜 ${tooltipText}`,
                        color: settings.inlineTextColor || " #03a9f4",
                        fontSize: "12px"
                    };
                }
                console.log("Color: ", settings)

                decoration.overviewRulerColor = settings.highlightColor;
                decoration.overviewRulerLane = vscode.OverviewRulerLane.Full;
        
                decorationsArray.push(decoration);

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
    // vscode.commands.registerCommand('protasker.addNoteToLine', async () => {
    //     const editor = vscode.window.activeTextEditor;
    //     if (!editor) return;
    
    //     const noteContent = await vscode.window.showInputBox({
    //         placeHolder: 'Введите текст заметки'
    //     });
    
    //     if (noteContent) {
    //         const lineNumber = editor.selection.active.line + 1;  // Строка, на которой вставляется заметка
    //         const filePath = editor.document.uri.fsPath;  // Путь к текущему файлу
    
    //         // Добавляем заметку на эту строку
    //         provider.addNoteToLine(filePath, lineNumber, "line", noteContent); // Обновляем заметки в данных
    //         highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    //         notesExplorerProvider.refresh();
    //     }
    // });
    
    // Команда для редактирования заметки
    // context.subscriptions.push(vscode.commands.registerCommand('protasker.editNote', async () => {
    //     const editor = vscode.window.activeTextEditor;
    //     if (!editor) return;
    
    //     const lineNumber = editor.selection.active.line + 1;  // Получаем строку
    //     const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase();
    
    //     if (!lineHasNote()) {
    //         vscode.window.showInformationMessage("На этой строке нет заметок.");
    //         return;
    //     }
    
    //     const notesForFile = provider.notesData.lines[filePath] || [];
    //     const notesOnLine = notesForFile.filter(note => note.line === lineNumber);
    
    //     if (notesOnLine.length === 0) {
    //         vscode.window.showInformationMessage("На этой строке нет заметок.");
    //         return;
    //     }
    
    //     const noteToEdit = notesOnLine[0];  // Редактируем первую заметку на строке
    //     const editedContent = await vscode.window.showInputBox({
    //         value: noteToEdit.content,
    //         placeHolder: "Редактируйте заметку"
    //     });
    //     console.log(`строка: ${lineNumber}, запись: ${noteToEdit.content} `)
    
    //     if (editedContent) {
    //         noteToEdit.content = editedContent;
    //         await provider.saveNotesToFile();
    //         provider.refresh();
    //         notesExplorerProvider.refresh()
    //         vscode.window.showInformationMessage("Заметка успешно отредактирована.");
    //     }
    //     highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
    // }));
    
    // Команда для удаления заметки
    // context.subscriptions.push(vscode.commands.registerCommand('protasker.deleteNoteFromList', async (treeItem) => {
    //     treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
    //     const settings = getProTaskerSettings();
    //     console.error("❌ Ошибка: Нет данных для удаления!", treeItem);
    //     if (!treeItem || !treeItem.data || !treeItem.data.id) {
    //         console.error("❌ Ошибка: Нет данных для удаления!", treeItem);
    //         vscode.window.showErrorMessage("Ошибка: Неверные данные для удаления.");
    //         return;
    //     }
    
    //     const confirm = await vscode.window.showWarningMessage(`Удалить запись ${treeItem.data.content} ?`, "Да", "Нет");
    //     if (confirm !== "Да") return;
    
    //     const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase());
    
    //     const { id, type, prov, path, linepath } = treeItem.data;
    //     let targetCollection = null;
    //     let targetKey = null;
    //     let stillExists = true;

    //     if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
    //         targetCollection = provider.notesData[prov];
    //         targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
    //     }
    //     if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
    //         vscode.window.showErrorMessage("Ошибка: Не удалось найти запись.");
    //         return;
    //     }
    
    //     console.log(`✅ Найдена коллекция ${targetKey} для удаления.`);
    
    //     // Удаляем запись из нужного массива
    //     let categories = ["comments", "checklists", "events", "notes", ...customTypes];

    //     if(type == "line"){
    //         if (targetCollection[targetKey].length){
    //             targetCollection[targetKey] = targetCollection[targetKey].filter(note => note.id !== id)
    //         }

    //         stillExists = targetCollection[targetKey] && targetCollection[targetKey].length > 0
    //     }else{
    //         categories.forEach(category => {
    //             if (targetCollection[targetKey][category]) {
    //                 targetCollection[targetKey][category] = targetCollection[targetKey][category].filter(note => note.id !== id);
    //             }
    //         });

    //         // **Повторно проверяем, остались ли данные**
    //         stillExists = categories.some(category =>
    //             targetCollection[targetKey][category] && targetCollection[targetKey][category].length > 0
    //         );
    //     }
        
    
        
    
    //     if (!stillExists) {
    //         console.log(`✅ Успешно удалено all: id=${id}, type=${type}`);
    //         delete targetCollection[targetKey];
    //     } else {
    //         console.log(`✅ ${targetKey} НЕ пуст, оставляем.`);
    //     }
    
    //     provider.saveNotesToFile();
    //     provider.refresh();
    //     notesExplorerProvider.refresh();
    //     highlightCommentedLines(vscode.window.activeTextEditor, provider); // 🔄 Обновляем подсветку
    //     vscode.window.showInformationMessage("✅ Элемент удален.");
    // }));

    // context.subscriptions.push(vscode.commands.registerCommand('protasker.editNoteFromList', async (treeItem) => {
    //     treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
    //     const settings = getProTaskerSettings();
    //     if (!treeItem || !treeItem.data || !treeItem.data.id) {
    //         console.error("❌ Ошибка: Нет данных для изменения!", treeItem);
    //         vscode.window.showErrorMessage("Ошибка: Неверные данные для изменения.");
    //         return;
    //     }
    //     const { id, type, prov, path, linepath } = treeItem.data;
    //     let targetCollection = null;
    //     let targetKey = null;
    //     let targetEntry = null;

    //     const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase())
    
    //     if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
    //         targetCollection = provider.notesData[prov];
    //         targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
    //     }
    //     if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
    //         vscode.window.showErrorMessage("Ошибка: Не удалось найти запись.");
    //         console.log("Warning: " + targetCollection + " " + targetKey)
    //         return;
    //     }

    //     if (prov == "lines") {
    //         // 🔹 Если запись в строках файла (lines), ищем напрямую в массиве
    //         targetEntry = targetCollection[targetKey].find(note => note.id === id);
    //     } else {
    //         // 🔹 Для файлов и директорий ищем в категориях (notes, comments, checklists, events)
    //         const categories = ["notes", "comments", "checklists", "events", ...customTypes];
    //         for (const category of categories) {
    //             if (Array.isArray(targetCollection[targetKey][category])) {
    //                 targetEntry = targetCollection[targetKey][category].find(note => note.id === id);
    //                 if (targetEntry) break;
    //             }
    //         }
    //     }
    
    //     if (!targetEntry) {
    //         vscode.window.showErrorMessage("Ошибка: Запись не найдена.");
    //         return;
    //     }
    
    //     // Запросить новый текст у пользователя
    //     const newText = await vscode.window.showInputBox({
    //         placeHolder: 'Введите новый текст записи',
    //         value: targetEntry.content
    //     });
    
    //     if (!newText || newText.trim() === "") {
    //         vscode.window.showErrorMessage("Ошибка: Текст не может быть пустым.");
    //         return;
    //     }
    
    //     // Обновляем запись
    //     targetEntry.content = newText;
    
    //     console.log(`✏️ Запись обновлена: id=${id}, type=${type}, newContent="${newText}"`);
    //     vscode.window.showInformationMessage("✅ Запись успешно обновлена.");
    
    //     // Сохраняем изменения и обновляем UI
    //     provider.saveNotesToFile();
    //     provider.refresh();
    //     notesExplorerProvider.refresh();
    //     highlightCommentedLines(vscode.window.activeTextEditor, provider); // 🔄 Обновляем подсветку
    // }));
    
    
    context.subscriptions.push(vscode.commands.registerCommand('protasker.searchNotes', async () => {
        const query = await vscode.window.showInputBox({
            placeHolder: "🔍 Введите текст для поиска...",
            prompt: "Введите ключевые слова или часть заметки"
        });
    
        if (!query || query.trim() === "") {
            vscode.window.showErrorMessage("⚠️ Поисковый запрос не может быть пустым!");
            return;
        }
    
        console.log(`🔍 Ищем заметки по запросу: "${query}"`);
        provider.searchNotes(query);
        provider.filteredNotes = null;
        provider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('protasker.clearSearch', () => {
        provider.clearSearch();
        vscode.window.showInformationMessage("🔄 Поиск сброшен.");
    }));

    context.subscriptions.push(vscode.commands.registerCommand('protasker.resetSearch', async () => {
        console.log("🔄 Сброс поиска...");
        provider.search = false;
        provider.filteredNotes = null;
        provider.searchResults = null;  // Очищаем результаты поиска
        provider.refresh();  // Обновляем UI
    }));

    context.subscriptions.push(vscode.commands.registerCommand('protasker.filterNotes', async () => {
        const settings = getProTaskerSettings();
        const customTypes = [];
        settings.customTypes.map(note => {
            customTypes.push({label: note, description: `Filter by ${note} only`})
        })
        console.log(settings.customTypes)
        // Выбор типа для фильтрации
        const filterType = await vscode.window.showQuickPick(
            [
                { label: 'All', description: 'Show all notes, comments, checklists, events, ...' },
                { label: 'Notes', description: 'Filter by notes only' },
                { label: 'Comments', description: 'Filter by comments only' },
                { label: 'Checklists', description: 'Filter by checklists only' },
                { label: 'Events', description: 'Filter by events only' },
                { label: 'Line', description: 'Filter by events only' },
                ...customTypes
            ],
            { placeHolder: 'Select a type to filter' }
        );
    
        if (!filterType) return;  // Если пользователь отменил выбор, ничего не делаем.
    
        // Выбор категории для фильтрации
        const filterCategory = await vscode.window.showQuickPick(
            [
                { label: 'All', description: 'Show from all categories (files, directories, lines)' },
                { label: 'Files', description: 'Filter by files' },
                { label: 'Directories', description: 'Filter by directories' },
                { label: 'Lines', description: 'Filter by lines' }
            ],
            { placeHolder: 'Select a category to filter by' }
        );
    
        if (!filterCategory) return;  // Если пользователь отменил выбор, ничего не делаем.
    
        const queryType = filterType.label.toLowerCase();
        const queryCategory = filterCategory.label.toLowerCase();
    
        console.log(`🔍 Фильтруем по типу: ${queryType}, категории: ${queryCategory}`);
    
        // Применяем фильтрацию по типу и категории
        provider.filterNotes(queryType, queryCategory);
        const filteredResults = await provider.filteredNotes
        console.log(`🔹 Найдено результатов: ${filteredResults.length}`);
        if (filteredResults.length === 0) {
            vscode.window.showInformationMessage("😕 Ничего не найдено по запросу.");
        }
    
        // Обновление TreeView с результатами фильтрации
        provider.searchResults = null;
        provider.refresh();  // Обновляем интерфейс
    
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('protasker.resetFilter', () => {
        console.log("🔄 Сбрасываем фильтр, показываем все записи...");
        provider.selectedType = "all";
        provider.selectedCategory = "all";
        provider.refresh();
    }));
    
    vscode.commands.registerCommand("protasker.goToNote", async (note) => {
        if (!note || !note.context.path || typeof note.context.line !== "number") {
            vscode.window.showErrorMessage("Ошибка: не удалось найти привязанную строку.");
            return;
        }
    
        const fileUri = vscode.Uri.file(note.context.path);
    
        try {
            // Проверяем, существует ли файл
            await vscode.workspace.fs.stat(fileUri); // Если файла нет, бросит ошибку
            
            // Если файл найден, открываем его
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document);
    
            // Перелистываем к нужной строке
            const position = new vscode.Position(note.context.line - 1, 0);
            const range = new vscode.Range(position, position);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            // Если файл не найден или произошла ошибка, показываем сообщение
            vscode.window.showErrorMessage(`Файл не найден: ${fileUri.fsPath}`);
        }
    });

    vscode.commands.registerCommand("protasker.goToFile", async (note) => {
        if (!note || !note.filepath ) {
            vscode.window.showErrorMessage("Ошибка: не удалось найти файл.");
            return;
        }
    
        const fileUri = vscode.Uri.file(note.filepath );

        // Проверяем, существует ли файл
        await vscode.workspace.fs.stat(fileUri); // Если файла нет, бросит ошибку

        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
    })
    
    vscode.commands.registerCommand("protasker.deleteAll", async (note) => {
        const editor = vscode.window.activeTextEditor;
        let type = null;
        let path = null;

        switch(note.context.contextValue){
            case "lines":
                type = "lines";
                path = note.context.lineFile;
            break;
            case "file":
                type = "files";
                path = note.context.file;
            break;
            case "directory":
                type = "directories";
                path = note.context.directory;
            break;
        }

        if(type && path){
            const confirm = await vscode.window.showWarningMessage(`Удалить все записи с ${note.label}?`, "Да", "Нет");
            if (confirm !== "Да") return;

            const isDirectory = provider.notesData[type][path] !== undefined;
            const target = provider.notesData[type][path];
            
            if (!isDirectory || target.length == 0) {
                console.error("Ошибка: нет заметок в файле/директории", path);
                return;
            }

            if(delete provider.notesData[type][path]) vscode.window.showInformationMessage(`Clear ${note.label} success.`);
            else { vscode.window.showErrorMessage(`Clear ${note.label} failed. Try again letter.`); return;};

            await provider.saveNotesToFile();
        
            highlightCommentedLines(editor, provider); // 🔄 Обновляем подсветку
            provider.refresh();
            notesExplorerProvider.refresh();
        }
    })

    // const addNoteButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    // addNoteButton.text = '$(plus) Add Note';
    // addNoteButton.command = 'protasker.addNoteToLine';
    // addNoteButton.show();
    
    // Используем настройки
    const settings = getProTaskerSettings();
    console.log("🔧 Настройки загружены:", settings);

    context.subscriptions.push(treeView);
    updateNotifications(provider);
}

function updateNotifications(provider) {
    // Получаем **актуальное** значение настройки
    const enableNotifications = vscode.workspace.getConfiguration("protasker").get("notificatons");

    if (enableNotifications) {
        console.log("✅ Оповещения включены", enableNotifications);
        if (!notifyInterval || notifyInterval == null) {
            notifyInterval = setInterval(() => checkDeadlines(provider), 15000);
            console.log("✅ Оповещения включены");
        }
    } else {
        if (notifyInterval) { 
            console.log("❌ Оповещения выключены", enableNotifications);
            clearInterval(notifyInterval);
            notifyInterval = null;
            console.log("❌ Оповещения выключены");
        }
    }
}

function checkDeadlines(provider) {
   
    console.log("⚡ Checking deadlines...");

    const now = Date.now();
    const settings = getProTaskerSettings();
    const checkedItems = new Set(); // ✅ Отслеживаем проверенные объекты

    function checkEntries(entries, location) {
        if (!entries || typeof entries !== "object") return; // Пропускаем, если пусто
    
        for (const category of ["notes", "comments", "checklists", "events", ...settings.customTypes]) {
            if (!entries[category] || !Array.isArray(entries[category])) continue;
    
            for (const note of entries[category]) {
                if (!note.deadline) continue; // Пропускаем без дедлайна
    
                // ✅ Уникальный ключ вместо note.id
                const uniqueKey = `${location}:${note.deadline}:${note.content}`;
                
                if (checkedItems.has(uniqueKey)) {
                    console.log(`🔁 Пропущено (уже проверялось): ${uniqueKey}`);
                    continue;
                }
                checkedItems.add(uniqueKey);
    
                const deadline = new Date(note.deadline).getTime();
                if (isNaN(deadline)) {
                    console.warn(`⚠️ Invalid date in ${location}:`, note.deadline);
                    continue;
                }
    
                const diff = deadline - now;
                console.log(`🔍 Checking ${note.type} in ${location}: ${diff}ms left`);
    
                if (diff < 3600000 && diff > 0 && !notifiedDeadlines.has(uniqueKey)) {
                    //vscode.window.showWarningMessage(`⏳ Напоминание: ${note.content}`);
                    playNotificationSound("⏳ Напоминание", note.content, "arpeggio-467.mp3");
                    notifiedDeadlines.add(uniqueKey);
                }
                if (diff <= 0 && !notifiedDeadlines.has(uniqueKey)) {
                    vscode.window.showErrorMessage(`❌ Просрочено: ${note.content}`);
                    playNotificationSound("❌ Просрочено", note.content, "arpeggio-467.mp3");
                    notifiedDeadlines.add(uniqueKey);
                }
            }
        }
    }
    

    try {
        // 🔍 Проверяем файлы
        for (const [filepath, data] of Object.entries(provider.notesData.files || {})) {
            checkEntries(data, `File: ${filepath}`);

            // 🔍 Проверяем строки в файлах
            for (const [lineNumber, lineData] of Object.entries(data.lines || {})) {
                checkEntries(lineData, `Line ${lineNumber} in ${filepath}`);
            }
        }

        // 🔍 Проверяем директории
        for (const [dirPath, dirData] of Object.entries(provider.notesData.directories || {})) {
            checkEntries(dirData, `Directory: ${dirPath}`);
        }

        console.log("✅ Deadline check completed!");
    } catch (error) {
        console.error("❌ Error in checkDeadlines:", error);
    }
}


function playNotificationSound(title, message, sound) {
    notifier.notify({
        title: title || 'ProTasker',
        message: message || 'Напоминание о дедлайне!',
        sound: path.join(__dirname, 'sounds', sound)
    });
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

function getProTaskerSettings() {
    const config = vscode.workspace.getConfiguration('protasker');
    return {
        language: config.get('language'),
        customTypes: config.get('customTypes'),
        noteDisplay: config.get('noteDisplay'),
        highlightColor: config.get('highlightColor'),
        showTimeAgo: config.get('showTimeAgo'),
        notificatons: config.get('notificatons'),
        inlineTextColor: config.get('inlineTextColor')
    };
}


function deactivate() {
    console.log('ProTasker extension deactivated');
}

function playSound( soundLink ) {
    vscode.env.openExternal(soundLink);
}

module.exports = {
    activate,
    deactivate
};