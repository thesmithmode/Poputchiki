import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { stripe, stripeWebhookSecret } from "@/lib/stripe"

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    const alreadyProcessed = await prisma.processedStripeEvent.findUnique({
      where: { eventId: event.id },
    })

    if (alreadyProcessed) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan

        if (userId && plan && typeof session.subscription === "string") {
          const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription)

          await prisma.subscription.update({
            where: { userId },
            data: {
              status: plan === "PRO" ? "PRO" : "PREMIUM",
              stripeSubscriptionId: session.subscription,
              stripePriceId: stripeSubscription.items.data[0]?.price.id || null,
              currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            },
          })
        }
        break
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const dbSubscription = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        })

        if (dbSubscription) {
          if (event.type === "customer.subscription.deleted" || subscription.status === "canceled") {
            await prisma.subscription.update({
              where: { userId: dbSubscription.userId },
              data: {
                status: "CANCELLED",
                currentPeriodEnd: null,
              },
            })
          } else {
            await prisma.subscription.update({
              where: { userId: dbSubscription.userId },
              data: {
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              },
            })
          }
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    await prisma.processedStripeEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
      },
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

