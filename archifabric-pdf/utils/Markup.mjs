/**
 * @module utils/Markup
 * @description A utility class abstracting markup parsing (Markdown to HTML).
 * Manages document hierarchy (levels), Table of Contents (TOC) generation, 
 * CSS styling, and custom image rendering. Uses UUIDs for safe placeholder injection.
 * Enforces strict HTML/XML tags for reliable PDF rendering via WeasyPrint.
 */

import { marked } from '../libs/marked.esm.js';

// Java interop for generating unique UUID placeholders
const UUID = Java.type('java.util.UUID');

// ============================================================================
// Helper: Native HTML Escaper
// ============================================================================
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================================
// Custom Marked Renderer Configuration
// ============================================================================
marked.use({
    renderer: {
        image(token) {
            const href = escapeHtml(token.href);
            const text = escapeHtml(token.text);
            let titleAttr = '';
            let widthAttr = '';
            let heightAttr = '';

            if (token.title) {
                const match = token.title.match(/^=([\d%a-z]+)x([\d%a-z]+)\s*(.*)/i);
                if (match) {
                    widthAttr = ` width="${match[1]}"`;
                    heightAttr = ` height="${match[2]}"`;
                    if (match[3]) {
                        titleAttr = ` title="${escapeHtml(match[3])}"`;
                    }
                } else {
                    titleAttr = ` title="${escapeHtml(token.title)}"`;
                }
            }
            
            // Ensure the image tag is strictly closed for XML/WeasyPrint compatibility
            return `<img src="${href}" alt="${text}"${titleAttr}${widthAttr}${heightAttr} />`;
        }
    },
    gfm: true
});

// ============================================================================
// Markup Class Definition
// ============================================================================

export class Markup {
    #documentLevel = 0;
    #contentBuffer = []; 
    #tocBuffer = [];
    
    // Using a Set ensures that identical CSS blocks (e.g., from multiple catalogs) are automatically deduplicated
    #cssBuffer = new Set();
    
    // Unique UUID placeholders for safe string replacement
    #frontPageID = "";
    #tocID = "";
    #classStack = [];

    /**
     * Initializes the Markup engine.
     * @param {Object} lb - The LogBook instance.
     * @param {string} language - The primary language for the document.
     */
    constructor(lb, language = 'Markdown') {
        this.lb = lb;
        this.language = language;
        this.frontPageHtml = ""; 
    }

    /**
     * Appends CSS to the global stylesheet. Deduplicates identical blocks automatically.
     * @param {string} styleSheet - The CSS rules to inject.
     */
    appendCss(styleSheet) {
        if (styleSheet) {
            this.#cssBuffer.add(styleSheet.trim());
        }
    }

    /**
     * Appends pre-parsed HTML content to the document buffer.
     * @param {string} mdContent - The HTML content to append.
     */
    appendContent(mdContent) {
        if (mdContent) this.#contentBuffer.push(mdContent);
    }

    get content() {
        return this.#contentBuffer.join('');
    }

    get documentLevel() {
        return this.#documentLevel;
    }

