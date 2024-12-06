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


const tokenLegend: SemanticTokensLegend = {
	tokenTypes,
	tokenModifiers
};

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
// Log The InitializeParams
//     
//     const capabilities = params.capabilities;
// 
//     hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
//     hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
//     hasDiagnosticRelatedInformationCapability = !!(
//         capabilities.textDocument &&
//         capabilities.textDocument.publishDiagnostics &&
//         capabilities.textDocument.publishDiagnostics.relatedInformation
//     );
// 
//     const result: InitializeResult = {
//         capabilities: {
//             textDocumentSync: TextDocumentSyncKind.Incremental,
//             hoverProvider: true,
//             diagnosticProvider: {
//                 interFileDependencies: false,
//                 workspaceDiagnostics: false
//             }
//         }
//     };
// 
//     if (hasWorkspaceFolderCapability) {
//         result.capabilities.workspace = {
//             workspaceFolders: {
//                 supported: true
//             }
//         };
//     }
// 
//     return result;
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
        }
    };
});

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
    // validateTextDocument(change.document);
});

// Add this handler for save events
documents.onDidSave(async (changeEvent: TextDocumentChangeEvent<TextDocument>) => {
    // const document = changeEvent.document;
    // Clear existing diagnostics
    // connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    
    // Re-validate the entire document
    // await validateTextDocument(document);
});

connection.onHover(
    async ({ textDocument, position }: TextDocumentPositionParams): Promise<Hover | null> => {
        const document = documents.get(textDocument.uri);
        if (!document) {
            console.log('No document found');
            return null;
        }

        const offset = document.offsetAt(position);
        const text = document.getText();
        const lines = text.split(/\r\n|\r|\n/);
        const line = lines[position.line];
        const word = getWordAtPosition(text, offset);

        if (!word) {
            console.log('No word found');
            return null;
        }

        const info = getHoverInfo(word, line);

        if (info) {
            return {
                contents: {
                    kind: 'markdown',
                    value: `\`\`\`\n${info}\n\`\`\``
                }
            };
        }

        console.log('No hover info found');
        return null;
    }
);

function getWordAtPosition(text: string, offset: number): string {
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    // Return nothing safely for now
    return;
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');

	// Clear all diagnostics
	// documents.all().forEach(validateTextDocument);
});


connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);

	// Revalidate the document with the new content
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		// validateTextDocument(document);
	}
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
