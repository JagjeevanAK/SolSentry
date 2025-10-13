import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { 
    getTransactionsByAddress, 
    getTransactionsForTokenByAddress,
    getTransactionsBySignature 
} from "../utils/helius-api";
import { 
    getAccountInfo, 
    searchSolscan 
} from "../utils/solscan-api";

export const fetchTransactionsByAddressTool = new DynamicStructuredTool({
    name: "fetch_transactions_by_address",
    description: "Fetches all transactions for a given Solana address. Can optionally filter by time period (hours back from now).",
    schema: z.object({
        address: z.string().describe("The Solana wallet or pool address"),
        hoursBack: z.number().optional().describe("Number of hours to look back (e.g., 6 for last 6 hours, 24 for last day). Default: 10 hours.")
    }),
    func: async (input: { address: string; hoursBack?: number }) => {
        const { address, hoursBack } = input;
        console.log(`\n[Tool: fetch_transactions_by_address] Fetching transactions for ${address}, hoursBack: ${hoursBack || 'default'}`);
        try {
            const transactions = await getTransactionsByAddress(address, hoursBack);
            console.log(`[Tool: fetch_transactions_by_address] Found ${transactions.length} transactions`);
            return JSON.stringify({
                success: true,
                totalTransactions: transactions.length,
                transactions: transactions,
                timeRange: hoursBack ? `Last ${hoursBack} hours` : "Recent transactions"
            });
        } catch (error: any) {
            console.error(`[Tool: fetch_transactions_by_address] Error:`, error);
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
});

export const fetchTokenTransactionsTool = new DynamicStructuredTool({
    name: "fetch_token_transactions",
    description: "Fetches all transactions for a specific token (mint address) from a wallet address. Useful for analyzing wallet activity for a particular token.",
    schema: z.object({
        walletAddress: z.string().describe("The Solana wallet address"),
        tokenMint: z.string().describe("The token mint address (e.g., token contract address)"),
        hoursBack: z.number().optional().describe("Number of hours to look back. Default: 10 hours if not specified.")
    }),
    func: async (input: { walletAddress: string; tokenMint: string; hoursBack?: number }) => {
        const { walletAddress, tokenMint, hoursBack } = input;
        try {
            const transactions = await getTransactionsForTokenByAddress(
                walletAddress,
                tokenMint,
                hoursBack
            );
            return JSON.stringify({
                success: true,
                totalTransactions: transactions.length,
                transactions: transactions,
                tokenMint: tokenMint,
                walletAddress: walletAddress
            });
        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
});

export const fetchAccountInfoTool = new DynamicStructuredTool({
    name: "fetch_account_info",
    description: "Fetches detailed account information from Solscan for a given address. Provides metadata about the account including type, balance, and other details.",
    schema: z.object({
        address: z.string().describe("The Solana address to get information about")
    }),
    func: async (input: { address: string }) => {
        const { address } = input;
        try {
            const accountInfo = await getAccountInfo(address);
            return JSON.stringify({
                success: true,
                accountInfo: accountInfo
            });
        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
});

export const searchAddressTool = new DynamicStructuredTool({
    name: "search_address",
    description: "Searches for an address in Solscan and returns entity information including isOnCurve field to identify PDAs vs regular accounts.",
    schema: z.object({
        address: z.string().describe("The Solana address to search for")
    }),
    func: async (input: { address: string }) => {
        const { address } = input;
        try {
            const searchResult = await searchSolscan(address);
            return JSON.stringify({
                success: true,
                results: searchResult
            });
        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
});

export const analyzeTransactionPatternsTool = new DynamicStructuredTool({
    name: "analyze_transaction_patterns",
    description: "Analyzes a set of transactions to identify patterns, frequency, volumes, and potential abnormalities. Returns statistical analysis.",
    schema: z.object({
        transactions: z.array(z.any()).describe("Array of transaction objects to analyze")
    }),
    func: async (input: { transactions: any[] }) => {
        const { transactions } = input;
        try {
            // Extract key metrics
            const addressFrequency = new Map<string, number>();
            const volumeByAddress = new Map<string, number>();
            const transactionTypes = new Map<string, number>();
            
            transactions.forEach((tx: any) => {
                // Count transaction types
                const type = tx.type || "unknown";
                transactionTypes.set(type, (transactionTypes.get(type) || 0) + 1);
                
                // Analyze token transfers
                if (tx.tokenTransfers) {
                    tx.tokenTransfers.forEach((transfer: any) => {
                        const from = transfer.fromUserAccount;
                        const to = transfer.toUserAccount;
                        const amount = transfer.tokenAmount || 0;
                        
                        if (from) {
                            addressFrequency.set(from, (addressFrequency.get(from) || 0) + 1);
                            volumeByAddress.set(from, (volumeByAddress.get(from) || 0) + amount);
                        }
                        if (to) {
                            addressFrequency.set(to, (addressFrequency.get(to) || 0) + 1);
                            volumeByAddress.set(to, (volumeByAddress.get(to) || 0) + amount);
                        }
                    });
                }
            });
            
            // Find addresses with high frequency (potential abnormality)
            const sortedByFrequency = Array.from(addressFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            const sortedByVolume = Array.from(volumeByAddress.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            return JSON.stringify({
                success: true,
                analysis: {
                    totalTransactions: transactions.length,
                    uniqueAddresses: addressFrequency.size,
                    transactionTypes: Object.fromEntries(transactionTypes),
                    topAddressesByFrequency: sortedByFrequency.map(([addr, count]) => ({
                        address: addr,
                        transactionCount: count
                    })),
                    topAddressesByVolume: sortedByVolume.map(([addr, volume]) => ({
                        address: addr,
                        totalVolume: volume
                    })),
                    timeRange: transactions.length > 0 ? {
                        earliest: transactions[transactions.length - 1]?.timestamp,
                        latest: transactions[0]?.timestamp
                    } : null
                }
            });
        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
});

export const allTools = [
    fetchTransactionsByAddressTool,
    fetchTokenTransactionsTool,
    fetchAccountInfoTool,
    searchAddressTool,
    analyzeTransactionPatternsTool
];

