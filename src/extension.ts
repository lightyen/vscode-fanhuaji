import axios, { Canceler, CancelToken } from "axios"
import vscode, { TextEditor } from "vscode"
import { intl } from "./locale"
import { NAME, OptionalConvertParams, Settings } from "./settings"

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
	const outputChannel = vscode.window.createOutputChannel(NAME)
	outputChannel.append(`commit hash: ${__COMMIT_HASH__}`)

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
					return doConvert(editor)
				},
			)

			async function doConvert(editor: TextEditor): Promise<void> {
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
					const sep = " 𫠬𫠣 "
					const list: Array<{ texts: string[]; length: number; selections: vscode.Selection[] }> = []

					let o: { texts: string[]; length: number; selections: vscode.Selection[] } = {
						texts: [],
						length: 0,
						selections: [],
					}
					for (let i = 0; i < items.length; i++) {
						const { text, selection } = items[i]
						if (o.length + sep.length + text.length >= MAX_TEXT_LENGTH_IN_BYTES) {
							list.push(o)
							o = { texts: [], length: 0, selections: [] }
							continue
						}
						o.selections.push(selection)
						o.texts.push(text)
						if (o.length) {
							o.length = o.length + sep.length + text.length
						} else {
							o.length = text.length
						}
					}
					list.push(o)

					for (const { texts, selections } of list) {
						console.log(texts)
						const text = texts.join(sep)
						let out = await mustConvert(converter, text, settings.key, settings.convertParams)
						if (out) {
							let i = 0
							const arr: Array<{ selection: vscode.Selection; text: string }> = []
							while (out.length > 0) {
								const index = out.indexOf(sep)
								const text = index !== -1 ? out.slice(0, index) : out
								if (text) {
									arr.push({ selection: selections[i], text })
								}
								if (index === -1) {
									break
								}
								out = out.slice(index + sep.length)
								i++
							}
							await editor.edit(async editBuilder => {
								for (const { selection, text } of arr) {
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
	}
}

export async function deactivate() {
	// do nothing.
}
