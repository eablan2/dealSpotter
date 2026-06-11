const express = require('express');
const axios = require('axios');
const path = require('path');

const STORES = [
  {
    id: 'ashland',
    label: '2940 N Ashland Ave',
    address: '2940 N Ashland Ave, Chicago, IL 60657',
    postalCode: '60657',
    jewelStoreId: '3441',
    lat: 41.9354,
    lon: -87.6702,
  },
];

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dealsCacheMap = {};

const FLIPP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Origin': 'https://flipp.com',
  'Referer': 'https://flipp.com/',
};

// Step 1: find the current Jewel-Osco Weekly Ad flyer for this postal code
async function findJewelFlyer(postalCode) {
  const res = await axios.get(
    `https://cdn-gateflipp.flippback.com/bf/flipp/flyers?locale=en-US&postal_code=${postalCode}&merchants[]=jewel-osco`,
    { headers: FLIPP_HEADERS, timeout: 15000 }
  );

  const flyers = res.data?.flyers;
  if (!flyers?.length) throw new Error('No flyers returned');

  // Prefer the main "Weekly Ad" from Jewel-Osco; fall back to any Jewel flyer
  const now = new Date();
  const jewel = flyers
    .filter(f => f.merchant === 'Jewel-Osco')
    .filter(f => new Date(f.valid_to) >= now)
    .sort((a, b) => (b.name === 'Weekly Ad' ? 1 : 0) - (a.name === 'Weekly Ad' ? 1 : 0));

  if (!jewel.length) throw new Error('No active Jewel-Osco flyer found');

  const flyer = jewel[0];
  return { id: flyer.id, name: flyer.name, validFrom: flyer.valid_from, validTo: flyer.valid_to };
}

// Step 2: fetch all items for that specific flyer from the correct Flipp API
async function fetchFlyerItems(flyerId, postalCode) {
  const res = await axios.get(
    `https://dam.flippenterprise.net/api/flipp/flyers/${flyerId}/flyer_items?locale=en-US&postal_code=${postalCode}`,
    { headers: FLIPP_HEADERS, timeout: 20000 }
  );

  const items = res.data;
  if (!Array.isArray(items) || !items.length) throw new Error('No items returned');

  return items
    .filter(item => item.name && item.name.trim().length > 1)
    .map(item => {
      const priceNum = item.price && item.price !== '' ? parseFloat(item.price) : null;
      return {
        id: String(item.id),
        name: item.name.trim(),
        brand: item.brand || null,
        price: !isNaN(priceNum) ? priceNum : null,
        priceText: (!isNaN(priceNum) && priceNum !== null) ? `$${priceNum.toFixed(2)}` : 'See ad',
        originalPrice: null,
        savings: null,
        category: categorize(item.name, item.brand),
        imageUrl: item.cutout_image_url || null,
        validFrom: item.valid_from,
        validTo: item.valid_to,
      };
    });
}

function categorize(name, brand) {
  const n = (name + ' ' + (brand || '')).toLowerCase();
  if (/beef|chicken|pork|turkey|salmon|shrimp|fish|meat|steak|chop|rib|brisket|sausage|hot dog|bacon/.test(n)) return 'Meat & Seafood';
  if (/milk|cheese|yogurt|butter|cream|dairy|egg|cottage/.test(n)) return 'Dairy & Eggs';
  if (/apple|orange|banana|berry|grape|peach|lemon|lime|lettuce|tomato|pepper|onion|broccoli|spinach|vegetable|fruit|produce|avocado|mango|watermelon|corn|potato/.test(n)) return 'Produce';
  if (/bread|bagel|muffin|roll|cake|cookie|bakery|pastry|bun|tortilla|pita/.test(n)) return 'Bakery';
  if (/beer|wine|spirit|liquor|vodka|whiskey|hard selt/.test(n)) return 'Alcohol';
  if (/soda|juice|water|coffee|tea|drink|beverage|gatorade|bodyarmor|powerade/.test(n)) return 'Beverages';
  if (/frozen|pizza|ice cream|popsicle|gelato/.test(n)) return 'Frozen';
  if (/shampoo|soap|detergent|paper|towel|toilet|cleaning|laundry|dish|razors|deodorant|toothpaste|mouthwash|vitamins|supplement/.test(n)) return 'Household & Personal Care';
  if (/dog|cat|pet food|pet/.test(n)) return 'Pet';
  if (/cereal|pasta|rice|soup|sauce|condiment|snack|chip|cracker|candy|chocolate|nut|granola|mayonnaise|ketchup|mustard/.test(n)) return 'Pantry';
  return 'Other';
}

