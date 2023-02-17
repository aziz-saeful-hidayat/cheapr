const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { updateProduct, optimizePage } = require("./utils");

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
};

const site_name = "B&H";

const bhphotovideo = async () => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 3,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    retryLimit: 10,
    retryDelay: 300000,
    timeout: 100000,
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
    await optimizePage(page);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });

    let text = typeof source == "string" ? source.trim() : source;
    await page.goto(`https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`, {
      waitUntil: "networkidle2",
    });
    await checkBlock();
    let products = await page.$$eval(
      'div[data-selenium="miniProductPage"]',
      (trs, text) => {
        return trs.map((tr) => {
          let link = "";
          if (
            tr
              .querySelector(
                'div > div[data-selenium="miniProductPageDescription"] > div[data-selenium="miniProductPageProductSkuInfo"]'
              )
              .innerText.includes("MFR #") &&
            tr
              .querySelector(
                'div > div[data-selenium="miniProductPageDescription"] > div[data-selenium="miniProductPageProductSkuInfo"]'
              )
              .innerText.replace(/(\r\n|\n|\r)/gm, "")
              .split("MFR #")[1]
              .trim() ==
              (typeof text == "string" ? text.trim() : text.toString())
          ) {
            link = tr
              .querySelector(
                'div > div[data-selenium="miniProductPageDescription"] > h3 > a'
              )
              .getAttribute("href");
          }
          return link;
        });
      },
      text
    );
    products = products.filter((link) => {
      return link != "";
    });
    let link1 = "";
    let price = "";
    let h1 = "";
    let in_stock = "";
    console.log("found", products.length, text);
    if (products.length > 0) {
      link1 = `https://www.bhphotovideo.com${products[0]}`;
      await page.goto(link1, {
        waitUntil: "networkidle2",
      });
      await checkBlock(link1);
      price = await page.evaluate(() => {
        let el = document.querySelector(
          'div[data-selenium="pricingContainer"]'
        );
        return el ? el.innerText : "";
      });
      in_stock = await page.evaluate(() => {
        let el = document.querySelector('div[data-selenium="stockInfo"]');
        return el ? el.innerText : "";
      });
      h1 = await page.evaluate(() => {
        let el = document.querySelector("h1");
        return el ? el.innerText : "";
      });
    }
    let data = {
      source: source,
      link: link1,
      title: h1,
      price: price,
      in_stock: in_stock,
    };
    if (price) {
      in_stock = in_stock.includes("In Stock");
      data["in_stock"] = in_stock;
      console.log(data);
      updateProduct("B&H", source, price, in_stock, h1, link1);
    } else {
      console.log(data);
      updateProduct("B&H", source, null, true, null, null);
    }
  });

  let response = await axios.get(
    "https://cheapr.my.id/price/?in_stock=&ordering=updated_at&product__mpn=&site__name=B%26H",
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  let jsonData = await response.data;
  console.log(site_name, jsonData.length);
  let result = jsonData["results"];
  for (let i = 0; i < result.length; i++) {
    let source = result[i]["product"]["mpn"];
    cluster.queue(source);
  }
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  bhphotovideo,
};
