import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      results.push(full);
    }
  }
  return results;
}

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 5000 });

  const testsRoot = path.resolve(__dirname);
  findTestFiles(testsRoot).forEach((f) => mocha.addFile(f));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
