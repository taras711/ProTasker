$(document).ready(function() {
    // Тестовые данные
    const data = {
        files: {
            "c:/users/taras/onedrive/plocha/projects/app/calengen/ui.view.view.class.js": {
                notes: [{
                    id: 1740823115946,
                    type: "note",
                    content: "rfregerge",
                    createdAt: "2025-03-01T09:58:35.946Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/ui.view.view.class.js",
                    prov: "files"
                }],
                comments: [],
                checklists: [{
                    id: 1740819320973,
                    type: "checklist",
                    content: {
                        id: 1740819320973,
                        name: "retet ert",
                        type: "checklist",
                        items: [
                            { text: "sfsd sd", done: false },
                            { text: "sfd ds sd", done: true },
                            { text: "gh gfhfgh fhfg", done: false }
                        ],
                        createdAt: "2025-03-01T08:55:20.973Z"
                    },
                    createdAt: "2025-03-01T08:55:20.973Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/ui.view.view.class.js",
                    prov: "files"
                }],
                events: []
            },
        },
        directories: {
            "c:/users/taras/onedrive/plocha/projects/app/calengen/design": {
                notes: [],
                comments: [],
                checklists: [
                    {
                        id: 1740823401403,
                        type: "checklist",
                        content: {
                            id: 1740823401402,
                            name: "dfg g reg rreg",
                            type: "checklist",
                            items: [
                                { text: "drg rg dgr", done: false },
                                { text: "drg rg drg", done: false }
                            ],
                            createdAt: "2025-03-01T10:03:21.402Z"
                        },
                        createdAt: "2025-03-01T10:03:21.403Z",
                        path: "c:/users/taras/onedrive/plocha/projects/app/calengen/design",
                        prov: "directories"
                    },
                    {
                        id: 1740823401423433,
                        type: "checklist",
                        content: {
                            id: 1740223401402,
                            name: "dfg g reg rreg",
                            type: "checklist",
                            items: [
                                { text: "drg rg dgr", done: true },
                                { text: "drg rg drg", done: false }
                            ],
                            createdAt: "2025-03-01T10:03:21.402Z"
                        },
                        createdAt: "2025-03-01T10:03:21.403Z",
                        path: "c:/users/taras/onedrive/plocha/projects/app/calengen/design",
                        prov: "directories"
                    },
                    {
                        id: 17408152423433,
                        type: "checklist",
                        content: {
                            id: 1740543401402,
                            name: "dfg g reg rreg",
                            type: "checklist",
                            items: [
                                { text: "drg rg dgr", done: true },
                                { text: "drg rg drg", done: false }
                            ],
                            createdAt: "2025-03-01T10:10:15.402Z"
                        },
                        createdAt: "2025-03-01T10:10:15.403Z",
                        path: "c:/users/taras/onedrive/plocha/projects/app/calengen/design",
                        prov: "directories"
                    }
                ],
                events: [
                    {
                        id: 1740825905415,
                        type: "comment",
                        content: "ewdfewf",
                        createdAt: "2025-03-01T10:45:05.415Z",
                    },
                ]
            },
            "c:/users/taras/onedrive/plocha/projects/app/calengen/projects": {
                notes: [{
                    id: 1740823115946,
                    type: "note",
                    content: "rfregerge",
                    createdAt: "2025-03-01T09:58:35.946Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/projects",
                    prov: "directories"
                }],
                comments: [],
                checklists: [],
                events: [{
                    id: 1740825905415,
                    type: "comment",
                    content: "ewdfewf",
                    createdAt: "2025-03-01T10:45:05.415Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/projects",
                    prov: "directories"
                }]
            }
        },
        lines: {
            "c:/users/taras/onedrive/plocha/projects/app/calengen/design/app.css": [
                {
                    line: 1,
                    id: 1740825905415,
                    type: "line",
                    content: "ewdfewf",
                    createdAt: "2025-03-01T10:45:05.415Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/design/app.css"
                },
                {
                    line: 5,
                    id: 17408545563415,
                    type: "line",
                    content: "ewdfewf",
                    createdAt: "2025-03-01T10:45:05.415Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/design/app.css"
                }
            ]
        }
    };
    const mainData = {
        directories: data.directories,
        files: data.files,
        lines: data.lines
    }

    let globalData = {
        block: null,
        type: null
    };
    let currentType = null;
    let recordElement = null;
    const timelineContainer = $("#timeline")
    const setIcons = (type) => {
        let iconTag = $("<i>").addClass("fa");
        if(type === "directories") {
            iconTag.removeClass("fa-line fa-file").addClass("fa-folder");
        } else if(type === "files") {
            iconTag.removeClass("fa-folder fa-line").addClass("fa-file");
        } else if(type === "lines") {
            iconTag.removeClass("fa-folder fa-file").addClass("fa-paperclip");
        }
        return iconTag;
    }

    // Функция для рендеринга дерева каталогов
    function renderDirectoryTree() {
        let currentType = null;
        const treeContainer = $("#directory-tree ul");

        $.each(mainData, function(prov) {
            if (prov !== currentType) {
                // Тип изменился — создаем новый контейнер
                currentType = prov;
                treeContainer.append("<hr>");
            }
            
            $.each(mainData[prov], function(filepath) {
                const li = $("<li>").text(baseName(filepath)).click(function(event) {
                    // add class event  li "active"
                    $(".active", treeContainer).removeClass("active");
                    $(event.target).addClass("active"); 
                    renderRecordsTimeline(prov, filepath);
                });
                const icon = setIcons(prov);
                treeContainer.append(icon).append(li);
            });
        });
    }

    function baseName(url){
        return url.split('/').pop();
    }

    // Функция для рендеринга записей для выбранной директории
    function renderRecordsTimeline(categorie, directoryPath) {
        timelineContainer.empty(); // Очистить предыдущие записи

        const records = data[categorie][directoryPath];

        
        
        $.each(records, function(prov) {
            if (records[prov].length) {
                records[prov].forEach(note => {
                    treeView(note);
                });
            }
        });
        if(categorie === "lines") {
            console.log(data[categorie][directoryPath])
            records.forEach(line => treeView(line))
        }
    }

    function treeView(note) {
        if (note.type !== currentType) {
            // Тип изменился — создаем новый контейнер
            currentType = note.type;
            
            recordElement = $("<div>").addClass("record");

            // Создаем заголовок типа
            const titleElement = $("<div>").addClass("record-header").text(note.type + "s");

            // Создаем дату создания
            const dateElement = $("<div>").addClass("created-at").text(new Date(note.createdAt).toLocaleString());

            // Добавляем в контейнер
            recordElement.append(titleElement).append(dateElement);
            timelineContainer.append(recordElement);
        }

        // Добавляем содержимое в текущий контейнер
        const noteElement = $("<div>").addClass("record-item"); 
        divToAccordion(noteElement);
        noteElement.append("<div class='record-content'></div>").append($("<div>", {class: 'collapse'}));
        noteElement.find(".record-content").html(getType(note));

         noteElement.find(".collapse").html(`<ul><li>ID: ${note.id}</li> <li>Path: ${note.path}</li> <li>Created At: ${note.createdAt}</li> <li>Provider: ${note.prov}</li></ul>`);
        

        recordElement.append(noteElement);
    }

    // Функция фильтрации записей
    function filterRecords() {

        // Получаем значение поискового запроса подробно с учетем дочерних элементов
        const query = $("#search").val().toLowerCase();

        // Перебираем все записи
        $(".record-item").each(function() {
            const text = $(this).text().toLowerCase();
            const show = text.includes(query);
            $(this).toggle(show);
        })
    }

    function divToAccordion(elemwent) {
        $(elemwent).addClass("accordion");

        // Показать содержимое
        $(elemwent).on("click", function(event) {
            event.stopPropagation();
            event.preventDefault();
            $(this).children(".collapse").toggle();
        });
    }

    function getType(data){
        const template = `<div class="record-body">%s <span class="created-at">%s</span></div>`;
        let output = "";

        switch (data.type) {
            case "note":
            case "event":
            case "comment":
                return template.replace("%s", data.content);
            case "checklist":
                let set = "<li><div class='checklist-items'>";
                set += `<span>${data.content.name}</span>`;
                $.each(data.content.items, function(_, item) {
                    set += `<div class='checklist-item'><span>${item.done ? "✅" : "❌"}</span>
                    <span>${item.text}</span></div>`;
                });
                set += "</div></li>";
                return template.replace("%s", `<ul>${set}</ul>`).replace("%s", data.content.createdAt);
            case "line":
                return template.replace("%s", data.content);
            default:
                return "Unknown";
        }
    }

    // Инициализация
    renderDirectoryTree();

    // если не выбрано о выбрать первый элемент renderDirectoryTree
    $("#directory-tree li").eq(0).click();
    $("#search").on("keyup", filterRecords);
});

