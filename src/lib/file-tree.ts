/**
 * 从文件相对路径列表生成 text tree（省 token 的目录树）。
 * 只展示收集到的文件，目录自动折叠。
 *
 * @param options.maxDepth 最大展示深度（root 为 0）。超出的目录行追加 ` …`
 *   表示「下面还有内容」，而不是静默截断——静默截断会让人误以为目录是空的。
 */
export function buildFileTree(
  relPaths: string[],
  rootName = ".",
  options: { maxDepth?: number } = {},
): string {
  interface Node {
    name: string;
    children: Map<string, Node>;
    isFile: boolean;
  }

  const root: Node = { name: rootName, children: new Map(), isFile: false };

  for (const rel of [...relPaths].sort()) {
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, children: new Map(), isFile };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  const maxDepth = options.maxDepth;
  const lines: string[] = [];
  const render = (
    node: Node,
    prefix: string,
    isLast: boolean,
    depth: number,
  ) => {
    if (maxDepth !== undefined && depth > maxDepth) return;
    const isRoot = node === root;
    const truncated =
      maxDepth !== undefined && depth === maxDepth && node.children.size > 0;
    lines.push(
      `${prefix}${isRoot ? "" : isLast ? "└── " : "├── "}${node.name}${
        node.isFile ? "" : isRoot ? "" : "/"
      }${truncated ? " …" : ""}`,
    );
    if (truncated) return;
    const entries = [...node.children.entries()];
    entries.sort(([a], [b]) => {
      const aDir = !node.children.get(a)!.isFile;
      const bDir = !node.children.get(b)!.isFile;
      if (aDir !== bDir) return aDir ? -1 : 1; // 目录在前
      return a.localeCompare(b);
    });
    entries.forEach(([, child], idx) => {
      const last = idx === entries.length - 1;
      const childPrefix =
        node === root ? "" : `${prefix}${isLast ? "    " : "│   "}`;
      render(child, childPrefix, last, depth + 1);
    });
  };

  render(root, "", true, 0);
  return lines.join("\n");
}
