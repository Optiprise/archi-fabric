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
 * @module artifacts/Document
 * @description The root artifact for generating the document structure.
 * Wraps the content in a main container, handles the front page placeholder,
 * and sets the document title/filename based on the label expression.
 * Supports modular building blocks by seamlessly expanding nested Views.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';

export default class Document extends Artifact {
    constructor(artifactory) {
        super('Document', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-a758bf44f0c44d22be8a1ddc6c385193';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);

        try {
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';
            const dump = inlineParams['dump'] ? ` ${inlineParams['dump']}` : '';
            const locale = inlineParams['locale'] ? `${inlineParams['locale']}` : 'en-US';
            const elementId = (targetElement?.id) || modelElement.id;

            // 1. Generate Root HTML Container
            this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}${customCssClass}">\n`);

            // Setup Metadata
            this._setupMetadata(modelElement, targetElement);

            // 2. Setup Global Variables
            this._setupGlobals(locale);

            // 5. Process Nested Children via ModelStructure
            const modelStructure = new ModelStructure(this.lb, modelElement);
            const pairs = modelStructure.getTemplateTargetPairs();
            this._processTemplatePairs(pairs, targetElement);

            // 6. Close Root HTML Container
            this.markup.appendContent(`</div>\n`);
            this.lb.log(`Document rendering completed successfully.`);
            this.lb.log(`dump parameter value: ${dump}`);
            if (dump.trim().toLowerCase() === 'css') {
                this.lb.log(`Dump of CSS classes and HTML elements used in the document.`);
                this.globalVars.set('DumpCSS', true);
            } else if (dump.trim().toLowerCase() === 'html') {
                this.lb.log(`Dump of HTML elements used in the document.`);
                this.globalVars.set('DumpHTML', true);
            }
        } catch (err) {
            this.lb.error(`Error during rendering of Document: ${err.message}`, modelElement);
        } finally {
            this.lb.leave();

        }
    }

        /**
     * Sets up initial global variables like the current date.
     * @param {string} localeTag - The locale tag to use for date formatting (e.g., 'en-US').
     * @private
     * 
     */

    _setupGlobals(localeTag = 'en-US') {
        this.lb.enter(`Engine._setupGlobals(locale: '${localeTag}')`);
        
        const LocalDateTime = Java.type("java.time.LocalDateTime");
        const DateTimeFormatter = Java.type("java.time.format.DateTimeFormatter");
        const FormatStyle = Java.type("java.time.format.FormatStyle");
        const Locale = Java.type("java.util.Locale");

        // 1. Convert the localeTag to a Locale object, replacing underscores with hyphens
        const targetLocale = Locale.forLanguageTag(localeTag.replace('_', '-'));

        const dateFormatter = DateTimeFormatter
            .ofLocalizedDate(FormatStyle.LONG)
            .withLocale(targetLocale);

        const dateFullFormatter = DateTimeFormatter
            .ofLocalizedDate(FormatStyle.FULL)
            .withLocale(targetLocale);

        const dateMediumFormatter = DateTimeFormatter
            .ofLocalizedDate(FormatStyle.MEDIUM)
            .withLocale(targetLocale);

        const dateShortFormatter = DateTimeFormatter
            .ofLocalizedDate(FormatStyle.SHORT)
            .withLocale(targetLocale);

        const isoFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        const timeStampFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");


        // 3. Check if this locale is actually installed on the system
        const resolvedLocale = dateFormatter.getLocale();
        if (!resolvedLocale || !resolvedLocale.getLanguage()) {
            const errorMsg = `The required locale '${localeTag}' is not installed on this system. Cannot meet the document requirements.`;
            throw new Error(errorMsg);
        }

        // 4. Get the current date and time
        const now = LocalDateTime.now();

        //  5. Set the global variables with the formatted values
        this.artifactory.globalVars.set('Locale', targetLocale);
        this.artifactory.globalVars.set("Date", now.format(dateFormatter));
        this.artifactory.globalVars.set("FullDate", now.format(dateFullFormatter));
        this.artifactory.globalVars.set("MediumDate", now.format(dateMediumFormatter));
        this.artifactory.globalVars.set("ShortDate", now.format(dateShortFormatter));
        this.artifactory.globalVars.set("ISODate", now.format(isoFormatter));
        this.artifactory.globalVars.set("TimeStamp", now.format(timeStampFormatter));

        // 6. Log the set global variables for verification
        this.lb.log(`Globals - Locale: ${targetLocale}, Date: ${now.format(dateFormatter)}, FullDate: ${now.format(dateFullFormatter)}, MediumDate: ${now.format(dateMediumFormatter)}, ShortDate: ${now.format(dateShortFormatter)}, ISODate: ${now.format(isoFormatter)}, TimeStamp: ${now.format(timeStampFormatter)}`);
        this.lb.leave();
    }

