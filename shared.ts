export const NAME = "Fanhuaji"

type ConvertParams = {
	ignoreTextStyles?: string
	jpTextStyles?: string
	modules?: Record<string, -1 | 0 | 1> | string
	userPreReplace?: Record<string, string> | string
	userPostReplace?: Record<string, string> | string
	userProtectReplace?: string[] | string
}
export interface Settings {
	api: {
		server: string
		key: string
		convertParams?: ConvertParams
	}
}
