const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { updateProduct } = require("./utils");
const iPhone = KnownDevices["iPhone X"];

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
};

const googleshopping = async (mpns) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 1,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    retryLimit: 10,
    retryDelay: 30000,
  });
  cluster.on("taskerror", (err, data, willRetry) => {
    if (willRetry) {
      console.warn(
        `Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`
      );
    } else {
      console.error(`Failed to crawl ${data}: ${err.message}`);
    }
  });
  await cluster.task(async ({ page, data: source }) => {
    console.log(source);
    const checkBlock = async () => {
      let block = await page.evaluate(() => {
        let el = document.querySelector("#px-captcha");
        return el ? true : false;
      });
      let [blocked] = await page.$x(
        '//*[contains(text(),"Before we continue")]'
      );
      if (block || blocked) {
        throw new Error("Blocked");
      }
    };
    page.setDefaultTimeout(0);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    await page.emulate(iPhone);
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(`https://shopping.google.com/`, {
      waitUntil: "networkidle2",
    });
    await checkBlock();
    await page.waitForSelector('input[name="q"]');
    // await page.evaluate(
    //   (text) => (document.querySelector('input[name="q"]').value = text),
    //   text
    // );
    await page.type('input[name="q"]', text);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(100000);
  });

  for (let i = 0; i < mpns.length; i++) {
    let source = mpns[i];
    cluster.queue(source);
  }
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  googleshopping,
};
