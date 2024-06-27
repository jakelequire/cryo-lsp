const path = require('path');
const vscode = require('vscode');
const {
    LanguageClient,
    TransportKind
} = require('vscode-languageclient/node');

let client;

function activate(context) {
    const serverModule = context.asAbsolutePath(
        path.join('server', 'index.js')
    );

    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'cryo' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    client = new LanguageClient(
        'cryoLanguageServer',
        'Cryo Language Server',
        serverOptions,
        clientOptions
    );

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
    deactivate
};
