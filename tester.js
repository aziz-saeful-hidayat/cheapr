const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { updateProduct, updateDataProduct } = require("./utils");
const e = require("express");
const iPhone = KnownDevices["iPhone X"];

const PUPPETEER_OPTIONS = {
  headless: true,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
  // userDataDir: "./user_data",
};

const check_match = (make, title) => {
  let match = undefined;
  if (make && title) {
    let symbol = ["symbol", "motorola", "zebra"];
    let honeywell = ["intermec", "honeywell", "datamax-o'neil", "datamax"];
    let hp = ["samsung", "hp", "hewlett", "datalogic"];
    let fargo = ["datacard", "fargo"];
    let fireye = ["fireye", "companyfireye"];
    let canon = ["canon", "canon international"];
    let tsc = ["tsc", "tsc america"];
    let star = ["star", "star micronics"];
    let code = ["code", "code corporation"];
    if (!make) {
      match = null;
    } else if (make.toLowerCase() in symbol) {
      let found = false;
      symbol.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in honeywell) {
      let found = false;
      honeywell.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in hp) {
      let found = false;
      hp.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in fargo) {
      let found = false;
      fargo.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in fireye) {
      let found = false;
      fireye.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in canon) {
      let found = false;
      canon.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in tsc) {
      let found = false;
      tsc.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in star) {
      let found = false;
      star.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in code) {
      let found = false;
      code.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (make.toLowerCase() in code) {
      let found = false;
      code.forEach((s) => {
        if (` ${title.toLowerCase().includes(` ${s}`)} `) {
          found = True;
        }
      });
      match = found;
    } else if (` ${title.lower()} `.includes(` ${make.lower()}`)) {
      match = True;
    } else {
      match = False;
    }
  }
  return match;
};

const tester = async function () {
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./user_data",
  });
  const page = await browser.newPage();
  const source = "S30A-4011CA";
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto("https://www.barcodesinc.com/search.htm?PA03770-B615", {
      waitUntil: "domcontentloaded",
    });
    await checkBlock(page);
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

    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await checkBlock(page);
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
          link: `https://www.barcodesinc.com${link1}`,
          title: h1,
          price: price,
          in_stock: in_stock,
        };
        console.log(data);
        updateDataProduct("Barcodes Inc", data);
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
          updateDataProduct("Barcodes Inc", data);
        } else {
          console.log(empty_data);
          updateDataProduct("Barcodes Inc", empty_data);
        }
      }
    } else {
      console.log(empty_data);
      updateDataProduct("Barcodes Inc", empty_data);
    }

    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Radwell");
    await browser.close();
  }
};

module.exports = {
  tester,
};
