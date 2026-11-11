const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const incompleteHome = `<!doctype html>
<html><head>
<title>Harbor Sample</title>
<meta property="og:site_name" content="Harbor Sample">
<meta name="description" content="Harbor Sample sells handmade ceramic mugs online.">
<link rel="icon" href="/fixtures/incomplete/logo.png">
</head><body>
<header><a href="/fixtures/incomplete"><img alt="Harbor Sample logo" src="/fixtures/incomplete/logo.png"></a>
<nav>
<a href="/fixtures/incomplete/products/mug">Mugs</a>
<a href="/fixtures/incomplete/shipping">Shipping</a>
<a href="/fixtures/incomplete/about">About</a>
</nav></header>
<main><h1>Harbor Sample</h1>
<p>Harbor Sample sells handmade ceramic mugs from a small workshop. Orders ship from the studio.</p>
</main></body></html>`

const incompleteAbout = `<!doctype html><html><head><title>About Harbor Sample</title></head><body>
<main><h1>About</h1><p>Harbor Sample is a small workshop that makes ceramic mugs and ships them to customers.</p></main>
</body></html>`

const incompleteShipping = `<!doctype html><html><head><title>Shipping</title></head><body>
<main><h1>Shipping</h1><p>Orders leave the studio within three business days. Delivery times depend on the destination.</p></main>
</body></html>`

const incompleteMug = `<!doctype html><html><head><title>Stone mug</title></head><body>
<main><h1>Stone mug</h1>
<p>A heavy ceramic mug. Capacity 350 mL. Dishwasher safe.</p>
<img src="/fixtures/incomplete/mug.png" alt="Stone mug">
</main>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Stone mug","description":"A heavy ceramic mug. Capacity 350 mL. Dishwasher safe.","image":"/fixtures/incomplete/mug.png","sku":"MUG-STONE"}
</script>
</body></html>`

const completeHome = `<!doctype html><html><head>
<title>Northline Outdoor</title>
<meta property="og:site_name" content="Northline Outdoor">
<meta property="og:image" content="/fixtures/complete/cover.png">
<link rel="icon" href="/fixtures/complete/logo.png">
</head><body>
<header><img alt="Northline Outdoor logo" src="/fixtures/complete/logo.png">
<nav>
<a href="/fixtures/complete/products/trail-shoes">Shoes</a>
<a href="/fixtures/complete/shipping">Shipping</a>
<a href="/fixtures/complete/returns">Returns</a>
<a href="/fixtures/complete/about">About</a>
</nav></header>
<main>
<h1>Northline Outdoor</h1>
<p>Northline Outdoor sells trail running shoes online to customers in the United States.</p>
<p>Studio address: 18 Market Street, Portland, United States.</p>
</main></body></html>`

const completeAbout = `<!doctype html><html><head><title>About Northline Outdoor</title></head><body>
<main><p>Northline Outdoor makes waterproof trail shoes and sells them from its United States online store.</p></main>
</body></html>`

const completeShipping = `<!doctype html><html><head><title>Shipping</title></head><body>
<main><h1>Shipping</h1><p>We ship in-stock shoes from Portland. Delivery usually takes 3 to 5 business days inside the United States.</p></main>
</body></html>`

const completeReturns = `<!doctype html><html><head><title>Returns</title></head><body>
<main><h1>Returns</h1><p>We accept returns within 30 days of delivery. Sale items follow this same return window unless the product page says otherwise.</p></main>
</body></html>`

const completeProduct = `<!doctype html><html><head><title>Trail running shoes</title></head><body>
<main><h1>Trail running shoes</h1></main>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProductGroup",
  "name": "Trail running shoes",
  "productGroupID": "TRAIL",
  "brand": {"@type": "Brand", "name": "Northline"},
  "description": "Waterproof trail shoes with a rubber outsole.",
  "hasVariant": [
    {
      "@type": "Product",
      "sku": "TRAIL-BLK-10",
      "name": "Trail running shoes — black, size 10",
      "color": "Black",
      "size": "10",
      "description": "Waterproof trail shoes with a rubber outsole.",
      "image": "/fixtures/complete/trail.png",
      "offers": {"@type": "Offer", "url": "/fixtures/complete/products/trail-shoes?color=black&size=10", "price": "79.99", "priceCurrency": "USD", "availability": "https://schema.org/InStock"}
    },
    {
      "@type": "Product",
      "sku": "TRAIL-BLK-11",
      "name": "Trail running shoes — black, size 11",
      "color": "Black",
      "size": "11",
      "description": "Waterproof trail shoes with a rubber outsole.",
      "image": "/fixtures/complete/trail.png",
      "offers": {"@type": "Offer", "url": "/fixtures/complete/products/trail-shoes?color=black&size=11", "price": "79.99", "priceCurrency": "USD", "availability": "https://schema.org/OutOfStock"}
    }
  ]
}
</script>
</body></html>`

