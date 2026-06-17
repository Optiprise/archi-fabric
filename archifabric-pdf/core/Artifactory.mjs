/**
 * @module core/Artifactory
 * @description Manages the dynamic loading, initialization, and execution of Artifact modules.
 * It scans the artifacts directory, dynamically imports the ES6 modules, verifies they extend
 * the base Artifact class, and registers them. It acts as the central dispatcher for rendering.
 */

import { Artifact } from "./Artifact.mjs";
import { ExpressionParser } from '../utils/ExpressionParser.mjs';

// Java interop imports for file system operations in GraalVM (jArchi)
const Files = Java.type('java.nio.file.Files');
const Paths = Java.type('java.nio.file.Paths');
const Collectors = Java.type('java.util.stream.Collectors');

export class Artifactory {
    #registry = new Map();
    #basePath = "";

    /**
     * Initializes the Artifactory and sets the directory path for the artifact modules.
     * @param {Object} lb - The LogBook instance for logging.
     * @param {Object} markup - The Markup instance for generating document formatting.
     */
    constructor(lb, markup) {
        lb.enter('Artifactory.constructor');
        this.lb = lb;
        this.markup = markup;
        this.globalVars = new Map();
        this.parser = new ExpressionParser(this);
        
        // Empty map, dynamically filled by the artifacts themselves if they provide a helpUrl
        this.helpRegistry = new Map();

        // Determine the base path for artifacts. __DIR__ is provided by the jArchi environment.
        // Ensures the path ends with a trailing slash.
        this.#basePath = __DIR__.endsWith('/') ? __DIR__ + '../artifacts/' : __DIR__ + '/../artifacts/';
        this.lb.log(`Artifactory path set to: ${this.#basePath}`);
        
        lb.leave();
    }

    /**
     * Scans the artifacts directory for .mjs files, dynamically imports them,
     * instantiates valid Artifact classes, and stores them in the registry.
     * @returns {Promise<void>} Resolves when all artifacts are successfully loaded and registered.
     * @throws {Error} If the directory cannot be read or a module fails to load.
     */
    async loadAndInit() {
        this.lb.enter('Artifactory.loadAndInit');
        const dirPath = Paths.get(this.#basePath);
        
        // Verify that the target directory exists
        if (!Files.isDirectory(dirPath)) {
            this.lb.error(`Directory not found: ${this.#basePath}`);
            this.lb.leave();
            return;
        }

        try {
            // Walk the directory (1 level deep) to find all .mjs files using Java NIO
            const stream = Files.walk(dirPath, 1);
            const fileList = stream
                .filter(path => Files.isRegularFile(path) && path.toString().endsWith('.mjs'))
                .collect(Collectors.toList());
            stream.close();

            // Convert the Java List to a JavaScript Array
            const paths = Java.from ? Java.from(fileList) : fileList.toArray();
            this.lb.log(`Found ${paths.length} module(s) to load`);

            // Create promises to dynamically import each found module
            const importPromises = paths.map(path => {
                const url = path.toUri().toString();
                return import(url);
            });

            // Wait for all dynamic imports to resolve
            const loadedMods = await Promise.all(importPromises);

            // Filter the loaded modules and instantiate the ones extending the base Artifact class
            loadedMods.forEach((mod, i) => {
                const Cls = mod.default;
                
                // Verify the module exports a class that extends Artifact (GraalVM safe check)
                if (typeof Cls === 'function' && Artifact.prototype.isPrototypeOf(Cls.prototype)) {
                    this.lb.log(`Loaded artifact class: ${Cls.name}`);
                    try {
                        const instance = new Cls(this);
                        // Register the artifact in the map using its specific name/identifier
                        this.#registry.set(instance.name, instance);
                        
                        // Dynamically register the URL if the artifact provides one
                        if (instance.helpUrl) {
                            this.helpRegistry.set(instance.name, instance.helpUrl);
                        }
                        
                        this.lb.log(`Successfully registered artifact: ${instance.name}`);
                    } catch (err) {
                        this.lb.error(`Failed to instantiate ${Cls.name}: ${err}`);
                    }
                } else {
                    this.lb.error(`Invalid artifact at ${paths[i]}: default export does not extend the base Artifact class.`);
                }
            });

        } catch (err) {
            this.lb.error(`Error loading artifacts from file system: ${err}`);
            throw err; // Re-throw to allow higher-level error handling
        } finally {
            this.lb.leave();
        }
    }

    /**
     * Dispatches the rendering process to the appropriate loaded artifact.
     * @param {string} rawArtifactName - The registered name of the artifact, optionally containing parameters (e.g., "Section class=intro").
     * @param {Object} modelElement - The source model element providing the parameters/context.
     * @param {Object} targetElement - The actual target element from the TargetStructure to be rendered.
     */
    render(rawArtifactName, modelElement, targetElement) {
        // Extract base name to support inline parameters like "Section class=intro"
        const artifactName = typeof rawArtifactName === 'string' ? rawArtifactName.trim().split(/\s+/)[0] : rawArtifactName;
        
        this.lb.enter(`Artifactory.render(artifact: '${artifactName}')`);
        
        const artifact = this.#registry.get(artifactName);
        
        // Retrieve the dynamic URL (if registered) using the resolved base name
        const helpUrl = this.helpRegistry.get(artifactName);
        
        // Construct the help text only if a URL is available
        const helpText = helpUrl ? `\n[Documentation & Help: ${helpUrl}]` : '';
        
        // Verify the artifact exists and has a valid render method
        if (artifact && typeof artifact.render === 'function') {
            try {
                // Helper to format names and labels for clear logging
                const formatLogName = (el) => {
                    if (!el) return 'undefined';
                    const name = el.name || 'unnamed';
                    const label = el.labelExpression || el.labelValue;
                    return label ? `${el.type}: ${name} [Label: ${label}]` : `${el.type}: ${name}`;
                };

                this.lb.log(`Processing Model (${formatLogName(modelElement)}) targeting Data (${formatLogName(targetElement)})`);
                
                artifact.render(modelElement, targetElement);
            } catch (err) {
                this.lb.error(`Error during rendering of artifact '${artifactName}': ${err.message}${helpText}`, modelElement);
            }
        } else {
            this.lb.error(`Artifact module for '${artifactName}' is not loaded or does not implement render().${helpText}`, modelElement);
        }
        
        this.lb.leave();
    }
}