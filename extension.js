const vscode = require('vscode');


const { NotesExplorer } = require('./src/dataManager');  // Импортируем класс из dataManager

function activate(context) {
    console.log('ProTasker extension activated');

    // Регистрируем TreeDataProvider с уникальным идентификатором
    const provider = new NotesExplorer();
    const treeView = vscode.window.registerTreeDataProvider('sidebar_protasker_id1', provider);
	// ✅ Принудительно обновляем `TreeView`
	vscode.commands.registerCommand('protasker.refresh', () => provider.refresh());
	console.log("✅ DEBUG: Регистрируем команду protasker.deleteNote...");

	context.subscriptions.push(vscode.commands.registerCommand('protasker.deleteNote', async (treeItem) => {
		console.log("✅ DEBUG: Вызвана команда protasker.deleteNote", treeItem);
	
		const filePath = treeItem.parent || treeItem.path;
		if (!filePath) {
			console.error("❌ Ошибка: Ни parent, ни path не найдены", treeItem);
			return;
		}
	
		const isDirectory = provider.notesData.directories[filePath] !== undefined;
		const target = isDirectory ? provider.notesData.directories[filePath] : provider.notesData.files[filePath];
	
		if (!target) {
			console.error(`❌ Ошибка: ${isDirectory ? "Директория" : "Файл"} не найден в notesData`, filePath);
			return;
		}
	
		if (!target.notes) {
			console.error("❌ Ошибка: В этом файле/директории нет заметок", filePath);
			return;
		}
	
		console.log("✅ DEBUG: До удаления", JSON.stringify(target.notes, null, 2));
	
		// Ищем заметку по `content`, потому что `label` — это имя файла/папки
		const noteIndex = target.notes.findIndex(n => n.content.trim() === treeItem.label.trim());
		if (noteIndex === -1) {
			console.error("❌ Ошибка: Заметка не найдена в списке!", treeItem.label);
			console.log("✅ DEBUG: Существующие заметки:", target.notes.map(n => n.content));
			return;
		}
	
		target.notes.splice(noteIndex, 1); // Удаляем по индексу
	
		console.log("✅ DEBUG: После удаления", JSON.stringify(target.notes, null, 2));
	
		await provider.saveNotesToFile();
		provider.refresh();
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand('protasker.editNote', async (note) => {
		const newContent = await vscode.window.showInputBox({ prompt: "Редактировать заметку", value: note.content });
	
		if (newContent) {
			note.content = newContent;
			await provider.saveNotesToFile();
			provider.refresh();
		}
	}));
	
	

    // Создаем кнопки в статус-баре
    const addNoteButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    addNoteButton.text = '$(plus) Add Note';
    addNoteButton.command = 'protasker.addNote';
    addNoteButton.show();

    const filterNotesButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    filterNotesButton.text = '$(filter) Filter Notes';
    filterNotesButton.command = 'protasker.filterNotes';
    filterNotesButton.show();

    // Регистрируем команду для открытия notesExplorer
    let openNotesExplorerCommand = vscode.commands.registerCommand('protasker.openNotesExplorer', () => {
        vscode.window.showInformationMessage('Opening Notes Explorer!');
    });

	
    // Регистрируем команду для добавления заметки
    let addNoteCommand = vscode.commands.registerCommand('protasker.addNote', async () => {
		const noteContent = await vscode.window.showInputBox({
			placeHolder: 'Enter your note content here'
		});
	
		const selection = await vscode.window.showQuickPick(['File', 'Line', 'Directory'], {
			placeHolder: 'Select where to add the note'
		});

		async function selectDirectory() {
			const uri = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: "Выбрать папку для заметки"
			});
		
			if (uri && uri.length > 0) {
				console.log("Выбрана папка:", uri[0].fsPath);
				return uri[0].fsPath;
			}
			return null;
		}

		async function getTargetPath() {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				return editor.document.uri.fsPath; // Если открыт файл, берём его
			} else {
				return await selectDirectory(); // Иначе спрашиваем директорию
			}
		}
	
		if (noteContent && selection) {
			const filePath = await getTargetPath();
			
			if (selection === 'File') {
				provider.addNoteToFile(filePath, noteContent);
			} else if (selection === 'Line') {
				const editor = vscode.window.activeTextEditor;
				const lineNumber = editor ? editor.selection.active.line + 1 : 0;
				provider.addNoteToLine(filePath, lineNumber, noteContent);
			} else if (selection === 'Directory') {
				const directoryPath = await selectDirectory();
				if (directoryPath) {
					provider.addNoteToDirectory(directoryPath, noteContent);
				}
			}
		}
		
	});
	
	

    // Регистрируем команду для фильтрации заметок
    let filterNotesCommand = vscode.commands.registerCommand('protasker.filterNotes', async () => {
		const filterText = await vscode.window.showInputBox({
			placeHolder: 'Filter notes by content'
		});
	
		if (filterText) {
			let filteredFiles = {};
	
			// Фильтруем заметки по содержимому в каждом файле
			for (let filePath in provider.notesData.files) {
				const file = provider.notesData.files[filePath];
				filteredFiles[filePath] = {
					notes: file.notes.filter(note => note.content.includes(filterText)),
					lines: file.lines
				};
			}
	
			// Обновляем provider с отфильтрованными заметками
			provider.notesData.files = filteredFiles;
	
			// Сохраняем изменения
			provider.saveNotesToFile();
	
			// Обновляем отображение
			provider.refresh();
		}
	});

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			highlightCommentedLines(editor, provider);
		}
	});
	

    // Подписываемся на команды
    context.subscriptions.push(openNotesExplorerCommand);
    context.subscriptions.push(treeView);
    context.subscriptions.push(filterNotesCommand);
    context.subscriptions.push(addNoteCommand);
    context.subscriptions.push(addNoteButton);
    context.subscriptions.push(filterNotesButton);
}

function highlightCommentedLines(editor, provider) {
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    const fileNotes = provider.notesData.files[filePath]?.lines || {};
    const decorationsArray = [];

    Object.keys(fileNotes).forEach(lineNumber => {
        const lineIndex = parseInt(lineNumber);
        const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
        decorationsArray.push({ range });
    });

    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(255,255,0,0.3)"
    });

    editor.setDecorations(decorationType, decorationsArray);
}

function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