const loginPage = `<!doctype html><html><head><title>Sign in</title></head><body>
<form>
<label>Email <input type="email" name="email"></label>
<label>Password <input type="password" name="password"></label>
<button>Sign in</button>
</form>
</body></html>`

const brochure = `<!doctype html><html><head>
<title>Studio North</title>
<meta property="og:site_name" content="Studio North">
</head><body>
<nav><a href="/fixtures/brochure/about">About</a></nav>
<main><h1>Studio North</h1><p>Studio North is a two-person design studio. We publish essays and do not sell products online.</p></main>
</body></html>`

const brochureAbout = `<!doctype html><html><head><title>About Studio North</title></head><body>
<main><p>Studio North designs books and exhibitions. There is no cart and no product catalog.</p></main>
</body></html>`

const shopHome = `<!doctype html><html><head><title>Fixture Shop</title>
<meta property="og:site_name" content="Fixture Shop">
</head><body>
<script>Shopify.currency = {"active":"USD","rate":"1.0"};</script>
<script>Shopify.theme = {};</script>
<main><h1>Fixture Shop</h1><p>A public Shopify-style catalog used for tests.</p></main>
</body></html>`

const shopJson = JSON.stringify({
  products: [
    {
      id: 100,
      title: "Trail running shoes",
      handle: "trail-shoes",
      body_html: "<p>Waterproof trail shoes with a rubber outsole.</p>",
      vendor: "Northline",
      product_type: "Shoes",
      options: [{ name: "Color" }, { name: "Size" }],
      images: [{ src: "https://cdn.example.com/trail.jpg" }],
      variants: [
        { id: 1001, title: "Black / 10", sku: "TRAIL-BLK-10", price: "79.99", compare_at_price: null, available: true, option1: "Black", option2: "10", barcode: "09506000134352" },
        { id: 1002, title: "Black / 11", sku: "TRAIL-BLK-11", price: "59.99", compare_at_price: "79.99", available: false, option1: "Black", option2: "11" },
      ],
    },
  ],
})

const optionsPage = `<!doctype html><html><head><title>Canvas tote</title></head><body>
<h1>Canvas tote</h1>
<p>A cotton tote sold in several colors.</p>
<select name="options[Color]"><option>Black</option><option>Sand</option></select>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Canvas tote","sku":"TOTE-1","description":"A cotton tote."}
</script>
</body></html>`

const pages: Record<string, string> = {
  "/fixtures/incomplete": incompleteHome,
  "/fixtures/incomplete/about": incompleteAbout,
  "/fixtures/incomplete/shipping": incompleteShipping,
  "/fixtures/incomplete/products/mug": incompleteMug,
  "/fixtures/complete": completeHome,
  "/fixtures/complete/about": completeAbout,
  "/fixtures/complete/shipping": completeShipping,
  "/fixtures/complete/returns": completeReturns,
  "/fixtures/complete/products/trail-shoes": completeProduct,
  "/fixtures/login": loginPage,
  "/fixtures/brochure": brochure,
  "/fixtures/brochure/about": brochureAbout,
  "/fixtures/shop": shopHome,
  "/fixtures/shop/products.json": shopJson,
  "/fixtures/options": optionsPage,
}

export function fixtureBody(pathname: string): { body: Buffer | string; contentType: string } | null {
  const path = pathname.replace(/\/$/, "") || "/"
  if (path.endsWith(".png")) return { body: PNG, contentType: "image/png" }
  const hit = pages[path]
  if (!hit) return null
  if (path.endsWith(".json")) return { body: hit, contentType: "application/json; charset=utf-8" }
  return { body: hit, contentType: "text/html; charset=utf-8" }
}

export function fixtureFetch(origin = "http://127.0.0.1"): (url: string, init: RequestInit) => Promise<Response> {
  return async (url: string) => {
    const parsed = new URL(url, origin)
    const hit = fixtureBody(parsed.pathname)
    if (!hit) return new Response("missing", { status: 404 })
    const body = typeof hit.body === "string" ? hit.body : new Uint8Array(hit.body)
    return new Response(body, { status: 200, headers: { "content-type": hit.contentType } })
  }
}
