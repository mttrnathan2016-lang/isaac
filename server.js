import express from 'express';
import Stripe from 'stripe';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import nodemailer from 'nodemailer';

const app = express();
const port = process.env.PORT || 3000;
const secret = process.env.STRIPE_SECRET_KEY;
const stripe = secret ? new Stripe(secret) : null;
const prices = new Map([[150,100],[1590,500],[10000,1000],[25000,2500],[55000,5000],[120000,10000],[400000,29000]]);
const resetCodes = new Map();
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}) : null;
const bonusItems = new Map([[1590,'Skyglow scarf'],[10000,'Golden explorer set'],[25000,'Dragon mount']]); // cents: $1, $5, $10, $25, $50, $100, $290
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname));
app.post('/api/create-checkout-session', async (req, res) => {
  const coins = Number(req.body?.coins); const item = String(req.body?.item || '');
  if (!stripe) return res.status(503).json({error:'Stripe is not configured on this server.'});
  if (!prices.has(coins)) return res.status(400).json({error:'Unknown coin package.'});
  try {
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      line_items:[{price_data:{currency:'usd',product_data:{name:`${coins} Star Coins`},unit_amount:prices.get(coins)},quantity:1}],
      metadata:{coins:String(coins),item:bonusItems.get(coins)===item?item:''},
      success_url:`${process.env.PUBLIC_URL || 'http://localhost:'+port}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${process.env.PUBLIC_URL || 'http://localhost:'+port}/?purchase=cancelled`
    });
    res.json({url:session.url});
  } catch (err) { res.status(502).json({error:'Unable to start Stripe Checkout.'}); }
});
app.post('/api/request-password-reset', async (req,res)=>{const email=String(req.body?.email||'').trim();if(!mailer)return res.status(503).json({error:'Email is not configured.'});if(!email)return res.status(400).json({error:'Email is required.'});const code=String(Math.floor(100000+Math.random()*900000));resetCodes.set(email,{code,expires:Date.now()+15*60*1000});try{await mailer.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:email,subject:'Starblox password reset',text:`Your Starblox reset code is ${code}. It expires in 15 minutes.`});res.json({message:'A six-digit reset code was sent to your email.'})}catch{res.status(502).json({error:'Could not send reset email.'})}});
app.post('/api/verify-password-reset', (req,res)=>{const email=String(req.body?.email||'').trim(),code=String(req.body?.code||'').trim(),entry=resetCodes.get(email);if(!entry||entry.expires<Date.now()||entry.code!==code)return res.status(400).json({error:'Invalid or expired reset code.'});resetCodes.delete(email);res.json({ok:true})});
app.get('/api/checkout-session', async (req,res) => {
  if (!stripe) return res.status(503).json({error:'Stripe is not configured on this server.'});
  try { const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id)); if (session.payment_status !== 'paid') return res.status(402).json({error:'Payment is not completed.'}); const coins = Number(session.metadata?.coins); if (!prices.has(coins)) return res.status(400).json({error:'Invalid purchase.'}); res.json({coins,item:session.metadata?.item||''}); } catch { res.status(400).json({error:'Invalid checkout session.'}); }
});

app.listen(port,()=>console.log(`Starblox listening on ${port}`));
