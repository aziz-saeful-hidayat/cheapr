const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { updateProduct, updateDataProduct, checkBlock } = require("./utils");
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
  const source = "ZD4A042-301E00EZ";
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
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
            let sku = tr.querySelector("div > div.product-item-info > a > span")
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
                .trim() == (typeof text == "string" ? text.toUpperCase() : text)
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

    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Barcodesinc");
    await browser.close();
  }
};

module.exports = {
  tester,
};
