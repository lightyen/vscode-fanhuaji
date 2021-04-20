import axios, { AxiosError } from "axios"
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

function getSettings(activeEditor?: vscode.TextEditor) {
	let settings: Settings | undefined

	const ws = vscode.workspace.workspaceFolders
		?.filter(f => {
			if (!activeEditor) return false
			return activeEditor.document.uri.toString().startsWith(f.uri.toString())
		})
		.sort((a, b) => b.uri.toString().localeCompare(a.uri.toString()))

	if (ws && ws.length > 0) {
		settings = vscode.workspace.getConfiguration("", ws[0]).get("fanhuaji")
	} else {
		settings = vscode.workspace.getConfiguration("").get("fanhuaji")
	}

	if (settings?.api.convertParams?.modules != undefined) {
		if (typeof settings.api.convertParams.modules === "object") {
			settings.api.convertParams.modules = JSON.stringify(settings?.api.convertParams?.modules)
		}
	}

	if (settings?.api.convertParams?.userPreReplace != undefined) {
		if (settings.api.convertParams.userPreReplace === "object") {
			settings.api.convertParams.userPreReplace = Object.entries(settings.api.convertParams.userPreReplace)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n")
		}
	}

	if (settings?.api.convertParams?.userPostReplace != undefined) {
		if (settings.api.convertParams.userPostReplace === "object") {
			settings.api.convertParams.userPostReplace = Object.entries(settings.api.convertParams.userPostReplace)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n")
		}
	}

	if (settings?.api.convertParams?.userProtectReplace instanceof Array) {
		settings.api.convertParams.userProtectReplace = settings.api.convertParams.userProtectReplace.join("\n")
	}

	return settings
}

export async function activate(context: vscode.ExtensionContext) {
	const Convert = (converter: Converter) => async () => {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}

		const settings = getSettings(editor)

		interface Data {
			converter: Converter
			text: string
			apiKey?: string
		}

		interface ResponseData {
			data: {
				converter: string
				text: string
				textFormat: string
				diff: string | null
				jpTextStyles: string[]
				usedModules: string[]
			}
			execTime: number
			msg: string
			revirsions: {
				build: string
				msg: string
				time: number
			}
		}

		async function post<T>(data: Data) {
			return axios.post<T>((settings?.api.server || "https://api.zhconvert.org") + "/convert", data)
		}

		async function convert(text: string) {
			try {
				if (text === "") {
					return text
				}
				const resp = await post<ResponseData>({ converter, text, ...(settings?.api?.convertParams || null) })
				return resp.data.data.text
			} catch (err) {
				if (axios.isAxiosError(err)) {
					const error: AxiosError = err
					await vscode.window.showErrorMessage(error.message)
				} else {
					await vscode.window.showErrorMessage(err)
				}
				return text
			}
		}

		const document = editor.document
		const items = editor.selections.map(selection => ({ selection, text: document.getText(selection) }))

		if (items.length === 1 && items[0].text === "") {
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

	context.subscriptions.push(
		vscode.commands.registerCommand("fanhuaji.serverInfo", async () => {
			const settings = getSettings(vscode.window.activeTextEditor)
			try {
				const resp = await axios.get((settings?.api.server || "https://api.zhconvert.org") + "/service-info")
				console.log(resp.data)
			} catch (err) {
				if (axios.isAxiosError(err)) {
					const error: AxiosError = err
					await vscode.window.showErrorMessage(error.message)
				} else {
					await vscode.window.showErrorMessage(err)
				}
			}
		}),
	)
}

export async function deactivate() {
	//
}
