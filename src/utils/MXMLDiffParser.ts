/**
 * Intelligent MusicXML Git Diff Parser
 * Shows full parent context for important XML sections
 */

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
  parentContext?: string; // e.g., "measure number='2'" or "part-list"
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: number;
}

export interface ParsedDiff {
  filename: string;
  hunks: DiffHunk[];
}

/**
 * Parent tags that should show their full context when children change
 */
const CONTEXT_PARENTS = [
  'measure',
  'part-list',
  // 'score-part',
  'credit',
  'defaults',
  'identification',
  'attributes',
  // 'note',
  // 'direction',
  // 'barline',
] as const;

/**
 * Parse git diff output with intelligent MusicXML context
 */
export function parseMusicXMLDiff(diffOutput: string): ParsedDiff[] {
  const files: ParsedDiff[] = [];
  const lines = diffOutput.split('\n');

  let currentFile: ParsedDiff | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: --- a/file.xml or +++ b/file.xml
    if (line.startsWith('---') || line.startsWith('+++')) {
      const match = line.match(/^[+-]{3} [ab]\/(.+)$/);
      if (match) {
        const filename = match[1];
        if (line.startsWith('---')) {
          currentFile = { filename, hunks: [] };
          files.push(currentFile);
        }
      }
      continue;
    }

    // Hunk header: @@ -145,8 +145,8 @@ Measure 23
    if (line.startsWith('@@')) {
      if (currentFile) {
        currentHunk = {
          header: line,
          lines: [],
        };
        currentFile.hunks.push(currentHunk);
      }
      continue;
    }

    // Diff lines
    if (currentHunk) {
      let type: DiffLine['type'] = 'context';

      if (line.startsWith('+')) {
        type = 'add';
      } else if (line.startsWith('-')) {
        type = 'remove';
      }

      currentHunk.lines.push({
        type,
        content: line.substring(1), // Remove +/- prefix
      });
    }
  }

  return files;
}

/**
 * Execute git diff with optimal flags for MusicXML
 */
export async function getMusicXMLDiff(
  options: {
    file?: string;
    file1?: string; // For --no-index mode
    file2?: string; // For --no-index mode
    commit1?: string;
    commit2?: string;
    context?: number; // -U lines of context
    algorithm?: 'default' | 'patience' | 'histogram' | 'minimal';
    colorWords?: boolean;
    useFunctionContext?: boolean; // Use git's --function-context
    noIndex?: boolean; // Compare files directly without git
  } = {}
): Promise<string> {
  const {
    file = '',
    file1 = '',
    file2 = '',
    commit1 = '',
    commit2 = '',
    context = 10,
    algorithm = 'patience',
    colorWords = false,
    useFunctionContext = false,
    noIndex = false,
  } = options;

  const args = ['diff', '-w'];

  // Add --no-index for comparing files outside git
  if (noIndex || (file1 && file2)) {
    args.push('--no-index');
  }

  // Use function context OR numeric context (not both)
  if (useFunctionContext) {
    args.push('--function-context');
  } else {
    args.push(`-U${context}`);
  }

  // Add algorithm
  if (algorithm !== 'default') {
    args.push(`--${algorithm}`);
  }

  // Add color-words for inline highlighting
  if (colorWords) {
    args.push('--color-words');
  }

  // Handle different modes
  if (file1 && file2) {
    // --no-index mode: compare two files
    args.push(file1, file2);
  } else {
    // Normal git mode: compare commits
    if (commit1) args.push(commit1);
    if (commit2) args.push(commit2);
    if (file) args.push('--', file);
  }

  // Execute with Bun
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  return output;
}

/**
 * Expand diff to show full parent context for important tags
 */
export function expandParentContext(
  diffOutput: string,
  xmlContent: string
): string {
  const parsed = parseMusicXMLDiff(diffOutput);
  const xmlLines = xmlContent.split('\n');

  // For each hunk, detect if we're inside an important parent
  for (const file of parsed) {
    for (const hunk of file.hunks) {
      const context = detectParentContext(hunk, xmlLines);
      if (context) {
        hunk.parentContext = context;
      }
    }
  }

  return reconstructDiff(parsed);
}

/**
 * Detect which parent context tag we're inside
 */
