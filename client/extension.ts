import axios from "axios"
import vscode from "vscode"
import { Settings } from "../shared"

type Converter =
	| "Traditional"
	| "Simplified"
	| "Taiwan"
	| "China"
	| "Hongkong"
	| "Pinyin"
	| "Bopomofo"
	| "Mars"
	| "WikiSimplified"
	| "WikiTraditional"

export async function activate(context: vscode.ExtensionContext) {
	const Convert = (converter: Converter) => async () => {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}

		let settings: Settings | undefined

		const ws = vscode.workspace.workspaceFolders
			?.filter(f => {
				return editor.document.uri.toString().startsWith(f.uri.toString())
			})
			.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()))

		if (ws && ws.length > 0) {
			settings = vscode.workspace.getConfiguration("", ws[0]).get("fanhuaji")
		} else {
			settings = vscode.workspace.getConfiguration("").get("fanhuaji")
		}

		interface Data {
			converter: Converter
			text: string
			apiKey?: string
		}

		interface RespData {
			data: {
				text: string
			}
		}

		async function post<T>(data: Data) {
			return axios.post<T>((settings?.apiServer || "https://api.zhconvert.org") + "/convert", data)
		}

		async function convert(text: string) {
			try {
				if (text === "") {
					return ""
				}
				const resp = await post<RespData>({ converter, text })
				return resp.data.data.text
			} catch (err) {
				return text
			}
		}

		const document = editor.document
		const items = editor.selections.map(selection => ({ selection, text: document.getText(selection) }))

		if (items.every(item => item.text === "")) {
			const text = document.getText()
			const range = new vscode.Range(document.positionAt(0), document.positionAt(text.length))
			const newText = await convert(text)
			await editor.edit(editBuilder => {
				editBuilder.replace(range, newText)
			})
		} else {
			const results = await Promise.all(
				items.map(async ({ selection, text }) => {
					return { text: await convert(text), selection }
				}),
			)
			await editor.edit(async editBuilder => {
				for (const result of results) {
					editBuilder.replace(result.selection, result.text)
				}
			})
		}
	}

	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Traditional", Convert("Traditional")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Simplified", Convert("Simplified")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Taiwan", Convert("Taiwan")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.China", Convert("China")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Hongkong", Convert("Hongkong")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Pinyin", Convert("Pinyin")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Bopomofo", Convert("Bopomofo")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Mars", Convert("Mars")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.WikiSimplified", Convert("WikiSimplified")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.WikiTraditional", Convert("WikiTraditional")))
}

export async function deactivate() {
	//
}