function getMockDeals() {
  const deals = [
    { id: '1', name: 'USDA Choice Beef Chuck Roast', brand: null, price: 4.99, priceText: '$4.99/lb', originalPrice: '$7.99/lb', savings: 'Save $3.00/lb', category: 'Meat & Seafood', imageUrl: null },
    { id: '2', name: 'Boneless Skinless Chicken Breasts', brand: null, price: 2.99, priceText: '$2.99/lb', originalPrice: '$5.49/lb', savings: 'Save $2.50/lb', category: 'Meat & Seafood', imageUrl: null },
    { id: '3', name: 'Lucerne Milk 1 Gallon', brand: 'Lucerne', price: 3.49, priceText: '$3.49', originalPrice: '$4.99', savings: 'Save $1.50', category: 'Dairy & Eggs', imageUrl: null },
    { id: '4', name: 'Large Eggs 12 ct', brand: null, price: 2.99, priceText: '$2.99', originalPrice: '$4.49', savings: 'Save $1.50', category: 'Dairy & Eggs', imageUrl: null },
    { id: '5', name: 'Strawberries 1 lb', brand: null, price: 2.99, priceText: '$2.99', originalPrice: '$4.99', savings: 'Save $2.00', category: 'Produce', imageUrl: null },
    { id: '6', name: 'Broccoli Crowns', brand: null, price: 0.99, priceText: '$0.99/lb', originalPrice: '$1.99/lb', savings: 'Save $1.00/lb', category: 'Produce', imageUrl: null },
    { id: '7', name: 'Coca-Cola 12-Pack Cans', brand: 'Coca-Cola', price: 5.99, priceText: '$5.99', originalPrice: '$8.99', savings: 'Save $3.00', category: 'Beverages', imageUrl: null },
    { id: '8', name: 'Tropicana Orange Juice 52 oz', brand: 'Tropicana', price: 3.99, priceText: '$3.99', originalPrice: '$6.49', savings: 'Save $2.50', category: 'Beverages', imageUrl: null },
    { id: '9', name: 'DiGiorno Frozen Pizza', brand: 'DiGiorno', price: 5.99, priceText: '$5.99', originalPrice: '$7.99', savings: null, category: 'Frozen', imageUrl: null },
    { id: '10', name: 'Cheerios 18 oz', brand: 'Cheerios', price: 4.49, priceText: '$4.49', originalPrice: '$6.49', savings: 'Save $2.00', category: 'Pantry', imageUrl: null },
  ];
  return { deals, source: 'demo', note: 'Demo data — live Jewel data unavailable. Try refreshing.' };
}

app.get('/api/stores', (req, res) => res.json(STORES));

app.get('/api/deals', async (req, res) => {
  const postalCode = req.query.postal_code;
  if (!postalCode) return res.status(400).json({ error: 'postal_code is required' });

  const cached = dealsCacheMap[postalCode];
  if (cached && (Date.now() - cached.time) < 30 * 60 * 1000) {
    return res.json(cached.data);
  }

  try {
    console.log(`[${postalCode}] Finding current Jewel Weekly Ad flyer...`);
    const flyer = await findJewelFlyer(postalCode);
    console.log(`[${postalCode}] Found flyer ${flyer.id} "${flyer.name}" (valid ${flyer.validFrom} – ${flyer.validTo})`);

    const items = await fetchFlyerItems(flyer.id, postalCode);
    console.log(`[${postalCode}] Fetched ${items.length} items`);

    const data = {
      deals: items,
      source: 'live',
      flyerId: flyer.id,
      flyerName: flyer.name,
      validFrom: flyer.validFrom,
      validTo: flyer.validTo,
      note: `${items.length} deals from Jewel Weekly Ad (${flyer.validFrom.slice(0,10)} – ${flyer.validTo.slice(0,10)})`,
    };
    dealsCacheMap[postalCode] = { data, time: Date.now() };
    res.json(data);
  } catch (err) {
    console.error(`[${postalCode}] Fetch failed:`, err.message);
    const data = getMockDeals();
    dealsCacheMap[postalCode] = { data, time: Date.now() };
    res.json(data);
  }
});

app.post('/api/deals/refresh', (req, res) => {
  const { postal_code } = req.body;
  if (postal_code) {
    delete dealsCacheMap[postal_code];
  } else {
    Object.keys(dealsCacheMap).forEach(k => delete dealsCacheMap[k]);
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Deal Spotter running at http://localhost:${PORT}`));
