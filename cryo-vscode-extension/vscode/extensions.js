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
            foreground: '#569CD6', // Dark-ish blue for declarations (const, mut, function)
        },
    },
    {
        scope: 'keyword.control.cryo',
        settings: {
            foreground: '#C586C0', // Pink/purple for control keywords
        },
    },
    {
        scope: 'storage.type.cryo',
        settings: {
            foreground: '#4EC9B0', // Teal/green for types (int, float, boolean, etc.)
        },
    },
    {
        scope: 'keyword.operator.cryo',
        settings: {
            foreground: '#D4D4D4', // Light gray for operators
        },
    },
    {
        scope: 'constant.numeric.cryo',
        settings: {
            foreground: '#B5CEA8', // Light green for numbers
        },
    },
    {
        scope: 'string.quoted.double.cryo',
        settings: {
            foreground: '#CE9178', // Light red for strings
        },
    }
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

    client.onReady().then(() => {
        client.sendRequest(SemanticTokensRegistrationType.method, {
            id: 'semantic-tokens',
            registerOptions: {
                documentSelector: [{ scheme: 'file', language: 'cryo' }],
                legend,
                range: true,
                full: {
                    delta: true
                }
            }
        });
    })

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
