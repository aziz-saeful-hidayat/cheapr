const axios = require("axios");
const fs = require("fs");
const csvParser = require("csv-parser");
const needle = require("needle");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const jsdom = require("jsdom");
const dns = require("dns");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const async = require("async");

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(promiseFactory, retryCount, first, delay) {
  try {
    if (!first) {
      await sleep(delay);
    }
    return await promiseFactory();
  } catch (error) {
    if (retryCount <= 0) {
      throw error;
    }
    return await retry(promiseFactory, retryCount - 1, false, delay);
  }
}

const updateDataProduct = function (site, data) {
  if (data) {
    updateProduct(
      site,
      data["source"],
      data["price"],
      data["in_stock"],
      data["title"],
      data["link"]
    );
  }
};
const updateProduct = function (site, mpn, price, in_stock, title, url) {
  let dec_price = price
    ? parseFloat(price.replace("$", "").replace(",", "").trim())
    : null;
  const data = {
    site: site,
    mpn: mpn.toString(),
    price: dec_price,
    in_stock: in_stock,
    title: title,
    url: url,
  };
  axios
    .post("https://cheapr.my.id/update_product", data, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((response) => response.data)
    .then((data) => {
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};

const optimizePage = async (page) => {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setRequestInterception(true);

  page.on("request", (req) => {
    if (
      req.resourceType() == "stylesheet" ||
      req.resourceType() == "font" ||
      req.resourceType() == "image"
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });
};
const sendSlack = function (channel, text) {
  const data = {
    channel: channel,
    text: text,
  };
  axios
    .post("https://cheapr.my.id/send_slack", data, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((response) => response.data)
    .then((data) => {
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};
module.exports = {
  updateProduct,
  updateDataProduct,
  optimizePage,
  sendSlack,
  retry,
  sleep,
};
