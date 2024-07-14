"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const legend = {
    tokenTypes: ['variable', 'function', 'parameter', 'keyword', 'comment', 'string', 'number', 'operator'],
    tokenModifiers: ['declaration', 'readonly', 'static', 'deprecated', 'abstract']
};
// Create a connection for the server.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// The workspace folder this server is operating on
let workspaceFolder = null;
connection.onInitialize((params) => {
    workspaceFolder = params.rootUri;
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            hoverProvider: true,
        },
    };
});
connection.languages.semanticTokens.on((params) => {
    const tokens = [];
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
    const tokens = [];
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
    if (document) {
        const code = document.getText();
        const filePath = './file.cryo';
        // Save the code to a temporary file
        fs.writeFileSync(filePath, code);
        console.log(`C:/Programming/apps/cryo/src/bin/main.exe ${filePath}`);
        (0, child_process_1.exec)(`C:/Programming/apps/cryo/src/bin/main.exe ${filePath}`, (error, stdout, stderr) => {
            if (error) {
                connection.console.error(`exec error: ${error}`);
                return;
            }
            const diagnostics = [];
            console.log("Cryo DEBUG: ", stdout);
            if (stdout) {
                const lines = stdout.split('\n');
                for (let line of lines) {
                    if (line.trim().length > 0) {
                        const error = JSON.parse(line);
                        const diagnostic = {
                            severity: node_1.DiagnosticSeverity.Error,
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
        });
    }
});
connection.onHover((_textDocumentPosition) => {
    const content = '';
    return {
        contents: { kind: 'plaintext', value: content },
    };
});
// Make the text document manager listen on the connection
documents.listen(connection);
// Listen on the connection
connection.listen();
