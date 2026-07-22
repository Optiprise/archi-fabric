/**
 * @module artifacts/CSS
 * @description Artifact that injects custom CSS styling into the final document.
 * It reads the CSS code from the documentation of the model element (the artifact itself)
 * and/or the content/documentation of the target element, and appends it to the global stylesheet.
 */
import { Artifact } from '../core/Artifact.mjs';

export default class CSS extends Artifact {
    /**
     * Initializes the CSS injection artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('CSS', artifactory);

        /**
         * URL pointing to documentation for the CSS artifact.
         * Automatically shown by the LogBook if this module crashes.
         * @type {string} 
         */
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-309858853fb2465bbb62938824e3f3f2';
    }

    /**
     * Reads the CSS content from both the model template and target element, 
     * and adds it to the Markup engine's CSS buffer.
     * @param {Object} modelElement - The Archi template element defining the CSS artifact.
     * @param {Object} targetElement - The actual Archi element providing the context.
     */
    /**
     * Reads the CSS content from the model template and adds it to the Markup engine's CSS buffer.
     * @param {Object} modelElement - The Archi template element defining the CSS artifact.
     * @param {Object} targetElement - The actual Archi element providing the context.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);

        let cssFound = false;

        // 1. Extract CSS ONLY from the template element (the CSS artifact box itself)
        if (modelElement?.documentation) {
            this.lb.log(`Injecting custom CSS from model element documentation: ${modelElement.name || modelElement.id}`);
            
            // Optioneel: We evalueren de CSS eerst, zodat je variabelen in je CSS kunt gebruiken!
            const parsedCSS = this.artifactory.parser.evaluate(modelElement.documentation, targetElement, this);
            
            this.markup.appendCss(parsedCSS + '\n');
            cssFound = true;
        }

        // 2. (VERWIJDERD) We halen GEEN documentatie meer uit het targetElement. 
        // Dit voorkomt dat gewone tekst of markdown van een hoofdstuk in de stylesheet lekt.

        if (!cssFound) {
            this.lb.log(`Warning: No CSS content found in the model element.`);
        }

        this.lb.leave();
    }
}