import axios from "axios";
import { SOLSCAN_CONFIG } from "../config/api";

const cookie = process.env.SOLSCAN_COOKIE || "solscan_cookie_here";

const getHeaders = () => ({
    "accept": "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "cookie": cookie,
    "origin": "https://solscan.io",
    "referer": "https://solscan.io/",
    "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Brave";v="140"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "sec-gpc": "1",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
});

export async function getAccountInfo(address: string) {
    const url = `${SOLSCAN_CONFIG.baseUrl}${SOLSCAN_CONFIG.endpoints.account}`;
    const params = { 
        address, 
        view_as: "account" 
    };
    
    try {
        const res = await axios.get(url, { params, headers: getHeaders() });
        const cleanedData = JSON.parse(JSON.stringify(res.data));
        
        if (cleanedData?.metadata?.tokens) {
            delete cleanedData.metadata.tokens;
        }
        
        return cleanedData;
    } catch (error) {
        console.error("Error fetching account info from Solscan:", error);
        throw error;
    }
}

export async function searchSolscan(keyword: string) {
    const url = `${SOLSCAN_CONFIG.baseUrl}${SOLSCAN_CONFIG.endpoints.search}`;
    const params = { keyword };
    
    try {
        const res = await axios.get(url, { params, headers: getHeaders() });
        const cleanedData = JSON.parse(JSON.stringify(res.data));
        
        if (cleanedData?.metadata?.tokens) {
            delete cleanedData.metadata.tokens;
        }
        
        return cleanedData;
    } catch (error) {
        console.error("Error searching Solscan:", error);
        throw error;
    }
}