    genHtmlClass(unsafeName) {
        this.lb.enter(`Markup.genHtmlClass(${unsafeName})`);
        
        if (typeof unsafeName !== 'string') {
            this.lb.leave('not a string');
            return String(unsafeName);
        }

        const className = unsafeName
            .replace(/[&<>"']/g, "")
            .replace(/\s+/g, "-")
            .toLowerCase();
            
        this.lb.leave(className);
        return className;
    }

    /**
     * Generates a unique UUID and inserts it into the content buffer as a placeholder for the Front Page.
     */
    insertFrontPagePlaceholder() {
        this.lb.enter(`Markup.insertFrontPagePlaceholder`);
        if (this.#frontPageID === "") {
            this.#frontPageID = UUID.randomUUID().toString();
            this.appendContent(this.#frontPageID + '\n');
            this.lb.log(`Set FrontPageID to: ${this.#frontPageID}`);
        }
        this.lb.leave();
    }

    /**
     * Generates a unique UUID and inserts it into the content buffer as a placeholder for the TOC.
     */
    insertTocPlaceholder() {
        this.lb.enter(`Markup.insertTocPlaceholder`);
        if (this.#tocID === "") {
            this.#tocID = UUID.randomUUID().toString();
            this.appendContent(this.#tocID + '\n');
            this.lb.log(`Set TOCID to: ${this.#tocID}`);
        }
        this.lb.leave();
    }

    levelUp(customClass = '') {
        this.#documentLevel++;
        
        // Combineer de classes van het bovenliggende niveau met de nieuwe classes
        const parentClass = this.#classStack.length > 0 ? this.#classStack[this.#classStack.length - 1] : '';
        const combined = [parentClass, customClass].filter(c => c && c.trim() !== '').join(' ');
        
        // Zet ze op de stack
        this.#classStack.push(combined);
        this.lb.log(`Level Up: [${this.#documentLevel}], Active Classes: ${combined}`);
    }

    levelDown() {
        this.#classStack.pop(); // Verwijder de classes van dit niveau weer
        this.#documentLevel = Math.max(0, this.#documentLevel - 1);
        this.lb.log(`Level Down: [${this.#documentLevel}]`);
    }

    header(title, target, customClass = '') {
        this.lb.enter(`Markup.header(${title}, ${target})`);
        
        let idAttr = '';
        let headerClassAttr = '';
        let tocClassAttr = `toc h${this.#documentLevel}`;

        // Combineer de overgeërfde classes van de stack met de lokaal meegegeven class
        const stackClass = this.#classStack.length > 0 ? this.#classStack[this.#classStack.length - 1] : '';
        const combinedClass = [stackClass, customClass].filter(c => c && c.trim() !== '').join(' ');

        // Verwijder eventuele dubbele classes (als een sectie 'bijlage' heeft, hoeven we het niet 2x te printen)
        const uniqueClasses = [...new Set(combinedClass.split(/\s+/))].join(' ');

        if (uniqueClasses !== '') {
            headerClassAttr = ` class="${uniqueClasses}"`;
            tocClassAttr += ` ${uniqueClasses}`;
        }

        if (target && title) {
            const anchorId = `${target}-h${this.#documentLevel}`;
            idAttr = `id="${anchorId}"`;
            
            // Zet de gecombineerde class ook op de lijst in de Inhoudsopgave!
            this.#tocBuffer.push(`<li class="${tocClassAttr}"><a href="#${anchorId}">${escapeHtml(title)}</a></li>\n`);
        }
        
        // Genereer de tag met de class (zodat h2.bijlage ook direct werkt)
        const content = title ? `<h${this.#documentLevel} ${idAttr}${headerClassAttr}>${title}</h${this.#documentLevel}>\n` : '';
        
        this.lb.leave();
        return content;
    }

    subheader(title, target) {
        this.levelUp();
        const content = this.header(title, target);
        this.levelDown();
        return content;
    }

    /**
     * Parses raw Markdown into HTML.
     * Intercepts standard Markdown headings (#) to make them relative to the 
     * current document markup level, and automatically adds them to the TOC.
     * @param {string} mdContent - The Markdown string.
     * @returns {string} The parsed HTML.
     */
    parse(mdContent) {
        if (!mdContent) return '';
        
        let processedContent = '';
        const lines = String(mdContent).split(/\r?\n|\r/);
        let inCodeBlock = false;
        
        lines.forEach((line) => {
            // Detect code block fences (```), and toggle the inCodeBlock flag. We do not want to process headers inside code blocks.
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }
            
            // Detect Markdown headers (e.g., #, ##, ###) and process them relative to the current document level.
            const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
            
            if (headerMatch && !inCodeBlock) {
                const depth = headerMatch[1].length;
                const title = headerMatch[2].trim();
                
                // We temporarily increase the document level to ensure that the header is rendered at the correct depth in the final HTML. This allows for nested sections and proper TOC generation.
                const originalLevel = this.#documentLevel;
                
                // We add the depth of the Markdown header to the current document level to get the final heading level. For example, if the current document level is 1 (Section) and we encounter a Markdown header with 2 hashes (##), it will be rendered as an <h3> in the final HTML.
                // This ensures that the document structure remains consistent and that the TOC reflects the correct hierarchy.
                // Example: in a Section (level 1), '## Subtitle' becomes <h3> (1 + 2 = 3)
                this.#documentLevel = originalLevel + depth;

                // Generate a unique ID for the header to ensure that it can be linked to from the TOC. We use a UUID to avoid collisions, especially in documents with repeated titles.
                const headerId = "md-" + UUID.randomUUID().toString().substring(0, 8);
                
                // Append the processed header to the content buffer, and also add it to the TOC buffer. The TOC entry will link to the generated header ID, allowing for easy navigation within the document.
                processedContent += '\n' + this.header(title, headerId) + '\n';
                
                // We restore the original document level after processing the header to ensure that subsequent content is rendered at the correct depth. This is important for maintaining the overall structure of the document, especially when multiple headers are present.
                this.#documentLevel = originalLevel;
            } else {
                //  For non-header lines, we simply append them to the processed content. This includes paragraphs, lists, code blocks, and any other Markdown elements. We do not modify these lines, as they will be parsed by the marked library into the appropriate HTML elements.
                processedContent += line + '\n';
            }
        });

        // Parse the remaining Markdown to HTML
        return marked.parse(processedContent);
    }
    /**
    
    /**
     * Parses raw inline Markdown into HTML (ignoring block elements).
     * @param {string} mdContent - The Markdown string.
     * @returns {string} The parsed HTML.
     */
    parseInline(mdContent) {
        return marked.parseInline(mdContent);
    }

    /**
     * Compiles all buffers, safely replaces the UUID placeholders, and returns the full HTML document.
     * Enforces strict XML/HTML5 compatibility and prevents double-parsing of Markdown.
     * @returns {string} The complete HTML string.
     */
    get html() {
        this.lb.enter('Markup.get html()');
        
        let bodyHtml = this.#contentBuffer.join('');
        const tocHtml = this.#tocBuffer.join('');
        const cssHtml = Array.from(this.#cssBuffer).join('\n\n');

        // Resolve placeholders using the strictly unique UUID strings
        if (this.#frontPageID !== "") {
            bodyHtml = bodyHtml.replace(this.#frontPageID, this.frontPageHtml);
        }
        if (this.#tocID !== "") {
            const flatTocHtml = this.#tocBuffer.length > 0 ? '<ul class="toc">\n' + tocHtml + '</ul>\n' : '';
            bodyHtml = bodyHtml.replace(this.#tocID, flatTocHtml);
        }

        // We DO NOT run marked.parse(bodyHtml) here anymore, because the content 
        // is already parsed into HTML at the component level (Section, Catalog).
        // Double parsing raw HTML with marked.js can destroy table and div structures!

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <style type="text/css">
${cssHtml}
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

        this.lb.leave('HTML generated');
        return htmlContent;
    }
}