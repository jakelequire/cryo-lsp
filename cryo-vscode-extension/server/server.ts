import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    TextDocumentPositionParams,
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { exec } from 'child_process';
import * as fs from 'fs';


const legend = {
    tokenTypes: ['variable', 'function', 'parameter', 'keyword', 'comment', 'string', 'number', 'operator'],
    tokenModifiers: ['declaration', 'readonly', 'static', 'deprecated', 'abstract']
};

// Create a connection for the server.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | null = null;

connection.onInitialize((params: InitializeParams): InitializeResult => {
    workspaceFolder = params.rootUri;
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
        },
    };
});

connection.languages.semanticTokens.on((params) => {
    const tokens: number[] = [];

    // Tokenize the document content
    //@ts-ignore
    const text = documents.get(params.textDocument.uri).getText();

    // Example tokenization process
    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
        let match;
        const regex = /\b(let|const|function|if|else|for|while|return)\b/g;
        while ((match = regex.exec(line)) !== null) {
            tokens.push(lineIndex);
            tokens.push(match.index);
            tokens.push(match[0].length);
            tokens.push(legend.tokenTypes.indexOf('keyword'));
            tokens.push(0); // token modifiers
        }
    });

    return {
        data: tokens
    };
});

connection.languages.semanticTokens.onDelta((params) => {
    const tokens: number[] = [];

    // Tokenize the document content
    //@ts-ignore
    const text = documents.get(params.textDocument.uri).getText();

    // Example tokenization process
    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
        let match;
        const regex = /\b(let|const|function|if|else|for|while|return)\b/g;
        while ((match = regex.exec(line)) !== null) {
            tokens.push(lineIndex);
            tokens.push(match.index);
            tokens.push(match[0].length);
            tokens.push(legend.tokenTypes.indexOf('keyword'));
            tokens.push(0); // token modifiers
        }
    });

    return {
        data: tokens
    };

});

documents.onDidOpen((change) => {
    connection.console.log(`Document opened: ${change.document.uri}`);
});

documents.onDidChangeContent((change) => {
    connection.console.log(`Document changed: ${change.document.uri}`);
});


connection.onDidChangeTextDocument((change) => {
    const document = documents.get(change.textDocument.uri);
    if(document) {
        const code = document.getText();
        const filePath = './file.cryo';
        
        // Save the code to a temporary file
        fs.writeFileSync(filePath, code);

        console.log(`C:/Programming/apps/cryo/src/bin/main.exe ${filePath}`);

        exec(`C:/Programming/apps/cryo/src/bin/main.exe ${filePath}`, (error, stdout, stderr) => {
            if (error) {
                connection.console.error(`exec error: ${error}`);
                return;
            }
            
            const diagnostics: Diagnostic[] = [];

            console.log("Cryo DEBUG: ", stdout);

            if(stdout) {
                const lines = stdout.split('\n');
                for(let line of lines) {
                    if (line.trim().length > 0) {
                        const error = JSON.parse(line);
                        const diagnostic: Diagnostic = {
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: error.line - 1, character: error.column - 1 },
                                end: { line: error.line - 1, character: error.column }
                            },
                            message: error.error,
                            source: 'cryo'
                        };
                        console.log("Cryo Diagnostic: ", diagnostic);
                        diagnostics.push(diagnostic);
                    }
                }
            }
            connection.sendDiagnostics({ uri: document.uri, diagnostics });
        })
    }
});

connection.onHover((_textDocumentPosition: TextDocumentPositionParams): Hover => {
    const content: string = '';
    return {
        contents: { kind: 'plaintext', value: content },
    };
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
