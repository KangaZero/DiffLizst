#!/usr/bin/env bun

/**
 * Test script for MusicXML diff parser
 * Usage: 
 *   bun run test-diff.ts <file.xml> [commit1] [commit2]
 *   bun run test-diff.ts <file1.xml> <file2.xml> --no-index
 */

import {
  getMusicXMLDiff,
  getEnhancedMusicXMLDiff,
  formatDiffForTerminal,
  parseMusicXMLDiff
} from '@/utils/MXMLDiffParser';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🎵 MusicXML Diff Parser Test

Usage:
  # Compare commits in git (requires git repository)
  bun run test-diff.ts <file.xml> [commit1] [commit2]
  
  # Compare two files directly (no git required)
  bun run test-diff.ts <file1.xml> <file2.xml> --no-index
  
Examples:
  # Git mode
  bun run test-diff.ts score.xml
  bun run test-diff.ts score.xml HEAD~1 HEAD
  bun run test-diff.ts score.xml abc123 def456

  # No-index mode (compare any 2 files)
  bun run test-diff.ts score-v1.xml score-v2.xml --no-index
  bun run test-diff.ts /path/to/old.xml /path/to/new.xml --no-index

Options will automatically show full context for:
  - <measure> tags
  - <part-list> tags  
  - <credit> tags
  - <defaults> tags
  - <identification> tags
`);
  process.exit(1);
}

// Check if --no-index mode
const noIndexFlag = args.includes('--no-index');
const filteredArgs = args.filter(arg => arg !== '--no-index');

let file1: string;
let file2: string | undefined;
let commit1: string | undefined;
let commit2: string | undefined;
let mode: 'git' | 'no-index';

if (noIndexFlag || filteredArgs.length === 2) {
  // No-index mode: compare two files
  mode = 'no-index';
  [file1, file2] = filteredArgs;

  console.log(`\n🔍 Comparing two files directly (--no-index mode)`);
  console.log(`   File 1: ${file1}`);
  console.log(`   File 2: ${file2}\n`);
} else {
  // Git mode: compare commits
  mode = 'git';
  [file1, commit1, commit2] = filteredArgs;
  commit1 = commit1 || 'HEAD~1';
  commit2 = commit2 || 'HEAD';

  console.log(`\n🔍 Analyzing MusicXML diff for: ${file1}`);
  console.log(`   Comparing: ${commit1} → ${commit2}\n`);
}

try {
  // Method 1: Basic diff with optimal flags
  console.log('═══════════════════════════════════════════════════');
  console.log(`Method 1: Basic Git Diff (-w --patience${mode === 'no-index' ? ' --no-index' : ''})`);
  console.log('═══════════════════════════════════════════════════\n');

  let basicDiff: string;
  if (mode === 'no-index') {
    basicDiff = await getMusicXMLDiff({
      file1,
      file2,
      noIndex: true,
      context: 10,
      algorithm: 'patience',
    });
  } else {
    basicDiff = await getMusicXMLDiff({
      file: file1,
      commit1,
      commit2,
      context: 10,
      algorithm: 'patience',
    });
  }

  console.log(formatDiffForTerminal(basicDiff));
  console.log('\n');

  // Method 2: Enhanced diff with parent context detection
  console.log('═══════════════════════════════════════════════════');
  console.log('Method 2: Enhanced Diff (with parent context tags)');
  console.log('═══════════════════════════════════════════════════\n');

  let enhancedDiff: string;
  if (mode === 'no-index') {
    enhancedDiff = await getEnhancedMusicXMLDiff(file1, {
      file2,
      showFullMeasures: false,
      showFullPartList: true,
      showFullCredit: true,
      showFullDefaults: true,
      showFullIdentification: true,
    });
  } else {
    enhancedDiff = await getEnhancedMusicXMLDiff(file1, {
      commit1,
      commit2,
      showFullMeasures: false,
      showFullPartList: true,
      showFullCredit: true,
      showFullDefaults: true,
      showFullIdentification: true,
    });
  }

  console.log(formatDiffForTerminal(enhancedDiff));
  console.log('\n');

  // Method 3: Parsed structure
  console.log('═══════════════════════════════════════════════════');
  console.log('Method 3: Parsed Diff Structure');
  console.log('═══════════════════════════════════════════════════\n');

  const parsed = parseMusicXMLDiff(enhancedDiff);

  for (const file of parsed) {
    console.log(`📄 File: ${file.filename}`);
    console.log(`   Hunks: ${file.hunks.length}\n`);

    file.hunks.forEach((hunk, i) => {
      console.log(`   Hunk ${i + 1}: ${hunk.header}`);
      if (hunk.parentContext) {
        console.log(`   └─ Context: <${hunk.parentContext}>`);
      }
      console.log(`   └─ Lines changed: ${hunk.lines.filter(l => l.type !== 'context').length}`);
      console.log('');
    });
  }

  // Statistics
  const totalAdditions = parsed.reduce((sum, file) =>
    sum + file.hunks.reduce((hSum, hunk) =>
      hSum + hunk.lines.filter(l => l.type === 'add').length, 0), 0);

  const totalDeletions = parsed.reduce((sum, file) =>
    sum + file.hunks.reduce((hSum, hunk) =>
      hSum + hunk.lines.filter(l => l.type === 'remove').length, 0), 0);

  console.log('═══════════════════════════════════════════════════');
  console.log('📊 Summary Statistics');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Mode: ${mode === 'no-index' ? 'Direct file comparison' : 'Git commit comparison'}`);
  console.log(`Files changed: ${parsed.length}`);
  console.log(`Total hunks: ${parsed.reduce((sum, f) => sum + f.hunks.length, 0)}`);
  console.log(`Lines added: ${totalAdditions}`);
  console.log(`Lines removed: ${totalDeletions}`);
  console.log('');

} catch (error) {
  console.error('❌ Error:', String(error));
  process.exit(1);
}