function detectParentContext(hunk: DiffHunk, xmlLines: string[]): typeof CONTEXT_PARENTS[number] | undefined {
  console.log("hunk", hunk)
  // Extract line number from hunk header: @@ -145,8 +145,8 @@
  const match = hunk.header.match(/@@ -(\d+),/);
  if (!match) return undefined;

  const startLine = parseInt(match[1], 10);

  // Search backwards from the hunk start to find parent tags
  for (let i = startLine - 1; i >= 0; i--) {
    const line = xmlLines[i]?.trim() || '';

    for (const parent of CONTEXT_PARENTS) {
      // Match opening tag: <measure number="2">
      const openTagMatch = line.match(new RegExp(`<${parent}([^>]*)>`));
      if (openTagMatch) {
        return `${parent}${openTagMatch[1]}`;
      }
    }

    // Stop if we hit the file start or another major section
    if (line.startsWith('<?xml') || line.startsWith('<score-partwise')) {
      break;
    }
  }

  return undefined;
}

/**
 * Get full parent tag content from XML
 */
export function extractParentTag(
  xmlContent: string,
  tagName: string,
  attributes: Record<string, string> = {}
): string | null {
  const lines = xmlContent.split('\n');
  let depth = 0;
  let capturing = false;
  let result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is our target opening tag
    if (!capturing) {
      const attrPattern = Object.entries(attributes)
        .map(([key, val]) => `${key}="${val}"`)
        .join('.*');

      const pattern = new RegExp(`<${tagName}[^>]*${attrPattern}[^>]*>`);
      if (pattern.test(trimmed)) {
        capturing = true;
        depth = 1;
        result.push(line);

        // Check if self-closing or single-line
        if (trimmed.includes(`</${tagName}>`) || trimmed.endsWith('/>')) {
          return result.join('\n');
        }
        continue;
      }
    }

    // Capture content
    if (capturing) {
      result.push(line);

      // Track nesting depth
      const openTags = (trimmed.match(new RegExp(`<${tagName}[^/>]*>`, 'g')) || []).length;
      const closeTags = (trimmed.match(new RegExp(`</${tagName}>`, 'g')) || []).length;

      depth += openTags - closeTags;

      if (depth === 0) {
        return result.join('\n');
      }
    }
  }

  return null;
}

/**
 * Reconstruct diff output with parent context annotations
 */
function reconstructDiff(parsed: ParsedDiff[]): string {
  let result = '';

  for (const file of parsed) {
    result += `--- a/${file.filename}\n`;
    result += `+++ b/${file.filename}\n`;

    for (const hunk of file.hunks) {
      result += hunk.header;
      if (hunk.parentContext) {
        result += ` [${hunk.parentContext}]`;
      }
      result += '\n';

      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        result += `${prefix}${line.content}\n`;
      }
    }
  }

  return result;
}

/**
 * Enhanced diff that automatically expands important parent contexts
 * COMBINED APPROACH: Uses git's --function-context + XML parsing for guaranteed completeness
 */
