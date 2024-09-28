import {
	Diagnostic,
	DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { spawn } from 'child_process';
import * as url from 'url';
import * as os from 'os';
import * as path from 'path';

import * as util from 'util';
import { execFile } from 'child_process';


interface DiagnosticDebugInfo {
    type: string;
    message: string;
    details: string;
    file: string;
    line: number;
    column: number;
    function: string;
}


// Promisify execFile for easier use with async/await
const execFileAsync = util.promisify(execFile);

function getCompilerPath(): string {
    // Determine the path to the Cryo compiler, this should be in the environmentmental variables
    // The path should be stored in the `CRYO_PATH` variable
    // The OS specific path separator should be used to split the path

    const compilerPath: string = "";

    // Windows:
    const isWindows: boolean = os.platform() === 'win32';
    if (isWindows) {
        const pathSeparator = ';';
        const cryoPath = process.env.CRYO_COMPILER_PATH;
        if (cryoPath) {
            console.log(cryoPath);
            return cryoPath.split(pathSeparator)[0];
        }

    }

    // Ubuntu:
    const isLinux: boolean = os.platform() === 'linux';
    if (isLinux) {
        const pathSeparator = ':';
        const cryoPath = process.env.CRYO_COMPILER_PATH;
        if (cryoPath) {
            console.log(cryoPath);
            return cryoPath.split(pathSeparator)[0];
        }
        else {
            console.log("<!> Could not determine the Cryo compiler path");
            const _compilerPath = "/home/phock/Programming/apps/cryo/src/bin/main";
            return _compilerPath;
        }
    }

    console.log("Could not determine the Cryo compiler path @getCompilerPath");
    return compilerPath;
}

function getFilePathAsFullPath(filePath: string): string {
    // If the file path is relative, convert it to an absolute path
    if (!path.isAbsolute(filePath)) {
        return path.join(process.cwd(), filePath);
    }
    return filePath;
}


export async function runCryoCompiler(textDocument: TextDocument): Promise<Diagnostic[]> {
    const documentUri = url.fileURLToPath(textDocument.uri);
    const compilerPath = getCompilerPath();
    const fileArg = getFilePathAsFullPath(documentUri);
    console.log(`Running compiler at ${compilerPath} on ${fileArg}`);

    try {
        // Add any necessary flags for error reporting
        const { stderr } = await execFileAsync(compilerPath, [fileArg]);
        
        console.log('Compiler stderr:', stderr);

        // Combine stdout and stderr for parsing
        const fullOutput = stderr;
        return await parseCompilerOutput(fullOutput, textDocument);
    } catch (error) {
        console.error('Error running compiler:', error);
        if (error instanceof Error) {
            // If the compiler process failed, we might still want to parse its output
            const fullOutput = error.message;
            return await parseCompilerOutput(fullOutput, textDocument);
        }
        return [];
    }
}

async function parseCompilerErrors(output: string, textDocument: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    const DiagnosticDebugInfo = errorOutput(output);

    for (const error of DiagnosticDebugInfo) {
        const diagnostic = Diagnostic.create({
            start: {
                line: error.line - 1,
                character: error.column - 1
            },
            end: {
                line: error.line - 1,
                character: error.column
            }
        }, error.message, DiagnosticSeverity.Error);

        diagnostics.push(diagnostic);
    }

    return diagnostics;
}

async function parseCompilerOutput(output: string, textDocument: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const errors = parseCompilerErrors(output, textDocument);
    await errors.then((errors) => {
        diagnostics.push(...errors);
    });
    return diagnostics;
}

function errorOutput(output: string): DiagnosticDebugInfo[] {
    const results: DiagnosticDebugInfo[] = [];
    const errorRegex = /#COMPILATION_ERROR\n\nFile: (.+)\nType: \[(.+)\]\nMessage: (.+)\nDetails: (.+)\nLocation: (.+):(\d+):(\d+)\nLine: (\d+)\nColumn: (\d+)\nFunction: (.+)\n\n#END_COMPILATION_ERROR/g;
    let match: RegExpExecArray | null;

    while ((match = errorRegex.exec(output)) !== null) {
        results.push({
            file: match[1],
            type: match[2],
            message: match[3],
            details: match[4],
            line: parseInt(match[8], 10),
            column: parseInt(match[9], 10),
            function: match[10]
        });
    }

    return results;
}
