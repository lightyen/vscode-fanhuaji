import { NAME } from "shared"
import vscode from "vscode"

export async function activate(context: vscode.ExtensionContext) {
	console.log(NAME)
}

export async function deactivate() {
	//
}
