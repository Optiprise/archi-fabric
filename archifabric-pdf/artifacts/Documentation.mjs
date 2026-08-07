
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
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';
            const elementId = (targetElement?.id) || modelElement.id;

        let content = '';

        if (modelElement.labelExpression && modelElement.labelExpression.trim() !== '') {
            content = this.parseExpression(modelElement.labelExpression, targetElement);
        } else {
            content = targetElement && targetElement.documentation
                ? targetElement.documentation
                : '';
        }

        if (content && String(content).trim() !== '') {
            this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}${customCssClass}">\n`);
            this.markup.appendContent(this.markup.parse(String(content)) + '\n');
            this.markup.appendContent(`</div>\n`);
        }

        this.lb.leave();
    }
}