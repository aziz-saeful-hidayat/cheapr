const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer");
const axios = require("axios");
const { updateProduct } = require("./utils");
const path = require("path");
const creds = require(path.resolve(__dirname, "./cm-automation.json")); // the file saved above
const { GoogleSpreadsheet } = require("google-spreadsheet");

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox"],
  executablePath: executablePath(),
};
const allnewcluster = async () => {
  puppeteer.use(StealthPlugin());
  const doc = new GoogleSpreadsheet(
    "1FJbWE8ObEqcnJK-1QQ1iLzfOeQFPO891CKwUFJK_kUI"
  );
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  console.log(doc.title);
  const resSheet = doc.sheetsById["1771276982"];

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
  const get_bhphotovideo = async function ({ page, data: obj }) {
    const { source: source, idx: idx, resSheet: resSheet } = obj;
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
      let in_stock = "";
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
        resSheet.getCell(idx, 36).value = price;
        // resSheet.getCell(idx, 36).backgroundColor = {
        //   red: 0.81,
        //   green: 0.81,
        //   blue: 0.81,
        //   alpha: 1,
        // };
        // return data;
      } else {
        console.log(data);

        resSheet.getCell(idx, 36).value = "N/A";
        // resSheet.getCell(idx, 36).backgroundColor = {
        //   red: 1,
        //   green: 1,
        //   blue: 1,
        //   alpha: 1,
        // };
      }
    } else {
      console.log(null);

      resSheet.getCell(idx, 36).value = "";
      // resSheet.getCell(idx, 36).backgroundColor = {
      //   red: 1,
      //   green: 1,
      //   blue: 1,
      //   alpha: 1,
      // };
    }
    await retry(
      () => Promise.all([resSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
  };
  const get_adorama = async function ({ page, data: obj }) {
    const { source: source, idx: idx } = obj;
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
      let in_stock = "";
      if (products.length > 0) {
        link1 = products[0];
        await page.goto(link1, {
          waitUntil: "networkidle2",
        });
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
          ? in_stock.includes("In Stock") &&
            in_stock.includes("Ships from Manufacturer")
          : true;
        if (mpn.includes(text.replace("-", ""))) {
          console.log(data);
          resSheet.getCell(idx, 34).value = price;
          // resSheet.getCell(idx, 34).backgroundColor = {
          //   red: 0.81,
          //   green: 0.81,
          //   blue: 0.81,
          //   alpha: 1,
          // };
        } else {
          resSheet.getCell(idx, 34).value = "N/A";
          resSheet.getCell(idx, 34).backgroundColor = {
            red: 1,
            green: 1,
            blue: 1,
            alpha: 1,
          };
        }
      } else {
        resSheet.getCell(idx, 34).value = "N/A";
        resSheet.getCell(idx, 34).backgroundColor = {
          red: 1,
          green: 1,
          blue: 1,
          alpha: 1,
        };
      }
    } else {
      resSheet.getCell(idx, 34).value = "";
      resSheet.getCell(idx, 34).backgroundColor = {
        red: 1,
        green: 1,
        blue: 1,
        alpha: 1,
      };
    }
    await retry(
      () => Promise.all([resSheet.saveUpdatedCells()]),
      5,
      true,
      10000
    );
  };
  const get_barcodesinc = async function ({
    page,
    data: { source: source, idx: idx },
  }) {
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
          in_stock = products[0]["in_stock"];
          let data = {
            source: source,
            link: link1,
            title: h1,
            price: price,
            in_stock: in_stock,
          };
          in_stock = price ? in_stock == "In Stock" : true;
          data["in_stock"] = in_stock;
          return data;
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
            let el = document.querySelector("h1");
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
          in_stock = price ? in_stock == "In Stock" : true;
          data["in_stock"] = in_stock;
          if (h1.includes(text) && price) {
            return data;
          } else {
            return null;
          }
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  };
  const get_provantage = async function ({
    page,
    data: { source: source, idx: idx },
  }) {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto("https://www.provantage.com/", {
        waitUntil: "networkidle2",
      });

      await page.evaluate(
        () =>
          (document.querySelector(
            "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(2) > input[type=text]"
          ).value = "")
      );
      await page.type(
        "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(2) > input[type=text]",
        text
      );
      await page.waitForSelector(
        "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(3) > input[type=image]"
      );

      await page.click(
        "#TOP2 > tbody > tr > td.TOP > div.LEFT > div:nth-child(3) > input[type=image]"
      );

      await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//h3[contains(text(),"Sorry, No Products Were Found Matching Your Query")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      let url = await page.url();
      if (!not_found) {
        let products = await page.$$eval(
          'div[class="BOX5B"]',
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("p:nth-child(2)") &&
                tr
                  .querySelector("p:nth-child(2)")
                  .innerText.split("Part#")[1]
                  .trim() ==
                  (typeof text == "string"
                    ? text.toUpperCase()
                    : text.toString())
              ) {
                objresult["name"] = tr.querySelector("p:nth-child(1) > a")
                  ? tr.querySelector("p:nth-child(1) > a").innerText
                  : "";
                objresult["link"] = tr.querySelector("p:nth-child(1) > a")
                  ? tr.querySelector("p:nth-child(1) > a").getAttribute("href")
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        if (products.length > 0) {
          link1 = products[0]["link"];
          await page.goto(`https://www.provantage.com${link1}`, {
            waitUntil: "networkidle2",
          });
        }

        let [price_el] = await page.$x(
          "//td[@id='Gprice']//following-sibling::td[@class='DT1']"
        );
        let price = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          price_el
        );

        let [stock_el] = await page.$x(
          '//div[@class="BOXV"]/div[@class="BTA"][2]/b/nobr/a[@class="BT1"]/div[@class="BT1"]'
        );
        let stock = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          stock_el
        );
        in_stock = stock.includes("IN STOCK");

        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        if (!price) {
          await page.click("div.BOXV > div:nth-child(7) > a > div > nobr");
        }
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        return data;
      } else {
        return null;
      }
    } else {
      return null;
    }
  };
  const get_cdw = async function ({
    page,
    data: { source: source, idx: idx },
  }) {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto("https://www.cdw.com/", {
        waitUntil: "networkidle2",
      });

      await page.evaluate(
        () => (document.querySelector("#search-input").value = "")
      );
      await page.type("#search-input", text);
      await page.waitForSelector("#gh-header-button-search");

      await page.click("#gh-header-button-search");

      await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//span[contains(text(),"Uh-Oh! No Results Found.")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      if (!not_found) {
        let [price_el] = await page.$x('//meta[@itemprop="price"]');
        price = await page.evaluate(
          (element) => (element ? element.getAttribute("content") : ""),
          price_el
        );
        let [stock_el] = await page.$x(
          "//span[contains(text(),'Availability:')]//parent::div/span[2]"
        );
        let stock = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          stock_el
        );
        let [mpn_el] = await page.$x('//span[@itemprop="mpn"]');
        let mpn = await page.evaluate(
          (element) => (element ? element.textContent : ""),
          mpn_el
        );
        h1 = await page.evaluate(() => {
          let el = document.querySelector("h1");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        let in_stock = stock.includes("In Stock");
        let clean_source = source.replace("[^0-9a-zA-Z]+", "");
        let clean_mpn = mpn.replace("[^0-9a-zA-Z]+", "");

        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        if (clean_mpn == clean_source) {
          return data;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  };
  const get_radwell = async function ({
    page,
    data: { source: source, idx: idx },
  }) {
    if (source) {
      let text = typeof source == "string" ? source.trim() : source.toString();
      await page.goto(`https://www.radwell.com/en-US/Search/?q=${text}`, {
        waitUntil: "networkidle2",
      });

      // await page.evaluate(() => (document.querySelector("#q").value = ""));
      // await page.type("#q", text);
      // await page.waitForSelector("#basicsearch > div > button");
      // await page.evaluate(() => {
      //   let el = document.querySelector("#basicsearch > div > button");
      //   el.click();
      // });

      // await page.waitForNavigation({ waitUntil: "networkidle2" });

      let [not_found] = await page.$x(
        '//span[contains(text(),"We couldn\'t find your item. Try refining your search.")]'
      );
      let link1 = "";
      let price = "";
      let h1 = "";
      if (!not_found) {
        let products = await page.$$eval(
          "#searchResults > div",
          (trs, text) => {
            return trs.map((tr) => {
              let objresult = { name: "", price: "", link: "" };
              if (
                tr.querySelector("div:nth-child(4) > h2") &&
                tr.querySelector("div:nth-child(4) > h2").innerText.trim() ==
                  (typeof text == "string"
                    ? text.toUpperCase()
                    : text.toString())
              ) {
                objresult["name"] = tr.querySelector("div:nth-child(2) > h2")
                  ? tr.querySelector("div:nth-child(2) > h2").innerText
                  : "";
                objresult["link"] = tr.querySelector("div.btnBuyOpt > a")
                  ? tr.querySelector("div.btnBuyOpt > a").getAttribute("href")
                  : "";
              }
              return objresult;
            });
          },
          text
        );
        products = products.filter((p) => {
          return p["link"] != "";
        });
        if (products.length > 0) {
          link1 = products[0]["link"];
          await page.goto(`https://www.radwell.com${link1}`);
          await page.waitForTimeout(3000);
        }
        let [price_el] = await page.$x(
          "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div/div/span/span"
        );
        price = await page.evaluate(
          (element) => (element ? element.innerText : ""),
          price_el
        );
        let [stock_el] = await page.$x(
          "//h3[contains(text(),'Surplus Never Used Radwell Packaging')]//parent::div//parent::div/div[5]/div/div[@class='stock instock']"
        );
        let stock = await page.evaluate(
          (element) => (element ? true : false),
          stock_el
        );
        h1 = await page.evaluate(() => {
          let el = document.querySelector("div.productHdr");
          return el ? el.innerText : "";
        });
        link1 = await page.url();
        let data = {
          source: source,
          link: link1,
          title: h1,
          price: price,
          in_stock: stock,
        };
        if (price) {
          return data;
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  };

  const get_new_mpn = async function () {
    let rowCount = resSheet.rowCount;
    console.log(rowCount);
    let start = 459;
    let end = 460;
    await resSheet.loadCells(`H${start}:H${end}`);
    await resSheet.loadCells(`AG${start}:AL${end}`);
    for (let i = start; i < end; i++) {
      let source = resSheet.getCellByA1(`H${i}`).value;
      let price = resSheet.getCellByA1(`AG${i}`).value;
      console.log(source, price);
      if (source && !price) {
        cluster.queue(
          { source: source, idx: i, resSheet: resSheet },
          get_bhphotovideo
        );
        // cluster.queue({ source: source, idx: i }, get_adorama);
        // cluster.queue({source: source, idx: i}, get_barcodesinc)
        // cluster.queue({source: source, idx: i}, get_cdw)
        // cluster.queue({source: source, idx: i}, get_provantage)
        // cluster.queue({source: source, idx: i}, get_radwell)
      }
    }
    console.log("Completed");
  };
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loop() {
    while (true) {
      await get_new_mpn();
      await delay(100 * 1000);
    }
  }
  await loop();
  // many more pages

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  allnewcluster,
};
