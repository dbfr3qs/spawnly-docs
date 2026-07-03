// Handles the relative links in the canonical `docs/` Markdown so they behave on
// the published site:
//   - doc → doc   ( ../delegation-design.md , 01-job-and-exit.md )  → internal route
//   - doc → source ( ../../internal/foo.go#L10 , ../../Dockerfile ) → link stripped,
//     its label kept as plain text (the source tree is not published)
// Files keep their original relative links (correct when read in-repo); this
// transform only affects the rendered site.
import path from 'node:path';

export function remarkRewriteRepoLinks() {
  return (tree, file) => {
    // Astro runs with cwd = website/; the repo root is its parent.
    const repoRoot = path.resolve(file.cwd, '..');
    const fileDir = path.dirname(file.path);

    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      const next = [];
      for (const child of node.children) {
        if (child.type === 'link' && typeof child.url === 'string') {
          const res = resolve(child.url, fileDir, repoRoot);
          if (res.action === 'strip') {
            // Drop the link node, splicing its label text nodes into the parent
            // so the text survives but no dead source URL is emitted.
            next.push(...child.children);
            continue;
          }
          if (res.action === 'rewrite') {
            child.url = res.url;
          }
        }
        next.push(child);
      }
      node.children = next;
      node.children.forEach(walk);
    };
    walk(tree);
  };
}

function resolve(url, fileDir, repoRoot) {
  // Leave external URLs, site-absolute paths, and pure anchors untouched.
  if (/^(https?:|mailto:|\/|#)/.test(url)) return { action: 'keep' };

  const [target, hash = ''] = url.split('#');
  const anchor = hash ? `#${hash}` : '';
  if (!target) return { action: 'keep' };

  const abs = path.resolve(fileDir, target);
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');

  // A Markdown file inside docs/ → an internal Starlight route.
  if (rel.startsWith('docs/') && rel.endsWith('.md')) {
    const route = '/' + rel.slice('docs/'.length).replace(/\.md$/, '');
    return { action: 'rewrite', url: route + anchor };
  }

  // Anything else points at repo source, which is not published: strip the link
  // and keep its label as plain text.
  return { action: 'strip' };
}
