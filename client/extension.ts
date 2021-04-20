import vscode from "vscode"

export async function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand("extension.convert.helloworld", () => {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}

		// const document = editor.document
		const selection = editor.selection
		// const word = document.getText(selection)

		editor.edit(editBuilder => {
			editBuilder.replace(selection, "helloworld")
		})
	})

	context.subscriptions.push(disposable)
}

export async function deactivate() {
	//
}
