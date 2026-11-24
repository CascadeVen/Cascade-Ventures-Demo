// Minifies src/ into the files Vercel serves. Run: node scripts/minify.mjs
// Edit the readable sources in src/, never the minified outputs.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// Needs esbuild: run "npm i -D esbuild" once in this folder (do not commit node_modules).
const { transformSync } = require("esbuild");
import fs from "fs";
const go = (src, out, loader) => { const r = transformSync(fs.readFileSync(src, "utf8"), { loader, minify: true, target: "es2019", legalComments: "none" }); fs.writeFileSync(out, r.code); console.log(out, fs.statSync(src).size, "->", r.code.length); };
go("src/site.css", "assets/site.css", "css");
go("src/site.js", "assets/site.js", "js");
{ const r = transformSync(fs.readFileSync("src/contact.js", "utf8"), { loader: "js", format: "esm", minify: true, target: "node18", legalComments: "none" }); fs.writeFileSync("api/contact.js", "// Vercel function. Readable source: src/contact.js. Needs RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.\n" + r.code); console.log("api/contact.js", fs.statSync("src/contact.js").size, "->", r.code.length); }
