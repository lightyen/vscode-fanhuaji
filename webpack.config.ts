import { CleanWebpackPlugin } from "clean-webpack-plugin"
import ESLintPlugin from "eslint-webpack-plugin"
import ForkTsCheckerPlugin from "fork-ts-checker-webpack-plugin"
import path from "path"
import TsPathsResolvePlugin from "ts-paths-resolve-plugin"
import type { Compiler, Configuration } from "webpack"
import { ExternalsPlugin } from "webpack"

class ExternalsVendorPlugin {
	externals: Record<string, string>
	constructor(...deps: string[]) {
		this.externals = {}
		for (const dep of deps) {
			this.externals[dep] = dep
		}
	}
	apply(compiler: Compiler) {
		new ExternalsPlugin("commonjs", this.externals).apply(compiler)
	}
}

const clientWorkspaceFolder = path.resolve(__dirname, "client")

const configClient: Configuration = {
	target: "node",
	mode: process.env.NODE_ENV === "production" ? "production" : "development",
	devtool: process.env.NODE_ENV === "production" ? "inline-source-map" : "source-map",
	entry: path.join(clientWorkspaceFolder, "extension.ts"),
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "extension.js",
		libraryTarget: "commonjs2",
		devtoolModuleFilenameTemplate: "../[resource-path]",
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules|\.test\.ts$/,
				use: [
					{
						loader: "ts-loader",
						options: {
							transpileOnly: true,
							context: clientWorkspaceFolder,
						},
					},
				],
			},
		],
	},
	resolve: {
		extensions: [".ts", ".js", ".json"],
		plugins: [new TsPathsResolvePlugin({ tsConfigPath: path.resolve(clientWorkspaceFolder, "tsconfig.json") })],
	},
	plugins: [
		new ForkTsCheckerPlugin({
			typescript: {
				configFile: path.resolve(clientWorkspaceFolder, "tsconfig.json"),
			},
		}),
		new ExternalsVendorPlugin("vscode"),
		new ESLintPlugin({ extensions: ["ts"] }),
		new CleanWebpackPlugin({ cleanOnceBeforeBuildPatterns: ["extension*"] }),
	],
}

export default [configClient]
