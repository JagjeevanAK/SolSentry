import { createHelius } from "helius-sdk";
import { HELIUS_CONFIG } from "../config/api";

const helius = createHelius({ apiKey: HELIUS_CONFIG.apiKey });

interface Transaction {
    signature: string;
    timestamp?: number;
    [key: string]: any;
}

export async function getTransactionsBySignature(signatures: string[]) {
    try {
        const res = await helius.enhanced.getTransactions({
            transactions: signatures
        });
        return res;
    } catch (error) {
        console.error("Error fetching transactions by signature:", error);
        throw error;
    }
}

export async function getTransactionsByAddress(
    address: string,
    hoursBack?: number,
    beforeSignature?: string
): Promise<Transaction[]> {
    try {
        if (!hoursBack) {
            const params: any = { address };
            if (beforeSignature) {
                params.before = beforeSignature;
            }
            const transactions = await helius.enhanced.getTransactionsByAddress(params);
            return transactions || [];
        }

        return await fetchTransactionsRecursively(address, hoursBack);
    } catch (error) {
        console.error("Error fetching transactions by address:", error);
        throw error;
    }
}

async function fetchTransactionsRecursively(
    address: string,
    hoursBack: number,
    beforeSignature?: string,
    accumulatedTransactions: Transaction[] = []
): Promise<Transaction[]> {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const cutoffTimestamp = currentTimeInSeconds - (hoursBack * 60 * 60);
    
    const params: any = { address };
    if (beforeSignature) {
        params.before = beforeSignature;
    }
    
    const transactions = await helius.enhanced.getTransactionsByAddress(params);
    
    if (!transactions || transactions.length === 0) {
        return accumulatedTransactions;
    }
    
    const transactionsInRange: Transaction[] = [];
    let shouldContinue = true;
    
    for (const tx of transactions) {
        if (!tx.timestamp) {
            continue;
        }
        
        if (tx.timestamp >= cutoffTimestamp) {
            transactionsInRange.push(tx);
        } else {
            shouldContinue = false;
            break;
        }
    }
    
    const newAccumulated = [...accumulatedTransactions, ...transactionsInRange];
    
    if (shouldContinue && transactions.length > 0) {
        const lastTx = transactions[transactions.length - 1];
        if (lastTx && lastTx.signature) {
            return fetchTransactionsRecursively(
                address,
                hoursBack,
                lastTx.signature,
                newAccumulated
            );
        }
    }
    
    return newAccumulated;
}

export async function getTransactionsForTokenByAddress(
    address: string,
    tokenMint: string,
    hoursBack?: number
): Promise<Transaction[]> {
    try {
        const allTransactions = await getTransactionsByAddress(address, hoursBack);
        
        const tokenTransactions = allTransactions.filter(tx => {
            if (tx.tokenTransfers) {
                return tx.tokenTransfers.some((transfer: any) => 
                    transfer.mint === tokenMint
                );
            }
            return false;
        });
        
        return tokenTransactions;
    } catch (error) {
        console.error("Error fetching token transactions:", error);
        throw error;
    }
}

