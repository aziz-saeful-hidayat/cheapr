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
    // retryLimit: 10,
    // retryDelay: 5000,
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

    page.setDefaultTimeout(0);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(`https://shopping.google.com/`, {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector('input[name="q"]');
    await page.type('input[name="q"]', text);

    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await page.waitForSelector("div.sh-pr__product-results > div");
    let products = await page.$$eval(
      "div.sh-pr__product-results > div",
      (trs) => {
        return trs.map((tr) => {
          let link = "";
          if (
            tr.querySelector(
              "div:nth-child(2) > div.sh-dgr__content > div:nth-child(5) > div > a"
            ) &&
            tr
              .querySelector(
                "div:nth-child(2) > div.sh-dgr__content > div:nth-child(5) > div > a"
              )
              .innerText.includes("Compare prices")
          ) {
            link = tr
              .querySelector(
                "div:nth-child(2) > div.sh-dgr__content > span > a"
              )
              .getAttribute("href");
          }
          return link;
        });
      }
    );
    console.log("Products found");
    products = products.filter((link) => {
      return link != "";
    });
    console.log(products);
    if (products.length > 0) {
      link1 = products[0];
      console.log(link1);
      await page.goto(`https://www.google.com${link1}`, {
        waitUntil: "networkidle2",
      });
    }
  });

  for (let i = 0; i < mpns.length; i++) {
    let source = mpns[i];
    cluster.queue(source);
  }
  // many more pages

  //   await cluster.idle();
  //   await cluster.close();
};

module.exports = {
  googleshopping,
};
