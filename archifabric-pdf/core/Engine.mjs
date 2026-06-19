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
        this.lb = new LogBook(LogBook.LEVELS.DEBUG); // Adjust verbosity level here
        this.markup = new Markup(this.lb, 'Markdown');
        this.artifactory = new Artifactory(this.lb, this.markup);
        
        // Setup paths
        // Checks for ARCHIFABRIC_EXPORT_PATH but falls back to DOCGEN_EXPORT_PATH for backwards compatibility
        const System = Java.type('java.lang.System');
        this.exportPath = System.getenv('ARCHIFABRIC_EXPORT_PATH') || System.getenv('DOCGEN_EXPORT_PATH');
        
        // Determine Weasyprint executable path based on OS platform
        this.weasyprintExe = $.process.platform === 'win32' 
            ? __DIR__ + '../weasyprint/weasyprint.exe' 
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

            // 2. Validate user selection in Archi
            const structureView = selection.filter('archimate-diagram-model').first();
            if (!structureView) {
                throw new Error('Please select a valid ArchiMate diagram view representing the document structure.');
            }

            // 3. Find the main container and delegate processing
            this._findAndProcessMainStructure(structureView);

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
            console.log('Ending ArchiFabric-PDF...');
        }
    }

    /**
     * Finds the root 'diagram-model-group' elements in the view, extracts global variables 
     * defined in their documentation fields, and triggers the rendering process.
     * @param {Object} collection - The selected Archi diagram view.
     * @private
     */
    _findAndProcessMainStructure(collection) {
        this.lb.enter(`Engine._findAndProcessMainStructure(${collection.name})`);

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
                window.alert(`ArchiFabric-PDF:\n${pdfFile} successfully generated.`);
            } catch (error) {
                throw new Error(`PDF Generation failed. Please check if Weasyprint is installed correctly.\nDetails: ${error.message}`);
            }
        } else {
            this.lb.log('User cancelled PDF save dialog.');
        }
        
        this.lb.leave();
    }
}