const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const production = argv.mode === "production";
  return {
    mode: argv.mode || "development",
    entry: {
      [production ? "dist/index" : "index"]: "./src/index.ts",
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname),
      libraryTarget: "commonjs2",
      library: {
        type: "commonjs2",
      },
    },
    externals: {
      siyuan: "siyuan",
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          include: [path.resolve(__dirname, "src")],
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
              },
            },
          ],
        },
        {
          test: /\.scss$/,
          use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: production ? "dist/index.css" : "index.css",
      }),
      new CopyPlugin({
        patterns: [
          { from: "plugin.json", to: production ? "dist/" : "." },
          { from: "icon.png", to: production ? "dist/" : "." },
          { from: "preview.png", to: production ? "dist/" : "." },
          { from: "README.md", to: production ? "dist/" : "." },
          { from: "README_zh_CN.md", to: production ? "dist/" : "." },
          { from: "CHANGELOG.md", to: production ? "dist/" : "." },
          { from: "LICENSE", to: production ? "dist/" : "." },
          { from: "src/i18n", to: production ? "dist/i18n" : "i18n" },
        ],
      }),
    ],
    optimization: {
      minimize: production,
    },
  };
};