    /**
     * Sets up document metadata, including the front page placeholder, the document title,
     * and evaluates expressions in the documentation.
     * @param {Object} modelElement - The model element defining the document.
     * @param {Object} targetElement - The actual target element.
     * @private
     */
    _setupMetadata(modelElement, targetElement) {
        // 2. Insert Frontpage Placeholder (if applicable)
        if (typeof this.markup.insertFrontPagePlaceholder === 'function') {
            this.markup.insertFrontPagePlaceholder(targetElement);
        }

        // 3. Document Title / Filename context
        if (modelElement.labelExpression) {
            const parsedTitle = this.parseExpression(modelElement.labelExpression, targetElement);
            if (parsedTitle && parsedTitle.trim() !== '') {
                this.globalVars.set('DocumentTitle', parsedTitle);
                this.lb.log(`Document title set to: ${parsedTitle}`);
            }
        }

        // 4. SILENT EXPRESSION PARSING 
        // We parse the documentation to trigger any ${set:var:val} commands globally.
        // We explicitly DO NOT call renderElementDocumentation() here because we don't 
        // want to print it as HTML. The visual 'Documentation' artifact handles printing.
        if (modelElement.documentation) {
            this.parseExpression(modelElement.documentation, targetElement);
        }
    }

    /**
     * Resolves a target node to its actual target, dereferencing views if it is a reference.
     * @param {Object} targetNode - The template target node to resolve.
     * @returns {Object} The resolved target element.
     * @private
     */
    _resolveTarget(targetNode) {
        return $(targetNode).is('diagram-model-reference') ? targetNode.refView : targetNode;
    }

    /**
     * Processes template target pairs, resolving targets and calling processTemplateNode.
     * @param {Array} pairs - The template target pairs to process.
     * @param {Object} targetElement - The fallback target element if no targets are mapped.
     * @private
     */
    _processTemplatePairs(pairs, targetElement) {
        for (const pair of pairs) {
            const { template, targets } = pair;
            if (targets && targets.length > 0) {
                for (const targetNode of targets) {
                    this._processTemplateNode(template, this._resolveTarget(targetNode));
                }
            } else {
                // Fallback: inherit the data context of the Document itself if nothing is mapped
                this._processTemplateNode(template, targetElement);
            }
        }
    }

    /**
     * Recursive function to handle Views as modular building blocks.
     * @param {Object} templateNode - The template node to process.
     * @param {Object} currentTarget - The target element to use as the data context.
     * @private
     */
    _processTemplateNode(templateNode, currentTarget) {
        // RULE: If it's a View, it's a container. Open it and scan for executable groups.
        if ($(templateNode).is('diagram-model-reference') || $(templateNode).is('archimate-diagram-model')) {
            const refView = templateNode.refView || templateNode;
            this.lb.log(`Document: Expanding modular view '${refView.name}'...`);

            $(refView).children('diagram-model-group').each(group => {
                this._processTemplateNode(group, currentTarget);
            });
        }
        // RULE: Only diagram-model-groups can contain artifact modules.
        else if ($(templateNode).is('diagram-model-group')) {
            const parsed = this.parseTemplateName(templateNode.name);
            this.artifactory.render(parsed.baseName, templateNode, currentTarget);
        }
        else {
            this.lb.log(`Warning: Ignored unsupported template node type: ${templateNode.type}`);
        }
    }
}