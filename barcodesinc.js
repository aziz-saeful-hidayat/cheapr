const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { updateProduct, optimizePage } = require("./utils");

const PUPPETEER_OPTIONS = {
  headless: true,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
};

const site_name = "Barcodes Inc";

const barcodesinc = async () => {
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
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
    await page.goto("https://www.barcodesinc.com/search.htm?PA03770-B615", {
      waitUntil: "networkidle2",
    });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.waitForSelector(
      "#global-header > div.search-area > form > input.searchfield"
    );
    await page.evaluate(
      (text) =>
        (document.querySelector(
          "#global-header > div.search-area > form > input.searchfield"
        ).value = text),
      text
    );
    await page.evaluate(() => {
      let el = document.querySelector(
        "#global-header > div.search-area > form > input.searchbutton"
      );
      el.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    await checkBlock(text);
    let [not_found] = await page.$x(
      '//p[contains(text(),"We could not find a product to match your search criteria.")]'
    );
    let link1 = "";
    let price = "";
    let h1 = "";
    let url = await page.url();
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
                "td:nth-child(2) > span.modelname > a"
              )
                ? tr.querySelector("td:nth-child(2) > span.modelname > a")
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
        in_stock = products[0]["in_stock"];
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        in_stock = price ? in_stock == "In Stock" : true;
        updateProduct(
          site_name,
          source,
          price,
          in_stock,
          h1,
          `https://www.barcodesinc.com${link1}`
        );
        console.log(data);
      } else {
        price = await page.evaluate(() => {
          let el = document.querySelector(
            "#addtocart-top > div > div:nth-child(1) > div > div.cost.price > span:nth-child(2)"
          );
          return el ? el.innerText : "";
        });
        in_stock = await page.evaluate(() => {
          let el = document.querySelector("div.instock");
          return el ? el.innerText : "";
        });
        h1 = await page.evaluate(() => {
          let el = document.querySelector("#product_info > h1");
          return el ? el.innerText : "";
        });

        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };

        if (h1.includes(text) && price) {
          link1 = await page.url();
          in_stock = price ? in_stock == "In Stock" : true;
          data["link1"] = link1;
          data["in_stock"] = in_stock;
          updateProduct(site_name, source, price, in_stock, h1, link1);
          console.log(data);
        } else {
          updateProduct(site_name, source, null, true, null, null);
          console.log(data);
        }
      }
    } else {
      let data = {
        source: source,
        link: "",
        title: "",
        price: "",
        in_stock: "",
      };
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
    let source = jsonData[i];
    cluster.queue(source);
  }
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  barcodesinc,
};
