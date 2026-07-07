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
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);

        let content = '';

        if (modelElement.labelExpression && modelElement.labelExpression.trim() !== '') {
            content = this.parseExpression(modelElement.labelExpression, targetElement);
        } else {
            content = targetElement && targetElement.documentation
                ? targetElement.documentation
                : '';
        }

        if (content && String(content).trim() !== '') {
            this.markup.appendContent(this.markup.parse(String(content)) + '\n');
        }

        this.lb.leave();
    }
}