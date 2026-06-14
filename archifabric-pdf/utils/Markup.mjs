/**
 * @module utils/Markup
 * @description A utility class abstracting markup parsing (Markdown to HTML).
 * Manages document hierarchy (levels), Table of Contents (TOC) generation, 
 * CSS styling, and custom image rendering. Uses UUIDs for safe placeholder injection.
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
            
            return `<img src="${href}" alt="${text}"${titleAttr}${widthAttr}${heightAttr}>`;
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
    #cssBuffer = [];
    
    // Unique UUID placeholders for safe string replacement
    #frontPageID = "";
    #tocID = "";

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

    appendCss(styleSheet) {
        if (styleSheet) this.#cssBuffer.push(styleSheet);
    }

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

    levelUp() {
        this.#documentLevel++;
        this.#tocBuffer.push(`<ul class="toc h${this.#documentLevel}">\n`);
        this.lb.log(`Level Up: [${this.#documentLevel}]`);
    }

    levelDown() {
        this.#tocBuffer.push(`</ul>\n`);
        this.#documentLevel = Math.max(0, this.#documentLevel - 1);
        this.lb.log(`Level Down: [${this.#documentLevel}]`);
    }

    header(title, target) {
        this.lb.enter(`Markup.header(${title}, ${target})`);
        
        let idAttr = '';
        if (target && title) {
            const anchorId = `${target}-h${this.#documentLevel}`;
            idAttr = `id="${anchorId}"`;
            
            // Add entry to Table of Contents buffer
            this.#tocBuffer.push(`<li class="toc h${this.#documentLevel}"><a href="#${anchorId}">${escapeHtml(title)}</a></li>\n`);
        }
        
        const content = title ? `<h${this.#documentLevel} ${idAttr}>${title}</h${this.#documentLevel}>\n` : '';
        
        this.lb.leave();
        return content;
    }

    subheader(title, target) {
        this.levelUp();
        const content = this.header(title, target);
        this.levelDown();
        return content;
    }

    parse(mdContent) {
        return marked.parse(mdContent);
    }
    
    parseInline(mdContent) {
        return marked.parseInline(mdContent);
    }

    /**
     * Compiles all buffers, safely replaces the UUID placeholders, and returns the full HTML document.
     * @returns {string} The complete HTML string.
     */
    get html() {
        this.lb.enter('Markup.get html()');
        
        let bodyHtml = this.#contentBuffer.join('');
        const tocHtml = this.#tocBuffer.join('');
        const cssHtml = this.#cssBuffer.join('\n');

        // Resolve placeholders using the strictly unique UUID strings
        if (this.#frontPageID !== "") {
            bodyHtml = bodyHtml.replace(this.#frontPageID, this.frontPageHtml);
        }
        if (this.#tocID !== "") {
            bodyHtml = bodyHtml.replace(this.#tocID, tocHtml);
        }

        const parsedBody = marked.parse(bodyHtml);

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
${cssHtml}
    </style>
</head>
<body>
${parsedBody}
</body>
</html>`;

        this.lb.leave('HTML generated');
        return htmlContent;
    }
}