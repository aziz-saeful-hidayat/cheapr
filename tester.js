const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { updateProduct } = require("./utils");
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
    console.log(`https://www.radwell.com/en-US/Search/?q=${source}`);

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
