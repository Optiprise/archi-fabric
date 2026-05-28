/*
 * @fileoverview DocGen Document Generator Script for jArchi.
 * This script processes a selected ArchiMate view containing a document structure (groups and references)
 * to generate a structured document, typically in PDF format via HTML.
 * It leverages Underscore.js, custom Markup, LogBook, and Artifactory modules.
 */

// Load dependencies
import LogBook from './logbook.mjs';


// Initialize core components
const logBook = new LogBook(2); // Initialize LogBook with debug level 2

