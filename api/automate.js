import core from 'puppeteer-core';
import chrome from 'chrome-aws-lambda';

// This is the main automation function
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Only POST requests are allowed' });
    }

    const { patientName, patientAge } = req.body;

    if (!patientName || !patientAge) {
        return res.status(400).json({ message: 'Patient name and age are required.' });
    }

    let browser = null;

    try {
        // --- 1. LAUNCH THE BROWSER ---
const executablePath = await chrome.executablePath || '/usr/bin/google-chrome';

browser = await core.launch({
    args: [...chrome.args, '--disable-software-rasterizer', '--disable-dev-shm-usage'],
    executablePath,
    headless: true, // Always true on server
    ignoreHTTPSErrors: true,
});


        const page = await browser.newPage();
            
        // --- 2. GO TO THE NCD PORTAL HOME PAGE ---
        // IMPORTANT: Replace with the actual URL after you log in
        const targetUrl = 'https://ncd.mohfw.gov.in/portal/#/home';
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // --- 3. SEARCH FOR THE PATIENT ---
        const searchInputSelector = 'input[placeholder="Enter name, phone"]';
        await page.waitForSelector(searchInputSelector);
        await page.type(searchInputSelector, patientName, { delay: 100 });
        await page.keyboard.press('Enter');
            
        // Wait for search results to load
        await page.waitForTimeout(3000); // Wait 3 seconds for results

        // --- 4. FIND AND CLICK THE CORRECT PATIENT BY AGE ---
        const searchResults = await page.$$eval('.card-body', (cards, age) => {
            // This code runs inside the browser
            const patientInfo = cards.map(card => {
                const nameElement = card.querySelector('h5'); // Assuming name is in h5
                const detailsElement = card.querySelector('p'); // Assuming age is in p
                    
                if (nameElement && detailsElement) {
                    const name = nameElement.innerText;
                    const ageText = detailsElement.innerText.match(/Age:\s*(\d+)/);
                    const patientAge = ageText ? ageText[1] : null;
                    return { name, age: patientAge };
                }
                return null;
            }).filter(p => p !== null);
                
            // Find the index of the correct patient
            const correctPatientIndex = patientInfo.findIndex(p => p.age == age);
            return correctPatientIndex;

        }, patientAge);

        if (searchResults === -1) {
            throw new Error(`Patient with age ${patientAge} not found in search results.`);
        }

        // Click on the correct patient card
        const patientCardSelector = `.card-body:nth-child(${searchResults + 1})`;
        await page.click(patientCardSelector);

        // --- 5. CONFIRMATION ---
        // Wait for the next page to load (e.g., the screening page)
        await page.waitForTimeout(3000); 

        // Send a success response
        res.status(200).json({ message: `Successfully found and clicked on ${patientName}.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'An error occurred during automation.' });
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
}
