const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { optimizePage, updateDataProduct } = require("./utils");
const path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const { GoogleSpreadsheet } = require("google-spreadsheet");

const PUPPETEER_OPTIONS = {
  headless: false,
  args: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-first-run",
    "--no-sandbox",
    "--no-zygote",
    "--proxy-server=dc.smartproxy.com:10000",
  ],
  executablePath: executablePath(),
};
const bsrcluster = async (keyword) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 5,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    retryLimit: 10,
    retryDelay: 30000,
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
  // We don't define a task and instead use own functions
  const extract_departments = async function (source) {
    const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    const page = await browser.newPage();
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });

    // await page.authenticate({ username: "spb4pudldd", password: "2selBrep0w0TmcgL5Y" });

    let products = [];
    let get_counter = async () => {
      let [counter_el] = await page.$x(
        '//*[@id="search"]/span[@data-component-type="s-result-info-bar"]/div/h1/div/div[1]/div/div/span[1]'
      );
      if (counter_el) {
        let counter = await page.evaluate(
          (counter_el) => counter_el.innerText,
          counter_el
        );

        const max = counter.includes(" of ")
          ? counter
              .split(" of ")[1]
              .replace("over", "")
              .replace("results for", "")
              .replace(",", "")
              .trim()
          : counter.split(" results for ")[0].replace(",", "").trim();
        console.log("MAX RESULT: ", max);
        return counter;
      } else {
        return null;
      }
    };
    let get_products = async () => {
      let results = await page.$$eval("h2 > a", (trs) => {
        return trs.map((tr) => {
          let objresult = {};
          objresult["name"] = tr.querySelector("span").innerText;
          objresult["link"] = tr.getAttribute("href");
          return objresult;
        });
      });
      let [curr_page_el] = await page.$x(
        "//span[contains(@aria-label,'Current page')]"
      );
      let curr_page = 1;
      if (curr_page_el) {
        curr_page = await page.evaluate(
          (curr_page_el) => curr_page_el.textContent,
          curr_page_el
        );
      }
      console.log(curr_page);
      for (let a = 0; a < results.length; a++) {
        products.push({
          ...results[a],
          idx: a,
          curr_page: curr_page,
          dep: "",
        });
      }
      let [next_page_el] = await page.$x("//a[contains(text(),'Next')]");

      if (next_page_el) {
        let next_page = await page.evaluate(
          (next_page_el) => next_page_el.getAttribute("href"),
          next_page_el
        );
        console.log(next_page);
        await page.goto(`https://www.amazon.com${next_page}`, {
          waitUntil: "domcontentloaded",
        });
        await get_products();
      }
    };
    let extract_pages = async (start = null, last = null) => {
      let max_counter = await get_counter();
      console.log(max_counter);
      if (parseInt(max_counter) > 500) {
        if (start == null && last == null) {
          for (let r = 0; r < 11; r++) {
            await page.goto(
              `https://www.amazon.com/s?k=${keyword}&rh=n%3A${text}%2Cp_n_availability%3A2661601011%2Cp_36%3A${
                r * 10000 ? r * 10000 : ""
              }-${(r + 1) * 10000 == 100000 ? "" : (r + 1) * 10000}&dc`,
              {
                waitUntil: "domcontentloaded",
              }
            );

            await extract_pages(r * 10000, (r + 1) * 10000);
          }
        } else {
          for (let r = 0; r < 1; r++) {
            let space = (last - start) / 2;
            await page.goto(
              `https://www.amazon.com/s?k=${keyword}&rh=n%3A${text}%2Cp_n_availability%3A2661601011%2Cp_36%3A${
                start + r * space
              }-${start + r * space + space}&dc`,
              {
                waitUntil: "domcontentloaded",
              }
            );

            await extract_pages(start + r * space, start + r * space + space);
          }
        }
      } else {
        await get_products();
      }
    };
    await optimizePage(page);
    let categories = ["1064954", "172282", "16310091"];
    for (let c = 0; c < categories.length; c++) {
      await page.goto(
        `https://www.amazon.com/s?k=${keyword}&rh=n%3A${categories[c]}%2Cp_n_availability%3A2661601011&dc`,
        {
          waitUntil: "domcontentloaded",
        }
      );

      await extract_pages();
    }

    await browser.close();
    for (let p = 0; p < products.length; p++) {
      cluster.queue(products[p]["link"], extract_page);
    }
  };
  const extract_page = async function ({ page, data: source }) {
    let text = typeof source == "string" ? source.trim() : source.toString();
    let clean_text = text.split("ref=")[0];
    let asin_src = clean_text.split("/")[3];
    let check_url = `https://cheapr.my.id/amazon_product/?search=${asin_src}`;
    console.log(check_url);
    let response = await axios.get(check_url);
    let result = await response.data.results;
    let crawl = false;
    if (result.length > 0) {
      if (result[0]["manufacturer"] == "") {
        crawl = true;
      }
    }
    if (result.length < 1 || crawl) {
      await optimizePage(page);
      await page.authenticate({
        username: "spb4pudldd",
        password: "2selBrep0w0TmcgL5Y",
      });
      await page.goto(`https://www.amazon.com${clean_text}`, {
        waitUntil: "domcontentloaded",
      });
      let h1 = "";
      let [h1_el] = await page.$x('//*[@id="productTitle"]');
      if (h1_el) {
        h1 = await page.evaluate((h1_el) => h1_el.innerText, h1_el);
      }

      let make = "";
      let [make_el] = await page.$x(
        "//*[starts-with(text(),' Brand')]//following-sibling::*"
      );

      let [make_el2] = await page.$x(
        "//*[starts-with(text(),'Brand')]//following-sibling::*"
      );
      let [make_el3] = await page.$x(
        "//*[starts-with(text(),'Brand')]//parent::td/following-sibling::*"
      );
      if (make_el) {
        make = await page.evaluate((make_el) => make_el.innerText, make_el);
      } else if (make_el2) {
        make = await page.evaluate((make_el2) => make_el2.innerText, make_el2);
      } else if (make_el3) {
        make = await page.evaluate((make_el3) => make_el3.innerText, make_el3);
      }

      let model = "";
      let [model_el] = await page.$x(
        "//*[contains(text(),'Model Name')]//following-sibling::*"
      );
      if (model_el) {
        model = await page.evaluate((model_el) => model_el.innerText, model_el);
      }
      let mpn = "";
      let [mpn_el] = await page.$x(
        "//*[contains(text(),'Item model number')]//following-sibling::*"
      );
      if (mpn_el) {
        mpn = await page.evaluate((mpn_el) => mpn_el.innerText, mpn_el);
      }
      let asin = "";
      let [asin_el] = await page.$x(
        "//*[contains(text(),'ASIN')]//following-sibling::*"
      );
      if (asin_el) {
        asin = await page.evaluate((asin_el) => asin_el.innerText, asin_el);
      }
      let manufacturer = "";
      let [manufacturer_el] = await page.$x(
        "//*[starts-with(text(),' Manufacturer')]//following-sibling::*"
      );
      let [manufacturer_el2] = await page.$x(
        "//*[starts-with(text(),'Manufacturer')]//following-sibling::*"
      );
      let [manufacturer_el3] = await page.$x(
        "//*[starts-with(text(),'Manufacturer')]//parent::td//following-sibling::*"
      );
      if (manufacturer_el) {
        manufacturer = await page.evaluate(
          (manufacturer_el) => manufacturer_el.innerText,
          manufacturer_el
        );
      } else if (manufacturer_el2) {
        manufacturer = await page.evaluate(
          (manufacturer_el2) => manufacturer_el2.innerText,
          manufacturer_el2
        );
      } else if (manufacturer_el3) {
        manufacturer = await page.evaluate(
          (manufacturer_el3) => manufacturer_el3.innerText,
          manufacturer_el3
        );
      }
      let price = "";
      let [price_el] = await page.$x(
        '//*[@id="corePrice_feature_div"]//descendant::span[@class="a-offscreen"]'
      );
      if (price_el) {
        price = await page.evaluate((price_el) => price_el.innerText, price_el);
      }
      let display_price = "";
      let [display_price_el] = await page.$x(
        '//*[@id="corePriceDisplay_desktop_feature_div"]//descendant::span[@class="a-offscreen"]'
      );
      if (display_price_el) {
        display_price = await page.evaluate(
          (display_price_el) => display_price_el.innerText,
          display_price_el
        );
      }
      let show_price = "";
      if (price) {
        show_price = price;
      } else if (display_price) {
        show_price = display_price;
      }
      let best = [];
      let bsr_els = await page.$x(
        "//*[contains(text(),'Best Sellers Rank')]//following-sibling::td/span/span"
      );
      for (let n = 0; n < bsr_els.length; n++) {
        let text = await page.evaluate(
          (bsr_el) => bsr_el.innerText,
          bsr_els[n]
        );
        let ranks = text.split(" in ");
        let rank = ranks[0].replace("#", "").replace(",", "").trim();
        let rank_text = ranks[1].split("(")[0].trim();
        best.push({ rank: parseInt(rank), category: { name: rank_text } });
      }
      let url = await page.url();
      let data = {
        title: h1,
        amazonbsr: best,
        make: make,
        manufacturer: manufacturer,
        model: model,
        mpn: mpn,
        asin: asin,
        price: show_price,
        url: url,
      };
      console.log(data);
      await axios.post("https://cheapr.my.id/amazon_product/", data, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  };
  let response = await axios.get(
    "https://cheapr.my.id/scraping_status/?search=bsr&format=json"
  );
  let result = await response.data.results;
  if (result.length > 0) {
    let data = result[0];
    if (data["status"] != "RUNNING") {
      await extract_departments();
      await axios.patch(`https://cheapr.my.id/scraping_status/${data["pk"]}/`, {
        status: "COMPLETED",
      });
    }
  }

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  bsrcluster,
};