export async function getEnhancedMusicXMLDiff(
  xmlFilePath: string,
  options?: {
    file2?: string; // For --no-index mode (compare two files)
    commit1?: string;
    commit2?: string;
    showFullMeasures?: boolean;
    showFullPartList?: boolean;
    showFullCredit?: boolean;
    showFullDefaults?: boolean;
    showFullIdentification?: boolean;
    ensureCompleteBlocks?: boolean; // NEW: Guarantee complete XML blocks
  }
): Promise<string> {
  const {
    file2 = '',
    commit1 = 'HEAD',
    commit2 = '',
    showFullMeasures = true,
    showFullPartList = true,
    showFullCredit = true,
    showFullDefaults = true,
    showFullIdentification = true,
    ensureCompleteBlocks = true, // Default: ensure complete blocks
  } = options || {};

  // STEP 1: Get diff using git's --function-context (fast, built-in)
  const diffOptions: {
    file?: string;
    file1?: string; // For --no-index mode
    file2?: string; // For --no-index mode
    commit1?: string;
    commit2?: string;
    context?: number; // -U lines of context
    algorithm?: 'default' | 'patience' | 'histogram' | 'minimal';
    colorWords?: boolean;
    useFunctionContext?: boolean; // Use git's --function-context
    noIndex?: boolean; // Compare files directly without git
  } = {
    useFunctionContext: true, // Use git's built-in function detection
    algorithm: 'patience',
  };

  // Check if we're in --no-index mode (comparing two files)
  if (file2) {
    diffOptions.file1 = xmlFilePath;
    diffOptions.file2 = file2;
    diffOptions.noIndex = true;
  } else {
    diffOptions.file = xmlFilePath;
    diffOptions.commit1 = commit1;
    diffOptions.commit2 = commit2;
  }

  const diff = await getMusicXMLDiff(diffOptions);

  // STEP 2: Read XML file(s) for parsing
  const xmlFile = Bun.file(xmlFilePath);
  const xmlContent = await xmlFile.text();
  const xmlLines = xmlContent.split('\n');

  // STEP 3: Parse the diff output
  const parsed = parseMusicXMLDiff(diff);

  // STEP 4: Enhance each hunk with complete XML blocks
  for (const file of parsed) {
    for (const hunk of file.hunks) {
      // Detect which parent tag we're inside
      const context = detectParentContext(hunk, xmlLines);

      console.log('context', context)
      if (context) {
        hunk.parentContext = context;

        // Check if this parent type should be fully shown
        const shouldExpand =
          (showFullMeasures && context.startsWith('measure')) ||
          (showFullPartList && context.startsWith('part-list')) ||
          (showFullCredit && context.startsWith('credit')) ||
          (showFullDefaults && context.startsWith('defaults')) ||
          (showFullIdentification && context.startsWith('identification'));

        // STEP 5: If requested, extract the COMPLETE parent block
        if (shouldExpand && ensureCompleteBlocks) {
          const tagName = context.split(/\s/)[0]; // Get tag name without attributes

          // Extract attributes from context (e.g., "measure number='2'" -> {number: '2'})
          const attrMatch = context.match(/(\w+)=['"]([^'"]+)['"]/g);
          const attributes: Record<string, string> = {};
          if (attrMatch) {
            attrMatch.forEach(attr => {
              const [key, val] = attr.split('=');
              attributes[key] = val.replace(/['"]/g, '');
            });
          }

          // Get the complete tag content from source XML
          const fullTagContent = extractParentTag(xmlContent, tagName, attributes);

          if (fullTagContent) {
            // Replace hunk lines with complete block
            const completeLines = fullTagContent.split('\n');
            const newLines: DiffLine[] = completeLines.map(line => ({
              type: 'context' as const,
              content: line,
            }));

            // Merge with existing changes
            hunk.lines = mergeHunkWithCompleteBlock(hunk.lines, newLines);
          }
        }
      }
    }
  }

  return reconstructDiff(parsed);
}

/**
 * Merge existing diff lines with complete block to preserve +/- markers
 */
function mergeHunkWithCompleteBlock(
  hunkLines: DiffLine[],
  completeBlockLines: DiffLine[]
): DiffLine[] {
  // Find all changed lines (additions/deletions)
  const changes = hunkLines.filter(line => line.type === 'add' || line.type === 'remove');

  if (changes.length === 0) {
    return completeBlockLines; // No changes, just return complete block
  }

  // Create a map of line content to change type
  const changeMap = new Map<string, 'add' | 'remove'>();
  changes.forEach(line => {
    if (line.type === 'header' || line.type === 'context') return
    changeMap.set(line.content.trim(), line.type);
  });

  // Apply changes to complete block
  return completeBlockLines.map(line => {
    const changeType = changeMap.get(line.content.trim());
    if (changeType) {
      return { ...line, type: changeType };
    }
    return line;
  });
}

/**
 * Format diff for terminal with colors (optional)
 */
export function formatDiffForTerminal(diff: string, useColors = true): string {
  if (!useColors) return diff;

  const lines = diff.split('\n');
  const colored = lines.map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return `\x1b[1m${line}\x1b[0m`; // Bold
    }
    if (line.startsWith('@@')) {
      return `\x1b[36m${line}\x1b[0m`; // Cyan
    }
    if (line.startsWith('+')) {
      return `\x1b[32m${line}\x1b[0m`; // Green
    }
    if (line.startsWith('-')) {
      return `\x1b[31m${line}\x1b[0m`; // Red
    }
    return line;
  });

  return colored.join('\n');
}

// Example usage:
/*
import { getEnhancedMusicXMLDiff, formatDiffForTerminal } from './musicxml-diff-parser';

const diff = await getEnhancedMusicXMLDiff('score.xml', {
  commit1: 'HEAD~1',
  commit2: 'HEAD',
  showFullMeasures: true,
  showFullPartList: true,
});

console.log(formatDiffForTerminal(diff));
*/
