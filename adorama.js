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

const site_name = "Adorama";
const checkStatus = async () => {
  let response_status = await axios.get(
    "https://cheapr.my.id/scraping_status/?search=adorama&format=json"
  );
  let result = await response_status.data.results;
  if (result.length > 0) {
    let data = result[0];
    if (data["status"] != "RUNNING") {
      await axios.patch(`https://cheapr.my.id/scraping_status/${data["pk"]}/`, {
        status: "RUNNING",
      });
    }
  }
};
const adorama = async () => {
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
    await page.authenticate({
      username: "user-cheapr-country-au",
      password: "Cheapr2023!",
    });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(`https://www.adorama.com/`, {
      waitUntil: "networkidle2",
    });
    await checkBlock();
    await page.waitForSelector("#searchDesktop > input");
    await page.evaluate(
      (text) => (document.querySelector("#searchDesktop > input").value = text),
      text
    );
    await page.evaluate(() => {
      let el = document.querySelector("#searchDesktop > button");
      el.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    await checkBlock();

    let [not_found] = await page.$x('//h1[contains(text(),"Sorry, we didn")]');
    let products = await page.$$eval(
      "#productGridPlaceholder > div > div.item-list.clear.style-is-list > div",
      (trs, text) => {
        return trs.map((tr) => {
          let link = "";
          if (
            tr.querySelector(
              "div.item-details > p.item-ids > i:nth-child(2)"
            ) &&
            tr
              .querySelector("div.item-details > p.item-ids > i:nth-child(2)")
              .innerText.includes("MFR:") &&
            tr
              .querySelector("div.item-details > p.item-ids > i:nth-child(2)")
              .innerText.replace(/(\r\n|\n|\r)/gm, "")
              .replace("MFR:", "")
              .trim() ==
              (typeof text == "string" ? text.trim() : text.toString())
          ) {
            link = tr.querySelector("a").getAttribute("href");
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
    if (products.length > 0) {
      link1 = products[0];
      await page.goto(link1, {
        waitUntil: "networkidle2",
      });
      await checkBlock();
    }

    let url = await page.url();
    if (!not_found && !url.includes("l/?searchinfo=")) {
      let mpn = await page.evaluate(() => {
        let el = document.querySelector(
          "#product-container > section > div.product-info-container.col1 > div.primary-info-sub.clear.cf > div.prod-id > i:nth-child(2) > span"
        );
        return el ? el.innerText.replace("-", "") : "";
      });
      price = await page.evaluate(() => {
        let el = document.querySelector("strong.your-price");
        return el ? el.innerText : "";
      });
      in_stock = await page.evaluate(() => {
        let el = document.querySelector("div.av-stock");
        return el ? el.innerText : "";
      });
      h1 = await page.evaluate(() => {
        let el = document.querySelector("h1 > span");
        return el ? el.innerText : "";
      });
      link1 = await page.url();
      let data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      in_stock = price
        ? in_stock.includes("In Stock") ||
          in_stock.includes("Ships from Manufacturer")
        : true;
      if (mpn.includes(text.replace("-", ""))) {
        console.log(data);
        updateProduct(site_name, source, price, in_stock, h1, link1);
      } else {
        updateProduct(site_name, source, null, true, null, null);
        console.log(data);
      }
    } else {
      let data = { source: source, link: "", title: "", price: "" };
      updateProduct(site_name, source, null, true, null, null);
      console.log(data);
    }
  });

  let response = await axios.post(
    "https://cheapr.my.id/get_mpns",
    { site: site_name },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  let jsonData = await response.data;
  console.log(site_name, jsonData.length);
  for (let i = 0; i < jsonData.length; i++) {
    let source = jsonData[i]["mpn"];
    cluster.queue(source);
  }
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  adorama,
};
