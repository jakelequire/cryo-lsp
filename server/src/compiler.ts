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
        return parseCompilerOutput(fullOutput, textDocument);
    } catch (error) {
        console.error('Error running compiler:', error);
        if (error instanceof Error) {
            // If the compiler process failed, we might still want to parse its output
            const fullOutput = error.message;
            return parseCompilerOutput(fullOutput, textDocument);
        }
        return [];
    }
}

function parseCompilerErrors(output: string, textDocument: TextDocument): Diagnostic[] {
    /*
    #COMPILATION_ERROR

    File: main.cryo
    Type: [ERROR]
    Message: Expected an expression or statement.
    Details: parsePrimaryExpression
    Location: main.cryo:21:30
    Line: 21
    Column: 30
    Function: parsePrimaryExpression

    #END_COMPILATION_ERROR
    
    ^ The above is the output of the cryo compiler. The #COMPILATION_ERROR and #END_COMPILATION_ERROR tags are used to identify the start and end of an error message.
    The error message contains the type of error, the message, details, location, line, column, and function. 
    We can parse this output to get the error messages and their locations.
    */
    const diagnostics: Diagnostic[] = [];
    const errorRegex = /#COMPILATION_ERROR\nFile: (.+)\nType: \[(.+)\]\nMessage: (.+)\nDetails: (.+)\nLocation: (.+):(\d+):(\d+)\nLine: (\d+)\nColumn: (\d+)\nFunction: (.+)\n#END_COMPILATION_ERROR/g;
    let match: RegExpExecArray | null;
    while ((match = errorRegex.exec(output)) !== null) {
        const [, type, message, details, file, lineStr, columnStr, lineStr2, columnStr2, func] = match;
        const line = parseInt(lineStr);
        const column = parseInt(columnStr);
        const line2 = parseInt(lineStr2);
        const column2 = parseInt(columnStr2);
        const range = {
            start: {
                line: line - 1,
                character: column - 1,
            },
            end: {
                line: line2 - 1,
                character: column2 - 1,
            },
        };
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range,
            message: message,
            source: file,
            code: type,
            relatedInformation: [
                {
                    location: {
                        uri: textDocument.uri,
                        range,
                    },
                    message: details,
                },
            ],
        };
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}

function parseCompilerOutput(output: string, textDocument: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const errors = parseCompilerErrors(output, textDocument);
    diagnostics.push(...errors);
    return diagnostics;
}
