import { chromium, Browser, BrowserContext, Page, Cookie } from 'playwright';
import { encryptCredential, decryptCredential } from '../utils/encryption';
import logger from "../logger";

export interface PolymedCredentials {
  username: string;
  password: string;
  loginUrl?: string;
}

export interface PolymedPriceData {
  articleCode: string;
  productName: string;
  description?: string;
  price: number;
  currency: string;
  unit?: string;
  availability?: string;
  catalogUrl?: string;
  imageUrl?: string;
  // Additional identifiers extracted from product pages
  pharmacode?: string;
  gtin?: string;
  packInfo?: string;
  manufacturer?: string;
}

// Product metadata from Polymed API (no price - use Galexis for pricing)
export interface PolymedProductMetadata {
  pmcCode: string;           // Polymed article code
  pharmacode?: string;       // Swiss pharmacy code (for Galexis lookup)
  gtin?: string;             // EAN/GTIN barcode
  productName: string;
  description?: string;
  packInfo?: string;
  showPrice: boolean;        // Whether Polymed shows price for this item
  catalogUrl?: string;
  imageUrl?: string;
}

export interface PolymedSearchResult {
  success: boolean;
  products: PolymedPriceData[];
  totalResults: number;
  searchQuery: string;
  error?: string;
}

export interface PolymedSession {
  cookies: Cookie[];
  lastLogin: Date;
  isValid: boolean;
}

const DEFAULT_LOGIN_URL = 'https://shop.polymed.ch/de';
const SEARCH_URL = 'https://shop.polymed.ch/de/search';
const REQUEST_DELAY_MS = 1500;

export class PolymedBrowserClient {
  private username: string;
  private password: string;
  private loginUrl: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionCookies: Cookie[] = [];
  private isLoggedIn: boolean = false;

  constructor(credentials: PolymedCredentials) {
    this.username = credentials.username;
    this.password = credentials.password;
    this.loginUrl = credentials.loginUrl || DEFAULT_LOGIN_URL;
  }

