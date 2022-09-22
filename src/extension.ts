import axios, { Canceler, CancelToken } from "axios"
import vscode, { TextEditor } from "vscode"
import { intl } from "./locale"
import { OptionalConvertParams, Settings } from "./settings"

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

const MAX_TEXT_LENGTH_IN_BYTES = 5000000

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

interface RequestOptions {
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

export async function activate(context: vscode.ExtensionContext) {
	let token: CancelToken
	let cancel: Canceler

	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Traditional", command("Traditional")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Simplified", command("Simplified")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Taiwan", command("Taiwan")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.China", command("China")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Hongkong", command("Hongkong")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Pinyin", command("Pinyin")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Bopomofo", command("Bopomofo")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.Mars", command("Mars")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.WikiSimplified", command("WikiSimplified")))
	context.subscriptions.push(vscode.commands.registerCommand("fanhuaji.WikiTraditional", command("WikiTraditional")))

	return

	async function convert(converter: Converter, text: string, apiKey: string, params?: OptionalConvertParams) {
		const resp = await request({
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

		function request(options: RequestOptions, settings?: Settings) {
			return axios.post<ResponseData>((settings?.server ?? "https://api.zhconvert.org") + "/convert", options, {
				cancelToken: token,
			})
		}
	}

	async function mustConvert(converter: Converter, text: string, apiKey: string, params?: OptionalConvertParams) {
		if (text === "") return ""
		try {
			return convert(converter, text, apiKey, params)
		} catch (err) {
			if (axios.isCancel(err)) {
				return undefined
			}

			if (axios.isAxiosError(err)) {
				const error = err
				vscode.window.showErrorMessage(error.message)
				return undefined
			}

			const e = err as { message?: string }
			if (e?.message) {
				vscode.window.showErrorMessage(e.message)
				return undefined
			}

			if (typeof err === "string") {
				vscode.window.showErrorMessage(err)
			}
		}
	}

	function command(converter: Converter): () => Promise<void> {
		return async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				return
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

				const settings = getSettings(editor)

				if (items.length === 1 && items[0].text === "") {
					const text = document.getText()
					const range = new vscode.Range(document.positionAt(0), document.positionAt(text.length))
					const newText = await mustConvert(converter, text, settings.key, settings.convertParams)
					if (newText) {
						await editor.edit(editBuilder => {
							editBuilder.replace(range, newText)
						})
					}
				} else {
					const results = await Promise.all(
						items.map(async ({ selection, text }) => {
							return {
								text: await mustConvert(converter, text, settings.key, settings.convertParams),
								selection,
							}
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
			}
		}
	}
}

export async function deactivate() {
	// do nothing.
}
