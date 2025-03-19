const assert = require('assert');
const { NoteManager } = require('../src/manager');

suite('NoteManager', () => {
    test('mainData', async () => {
        const data = {
            directories: {
                "/path/to/dir": {
                    notes: [
                        { id: 1, type: "note", content: "Note 1" },
                        { id: 2, type: "note", content: "Note 2" },
                    ],
                    events: [
                        { id: 1, type: "event", content: "Event 1" },
                    ],
                },
            },
            files: {
                "/path/to/file": {
                    notes: [
                        { id: 3, type: "note", content: "Note 3" },
                    ],
                    events: [
                        { id: 2, type: "event", content: "Event 2" },
                    ],
                },
            },
            lines: {
                "/path/to/line": [
                    { id: 4, type: "note", content: "Note 4" },
                ],
            },
        };

        const manager = new NoteManager(data, null);
        const mainData = await manager.mainData(null);

        assert.strictEqual(mainData.length, 4);
        assert.strictEqual(mainData[0].label, "dir");
        assert.strictEqual(mainData[1].label, "file");
        assert.strictEqual(mainData[2].label, "line");
    });

    test('contextValue', () => {
        const data = {
            directories: {
                "/path/to/dir": {
                    notes: [
                        { id: 1, type: "note", content: "Note 1" },
                    ],
                },
            },
        };

        const manager = new NoteManager(data, null);
        const item = manager.mainData(null)[0];

        assert.strictEqual(item.contextValue, "directory");
    });
});