  private async delay(ms: number = REQUEST_DELAY_MS): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async initialize(): Promise<void> {
    if (this.browser) return;

    logger.info('[Polymed] Initializing browser...');
    
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'de-CH',
    });

    this.page = await this.context.newPage();
    logger.info('[Polymed] Browser initialized');
  }

  async restoreSession(encryptedSession: string): Promise<boolean> {
    try {
      const sessionJson = decryptCredential(encryptedSession);
      if (!sessionJson) {
        logger.info('[Polymed] Could not decrypt session');
        return false;
      }
      const session: PolymedSession = JSON.parse(sessionJson);
      
      const sessionAge = Date.now() - new Date(session.lastLogin).getTime();
      const maxSessionAge = 24 * 60 * 60 * 1000;
      
      if (sessionAge > maxSessionAge) {
        logger.info('[Polymed] Session expired, need to re-login');
        return false;
      }

      if (!this.context) {
        await this.initialize();
      }

      await this.context!.addCookies(session.cookies);
      this.sessionCookies = session.cookies;
      
      await this.page!.goto(this.loginUrl, { waitUntil: 'networkidle' });
      await this.delay(500);
      
      const isStillLoggedIn = await this.checkLoginStatus();
      
      if (isStillLoggedIn) {
        logger.info('[Polymed] Session restored successfully');
        this.isLoggedIn = true;
        return true;
      }
      
      logger.info('[Polymed] Session invalid, need to re-login');
      return false;
    } catch (error) {
      logger.error('[Polymed] Error restoring session:', error);
      return false;
    }
  }

  private async checkLoginStatus(): Promise<boolean> {
    try {
      const logoutButton = await this.page!.$('a[href*="logout"], button:has-text("Logout"), button:has-text("Abmelden")');
      const accountLink = await this.page!.$('a[href*="account"], a[href*="konto"]');
      
      return !!(logoutButton || accountLink);
    } catch {
      return false;
    }
  }

  async login(): Promise<{ success: boolean; message: string; session?: string }> {
    try {
      if (!this.page) {
        await this.initialize();
      }

      logger.info('[Polymed] Navigating to login page...');
      await this.page!.goto(this.loginUrl, { waitUntil: 'networkidle' });
      await this.delay(1000);

      // Polymed has login form that may be collapsed - look for reveal button
      const loginRevealButton = await this.page!.$('button:has-text("Hier gehts zum Login"), button:has-text("Login"), [class*="login"] button');
      if (loginRevealButton) {
        logger.info('[Polymed] Clicking to reveal login form...');
        await loginRevealButton.click();
        await this.delay(500);
      }

      // Polymed has login form directly on main page with customerNumber field
      const usernameInput = await this.page!.$('input[name="customerNumber"], input[name="email"], input[name="username"], input[type="email"], input#email, input#username');
      const passwordInput = await this.page!.$('input[name="password"], input[type="password"], input#password');

      if (!usernameInput || !passwordInput) {
        await this.page!.screenshot({ path: '/tmp/polymed-login-debug.png' });
        return {
          success: false,
          message: 'Could not find login form. Login page structure may have changed.',
        };
      }

      logger.info('[Polymed] Filling login form...');
      await usernameInput.fill(this.username);
      await this.delay(200);
      await passwordInput.fill(this.password);
      await this.delay(200);

      const submitButton = await this.page!.$('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Anmelden")');
      if (submitButton) {
        await submitButton.click();
      } else {
        await passwordInput.press('Enter');
      }

      await this.page!.waitForLoadState('networkidle');
      await this.delay(1000);

      const isLoggedIn = await this.checkLoginStatus();
      
      if (isLoggedIn) {
        this.isLoggedIn = true;
        this.sessionCookies = await this.context!.cookies();
        
        const session: PolymedSession = {
          cookies: this.sessionCookies,
          lastLogin: new Date(),
          isValid: true,
        };
        
        const encryptedSession = encryptCredential(JSON.stringify(session));
        
        logger.info('[Polymed] Login successful');
        return {
          success: true,
          message: 'Login successful',
          session: encryptedSession,
        };
      }

      const errorElement = await this.page!.$('.error, .alert-danger, .login-error, [class*="error"]');
      let errorMessage = 'Login failed - please check credentials';
      
      if (errorElement) {
        errorMessage = await errorElement.textContent() || errorMessage;
      }

      logger.info('[Polymed] Login failed:', errorMessage);
      return {
        success: false,
        message: errorMessage,
      };

    } catch (error: any) {
      logger.error('[Polymed] Login error:', error);
      return {
        success: false,
        message: error.message || 'Login failed due to an error',
      };
    }
  }

  async searchByCode(code: string): Promise<PolymedSearchResult> {
    try {
      if (!this.isLoggedIn) {
        return {
          success: false,
          products: [],
          totalResults: 0,
          searchQuery: code,
          error: 'Not logged in. Please login first.',
        };
      }

      logger.info(`[Polymed] Searching for code: ${code}`);
      
      // Polymed search input uses placeholder="Produktsuche…"
      let searchInput = await this.page!.$('input[placeholder*="Produktsuche"], input[placeholder*="suche"], input[name="search"], input[name="q"], input[type="search"], input.search-input, input#search');
      
      if (!searchInput) {
        await this.page!.goto(SEARCH_URL, { waitUntil: 'networkidle' });
        await this.delay(500);
      }

      const currentSearchInput = await this.page!.$('input[placeholder*="Produktsuche"], input[placeholder*="suche"], input[name="search"], input[name="q"], input[type="search"], input.search-input, input#search');
      
      if (!currentSearchInput) {
        return {
          success: false,
          products: [],
          totalResults: 0,
          searchQuery: code,
          error: 'Could not find search input field',
        };
      }

      await currentSearchInput.fill('');
      await this.delay(100);
      await currentSearchInput.fill(code);
      await currentSearchInput.press('Enter');
      
      await this.page!.waitForLoadState('networkidle');
      await this.delay(1000);

      const products = await this.parseSearchResults();
      
      logger.info(`[Polymed] Found ${products.length} products for code: ${code}`);
      
      return {
        success: true,
        products,
        totalResults: products.length,
        searchQuery: code,
      };

    } catch (error: any) {
      logger.error('[Polymed] Search error:', error);
      return {
        success: false,
        products: [],
        totalResults: 0,
        searchQuery: code,
        error: error.message || 'Search failed',
      };
    }
  }

  async searchByText(text: string): Promise<PolymedSearchResult> {
    return this.searchByCode(text);
  }

  private async parseSearchResults(): Promise<PolymedPriceData[]> {
    const products: PolymedPriceData[] = [];

    try {
      logger.info('[Polymed] Waiting for page content to load...');
      
      // Wait for Next.js to hydrate
      await this.delay(2000);
      
      // Strategy 1: Extract from Next.js __NEXT_DATA__ or Apollo cache
      // Polymed uses Next.js with Apollo GraphQL - data is in window.__NEXT_DATA__
      const nextData = await this.page!.evaluate(() => {
        try {
          // Try to get Next.js data
          const nextDataScript = document.querySelector('#__NEXT_DATA__');
          if (nextDataScript) {
            return JSON.parse(nextDataScript.textContent || '{}');
          }
          
          // Try Apollo cache
          const w = window as any;
          if (w.__APOLLO_STATE__) {
            return { apolloState: w.__APOLLO_STATE__ };
          }
          
          return null;
        } catch {
          return null;
        }
      });
      
      if (nextData) {
        logger.info('[Polymed] Found Next.js data, extracting products...');
        
        // Try to extract products from pageProps or apolloState
        const extractedProducts = this.extractProductsFromNextData(nextData);
        if (extractedProducts.length > 0) {
          logger.info(`[Polymed] Extracted ${extractedProducts.length} products from Next.js data`);
          return extractedProducts;
        }
      }
      
      // Strategy 2: Intercept network responses for product data
      // Look for any JSON in the page that contains product info
      const pageJsonData = await this.page!.evaluate(() => {
        // Find all script tags with JSON content
        const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
        const jsonBlocks: any[] = [];
        
        scripts.forEach(script => {
          try {
            const text = script.textContent || '';
            if (text.includes('price') || text.includes('PMC') || text.includes('product')) {
              const parsed = JSON.parse(text);
              jsonBlocks.push(parsed);
            }
          } catch {
            // Not valid JSON
          }
        });
        
        return jsonBlocks;
      });
      
      if (pageJsonData && pageJsonData.length > 0) {
        logger.info(`[Polymed] Found ${pageJsonData.length} JSON blocks in page`);
        for (const data of pageJsonData) {
          const extracted = this.extractProductsFromNextData(data);
          if (extracted.length > 0) {
            logger.info(`[Polymed] Extracted ${extracted.length} products from JSON block`);
            products.push(...extracted);
          }
        }
        if (products.length > 0) {
          return products;
        }
      }
      
      // Strategy 3: Fall back to DOM scraping with improved selectors
      logger.info('[Polymed] Falling back to DOM scraping...');
      
      // Get product URLs from links
      const productLinks = await this.page!.$$('a[href*="/de/product/"]');
      logger.info(`[Polymed] Found ${productLinks.length} product links`);
      
      const seenUrls = new Set<string>();
      
      for (const link of productLinks) {
        try {
          const href = await link.getAttribute('href');
          if (!href || seenUrls.has(href)) continue;
          seenUrls.add(href);
          
          const text = await link.textContent();
          const cleanText = (text || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
          if (cleanText.length < 3) continue;
          
          // Extract PMC code from URL
          const codeMatch = href.match(/-(\d{5,7})(?:\?|$|\/)/);
          const articleCode = codeMatch ? codeMatch[1] : '';
          
          // For price, we'll need to fetch the product page
          // For now, add with price 0 and fetch later if needed
          if (articleCode) {
            products.push({
              articleCode,
              productName: cleanText,
              price: 0, // Will be fetched from product page
              currency: 'CHF',
              catalogUrl: new URL(href, this.loginUrl).href,
            });
            logger.info(`[Polymed] Found: ${cleanText.substring(0, 40)}... | PMC: ${articleCode}`);
          }
        } catch {
          // Skip errors
        }
      }
      
      // If we have products but no prices, try to fetch prices from product pages
      if (products.length > 0 && products.every(p => p.price === 0)) {
        logger.info('[Polymed] Fetching prices from product pages...');
        for (const product of products.slice(0, 10)) { // Limit to first 10 to avoid timeout
          if (product.catalogUrl) {
            try {
              const details = await this.getProductDetails(product.catalogUrl);
              if (details && details.price > 0) {
                product.price = details.price;
                logger.info(`[Polymed] Got price for ${product.articleCode}: CHF ${product.price}`);
              }
            } catch {
              // Skip price fetch errors
            }
          }
        }
      }

    } catch (error) {
      logger.error('[Polymed] Error parsing search results:', error);
    }

    return products;
  }
  
  private extractProductsFromNextData(data: any): PolymedPriceData[] {
    const products: PolymedPriceData[] = [];
    
    try {
      // Recursively search for product data in the Next.js data structure
      const findProducts = (obj: any, depth: number = 0): void => {
        if (depth > 10 || !obj) return;
        
        if (Array.isArray(obj)) {
          for (const item of obj) {
            findProducts(item, depth + 1);
          }
          return;
        }
        
        if (typeof obj !== 'object') return;
        
        // Look for product-like objects
        // Common patterns: { pmcCode, price, name } or { articleNumber, unitPrice, description }
        if (obj.pmcCode || obj.articleNumber || obj.productCode) {
          const product: PolymedPriceData = {
            articleCode: String(obj.pmcCode || obj.articleNumber || obj.productCode || ''),
            productName: obj.name || obj.description || obj.title || '',
            price: parseFloat(obj.price || obj.unitPrice || obj.basePrice || 0) || 0,
            currency: 'CHF',
            catalogUrl: obj.url || obj.link || undefined,
            gtin: obj.gtin || obj.ean || undefined,
            pharmacode: obj.pharmacode || obj.pmcCode || undefined,
          };
          
          if (product.articleCode || product.productName) {
            products.push(product);
          }
          return;
        }
        
        // Recurse into nested objects
        for (const key of Object.keys(obj)) {
          findProducts(obj[key], depth + 1);
        }
      };
      
      findProducts(data);
      
    } catch (error) {
      logger.error('[Polymed] Error extracting products from Next.js data:', error);
    }
    
    return products;
  }

  private parsePrice(priceText: string): number {
    if (!priceText) return 0;
    
    const cleaned = priceText
      .replace(/[CHF€$£]/gi, '')
      .replace(/\s+/g, '')
      .replace(/'/g, '')
      .replace(/,/g, '.')
      .trim();
    
    const match = cleaned.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  async getProductDetails(productUrl: string): Promise<PolymedPriceData | null> {
    try {
      if (!this.isLoggedIn) {
        logger.info('[Polymed] Not logged in, cannot get product details');
        return null;
      }

      await this.page!.goto(productUrl, { waitUntil: 'networkidle' });
      await this.delay(1500); // Wait for React hydration
      
      // Extract PMC code from URL
      const urlCodeMatch = productUrl.match(/-(\d{5,7})(?:\?|$|\/)/);
      const urlArticleCode = urlCodeMatch ? urlCodeMatch[1] : '';

      // Strategy 1: Try to extract from Next.js __NEXT_DATA__
      const nextData = await this.page!.evaluate(() => {
        try {
          const nextDataScript = document.querySelector('#__NEXT_DATA__');
          if (nextDataScript) {
            return JSON.parse(nextDataScript.textContent || '{}');
          }
          return null;
        } catch {
          return null;
        }
      });
      
      if (nextData) {
        const products = this.extractProductsFromNextData(nextData);
        if (products.length > 0) {
          const product = products[0];
          logger.info(`[Polymed] Extracted from Next.js data: ${product.productName} = CHF ${product.price}`);
          product.catalogUrl = productUrl;
          if (!product.articleCode && urlArticleCode) {
            product.articleCode = urlArticleCode;
          }
          return product;
        }
      }

      // Strategy 2: Try to find product data in script tags
      const productData = await this.page!.evaluate(() => {
        // Look for structured product data in script tags or data attributes
        const scripts = Array.from(document.querySelectorAll('script'));
        for (let i = 0; i < scripts.length; i++) {
          const text = scripts[i].textContent || '';
          // Look for price patterns in JSON
          const priceMatch = text.match(/"(?:price|unitPrice|basePrice)"[:\s]*([0-9.]+)/);
          const nameMatch = text.match(/"(?:name|title|description)"[:\s]*"([^"]+)"/);
          
          if (priceMatch && nameMatch) {
            return {
              price: parseFloat(priceMatch[1]),
              name: nameMatch[1],
            };
          }
        }
        
        // Try to find price in any visible element
        const allText = document.body.textContent || '';
        const chfMatch = allText.match(/CHF\s*([\d',\.]+)/);
        if (chfMatch) {
          const priceStr = chfMatch[1].replace(/'/g, '').replace(/,/g, '.');
          return { price: parseFloat(priceStr) || 0, name: '' };
        }
        
        return null;
      });
      
      let price = 0;
      let name = '';
      
      if (productData) {
        price = productData.price || 0;
        name = productData.name || '';
        if (price > 0) {
          logger.info(`[Polymed] Found price from page data: CHF ${price}`);
        }
      }

      // Strategy 3: DOM-based extraction as fallback
      if (!name) {
        const nameEl = await this.page!.$('h1, [class*="Title"], [class*="ProductName"]');
        name = nameEl ? ((await nameEl.textContent()) ?? '').trim() : '';
      }

      // Extract additional identifiers
      const pageContent = await this.page!.textContent('body') ?? '';
      
      let pharmacode: string | undefined;
      const pharmacodeMatch = pageContent.match(/(?:Pharmacode|Pharma-Code|PMC-Code)[:\s]*(\d{5,7})/i);
      if (pharmacodeMatch) {
        pharmacode = pharmacodeMatch[1];
      }

      let gtin: string | undefined;
      const gtinMatch = pageContent.match(/(?:GTIN|EAN|Barcode)[:\s]*(\d{13})/i);
      if (gtinMatch) {
        gtin = gtinMatch[1];
      }

      let packInfo: string | undefined;
      const packMatch = pageContent.match(/(\d+\s*(?:Stk|Stück|ml|g|kg|Tabletten|Kapseln|Ampullen|Beutel|Flaschen))/i);
      if (packMatch) {
        packInfo = packMatch[1];
      }

      return {
        articleCode: urlArticleCode,
        productName: name,
        price,
        currency: 'CHF',
        catalogUrl: productUrl,
        pharmacode,
        gtin,
        packInfo,
      };

    } catch (error) {
      logger.error('[Polymed] Error getting product details:', error);
      return null;
    }
  }

  /**
   * Fetch product metadata directly from Polymed API.
   * This method bypasses DOM scraping and calls the internal API endpoint.
   * Note: Polymed API does not return prices - use Galexis for price lookups.
   */
  async getProductMetadataByPmcCode(pmcCode: string): Promise<PolymedProductMetadata | null> {
    try {
      if (!this.isLoggedIn) {
        logger.info('[Polymed] Not logged in, cannot get product metadata');
        return null;
      }

      // Call the Polymed API directly using authenticated session
      const apiUrl = `https://shop.polymed.ch/api/products/${pmcCode}/de`;
      
      const response = await this.page!.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
            },
          });
          if (!res.ok) {
            return { error: `HTTP ${res.status}` };
          }
          return await res.json();
        } catch (e: any) {
          return { error: e.message };
        }
      }, apiUrl);

      if (response.error) {
        logger.info(`[Polymed] API error for PMC ${pmcCode}: ${response.error}`);
        return null;
      }

      // Extract GTIN from codes array
      let gtin: string | undefined;
      if (response.codes && Array.isArray(response.codes)) {
        const gtinEntry = response.codes.find((c: any) => 
          c.codeType === 'gtin' || c.codeType === 'gtin_pmc' || c.codeType === 'ean'
        );
        if (gtinEntry) {
          gtin = gtinEntry.code;
        }
      }

      // Extract pack info from name or properties
      let packInfo: string | undefined;
      const name = response.productText?.name || '';
      const packMatch = name.match(/(\d+\s*(?:Stk|Stück|ml|g|kg|Tabletten|Kapseln|Ampullen|Beutel|Flaschen|Tabletts))/i);
      if (packMatch) {
        packInfo = packMatch[1];
      }

      // Build catalog URL
      const slugName = name.toLowerCase()
        .replace(/[äÄ]/g, 'a').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const catalogUrl = `https://shop.polymed.ch/de/product/${slugName}-${pmcCode}`;

      // Build image URL if available
      let imageUrl: string | undefined;
      if (response.productPreviewImage) {
        imageUrl = `https://shop.polymed.ch/api/get_product_image/auto/auto/${response.productPreviewImage}?square=1`;
      }

      const metadata: PolymedProductMetadata = {
        pmcCode: String(response.pmcCode || pmcCode),
        pharmacode: String(response.pmcCode || pmcCode), // PMC code can be used as pharmacode
        gtin,
        productName: name,
        description: response.productText?.description?.replace(/<[^>]*>/g, '') || undefined,
        packInfo,
        showPrice: response.showPrice === true,
        catalogUrl,
        imageUrl,
      };

      logger.info(`[Polymed] Fetched metadata for PMC ${pmcCode}: ${metadata.productName}${gtin ? ` (GTIN: ${gtin})` : ''}`);
      return metadata;

    } catch (error) {
      logger.error(`[Polymed] Error fetching metadata for PMC ${pmcCode}:`, error);
      return null;
    }
  }

  /**
   * Batch fetch product metadata for multiple PMC codes.
   * Returns a map of pmcCode -> metadata.
   */
  async getProductMetadataBatch(pmcCodes: string[]): Promise<Map<string, PolymedProductMetadata>> {
    const results = new Map<string, PolymedProductMetadata>();
    
    for (const pmcCode of pmcCodes) {
      const metadata = await this.getProductMetadataByPmcCode(pmcCode);
      if (metadata) {
        results.set(pmcCode, metadata);
      }
      // Small delay between requests
      await this.delay(500);
    }
    
    return results;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.initialize();
      
      logger.info('[Polymed] Testing connection...');
      await this.page!.goto(this.loginUrl, { waitUntil: 'networkidle' });
      
      const title = await this.page!.title();
      
      if (title.toLowerCase().includes('polymed') || title.toLowerCase().includes('shop')) {
        return {
          success: true,
          message: `Connection successful. Page title: ${title}`,
        };
      }

      return {
        success: true,
        message: `Connection established, but page may have unexpected content. Title: ${title}`,
      };

    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection failed',
      };
    }
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.isLoggedIn = false;
    logger.info('[Polymed] Browser closed');
  }

  getSessionCookies(): Cookie[] {
    return this.sessionCookies;
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }
}

export function createPolymedClient(
  username: string,
  password: string,
  loginUrl?: string
): PolymedBrowserClient {
  return new PolymedBrowserClient({
    username,
    password,
    loginUrl,
  });
}
