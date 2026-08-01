import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 写输出文件。保证写文件失败时不会留下半个文件：
 * 先写临时文件再 rename。
 */
export async function writeOutput(
  content: string,
  outputPath: string,
): Promise<string> {
  const abs = path.resolve(outputPath);
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(abs)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, abs);
  return abs;
}
