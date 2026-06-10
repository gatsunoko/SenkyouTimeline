const fs = require("node:fs");
const path = require("node:path");

const distDir = path.resolve(__dirname, "..", "dist");
const indexPath = path.join(distDir, "index.html");

let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/, (_match, href) => {
  const cssPath = path.join(distDir, href.replace(/\//g, path.sep));
  const css = fs.readFileSync(cssPath, "utf8").replace(/<\/style/gi, "<\\/style");
  return `<style>\n${css}\n</style>`;
});

let inlineScript = "";
html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/, (_match, src) => {
  const jsPath = path.join(distDir, src.replace(/\//g, path.sep));
  const js = fs.readFileSync(jsPath, "utf8").replace(/<\/script/gi, "<\\/script");
  inlineScript = `<script>\n${js}\n</script>`;
  return "";
});

if (inlineScript) {
  html = html.replace("</body>", () => `    ${inlineScript}\n  </body>`);
}

fs.writeFileSync(indexPath, html, "utf8");
console.log("Prepared dist/index.html for direct file:// use.");
