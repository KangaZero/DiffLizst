/**
 * Bun test environment setup — polyfills browser DOM APIs that diffXML.ts needs.
 * Loaded automatically via bunfig.toml [test].preload before any test file runs.
 *
 * linkedom is the go-to lightweight DOM implementation for Node/Bun environments.
 * It supports the full CSS selector API (querySelectorAll) and XMLSerializer-
 * compatible serialisation via element.toString(), unlike @xmldom/xmldom which
 * lacks querySelectorAll.
 */
import { DOMParser } from "linkedom";

class XMLSerializerPolyfill {
  serializeToString(node: unknown): string {
    return (node as { toString(): string }).toString();
  }
}

Object.assign(globalThis, {
  DOMParser,
  XMLSerializer: XMLSerializerPolyfill,
});
