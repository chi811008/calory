// .html 檔以 Text 模組形式 import 為字串 (wrangler 打包, 見 wrangler.toml [[rules]])。
declare module '*.html' {
  const content: string;
  export default content;
}
