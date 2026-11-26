import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { paymentService, type PaymentVerification } from '@/services/payments';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, XCircle, Clock, ArrowRight, BookOpen } from 'lucide-react';

export function PaymentResultPage() {
  const [params] = useSearchParams();
  const { profile, isLoading: isAuthLoading, refreshProfile } = useAuth();
  const reference = params.get('reference') ?? params.get('trxref') ?? params.get('ref') ?? '';
  const [result, setResult] = useState<PaymentVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setLoading(false);
      setError('The payment provider did not return a transaction reference.');
      return;
    }

    let active = true;
    setLoading(true);

    paymentService.verifyPayment(reference)
      .then(async (verification) => {
        if (!active) return;
        setResult(verification);
        await refreshProfile();
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to verify this payment.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [reference, refreshProfile]);

  const status = result?.status ?? '';
  const isOk = status === 'succeeded';
  const isPending = status === 'pending';
  const isStillChecking = loading || isAuthLoading;

  return (
    <div className="container-page py-12 max-w-lg">
      <Card className="p-7 sm:p-9 text-center">
        {isStillChecking ? (
          <>
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 animate-pulse">
              <Clock className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink-950">Verifying payment with Paystack</h1>
            <p className="mt-2 text-sm text-ink-600">Please wait a moment while the Study Hub confirms your transaction and activates your learning entitlements.</p>
          </>
        ) : !profile && !isOk ? (
          <>
            <Alert tone="info" title="Sign in to complete payment activation"><p className="text-sm">Sign in with the account used to start this payment to access your materials.</p></Alert>
            <Link to={`/login?redirect=${encodeURIComponent(`/payment/return?reference=${reference}`)}`}><Button className="mt-5">Sign in</Button></Link>
          </>
        ) : (
          <>
            <div className={`mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
              isOk ? 'bg-green-100 text-green-700' : isPending ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>
              {isOk ? <CheckCircle2 className="h-7 w-7" /> : isPending ? <Clock className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
            </div>
            <Badge tone={isOk ? 'green' : isPending ? 'amber' : 'red'} className="mb-2">
              {isOk ? 'Payment confirmed' : isPending ? 'Payment pending' : 'Payment not confirmed'}
            </Badge>
            <h1 className="font-display text-2xl font-bold text-ink-950">
              {isOk ? 'Subscription updated' : isPending ? 'Payment is pending' : 'Payment could not be confirmed'}
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              {error ?? result?.message ?? 'The payment status could not be determined.'}
            </p>
            {reference && <p className="mt-3 text-xs text-ink-500">Reference: <span className="font-mono">{reference}</span></p>}
            {error && <Alert tone="warning" className="mt-5 text-left">{error}</Alert>}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {isOk ? (
                <>
                  <Link to="/dashboard"><Button leftIcon={<ArrowRight className="h-4 w-4" />}>Go to dashboard</Button></Link>
                  <Link to="/materials"><Button variant="outline" leftIcon={<BookOpen className="h-4 w-4" />}>Browse materials</Button></Link>
                </>
              ) : (
                <>
                  <Link to="/pricing"><Button>View packages</Button></Link>
                  <Link to="/payments"><Button variant="outline">Payment history</Button></Link>
                </>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
