import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

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

const tokenTypesLegend = [
    'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
    'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
    'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label'
];

const tokenModifiersLegend = [
    'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
    'modification', 'async'
];

const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        const allTokens = this._parseText(document.getText());
        const builder = new vscode.SemanticTokensBuilder();
        allTokens.forEach((token) => {
            builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
        });
        return builder.build();
    }

    private _encodeTokenType(tokenType: string): number {
        return tokenTypesLegend.indexOf(tokenType);
    }

    private _encodeTokenModifiers(tokenModifiers: string[]): number {
        let result = 0;
        tokenModifiers.forEach(modifier => {
            const index = tokenModifiersLegend.indexOf(modifier);
            if (index !== -1) {
                result |= (1 << index);
            }
        });
        return result;
    }

    private _parseText(text: string): IParsedToken[] {
        // Custom logic to parse the text and extract tokens
        return [];
    }
}

interface IParsedToken {
    line: number;
    startCharacter: number;
    length: number;
    tokenType: string;
    tokenModifiers: string[];
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: 'cryo' },
            new DocumentSemanticTokensProvider(),
            legend
        )
    );

    // Load and apply the theme
    const themePath = context.asAbsolutePath(path.join('themes', 'cryo-theme.json'));
    const themeData = JSON.parse(fs.readFileSync(themePath, 'utf8'));

    const config = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
    const existingConfig = config.get('textMateRules') || [];
    const updatedConfig = Array.isArray(existingConfig) ? existingConfig : [];
    config.update('textMateRules', [...updatedConfig, ...cryoConfig], vscode.ConfigurationTarget.Global);

    console.log("Cryo Extension Activated with theme.");

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('out/server', 'server.js'));

    // The debug options for the server
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // If the extension is launched in debug mode, then the debug server options are used
    // Otherwise, the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for Cryo documents
        documentSelector: [{ scheme: 'file', language: 'cryo' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc'),
        },
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'cryoLanguageServer',
        'Cryo Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
