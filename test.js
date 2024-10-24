const puppeteer = require("puppeteer");

async function openFiveTabs() {
  try {
    // Launch the browser
    const browser = await puppeteer.launch({
      headless: false, // Set to true if you don't want to see the browser UI
      defaultViewport: null,
    });

    // List of URLs to open
    const urls = [
      //   "http://localhost:3000/editor/slides",
      //   "http://localhost:3000/editor/sample_1.md",
      "http://localhost:3000/editor/sample_50.md",
      //   "http://localhost:3000/editor/sample_51.md",
      //   "http://localhost:3000/editor/sample_52.md",
    ];

    // Function to open a single URL in a new tab
    async function openTab(url) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      console.log(`Opened: ${url}`);
      return page;
    }

    // Open all URLs concurrently
    const pagePromises = urls.map((url) => openTab(url));
    await Promise.all(pagePromises);

    console.log("All tabs opened successfully");

    // Uncomment the next line if you want the script to keep the browser open
    // await new Promise(() => {});
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

openFiveTabs();
