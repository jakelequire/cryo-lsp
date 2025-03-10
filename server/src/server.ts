import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	TextDocumentSaveReason,
	SemanticTokensLegend,
    DidSaveTextDocumentParams,
    TextDocumentChangeEvent,
	Hover,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { tokenTypes, tokenModifiers, provideSemanticTokens, getHoverInfo } from './semantics';
import { initializeSymbolProvider, SymbolProvider } from './compiler';
import { SymbolTable } from './symbolTable';

// Initialize our symbol provider
let symbolProvider: SymbolProvider;

const tokenLegend: SemanticTokensLegend = {
	tokenTypes,
	tokenModifiers
};

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
export const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;


connection.onInitialized(() => {
    console.log('Server initialized');
    // if (hasConfigurationCapability) {
    //     connection.client.register(
    //         DidChangeConfigurationNotification.type,
    //         undefined
    //     );
    // }
});


documents.onDidChangeContent(change => {
    const document = change.document;
    // Notify compiler about the change
    // symbolProvider.handleDocumentChange(document);
});

// Add this handler for save events
documents.onDidSave(async (changeEvent: TextDocumentChangeEvent<TextDocument>) => {
    // const document = changeEvent.document;
    // Clear existing diagnostics
    // connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    
    // Re-validate the entire document
    // await validateTextDocument(document);
});

// connection.onHover(
//     async ({ textDocument, position }: TextDocumentPositionParams): Promise<Hover | null> => {
//         const document = documents.get(textDocument.uri);
//         if (!document) {
//             console.log('No document found');
//             return null;
//         }

//         const offset = document.offsetAt(position);
//         const text = document.getText();
//         const lines = text.split(/\r\n|\r|\n/);
//         const line = lines[position.line];
//         const word = getWordAtPosition(text, offset);

//         if (!word) {
//             console.log('No word found');
//             return null;
//         }

//         const info = getHoverInfo(word, line);

//         if (info) {
//             return {
//                 contents: {
//                     kind: 'markdown',
//                     value: `\`\`\`\n${info}\n\`\`\``
//                 }
//             };
//         }

//         console.log('No hover info found');
//         return null;
//     }
// );

export function getWordAtPosition(text: string, offset: number): string {
    const wordPattern = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
    let match;
    while ((match = wordPattern.exec(text))) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
            return match[0];
        }
    }
    return '';
}


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
