import Stripe from "stripe"

function getRequiredEnv(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET"): string {
  const value = process.env[name]

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`)
  }

  return value
}

export const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-11-20.acacia",
})

export const stripeWebhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET")
