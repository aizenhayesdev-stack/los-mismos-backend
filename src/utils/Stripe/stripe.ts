import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../../config/environment";

require("dotenv").config();

const stripe = new Stripe(STRIPE_SECRET_KEY as string);

export const createPaymentIntent = async (amount: number, metadata?: any) => {
    console.log(metadata)
    amount = amount * 100;
    // Calculate Stripe fee as 10% of the amount
    const stripeFee = Math.ceil(amount * 0.10);
    const totalCharge = amount + stripeFee;

    // Store the individual fee and total for reference in metadata (optional)
    if (metadata && typeof metadata === "object") {
        metadata.stripeFee = stripeFee;
        metadata.totalToCharge = totalCharge;
    }
    amount = totalCharge;
    // const totalToCharge = calculateTotalCharge(amount * 100);
    // metadata.totalToCharge = totalToCharge
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        metadata: metadata, // helpful for webhook
    });

    return paymentIntent
}