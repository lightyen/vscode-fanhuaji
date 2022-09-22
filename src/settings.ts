export const NAME = "Fanhuaji"

export type OptionalConvertParams = {
	ignoreTextStyles?: string
	jpTextStyles?: string
	jpStyleConversionStrategy?: string
	jpTextConversionStrategy?: string
	modules?: Record<string, -1 | 0 | 1> | string
	userPreReplace?: Record<string, string> | string
	userPostReplace?: Record<string, string> | string
	userProtectReplace?: string[] | string
	diffCharLevel?: boolean
	diffContextLines?: number
	diffEnable?: boolean
	diffIgnoreCase?: boolean
	diffIgnoreWhiteSpaces?: boolean
	diffTemplate?: string
	cleanUpText?: boolean
	ensureNewlineAtEof?: boolean
	translateTabsToSpaces?: number
	trimTrailingWhiteSpaces?: boolean
	unifyLeadingHyphen?: boolean
}
export interface Settings {
	server: string
	key: string
	convertParams?: OptionalConvertParams
}
