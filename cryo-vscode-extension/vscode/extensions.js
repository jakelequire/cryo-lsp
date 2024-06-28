const path = require('path');
const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

const cryoConfig = [
    {
        scope: 'comment.line.double-slash.cryo',
        settings: {
            foreground: '#6A9955', // Green for comments
        },
    },
    {
        scope: 'comment.block.cryo',
        settings: {
            foreground: '#6A9955', // Green for comments
        },
    },
    {
        scope: 'keyword.declaration.cryo',
        settings: {
            foreground: '#569CD6', // Dark-ish blue for declarations
        },
    },
    {
        scope: 'keyword.control.cryo',
        settings: {
            foreground: '#C586C0', // Pink/purple for control keywords
        },
    },
    {
        scope: 'keyword.type.cryo',
        settings: {
            foreground: '#4EC9B0', // Teal/green for types
        },
    },
];

function activate(context) {
    const serverModule = context.asAbsolutePath(path.join('server', 'index.js'));

    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'cryo' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc'),
        },
    };

    client = new LanguageClient(
        'cryoLanguageServer',
        'Cryo Language Server',
        serverOptions,
        clientOptions
    );

        // Update the token color customizations
        const config = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
        const existingConfig = config.get('textMateRules');
        const updatedConfig = Array.isArray(existingConfig) ? existingConfig : [];
        config.update('textMateRules', [...updatedConfig, ...cryoConfig], vscode.ConfigurationTarget.Global);

    client.start();
}

function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

module.exports = {
    activate,
    deactivate,
};
