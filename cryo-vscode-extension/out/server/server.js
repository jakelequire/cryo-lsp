"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
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
documents.onDidOpen((change) => {
    connection.console.log(`Document opened: ${change.document.uri}`);
});
documents.onDidChangeContent((change) => {
    connection.console.log(`Document changed: ${change.document.uri}`);
});
connection.onHover((_textDocumentPosition) => {
    const content = 'This is a hover message from the Cryo LSP server.';
    return {
        contents: { kind: 'plaintext', value: content },
    };
});
// Make the text document manager listen on the connection
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map