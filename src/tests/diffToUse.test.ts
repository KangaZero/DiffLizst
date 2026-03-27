import {
  getEnhancedMusicXMLDiff,
  formatDiffForTerminal,
} from "@/utils/MXMLDiffParser";

const args = process.argv.slice(2);
let enhancedDiff: string;
const noIndexFlag = args.includes("--no-index");
const filteredArgs = args.filter((arg) => arg !== "--no-index");

let file1: string;
let file2: string | undefined;
let commit1: string | undefined;
let commit2: string | undefined;
let mode: "git" | "no-index";

if (noIndexFlag || filteredArgs.length === 2) {
  mode = "no-index";
  [file1, file2] = filteredArgs;
} else {
  // Git mode: compare commits
  mode = "git";
  [file1, commit1, commit2] = filteredArgs;
  commit1 = commit1 || "HEAD~1";
  commit2 = commit2 || "HEAD";
}

if (mode === "no-index") {
  enhancedDiff = await getEnhancedMusicXMLDiff(file1, {
    file2,
    showFullMeasures: true,
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

//SPECIAL: THIS IS WHAT I WANT TO USE TO COMPARE
console.log(formatDiffForTerminal(enhancedDiff));
