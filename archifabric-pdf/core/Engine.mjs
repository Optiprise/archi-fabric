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
        this.exportPath = System.getenv('ARCHIFABRIC_EXPORT_PATH');
        this.envModelStructureId = System.getenv('MODELSTRUCTURE_ID');
        this.structureView = null;

        // Find the selected Archi diagram view or use the environment variable MODELSTRUCTURE_ID
        if (this.envModelStructureId) {
            console.log(`Environment variable MODELSTRUCTURE_ID found: ${this.envModelStructureId}`);
            // Select the view by ID and ensure it is an archimate-diagram-model
            this.structureView = $('#' + this.envModelStructureId).filter('archimate-diagram-model').first();
        } else {
            this.structureView = selection.filter('archimate-diagram-model').first();
        }

        if (!this.structureView) {
            throw new Error('Please select a valid ArchiMate diagram view representing the document structure, or provide a valid MODELSTRUCTURE_ID environment variable.');
        }

        // Determine the log level from the selected view or environment variable, defaulting to ERROR if not specified
        // Set up the LogBook, Markup, and Artifactory components
        const logLevel = this.structureView.prop('logLevel') || System.getenv('LOG_LEVEL') || LogBook.LEVELS.ERROR;
        this.lb = new LogBook(logLevel);
        this.markup = new Markup(this.lb, 'Markdown');
        this.artifactory = new Artifactory(this.lb, this.markup);
                
        // Determine Weasyprint executable path based on OS platform
        this.weasyprintExe = $.process.platform === 'win32' 
            ? __DIR__ + '../weasyprint/dist/weasyprint.exe' 
            : 'weasyprint';
            
        this._setupGlobals();
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
     * Generates HTML from the accumulated markup and executes Weasyprint to create a PDF.
     * @private
     */
    _exportToPDF() {
        this.lb.enter('Engine._exportToPDF');
        
        const docName = this.artifactory.globalVars.get('documentTitle') || `${model.name} - Document`;
        const defaultFileName = `${docName}.pdf`;

        // Determine destination file path
        const pdfFile = this.exportPath 
            ? `${this.exportPath}/${defaultFileName}`
            : window.promptSaveFile({
                title: `Save ArchiFabric Document: ${docName}`,
                filterExtensions: ['*.pdf'],
                fileName: defaultFileName,
            });

        if (pdfFile) {
            try {
                const htmlFile = pdfFile.replace(/\.pdf$/, '.html');
                
                // Write generated HTML string to disk
                $.fs.writeFile(htmlFile, this.markup.html); 
                
                // Execute Weasyprint
                this.lb.log(`Executing Weasyprint for file: ${pdfFile}`);
                $.child_process.exec(this.weasyprintExe, '-p', '--optimize-images', '-e', 'utf8', htmlFile, pdfFile);
                
                this.lb.log(`Successfully generated: ${pdfFile}`);
                if (!this.envModelStructureId) {
                    window.alert(`ArchiFabric-PDF:\n${pdfFile} successfully generated.`);
                }
            } catch (error) {
                throw new Error(`PDF Generation failed. Please check if Weasyprint is installed correctly.\nDetails: ${error.message}`);
            }
        } else {
            this.lb.log('User cancelled PDF save dialog.');
        }
        
        this.lb.leave();
    }
}