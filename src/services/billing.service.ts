import Stripe from "stripe";
import { getEnv } from "../config/env";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const env = getEnv();
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

export interface UsageReport {
  success: boolean;
  meterEventId: string | null;
  error?: string;
}

/**
 * Report token usage to Stripe via the Billing Meters API.
 *
 * @param stripeCustomerId - The Stripe customer ID to attribute usage to
 * @param totalTokens      - Number of tokens consumed
 * @param requestId        - Unique request ID used as deduplication identifier
 */
export async function reportUsage(
  stripeCustomerId: string,
  totalTokens: number,
  requestId: string
): Promise<UsageReport> {
  if (!stripeCustomerId) {
    return {
      success: false,
      meterEventId: null,
      error: "No Stripe customer ID configured for this user",
    };
  }

  const stripe = getStripe();
  const env = getEnv();

  try {
    const meterEvent = await stripe.billing.meterEvents.create({
      event_name: env.STRIPE_METER_EVENT_NAME,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: String(totalTokens),
      },
    });

    return {
      success: true,
      meterEventId: meterEvent.identifier,
    };
  } catch (error) {
    const message =
      error instanceof Stripe.errors.StripeError
        ? `Stripe error: ${error.type} - ${error.message}`
        : `Unknown billing error: ${String(error)}`;

    console.error(`Failed to report usage for customer ${stripeCustomerId}:`, message);

    return {
      success: false,
      meterEventId: null,
      error: message,
    };
  }
}

/**
 * Ensure the Stripe billing meter exists. Creates it if not found.
 * Called once at application startup.
 */
export async function ensureMeterExists(): Promise<void> {
  const stripe = getStripe();
  const env = getEnv();

  try {
    // List existing meters and check if ours exists
    const meters = await stripe.billing.meters.list({ limit: 100 });
    const existing = meters.data.find(
      (m) => m.event_name === env.STRIPE_METER_EVENT_NAME && m.status === "active"
    );

    if (existing) {
      console.log(`Stripe meter "${env.STRIPE_METER_EVENT_NAME}" already exists (${existing.id}).`);
      return;
    }

    // Create the meter
    const meter = await stripe.billing.meters.create({
      display_name: "AI Token Usage",
      event_name: env.STRIPE_METER_EVENT_NAME,
      default_aggregation: { formula: "sum" },
    });

    console.log(`Created Stripe meter "${env.STRIPE_METER_EVENT_NAME}" (${meter.id}).`);
  } catch (error) {
    // Non-fatal: log and continue. Billing will fail but the app still works.
    console.warn(
      "Warning: Could not verify/create Stripe billing meter:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
