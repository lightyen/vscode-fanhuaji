import axios, { Canceler, CancelToken } from "axios"
import { TextEncoder } from "util"
import vscode, { TextEditor } from "vscode"
import { intl } from "./locale"
import { OptionalConvertParams, Settings } from "./settings"

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

function getSettings(activeEditor?: vscode.TextEditor): Settings {
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

	if (settings?.convertParams?.modules != undefined) {
		if (typeof settings.convertParams.modules === "object") {
			settings.convertParams.modules = JSON.stringify(settings?.convertParams?.modules)
		}
	}

	if (settings?.convertParams?.userPreReplace != undefined) {
		if (settings.convertParams.userPreReplace === "object") {
			settings.convertParams.userPreReplace = Object.entries(settings.convertParams.userPreReplace)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n")
		}
	}

	if (settings?.convertParams?.userPostReplace != undefined) {
		if (settings.convertParams.userPostReplace === "object") {
			settings.convertParams.userPostReplace = Object.entries(settings.convertParams.userPostReplace)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n")
		}
	}

	if (settings?.convertParams?.userProtectReplace instanceof Array) {
		settings.convertParams.userProtectReplace = settings.convertParams.userProtectReplace.join("\n")
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return settings!
}

export async function activate(context: vscode.ExtensionContext) {
	let token: CancelToken
	let cancel: Canceler

	const Convert = (converter: Converter) => async () => {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}

		const MAX_TEXT_LENGTH_IN_BYTES = 5000000
		const settings = getSettings(editor)

		interface Data {
			converter: Converter
			text: string
			apiKey: string
			outputFormat: string
			prettify: boolean
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
			code: number
			msg: string
			revirsions: {
				build: string
				msg: string
				time: number
			}
		}

		cancel?.()

		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: intl.formatMessage({ id: "ext.running" }),
				cancellable: true,
			},
			async (progress, token) => {
				token.onCancellationRequested(() => cancel?.())
				return doConvert(editor, progress)
			},
		)

		async function doConvert(
			editor: TextEditor,
			progress: vscode.Progress<{
				message?: string | undefined
				increment?: number | undefined
			}>,
		): Promise<void> {
			const source = axios.CancelToken.source()
			token = source.token
			cancel = source.cancel

			function post<T>(data: Data) {
				return axios.post<T>((settings.server || "https://api.zhconvert.org") + "/convert", data, {
					cancelToken: token,
				})
			}

			async function convert(text: string, apiKey: string, params?: OptionalConvertParams) {
				if (text === "") {
					return text
				}
				const resp = await post<ResponseData>({
					converter,
					text,
					apiKey,
					outputFormat: "json",
					prettify: false,
					...params,
				})
				if (resp.data.data.text == undefined) {
					throw resp.data.msg
				}
				return resp.data.data.text
			}

			async function TryConvert(text: string, apiKey: string, params?: OptionalConvertParams) {
				try {
					return await convert(text, apiKey, params)
				} catch (err) {
					if (axios.isCancel(err)) {
						return undefined
					}

					if (axios.isAxiosError(err)) {
						const error = err
						vscode.window.showErrorMessage(error.message)
						return undefined
					}

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const e = err as { message?: string }
					if (e?.message) {
						vscode.window.showErrorMessage(e.message)
						return undefined
					}

					if (typeof err === "string") {
						vscode.window.showErrorMessage(err)
					}
					return undefined
				}
			}

			function preprocess(items: Array<{ selection: vscode.Selection; text: string }>) {
				const encoder = new TextEncoder()
				const arr: Array<{ selection: vscode.Selection; text: string }> = []
				for (let i = 0; i < items.length; i++) {
					const len = encoder.encode(items[i].text).length
					if (len <= MAX_TEXT_LENGTH_IN_BYTES) {
						arr.push(items[i])
						continue
					} else {
						vscode.window.showErrorMessage(`字數不能超過上限 ${MAX_TEXT_LENGTH_IN_BYTES}`)
					}
				}
				return arr
			}

			const document = editor.document
			let items = editor.selections.map(selection => ({ selection, text: document.getText(selection) }))
			if (items.length === 1 && items[0].text === "") {
				const text = document.getText()
				const selection = new vscode.Selection(document.positionAt(0), document.positionAt(text.length))
				items[0] = { text, selection }
			}

			items = preprocess(items)

			if (items.length === 1 && items[0].text === "") {
				const text = document.getText()
				const range = new vscode.Range(document.positionAt(0), document.positionAt(text.length))
				const newText = await TryConvert(text, settings.key, settings.convertParams)
				if (newText) {
					await editor.edit(editBuilder => {
						editBuilder.replace(range, newText)
					})
				}
			} else {
				const results = await Promise.all(
					items.map(async ({ selection, text }) => {
						return { text: await TryConvert(text, settings.key, settings.convertParams), selection }
					}),
				)
				await editor.edit(async editBuilder => {
					for (const { selection, text } of results) {
						if (text) {
							editBuilder.replace(selection, text)
						}
					}
				})
			}
			return
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
	// do nothing.
}
