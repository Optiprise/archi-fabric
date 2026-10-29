/*
 * ArchiFabric-PDF - [Document Generation Engine for Archi]
 * Copyright (C) 2026 [Optiprise, Bart Ratgers]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @module core/Engine
 * @description Core Orchestrator for ArchiFabric-PDF.
 * Responsible for initializing components, parsing the selected Archi view,
 * setting up global variables, and triggering the root Artifact rendering.
 * Finally, it executes Weasyprint to generate the PDF.
 */

import { Markup } from '../utils/Markup.mjs';
import { LogBook } from '../utils/Logbook.mjs';
import { Artifactory } from './Artifactory.mjs';

// Java interoperability for Date parsing
const LocalDate = Java.type("java.time.LocalDate");
const DateTimeFormatter = Java.type("java.time.format.DateTimeFormatter");
const Locale = Java.type("java.util.Locale");

export class Engine {
    /**
     * Initializes the Engine, sets up the logger, markup generator, artifactory,
     * and configures system paths for PDF generation.
     */
    constructor() {
        const System = Java.type('java.lang.System');
        const args = this._parseArguments();
        args || console.log('├ Parsed command-line arguments:', args);

        // Determine the export path from command-line arguments or environment variable
        this.exportPath = args.exportPath || System.getenv('ARCHIFABRIC_EXPORT_PATH');

        // Determine execution mode: 'cli' for command-line, 'interactive' for GUI
        this.executionMode = args.executionMode || 'interactive';
        if (!['cli', 'interactive'].includes(this.executionMode)) {
            throw new Error(
                `Invalid executionMode: ${this.executionMode}`
            );
        }

        // Determine the model structure ID from command-line arguments or selection in the GUI
        this.modelStructureId = args.modelStructureId || System.getenv('MODELSTRUCTURE_ID');
        if (this.modelStructureId) {
            this.structureView = $('#' + this.modelStructureId)
                .filter('archimate-diagram-model')
                .first();
        } else {
            this.structureView = selection
                .filter('archimate-diagram-model')
                .first();
        }

        if (!this.structureView) {
            throw new Error(
                'No valid ArchiMate view found for the document structure.'
            );
        }

        // Determine log level from command-line arguments, environment variable, or default to ERROR
        const logLevelName = String(
            args.logLevel || this.structureView.prop('logLevel') || 'ERROR').trim().toUpperCase();

        // Validate log level
        if (!Object.prototype.hasOwnProperty.call(LogBook.LEVELS, logLevelName)) {
            throw new Error(
                `Invalid logLevel '${logLevelName}'. ` +
                `Valid values: ${Object.keys(LogBook.LEVELS).join(', ')}`
            );
        }

        // Convert log level name to numeric value
        this.lb = new LogBook(LogBook.LEVELS[logLevelName]);

        // Set up the Markup and Artifactory components
        this.markup = new Markup(this.lb, 'Markdown');
        this.artifactory = new Artifactory(this.lb, this.markup);
                
        // Determine Weasyprint executable path based on OS platform
        this.weasyprintExe = $.process.platform === 'win32' 
            ? __DIR__ + '../weasyprint/dist/weasyprint.exe' 
            : 'weasyprint';
            
        this._setupGlobals();
    }

    /**
     * Parses command-line arguments in --key=value format.
     *
     * @returns {Object<string, string>} Parsed arguments.
     * @private
     */
    _parseArguments() {
        const args = {};

        for (const arg of $.process.argv) {
            if (!arg.startsWith('--')) continue;

            const separator = arg.indexOf('=');
            if (separator === -1) continue;

            const key = arg.substring(2, separator);
            const value = arg.substring(separator + 1);

            args[key] = value;
        }

        return args;
    }    

    /**
     * Sets up initial global variables like the current date.
     * @private
     */
    _setupGlobals() {
        this.lb.enter('Engine._setupGlobals');
        const today = LocalDate.now();
        const formatter = DateTimeFormatter.ofPattern("d MMMM yyyy", new Locale("en", "US"));
        
        this.artifactory.globalVars.set('Date', today.format(formatter));
        this.artifactory.globalVars.set('documentName', 'ArchiFabric Document');
        this.lb.leave();
    }

    /**
     * Main execution lifecycle. Validates selection, delegates rendering to the root Artifact,
     * and exports the generated HTML to PDF.
     * @returns {Promise<void>}
     */
    async run() {
        this.lb.enter('Engine.run');

        try {
            // 1. Initialize the Artifactory (dynamically load all artifact modules)
            await this.artifactory.loadAndInit();


            // 3. Find the main container and delegate processing
            this._findAndProcessMainStructure();

            // 4. Validate output before saving
            if (this.markup.content === '') {
                throw new Error('No valid document structure elements found to render.');
            }

            // 5. Export to PDF
            this._exportToPDF();

        } catch (error) {
            this.lb.error(error);
            throw error;
        } finally {
            this.lb.leave();

            if (this.artifactory.globalVars.get('dumpCSS')) {
                this.markup.extractCssClassesAndTags();
                console.show(); 
            }
            console.log('Ending ArchiFabric-PDF...');
        }
    }

