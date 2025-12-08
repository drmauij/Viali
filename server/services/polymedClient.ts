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

      const loginLink = await this.page!.$('a[href*="login"], button:has-text("Login"), a:has-text("Anmelden")');
      if (loginLink) {
        await loginLink.click();
        await this.page!.waitForLoadState('networkidle');
        await this.delay(500);
      }

      const usernameInput = await this.page!.$('input[name="email"], input[name="username"], input[type="email"], input#email, input#username');
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
      
      const searchInput = await this.page!.$('input[name="search"], input[name="q"], input[type="search"], input.search-input, input#search');
      
      if (!searchInput) {
        await this.page!.goto(SEARCH_URL, { waitUntil: 'networkidle' });
        await this.delay(500);
      }

      const currentSearchInput = await this.page!.$('input[name="search"], input[name="q"], input[type="search"], input.search-input, input#search');
      
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
      const productCards = await this.page!.$$('.product-card, .product-item, .product, [class*="product-box"], article[class*="product"]');
      
      if (productCards.length === 0) {
        const tableRows = await this.page!.$$('table tbody tr, .product-list tr, .search-results tr');
        
        for (const row of tableRows) {
          try {
            const nameEl = await row.$('td:nth-child(1), .product-name, .name');
            const codeEl = await row.$('td:nth-child(2), .product-code, .article-code, .code');
            const priceEl = await row.$('td:last-child, .price, .product-price');
            
            const name = nameEl ? await nameEl.textContent() : '';
            const code = codeEl ? await codeEl.textContent() : '';
            const priceText = priceEl ? await priceEl.textContent() : '';
            
            if (name && priceText) {
              const price = this.parsePrice(priceText);
              
              products.push({
                articleCode: (code || '').trim(),
                productName: (name || '').trim(),
                price,
                currency: 'CHF',
                catalogUrl: this.page!.url(),
              });
            }
          } catch (e) {
          }
        }
      } else {
        for (const card of productCards) {
          try {
            const nameEl = await card.$('.product-name, .name, h2, h3, .title, [class*="product-title"]');
            const codeEl = await card.$('.product-code, .article-code, .code, .sku, [class*="article"]');
            const priceEl = await card.$('.price, .product-price, [class*="price"]');
            const descEl = await card.$('.description, .product-description, p');
            const linkEl = await card.$('a[href*="product"], a[href*="artikel"]');
            const imgEl = await card.$('img');

            const name = nameEl ? (await nameEl.textContent()) ?? '' : '';
            const code = codeEl ? (await codeEl.textContent()) ?? '' : '';
            const priceText = priceEl ? (await priceEl.textContent()) ?? '' : '';
            const description = descEl ? (await descEl.textContent()) ?? '' : '';
            const catalogUrl = linkEl ? (await linkEl.getAttribute('href')) ?? '' : '';
            const imageUrl = imgEl ? (await imgEl.getAttribute('src')) ?? '' : '';

            if (name || code) {
              const price = this.parsePrice(priceText);
              
              products.push({
                articleCode: code.trim(),
                productName: name.trim(),
                description: description.trim() || undefined,
                price,
                currency: 'CHF',
                catalogUrl: catalogUrl ? new URL(catalogUrl, this.loginUrl).href : undefined,
                imageUrl: imageUrl ? new URL(imageUrl, this.loginUrl).href : undefined,
              });
            }
          } catch (e) {
          }
        }
      }

      if (products.length === 0) {
        const priceElements = await this.page!.$$('[class*="price"]');
        const titleElements = await this.page!.$$('h1, h2, h3, .title');
        
        if (priceElements.length > 0 && titleElements.length > 0) {
          const priceText = await priceElements[0].textContent();
          const titleText = await titleElements[0].textContent();
          
          if (priceText && titleText) {
            products.push({
              articleCode: '',
              productName: titleText.trim(),
              price: this.parsePrice(priceText),
              currency: 'CHF',
              catalogUrl: this.page!.url(),
            });
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

      const nameEl = await this.page!.$('h1, .product-title, .product-name');
      const priceEl = await this.page!.$('.price, .product-price, [class*="price"]');
      const codeEl = await this.page!.$('.article-code, .product-code, .sku');
      const descEl = await this.page!.$('.description, .product-description');
      const imgEl = await this.page!.$('.product-image img, .main-image img');

      const name = nameEl ? (await nameEl.textContent()) ?? '' : '';
      const priceText = priceEl ? (await priceEl.textContent()) ?? '' : '';
      const code = codeEl ? (await codeEl.textContent()) ?? '' : '';
      const description = descEl ? (await descEl.textContent()) ?? '' : '';
      const imageUrl = imgEl ? (await imgEl.getAttribute('src')) ?? '' : '';

      if (!name && !priceText) {
        return null;
      }

      return {
        articleCode: code.trim(),
        productName: name.trim(),
        description: description.trim() || undefined,
        price: this.parsePrice(priceText),
        currency: 'CHF',
        catalogUrl: productUrl,
        imageUrl: imageUrl ? new URL(imageUrl, this.loginUrl).href : undefined,
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
