export const SOLSCAN_CONFIG = {
    baseUrl: "https://api-v2.solscan.io",
    endpoints: {
        account: "/v2/account",
        search: "/v2/search"
    }
} as const;

export const HELIUS_CONFIG = {
    apiKey: process.env.HELIUS_API_KEY || ""
} as const;