    /**
     * Finds the root 'diagram-model-group' elements in the view, extracts global variables 
     * defined in their documentation fields, and triggers the rendering process.
     * @param {Object} collection - The selected Archi diagram view.
     * @private
     */
    _findAndProcessMainStructure(collection = this.structureView) {
        this.lb.enter(`Engine._findAndProcessMainStructure(${collection.name}) with id: ${collection.id}`);

        $(collection).children('diagram-model-group').each(groupElement => {
            this.lb.log(`Root document structure found: ${groupElement.name}`);
            
            // The root group itself is an Artifact. We delegate rendering to the Artifactory.
            this.artifactory.render(groupElement.name, groupElement, groupElement);
        });

        this.lb.leave();
    }

    /**
     * Generates HTML and synchronously executes WeasyPrint.
     * Waits until PDF generation is completed.
     * @private
     */
    _exportToPDF() {
        this.lb.enter('Engine._exportToPDF');

        try {
            const docName = this.artifactory.globalVars.get('documentTitle')
                || `${model.name} - Document`;

            const defaultFileName = `${docName}.pdf`;

            const pdfFile = this.exportPath
                ? `${this.exportPath}/${defaultFileName}`
                : window.promptSaveFile({
                    title: `Save ArchiFabric Document: ${docName}`,
                    filterExtensions: ['*.pdf'],
                    fileName: defaultFileName,
                });

            if (!pdfFile) {
                this.lb.log('User cancelled PDF save dialog.');
                return;
            }

            const htmlFile = pdfFile.replace(/\.pdf$/, '.html');

            // Write HTML to disk
            $.fs.writeFile(htmlFile, this.markup.html);


            const ProcessBuilder = Java.type('java.lang.ProcessBuilder');
            const weasyprint = new ProcessBuilder(
                this.weasyprintExe,
                '-p',
                '--optimize-images',
                '-e',
                'utf8',
                htmlFile,
                pdfFile
            );

            
            if (this.executionMode === 'cli') {
                // CLI: synchronous execution
                this._executeWeasyPrintSync(weasyprint, pdfFile);
            } else {
                // Interactive: asynchronous execution
                this._executeWeasyPrintAsync(weasyprint, pdfFile);
            }
        } finally {
            this.lb.leave();
        }
    }

    /**
     * Executes WeasyPrint synchronously.
     * Intended for CLI execution.
     *
     * @param {weasy} weasyprint - The WeasyPrint process builder.
     * @param {string} pdfFile - Destination PDF file.
     * @private
     */
    _executeWeasyPrintSync(weasyprint, pdfFile) {
        this.lb.enter('Engine._executeWeasyPrintSync');
        const TimeUnit = Java.type('java.util.concurrent.TimeUnit');

        weasyprint.inheritIO();

        const process = weasyprint.start();

        const completed = process.waitFor(30, TimeUnit.SECONDS);

        if (!completed) {
            process.destroyForcibly();
            throw new Error('WeasyPrint timeout after 30 seconds.');
        }

        if (process.exitValue() !== 0) {
            throw new Error(
                `WeasyPrint failed with exit code ${process.exitValue()}`
            );
        }

        const File = Java.type('java.io.File');
        const output = new File(pdfFile);

        if (!output.isFile() || output.length() === 0) {
            throw new Error(`PDF missing or empty: ${pdfFile}`);
        }

        this.lb.log(`Successfully generated: ${pdfFile}`);
        this.lb.leave();
    }

    /**
     * Executes WeasyPrint asynchronously.
     * Intended for interactive Archi usage.
     *
     * @param {weasy} weasyprint - The WeasyPrint process builder.
     * @param {string} pdfFile - Destination PDF file.
     * @private
     */
    _executeWeasyPrintAsync(weasyprint, pdfFile) {
        this.lb.enter('Engine._executeWeasyPrintAsync');

        // Redirect process output to a log file
        const File = Java.type('java.io.File');
        const logFile = new File(`${pdfFile}.log`);

        weasyprint.redirectErrorStream(true);
        weasyprint.redirectOutput(logFile);
        weasyprint.start();

        this.lb.log(`WeasyPrint started asynchronously: ${pdfFile}`);
        window.alert(`ArchiFabric-PDF started asynchronously to generate: ${pdfFile}`);
        this.lb.leave();
    }
}