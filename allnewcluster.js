const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { updateProduct, updateDataProduct } = require("./utils");
const path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const { GoogleSpreadsheet } = require("google-spreadsheet");

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox"],
  executablePath: executablePath(),
};
const allnewcluster = async (mpns) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
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
  const get_bhphotovideo = async function ({ page, data: source }) {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source;
      await page.goto(
        `https://www.bhphotovideo.com/c/search?q=${text}&sts=ma`,
        {
          waitUntil: "networkidle2",
        }
      );
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
      if (products.length > 0) {
        link1 = `https://www.bhphotovideo.com${products[0]}`;
        await page.goto(link1, {
          waitUntil: "networkidle2",
        });
        price = await page.evaluate(() => {
          let el = document.querySelector('div[data-selenium="pricingPrice');
          return el ? el.innerText : "";
        });
        in_stock = await page.evaluate(() => {
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
        in_stock = in_stock == "In Stock";
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
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.adorama.com/l/?searchinfo=${text}`, {
        waitUntil: "networkidle2",
      });
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
          waitUntil: "networkidle2",
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
  const get_barcodesinc = async function ({ page, source }) {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto("https://www.barcodesinc.com/search.htm?PA03770-B615", {
        waitUntil: "networkidle2",
      });
      await page.waitForSelector(
        "#global-header > div.search-area > form > input.searchfield"
      );

      await page.evaluate(
        () =>
          (document.querySelector(
            "#global-header > div.search-area > form > input.searchfield"
          ).value = "")
      );
      await page.type(
        "#global-header > div.search-area > form > input.searchfield",
        text
      );
      await page.waitForSelector(
        "#global-header > div.search-area > form > input.searchbutton"
      );

      await page.click(
        "#global-header > div.search-area > form > input.searchbutton"
      );

      await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//p[contains(text(),"We could not find a product to match your search criteria.")]'
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
      if (!not_found) {
        let products = await page.$$eval(
          "#partstable > tbody > tr",
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("td:nth-child(2) > span.modelname > a") &&
                tr
                  .querySelector("td:nth-child(2) > span.modelname > a")
                  .innerText.replace(")", "")
                  .split("(")[1] ==
                  (typeof text == "string" ? text.toUpperCase() : text)
              ) {
                objresult["price"] = tr.querySelector("td.pricecell > span")
                  ? tr.querySelector("td.pricecell > span").innerText
                  : "";
                objresult["name"] = tr.querySelector(
                  "td:nth-child(2) > span.modelname > a > b"
                )
                  ? tr.querySelector("td:nth-child(2) > span.modelname > a > b")
                      .innerText
                  : "";
                objresult["link"] = tr.querySelector(
                  "td:nth-child(2) > span.modelname > a"
                )
                  ? tr
                      .querySelector("td:nth-child(2) > span.modelname > a")
                      .getAttribute("href")
                  : "";
                objresult["in_stock"] = tr.querySelector(
                  "td:nth-child(2) > div.search-instock > span.message-instock"
                )
                  ? tr.querySelector(
                      "td:nth-child(2) > div.search-instock > span.message-instock"
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
          updateDataProduct("Adorama", data);
        } else {
          price = await page.evaluate(() => {
            let el = document.querySelector(
              "#addtocart-top > div > div:nth-child(1) > div > div.cost.price > span:nth-child(2)"
            );
            return el ? el.innerText : "";
          });
          stock = await page.evaluate(() => {
            let el = document.querySelector("div.instock");
            return el ? el.innerText : "";
          });
          h1 = await page.evaluate(() => {
            let el = document.querySelector("h1");
            return el ? el.innerText : "";
          });
          link1 = await page.url();
          in_stock = price ? stock == "In Stock" : true;
          data = {
            source: source,
            link: link1,
            title: h1,
            price: price,
            in_stock: in_stock,
          };
          if (h1.includes(text) && price) {
            console.log(data);
            updateDataProduct("Adorama", data);
          } else {
            console.log(empty_data);
            updateDataProduct("Adorama", empty_data);
          }
        }
      } else {
        console.log(empty_data);
        updateDataProduct("Adorama", empty_data);
      }
    } else {
      return null;
    }
  };
  for (let m = 0; m < mpns.length; module++) {
    let source = mpns[m];
    if (source) {
      cluster.queue(source, get_bhphotovideo);
      cluster.queue(source, get_adorama);
      cluster.queue(source, get_barcodesinc);
    }
  }
  let response = await axios.post(
    "http://103.49.239.195/update_with_mpns",
    { mpns: mpns },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  await cluster.idle();
  await cluster.close();
};

module.exports = {
  allnewcluster,
};
