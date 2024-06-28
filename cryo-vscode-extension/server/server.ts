import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

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

documents.onDidOpen((change) => {
    connection.console.log(`Document opened: ${change.document.uri}`);
});

documents.onDidChangeContent((change) => {
    connection.console.log(`Document changed: ${change.document.uri}`);
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
