import chromium from '@sparticuz/chromium';
import core from 'puppeteer-core';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Only POST requests are allowed' });
    }

    const { patientName, patientAge } = req.body;
    if (!patientName || !patientAge) {
        return res.status(400).json({ message: 'Patient name and age are required.' });
    }

    let browser = null;

    try {
        // --- 1. LAUNCH THE BROWSER (using @sparticuz/chromium) ---
        browser = await core.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
            
        // --- 2. GO TO THE NCD PORTAL HOME PAGE ---
        // IMPORTANT: This URL must be the one you see AFTER you log in.
        const targetUrl = 'https://ncd.mohfw.gov.in/portal/#/home';
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // --- 3. SEARCH FOR THE PATIENT ---
        const searchInputSelector = 'input[placeholder="Enter name, phone"]';
        await page.waitForSelector(searchInputSelector, { timeout: 10000 }); // Wait up to 10s
        await page.type(searchInputSelector, patientName, { delay: 100 });
        await page.keyboard.press('Enter');
            
        await page.waitForTimeout(3000); // Wait for results

        // --- 4. FIND AND CLICK THE CORRECT PATIENT BY AGE ---
        // This part is complex and might need adjustment based on the actual HTML of the site.
        // We are assuming the search results appear in elements with the class '.card-body'
        const patientCardIndex = await page.evaluate((name, age) => {
            const cards = Array.from(document.querySelectorAll('.card-body')); // Adjust selector if needed
            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const nameElement = card.querySelector('h5'); // Adjust if name is in another tag
                const detailsText = card.innerText;
                    
                if (nameElement && nameElement.innerText.toLowerCase().includes(name.toLowerCase())) {
                    const ageMatch = detailsText.match(/Age:\s*(\d+)/);
                    if (ageMatch && ageMatch[1] == age) {
                        return i; // Return the index of the correct card
                    }
                }
            }
            return -1; // Not found
        }, patientName, patientAge);

        if (patientCardIndex === -1) {
            throw new Error(`Patient '${patientName}' with age ${patientAge} not found.`);
        }

        // Click on the correct patient card
        const allCards = await page.$$('.card-body');
        await allCards[patientCardIndex].click();

        await page.waitForTimeout(3000); // Wait for profile to load

        res.status(200).json({ message: `Successfully found and clicked on ${patientName}.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'An error occurred.' });
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
}
