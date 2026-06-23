/**
 * @module artifacts/Documentation
 * @description Renders the documentation field of the target element.
 * Passes the text through the ExpressionParser to evaluate variables (like ${set:...}) 
 * before converting the remaining text from Markdown to HTML.
 */
import { Artifact } from '../core/Artifact.mjs';

export default class Documentation extends Artifact {
    constructor(artifactory) {
        super('Documentation', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-52e04c9f8dba4faa9d8740287e664067';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(${targetElement ? targetElement.name : 'undefined'})`);
        
        try {
            if (targetElement && targetElement.documentation) {
                // CRUCIAL FIX: Run the raw text through the ExpressionParser first!
                // This ensures ${set:var:val} commands are silently executed and removed,
                // and ${var:name} commands are replaced with their values.
                const parsedDoc = this.parseExpression(targetElement.documentation, targetElement);
                
                // Then convert the cleaned text to HTML using the Markup engine
                if (parsedDoc && parsedDoc.trim() !== '') {
                    this.markup.appendContent(this.markup.parse(parsedDoc) + '\n');
                }
            } else {
                this.lb.log('No documentation found for target element.');
            }
        } catch (err) {
            this.lb.error(`Error rendering Documentation: ${err.message}`, modelElement);
        } finally {
            this.lb.leave();
        }
    }
}