import { chromium, Browser, BrowserContext, Page, Cookie } from 'playwright';
import { encryptCredential, decryptCredential } from '../utils/encryption';

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

    console.log('[Polymed] Initializing browser...');
    
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
    console.log('[Polymed] Browser initialized');
  }

  async restoreSession(encryptedSession: string): Promise<boolean> {
    try {
      const sessionJson = decryptCredential(encryptedSession);
      if (!sessionJson) {
        console.log('[Polymed] Could not decrypt session');
        return false;
      }
      const session: PolymedSession = JSON.parse(sessionJson);
      
      const sessionAge = Date.now() - new Date(session.lastLogin).getTime();
      const maxSessionAge = 24 * 60 * 60 * 1000;
      
      if (sessionAge > maxSessionAge) {
        console.log('[Polymed] Session expired, need to re-login');
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
        console.log('[Polymed] Session restored successfully');
        this.isLoggedIn = true;
        return true;
      }
      
      console.log('[Polymed] Session invalid, need to re-login');
      return false;
    } catch (error) {
      console.error('[Polymed] Error restoring session:', error);
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

      console.log('[Polymed] Navigating to login page...');
      await this.page!.goto(this.loginUrl, { waitUntil: 'networkidle' });
      await this.delay(1000);

      // Polymed has login form that may be collapsed - look for reveal button
      const loginRevealButton = await this.page!.$('button:has-text("Hier gehts zum Login"), button:has-text("Login"), [class*="login"] button');
      if (loginRevealButton) {
        console.log('[Polymed] Clicking to reveal login form...');
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

      console.log('[Polymed] Filling login form...');
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
        
        console.log('[Polymed] Login successful');
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

      console.log('[Polymed] Login failed:', errorMessage);
      return {
        success: false,
        message: errorMessage,
      };

    } catch (error: any) {
      console.error('[Polymed] Login error:', error);
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

      console.log(`[Polymed] Searching for code: ${code}`);
      
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
      
      console.log(`[Polymed] Found ${products.length} products for code: ${code}`);
      
      return {
        success: true,
        products,
        totalResults: products.length,
        searchQuery: code,
      };

    } catch (error: any) {
      console.error('[Polymed] Search error:', error);
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
      // Polymed uses CSS modules with hashed class names like styles_productCard__g2_eE
      const productCards = await this.page!.$$('[class*="productCard"], .product-card, .product-item, [class*="ProductCard"], article');
      
      if (productCards.length > 0) {
        for (const card of productCards) {
          try {
            // Title is in h4.PolymedTitle or div with title class
            const nameEl = await card.$('h4, [class*="title"] h4, [class*="label"], [class*="Title"], [class*="name"]');
            // PMC-Code follows pattern: <span>PMC-Code: </span><span>CODE</span>
            const codeSpans = await card.$$('span');
            let articleCode = '';
            for (let i = 0; i < codeSpans.length - 1; i++) {
              const text = await codeSpans[i].textContent();
              if (text?.includes('PMC-Code') || text?.includes('Art.') || text?.includes('Artikel')) {
                articleCode = (await codeSpans[i + 1].textContent()) ?? '';
                break;
              }
            }
            // Product link
            const linkEl = await card.$('a[href*="/product/"], a[href*="/artikel/"], a[href*="/de/"]');
            // Image
            const imgEl = await card.$('img');
            
            // Price - try multiple strategies
            let priceText = '';
            
            // Strategy 1: Look for price class
            const priceEl = await card.$('[class*="price"], [class*="Price"], [class*="Preis"]');
            if (priceEl) {
              priceText = (await priceEl.textContent()) ?? '';
            }
            
            // Strategy 2: Look for CHF pattern in the card text
            if (!priceText || !priceText.includes('CHF')) {
              const cardText = await card.textContent() ?? '';
              const chfMatch = cardText.match(/CHF\s*([\d',\.]+)/i);
              if (chfMatch) {
                priceText = chfMatch[0];
              }
            }
            
            // Strategy 3: Look for any element containing currency
            if (!priceText || this.parsePrice(priceText) === 0) {
              const allSpans = await card.$$('span, div, p');
              for (const el of allSpans) {
                const text = await el.textContent() ?? '';
                if (text.includes('CHF') || /^\d+[.,]\d{2}$/.test(text.trim())) {
                  priceText = text;
                  break;
                }
              }
            }

            const name = nameEl ? (await nameEl.textContent()) ?? '' : '';
            const catalogUrl = linkEl ? (await linkEl.getAttribute('href')) ?? '' : '';
            const imageUrl = imgEl ? (await imgEl.getAttribute('src')) ?? '' : '';

            if (name || articleCode) {
              const price = this.parsePrice(priceText);
              
              products.push({
                articleCode: articleCode.trim(),
                productName: name.trim(),
                price,
                currency: 'CHF',
                catalogUrl: catalogUrl ? new URL(catalogUrl, this.loginUrl).href : undefined,
                imageUrl: imageUrl || undefined,
              });
            }
          } catch (e) {
            // Skip individual card errors
          }
        }
      }

      // Fallback: try to find products by looking for product links
      if (products.length === 0) {
        const productLinks = await this.page!.$$('a[href*="/de/product/"]');
        
        for (const link of productLinks) {
          try {
            const href = await link.getAttribute('href');
            const text = await link.textContent();
            
            if (text && href) {
              // Extract PMC code from URL (last segment before product name)
              const codeMatch = href.match(/-(\d+)$/);
              const articleCode = codeMatch ? codeMatch[1] : '';
              
              // Try to get price from parent container
              let price = 0;
              try {
                const parent = await link.evaluateHandle(el => el.closest('[class*="Card"], [class*="item"], article, div'));
                if (parent) {
                  const parentText = await parent.evaluate(el => el?.textContent ?? '') ?? '';
                  const chfMatch = parentText.match(/CHF\s*([\d',\.]+)/i);
                  if (chfMatch) {
                    price = this.parsePrice(chfMatch[0]);
                  }
                }
              } catch {
                // Ignore price extraction errors
              }
              
              products.push({
                articleCode,
                productName: text.trim(),
                price,
                currency: 'CHF',
                catalogUrl: new URL(href, this.loginUrl).href,
              });
            }
          } catch (e) {
            // Skip individual link errors
          }
        }
      }

    } catch (error) {
      console.error('[Polymed] Error parsing search results:', error);
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
        console.log('[Polymed] Not logged in, cannot get product details');
        return null;
      }

      await this.page!.goto(productUrl, { waitUntil: 'networkidle' });
      await this.delay(500);

      const nameEl = await this.page!.$('h1, .product-title, .product-name, [class*="Title"], [class*="ProductName"]');
      const priceEl = await this.page!.$('.price, .product-price, [class*="price"], [class*="Price"], [class*="Preis"]');
      const codeEl = await this.page!.$('.article-code, .product-code, .sku, [class*="ArticleCode"], [class*="PMC"]');
      const descEl = await this.page!.$('.description, .product-description, [class*="Description"]');
      const imgEl = await this.page!.$('.product-image img, .main-image img, [class*="ProductImage"] img');

      const name = nameEl ? (await nameEl.textContent()) ?? '' : '';
      let priceText = priceEl ? (await priceEl.textContent()) ?? '' : '';
      const code = codeEl ? (await codeEl.textContent()) ?? '' : '';
      const description = descEl ? (await descEl.textContent()) ?? '' : '';
      const imageUrl = imgEl ? (await imgEl.getAttribute('src')) ?? '' : '';

      // If no price found with selectors, try to find CHF pattern in page
      if (!priceText || this.parsePrice(priceText) === 0) {
        const pageContent = await this.page!.textContent('body') ?? '';
        const chfMatch = pageContent.match(/CHF\s*([\d',\.]+)/i);
        if (chfMatch) {
          priceText = chfMatch[0];
          console.log(`[Polymed] Found price via text pattern: ${priceText}`);
        }
      }

      if (!name && !priceText) {
        return null;
      }

      // Extract additional identifiers from the page content
      const pageContent = await this.page!.textContent('body') ?? '';
      
      // Extract Pharmacode (7-digit Swiss pharmacy code)
      // Common patterns: "Pharmacode: 1234567", "Pharmacode 1234567", "Pharma-Code: 1234567"
      let pharmacode: string | undefined;
      const pharmacodeMatch = pageContent.match(/(?:Pharmacode|Pharma-Code|Pharmacode)[:\s]*(\d{5,7})/i);
      if (pharmacodeMatch) {
        pharmacode = pharmacodeMatch[1];
        console.log(`[Polymed] Extracted pharmacode: ${pharmacode}`);
      }

      // Extract GTIN/EAN (13-digit barcode)
      // Common patterns: "GTIN: 7680123456789", "EAN: 7680123456789", "Barcode: 7680123456789"
      let gtin: string | undefined;
      const gtinMatch = pageContent.match(/(?:GTIN|EAN|Barcode)[:\s]*(\d{13})/i);
      if (gtinMatch) {
        gtin = gtinMatch[1];
        console.log(`[Polymed] Extracted GTIN: ${gtin}`);
      }

      // Extract manufacturer/brand
      let manufacturer: string | undefined;
      const manufacturerMatch = pageContent.match(/(?:Hersteller|Manufacturer|Marke|Brand)[:\s]*([^\n\r,]+)/i);
      if (manufacturerMatch) {
        manufacturer = manufacturerMatch[1].trim();
      }

      // Extract pack info (e.g., "100 Stk", "500ml", "30 Tabletten")
      let packInfo: string | undefined;
      const packMatch = pageContent.match(/(\d+\s*(?:Stk|Stück|ml|g|kg|Tabletten|Kapseln|Ampullen|Beutel|Flaschen))/i);
      if (packMatch) {
        packInfo = packMatch[1];
      }

      return {
        articleCode: code.trim(),
        productName: name.trim(),
        description: description.trim() || undefined,
        price: this.parsePrice(priceText),
        currency: 'CHF',
        catalogUrl: productUrl,
        imageUrl: imageUrl ? new URL(imageUrl, this.loginUrl).href : undefined,
        pharmacode,
        gtin,
        manufacturer,
        packInfo,
      };

    } catch (error) {
      console.error('[Polymed] Error getting product details:', error);
      return null;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.initialize();
      
      console.log('[Polymed] Testing connection...');
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
    console.log('[Polymed] Browser closed');
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
