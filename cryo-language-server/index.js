const {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind
} = require('vscode-languageserver/node');

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents = new TextDocuments();

// Listen for text document changes
documents.listen(connection);

// The content of a text document has changed. This event is emitted
// when the text document is first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

// Validate the text document
async function validateTextDocument(textDocument) {
    const text = textDocument.getText();
    const diagnostics = [];

    // Example validation: Check for the word "error"
    const pattern = /\berror\b/g;
    let m;
    while ((m = pattern.exec(text))) {
        const diagnostic = {
            severity: 1,
            range: {
                start: textDocument.positionAt(m.index),
                end: textDocument.positionAt(m.index + m[0].length)
            },
            message: `${m[0]} is a reserved word.`,
            source: 'cryo'
        };
        diagnostics.push(diagnostic);
    }

    // Send the computed diagnostics to VS Code
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
