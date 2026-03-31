const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.goto('http://localhost:3000');
  await page.click('button[data-flow="my-bookings"]');
  await page.waitForTimeout(500);
  
  const info = await page.evaluate(() => {
    const el = document.getElementById('flow-my-bookings');
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    const cardEl = el.querySelector('.card');
    const cardStyle = cardEl ? window.getComputedStyle(cardEl) : null;
    const cardRect = cardEl ? cardEl.getBoundingClientRect() : null;
    
    return {
      el: { display: style.display, opacity: style.opacity, visibility: style.visibility, rect },
      card: { display: cardStyle?.display, opacity: cardStyle?.opacity, visibility: cardStyle?.visibility, rect: cardRect },
      html: el.outerHTML
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
