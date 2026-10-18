import express from 'express';
import Stripe from 'stripe';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app = express();
const port = process.env.PORT || 3000;
const secret = process.env.STRIPE_SECRET_KEY;
const stripe = secret ? new Stripe(secret) : null;
const prices = new Map([[100, 199], [500, 699], [1200, 1299]]); // cents: $1.99, $6.99, $12.99
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname));
app.post('/api/create-checkout-session', async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!stripe) return res.status(503).json({error:'Stripe is not configured on this server.'});
  if (!prices.has(coins)) return res.status(400).json({error:'Unknown coin package.'});
  try {
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      line_items:[{price_data:{currency:'usd',product_data:{name:`${coins} Star Coins`},unit_amount:prices.get(coins)},quantity:1}],
      metadata:{coins:String(coins)},
      success_url:`${process.env.PUBLIC_URL || 'http://localhost:'+port}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${process.env.PUBLIC_URL || 'http://localhost:'+port}/?purchase=cancelled`
    });
    res.json({url:session.url});
  } catch (err) { res.status(502).json({error:'Unable to start Stripe Checkout.'}); }
});
app.get('/api/checkout-session', async (req,res) => {
  if (!stripe) return res.status(503).json({error:'Stripe is not configured on this server.'});
  try { const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id)); if (session.payment_status !== 'paid') return res.status(402).json({error:'Payment is not completed.'}); const coins = Number(session.metadata?.coins); if (!prices.has(coins)) return res.status(400).json({error:'Invalid purchase.'}); res.json({coins}); } catch { res.status(400).json({error:'Invalid checkout session.'}); }
});

app.listen(port,()=>console.log(`Wonderforge Worlds listening on ${port}`));
