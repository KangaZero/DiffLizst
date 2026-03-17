import etudeMei from '@/scores/Chopin/etudeOp10No1.xml?raw'
import etudeMei2 from '@/scores/Chopin/etudeOp10No2.xml?raw'
import { unlinkSync } from "node:fs";

export async function getSVGDiff() {
  // 1. Define temporary paths
  const path1 = `${import.meta.dir}/temp1.xml`;
  const path2 = `${import.meta.dir}/temp2.xml`;

  try {
    // 2. Write the raw strings to actual files
    await Promise.all([
      Bun.write(path1, etudeMei),
      Bun.write(path2, etudeMei2)
    ]);

    // 3. Run git diff on the FILE PATHS
    const proc = Bun.spawn([
      "git",
      "diff",
      "-w",
      "--color-words",
      "--patience",
      // "--word-diff=color",
      "--no-index",
      // "-U5", // How many lines of padding
      path1,
      path2
    ]);
    // const proc = Bun.spawn(["git", "diff", "--no-index", "-w", "--line-prefix", path1, path2]);

    // 4. Capture the output
    const text = await new Response(proc.stdout).text();

    // 5. Clean up the temp files
    unlinkSync(path1);
    unlinkSync(path2);
    console.log(text)

    return text;
  } catch (error) {
    console.error("Diff failed:", error);
    // Cleanup even if it fails
    if (Bun.file(path1).size > 0) unlinkSync(path1);
    if (Bun.file(path2).size > 0) unlinkSync(path2);
    return "";
  }
}

getSVGDiff()
