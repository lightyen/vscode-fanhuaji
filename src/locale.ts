interface NLSConfig {
	locale: "en" | "zh-tw"
}

const nlsConfig: NLSConfig = __VSCODE_WEB__
	? { locale: "en" }
	: JSON.parse(process?.env?.VSCODE_NLS_CONFIG ?? '{"locale":"en"}')

import { createIntl, createIntlCache, IntlConfig } from "@formatjs/intl"
import defaultMessages from "../package.nls.json"
const cache = createIntlCache()

export let intl: ReturnType<typeof createIntl>

function init() {
	let messages: IntlConfig["messages"]
	try {
		messages = __non_webpack_require__(`../package.nls.${nlsConfig.locale}.json`)
	} catch (err) {
		messages = defaultMessages
	}
	intl = createIntl(
		{
			defaultLocale: "en",
			locale: nlsConfig.locale,
			messages,
		},
		cache,
	)
}

init()
