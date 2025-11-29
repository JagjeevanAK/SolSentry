import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ResultDisplay } from '@/components/ResultDisplay';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ArrowLeft } from 'lucide-react';

export function ResultPage() {
    const { jobId } = useParams<{ jobId: string }>();
    const [state, setState] = useState<'completed' | 'failed' | 'active' | 'delayed' | 'waiting' | 'prioritized'>('active');
    const [result, setResult] = useState<unknown>(null);
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!jobId) return;

        const pollStatus = async () => {
            try {
                const response = await axios.get(`http://localhost:3000/jobs/${jobId}/result`);
                const data = response.data;

                setState(data.state);

                if (data.state === 'completed') {
                    setResult(data.result);
                } else if (data.state === 'failed') {
                    setError(data.error);
                }
            } catch (err) {
                console.error('Error polling job status:', err);
                // Don't set error state immediately on network error to allow retries, 
                // but maybe show a toast or connection warning.
            }
        };

        pollStatus();

        const interval = setInterval(() => {
            if (state !== 'completed' && state !== 'failed') {
                pollStatus();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [jobId, state]);

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Animated Background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-background" />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background animate-gradient opacity-40" />
            </div>

            {/* Content */}
            <div className="relative z-10 p-4 sm:p-8">
                <div className="w-full max-w-5xl mx-auto space-y-8">
                    <Link to="/">
                        <Button variant="ghost" className="gap-2 glass-card hover:scale-105 transition-smooth">
                            <ArrowLeft className="w-4 h-4" />
                            <span>Back to Search</span>
                        </Button>
                    </Link>

                    <ResultDisplay result={result} state={state} error={error} />
                </div>
            </div>
        </div>
    );
}
