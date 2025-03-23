//const path = require('path');
// Тестовые данные
const data = {
    files: {
        "c:/users/taras/onedrive/plocha/projects/app/calengen/ui.view.view.class.js": {
            notes: [
                {
                    id: 1740823115946,
                    type: "note",
                    content: "rfregerge",
                    createdAt: "2025-03-01T09:58:35.946Z",
                    path: "c:/users/taras/onedrive/plocha/projects/app/calengen/ui.view.view.class.js",
                    prov: "files"
                }
            ],
            comments: [],
            checklists: [
                {
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
                }
            ],
            events: []
        }
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
                }
            ],
            events: [
                // add simulated data
                {
                    id: 1740825905415,
                type: "line",
                content: "ewdfewf",
                createdAt: "2025-03-01T10:45:05.415Z",
                },

            ]
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
            }
        ]
    }
};
document = document || window.document || null;

const mainData = {
    directories: data.directories,
    files: data.files,
    lines: data.lines
}

let globalData = {
    block: null,
    type: null
};
// Функция для рендеринга дерева каталогов
function renderDirectoryTree() {
    const treeContainer = document.querySelector("#directory-tree ul");

    Object.keys(mainData).forEach(prov => {
        Object.keys(mainData[prov]).forEach(filepath => {
            const li = document.createElement("li");
            li.textContent = baseName(filepath); // Используем basename для получения базового имени filepath; // Используем basename для получения базового имени filepath;
            li.addEventListener("click", () => renderRecordsTimeline(filepath));
            treeContainer.appendChild(li);
        });
    });
}

function baseName(url){
    return url.split('/').pop();
}

// Функция для рендеринга записей для выбранной директории
function renderRecordsTimeline(directoryPath) {

    let recordElement;
    const timelineContainer = document.querySelector("#timeline");
    timelineContainer.innerHTML = ""; // Очистить предыдущие записи

    
    const template = `<div class="record-header">%s: %s</div>
                        <div class="record-body">Created at: %s</div>`
    const records = data.directories[directoryPath];
    Object.keys(records).forEach(prov => {
        
        if (records[prov].length) {
            records[prov].map((note) => {
                console.log("records", note);
                        
                if(globalData.type != note.type || globalData.type == null){
                   recordElement = document.createElement("div")
                    .classList.add("record");
                    
                    globalData.block = recordElement;
                }else if(globalData.block !== null && globalData.type == note.type){
                    recordElement = globalData.block;
                }
                
                
                recordElement.innerHTML = getType(note);
                timelineContainer.appendChild(recordElement);

                globalData.type = note.type;
            });
        }

        return;

    })
}

// Функция фильтрации записей
function filterRecords() {
    const searchQuery = document.getElementById("search").value.toLowerCase();
    const records = document.querySelectorAll(".record");

    records.forEach(record => {
        const content = record.querySelector(".record-header").textContent.toLowerCase();
        if (content.includes(searchQuery)) {
            record.style.display = "block";
        } else {
            record.style.display = "none";
        }
    });
}

function getType(data){
    console.log("Data", data.type)
    const template = `<div class="record-header">%s: %s</div>
                      <div class="record-body">Created at: %s</div>`;
    let output = "";

    switch (data.type) {
        case "note":
        case "event":
        case "comment":
            return template.replace("%s", data.type).replace("%s", data.content).replace("%s", new Date(data.createdAt).toLocaleString());
        case "checklist":
            let set = "<li><div class='checklist-item'>";
            set += `<span>${data.content.name}</span>`
            Object.keys(data.content.items).forEach(item => {
                console.log("item", item)
                set += `<div class='checklist-item'><span>${data.content.items[item].text}</span>
                        <span>${data.content.items[item].done ? "✅" : "❌"}</span></div>`;
            });
            set += "</div></li>"
            return template.replace("%s", data.type).replace("%s", `<ul>${set}</ul>`).replace("%s", new Date(data.createdAt).toLocaleString());
        case "line":
            return template.replace("%s", data.type).replace("%s", data.content).replace("%s", new Date(data.createdAt).toLocaleString());
        default:
            return "Unknown";
    }
}


