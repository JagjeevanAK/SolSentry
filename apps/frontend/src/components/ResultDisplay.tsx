import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

interface ResultDisplayProps {
    result: unknown;
    state: 'completed' | 'failed' | 'active' | 'delayed' | 'waiting' | 'prioritized';
    error?: string;
}

export function ResultDisplay({ result, state, error }: ResultDisplayProps) {
    // Failed state
    if (state === 'failed') {
        return (
            <Card className="w-full glass-card border-destructive/30 shadow-xl">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-full bg-destructive/10">
                            <XCircle className="w-6 h-6 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl text-destructive">Analysis Failed</CardTitle>
                            <CardDescription className="text-base mt-1">
                                {error || 'An unknown error occurred during analysis.'}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    // Processing states
    if (state !== 'completed') {
        const stateMessages = {
            active: 'Processing your request...',
            delayed: 'Request is queued and will process soon...',
            waiting: 'Waiting for available resources...',
            prioritized: 'Request has been prioritized...'
        };

        return (
            <Card className="w-full glass-card shadow-xl">
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="p-3 rounded-full bg-primary/10">
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            </div>
                            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        </div>
                        <div className="flex-1">
                            <CardTitle className="text-2xl gradient-text-primary">Processing Analysis</CardTitle>
                            <CardDescription className="text-base mt-1">
                                {stateMessages[state] || 'Your request is being analyzed. This may take a moment.'}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Progress indicators */}
                        <div className="flex gap-2">
                            {[0, 1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-1 flex-1 bg-muted rounded-full overflow-hidden"
                                >
                                    <div
                                        className="h-full bg-gradient-to-r from-primary to-accent animate-gradient"
                                        style={{ animationDelay: `${i * 0.2}s` }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertTriangle className="w-4 h-4" />
                            <span>This process may take up to 30 seconds</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Success state
    return (
        <Card className="w-full glass-card shadow-2xl border-primary/20">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-green-500/10">
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl gradient-text-primary">Analysis Complete</CardTitle>
                        <CardDescription className="text-base mt-1">
                            Your analysis results are ready for review
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[65vh] w-full rounded-xl border border-border/50 bg-muted/20 p-6 custom-scrollbar">
                    <div className="space-y-4">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/30">
                                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                            </pre>
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
