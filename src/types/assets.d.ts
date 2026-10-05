/**
 * Asset module declarations.
 * Next only ships typings for `*.module.css`, so plain global CSS
 * side-effect imports (e.g. `import "./globals.css"`) need this.
 */
declare module "*.css";

declare module "*.svg" {
  const src: string;
  export default src;
}
