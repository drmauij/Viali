import { PolymedBrowserClient } from '../server/services/polymedClient';
import { decryptCredential } from '../server/utils/encryption';

const ENCRYPTED_PASSWORD = 'f71267de9ebc045821ee0ccec8d0b1b3:b48b992e73e73b21c94510fb3f3c9d29';
const USERNAME = '800416';
const LOGIN_URL = 'https://shop.polymed.ch/de';

const TEST_ITEMS = [
  'Tubus 7',
  'Sauerstoff Maske Reservoir',
  'Perfusor Spritze',
  'Larynxmaske'
];

async function testPolymedSearch() {
  console.log('='.repeat(60));
  console.log('POLYMED SEARCH TEST - NON-MEDICATION ITEMS');
  console.log('='.repeat(60));
  console.log('');
  console.log('IMPORTANT: This is a READ-ONLY search test.');
  console.log('NO purchases or cart operations will be performed.');
  console.log('The Polymed client only has search capabilities.');
  console.log('');
  
  const password = decryptCredential(ENCRYPTED_PASSWORD);
  if (!password) {
    console.error('ERROR: Could not decrypt password');
    process.exit(1);
  }
  
  console.log(`Username: ${USERNAME}`);
  console.log(`Login URL: ${LOGIN_URL}`);
  console.log('');
  
  const client = new PolymedBrowserClient({
    username: USERNAME,
    password: password,
    loginUrl: LOGIN_URL
  });
  
  try {
    console.log('[1] Testing connection...');
    const connectionResult = await client.testConnection();
    console.log(`    Connection: ${connectionResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`    Message: ${connectionResult.message}`);
    console.log('');
    
    if (!connectionResult.success) {
      console.error('Connection test failed. Exiting.');
      await client.close();
      process.exit(1);
    }
    
    console.log('[2] Logging in...');
    const loginResult = await client.login();
    console.log(`    Login: ${loginResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`    Message: ${loginResult.message}`);
    console.log('');
    
    if (!loginResult.success) {
      console.error('Login failed. Exiting.');
      await client.close();
      process.exit(1);
    }
    
    console.log('[3] Searching for test items (READ-ONLY)...');
    console.log('');
    
    for (const item of TEST_ITEMS) {
      console.log('-'.repeat(50));
      console.log(`Searching: "${item}"`);
      console.log('-'.repeat(50));
      
      const searchResult = await client.searchByText(item);
      
      if (searchResult.success) {
        console.log(`Found ${searchResult.totalResults} result(s)`);
        
        if (searchResult.products.length > 0) {
          for (const product of searchResult.products.slice(0, 5)) {
            console.log('');
            console.log(`  Product: ${product.productName}`);
            console.log(`  Code: ${product.articleCode || 'N/A'}`);
            console.log(`  Price: ${product.price} ${product.currency}`);
            if (product.description) {
              console.log(`  Description: ${product.description.substring(0, 100)}...`);
            }
          }
        } else {
          console.log('  No products found for this search term');
        }
      } else {
        console.log(`  Search failed: ${searchResult.error}`);
      }
      
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('TEST COMPLETED - NO PURCHASES MADE');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('Test error:', error.message);
  } finally {
    console.log('');
    console.log('[4] Closing browser...');
    await client.close();
    console.log('    Browser closed');
  }
}

testPolymedSearch().catch(console.error);
