const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const {
  optimizePage,
  updateDataProduct,
  checkBlock,
  updateProduct,
} = require("./utils");
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
const allnewcluster = async (mpns) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 4,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    // retryLimit: 2,
    // retryDelay: 30000,
    timeout: 60000,
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
  const get_bhphotovideo = async function ({ page, data: source }) {
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    await optimizePage(page);

    if (source) {
      let text = typeof source == "string" ? source.trim() : source;
      await page.goto(
        `https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`,
        {
          waitUntil: "domcontentloaded",
        }
      );
      await checkBlock(page);
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
      let in_stock = true;
      let stock = "";
      if (products.length > 0) {
        link1 = `https://www.bhphotovideo.com${products[0]}`;
        await page.goto(link1, {
          waitUntil: "domcontentloaded",
        });
        await checkBlock(page);
        price = await page.evaluate(() => {
          let el = document.querySelector('div[data-selenium="pricingPrice');
          return el ? el.innerText : "";
        });
        stock = await page.evaluate(() => {
          let el = document.querySelector('span[data-selenium="stockStatus"]');
          return el ? el.innerText : "";
        });
        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
      }
      let empty_data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      let data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      if (price) {
        in_stock = stock == "In Stock";
        data["in_stock"] = in_stock;
        console.log(data);
        updateDataProduct("B&H", data);
      } else {
        console.log(empty_data);
        updateDataProduct("B&H", empty_data);
      }
    }
  };
  const get_adorama = async function ({ page, data: source }) {
    await optimizePage(page);
    if (source) {
      await optimizePage(page);
      await page.authenticate({
        username: "cheapr",
        password: "Cheapr2023!",
      });
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.adorama.com/`, {
        waitUntil: "domcontentloaded",
      });
      await checkBlock(page);
      await page.waitForSelector("#searchDesktop > input");
      await page.evaluate(
        (text) =>
          (document.querySelector("#searchDesktop > input").value = text),
        text
      );
      await page.evaluate(() => {
        let el = document.querySelector("#searchDesktop > button");
        el.click();
      });
      await page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await checkBlock(page);
      let [not_found] = await page.$x(
        '//h1[contains(text(),"Sorry, we didn")]'
      );
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
      let in_stock = true;
      if (products.length > 0) {
        link1 = products[0];
        await page.goto(link1, {
          waitUntil: "domcontentloaded",
        });
      }
      let empty_data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      let data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
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
        in_stock = price
          ? in_stock.includes("In Stock") &&
            in_stock.includes("Ships from Manufacturer")
          : true;
        data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        if (mpn.includes(text.replace("-", ""))) {
          console.log(data);
          updateDataProduct("Adorama", data);
        } else {
          console.log(empty_data);
          updateDataProduct("Adorama", empty_data);
        }
      } else {
        console.log(empty_data);
        updateDataProduct("Adorama", empty_data);
      }
    }
  };
  const get_barcodesinc = async function ({ page, data: source }) {
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    await optimizePage(page);
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();

      await page.goto(
        `https://www.barcodesinc.com/catalogsearch/result/?q=${text}`,
        {
          waitUntil: "networkidle2",
        }
      );
      await checkBlock(page);
      await page.waitForSelector("#search-spring-category-view");

      let products = await page.$x(
        '//section[@class="products list"]/div/main/article'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      let in_stock = true;
      let empty_data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      let data = {
        source: source,
        link: link1,
        title: h1,
        price: price,
        in_stock: in_stock,
      };
      if (products.length > 0) {
        await page.waitForSelector("#search-spring-category-view");
        let products = await page.$$eval(
          "#search-spring-category-view > section > div > main > article",
          (trs, text) => {
            return trs.map((tr) => {
              let sku = tr.querySelector(
                "div > div.product-item-info > a > span"
              )
                ? tr.querySelector("div > div.product-item-info > a > span")
                    .innerText
                : "";
              console.log(sku);
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("div > div.product-item-info > a > span") &&
                tr
                  .querySelector("div > div.product-item-info > a > span")
                  .innerText.replace("(", "")
                  .replace(")", "")
                  .trim() ==
                  (typeof text == "string" ? text.toUpperCase() : text)
              ) {
                objresult["price"] = tr.querySelector(
                  "div > div.product-item-actions > span.product-item-price > div > span > span > del > span"
                )
                  ? tr.querySelector(
                      "div > div.product-item-actions > span.product-item-price > div > span > span > del > span"
                    ).innerText
                  : "";
                objresult["name"] = tr.querySelector(
                  "div > div.product-item-info > a > h3"
                )
                  ? tr.querySelector("div > div.product-item-info > a > h3")
                      .innerText
                  : "";
                objresult["link"] = tr.querySelector(
                  "div > div.product-item-info > a"
                )
                  ? tr
                      .querySelector("div > div.product-item-info > a")
                      .getAttribute("href")
                  : "";
                objresult["in_stock"] = tr.querySelector(
                  "div > div.product-item-info > div.product-item-stock.in_stock > span"
                )
                  ? tr.querySelector(
                      "div > div.product-item-info > div.product-item-stock.in_stock > span"
                    ).innerText
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        products = products.filter((p) => {
          return p["price"] != "";
        });
        if (products.length > 0) {
          price = products[0]["price"];
          h1 = products[0]["name"];
          link1 = products[0]["link"];
          stock = products[0]["in_stock"];
          in_stock = price ? stock == "In Stock" : true;
          data = {
            source: source,
            link: link1,
            title: h1,
            price: price,
            in_stock: in_stock,
          };
          console.log(data);
          updateDataProduct("Barcodes Inc", data);
        } else {
          console.log("No Match Found");
          console.log(empty_data);
          updateDataProduct("Barcodes Inc", empty_data);
        }
      } else {
        console.log("Not Found");
        console.log(empty_data);
        updateDataProduct("Barcodes Inc", empty_data);
      }
    } else {
      return null;
    }
  };
  const get_radwell = async function ({ page, data: source }) {
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    await optimizePage(page);
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.radwell.com/en-US/Search/?q=${source}`, {
        waitUntil: "networkidle2",
      });
      let url = await page.url();
      const grabResult = async () => {
        let url = await page.url();
        let title = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
        let [price] = await page.$x(
          "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div/div/span/span"
        );
        let price_text = await page.evaluate(
          (price) => (price ? price.innerText : ""),
          price
        );
        if (title.includes(source) && price) {
          let stock = await page.$x(
            "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div//parent::div/div[5]/div/div[@class='stock instock']"
          );

          let in_stock = stock.length > 0;
          updateProduct("Radwell", source, price_text, in_stock, title, url);
        } else {
          updateProduct("Radwell", source, null, true, null, null);
        }
      };
      if (url.includes("/en-US/Buy/")) {
        await grabResult();
      } else {
        let result = [];
        let products = await page.$x('//*[@id="searchResults"]//h2');
        console.log(products.length);
        for (let r = 0; r < products.length; r++) {
          let product = products[r];
          let product_title = await page.evaluate(
            (product) => (product ? product.innerText : ""),
            product
          );
          let links = await product.$x(
            './/parent::div//parent::div/div[@class="btnBuyOpt"]/a[@href]'
          );
          const href = await (await links[0].getProperty("href")).jsonValue();
          if (product_title.trim() == source.trim()) {
            result.push(href);
          }
        }
        if (result.length > 0) {
          await page.goto(`${result[0]}`, {
            waitUntil: "networkidle2",
          });
          await grabResult();
        } else {
          updateProduct("Radwell", source, null, true, null, null);
        }
      }
    } else {
      return null;
    }
  };
  for (let m = 0; m < mpns.length; m++) {
    let source = mpns[m];
    if (source) {
      cluster.queue(source, get_bhphotovideo);
      cluster.queue(source, get_adorama);
      cluster.queue(source, get_barcodesinc);
      cluster.queue(source, get_radwell);
    }
  }

  await cluster.idle();
  await cluster.close();
  await axios.post(
    "https://cheapr.my.id/update_with_mpns",
    { mpns: mpns },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};

module.exports = {
  allnewcluster,
};
