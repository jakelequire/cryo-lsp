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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const node_1 = require("vscode-languageclient/node");
let client;
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
class DocumentSemanticTokensProvider {
    provideDocumentSemanticTokens(document, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const allTokens = this._parseText(document.getText());
            const builder = new vscode.SemanticTokensBuilder();
            allTokens.forEach((token) => {
                builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
            });
            return builder.build();
        });
    }
    _encodeTokenType(tokenType) {
        return tokenTypesLegend.indexOf(tokenType);
    }
    _encodeTokenModifiers(tokenModifiers) {
        let result = 0;
        tokenModifiers.forEach(modifier => {
            const index = tokenModifiersLegend.indexOf(modifier);
            if (index !== -1) {
                result |= (1 << index);
            }
        });
        return result;
    }
    _parseText(text) {
        // Custom logic to parse the text and extract tokens
        return [];
    }
}
function activate(context) {
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'cryo' }, new DocumentSemanticTokensProvider(), legend));
    // Load and apply the theme
    const themePath = context.asAbsolutePath(path.join('themes', 'cryo-theme.json'));
    const themeData = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    const config = vscode.workspace.getConfiguration('editor');
    const existingConfig = config.get('tokenColorCustomizations') || {};
    // @ts-ignore
    const updatedConfig = Object.assign(Object.assign({}, existingConfig), { semanticTokenColors: Object.assign(Object.assign({}, existingConfig.semanticTokenColors), themeData.semanticTokenColors) });
    config.update('tokenColorCustomizations', updatedConfig, vscode.ConfigurationTarget.Global);
    console.log("Cryo Extension Activated with theme.");
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('out/server', 'server.js'));
    // The debug options for the server
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
    // If the extension is launched in debug mode, then the debug server options are used
    // Otherwise, the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: { module: serverModule, transport: node_1.TransportKind.ipc, options: debugOptions },
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for Cryo documents
        documentSelector: [{ scheme: 'file', language: 'cryo' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc'),
        },
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient('cryoLanguageServer', 'Cryo Language Server', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    client.start();
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
