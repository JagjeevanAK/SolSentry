export interface WorkflowState {
    userQuery: string;
    extractedAddresses: string[];
    extractedTokens: string[];
    queryType: "abnormality_detection" | "wallet_analysis" | "transaction_lookup" | "general" | null;
    transactions: any[];
    accountInfo: any | null;
    analysis: string;
    error: string | null;
    metadata: {
        hoursBack?: number;
        specificToken?: string;
        transactionSignatures?: string[];
        [key: string]: any;
    };
}

export interface Transaction {
    signature: string;
    timestamp?: number;
    type?: string;
    source?: string;
    fee?: number;
    feePayer?: string;
    tokenTransfers?: TokenTransfer[];
    nativeTransfers?: NativeTransfer[];
    accountData?: any[];
    [key: string]: any;
}

export interface TokenTransfer {
    mint: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    fromTokenAccount?: string;
    toTokenAccount?: string;
    tokenAmount?: number;
    tokenStandard?: string;
}

export interface NativeTransfer {
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
}

export interface AbnormalityResult {
    hasAbnormalities: boolean;
    suspiciousAddresses: string[];
    findings: string[];
    statistics: {
        totalTransactions: number;
        uniqueAddresses: number;
        timeRange: {
            start: string;
            end: string;
        };
        [key: string]: any;
    };
}

