const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { updateProduct } = require("./utils");
const iPhone = KnownDevices["iPhone X"];

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
  // userDataDir: "./user_data",
};

const tester = async function () {
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: executablePath(),
    userDataDir: "./ebay_data",
  });
  const page = await browser.newPage();
  const source = ["777563225800"];
  try {
    await page.setJavaScriptEnabled(true);
    await page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    console.log(`https://www.fedex.com/fedextrack/?trknbr=${source}&trkqual=`);

    await page.goto(
      `https://www.fedex.com/fedextrack/?trknbr=${source}&trkqual=`,
      {
        waitUntil: "networkidle2",
      }
    );
    // get id
    // await page.waitForNavigation({ waitUntil: "networkidle2" });
    await page.waitForSelector("#shipmentIdentifier");
    let id = await page.evaluate(() => {
      let el = document.querySelector("#shipmentIdentifier");
      return el ? el.innerText : "";
    });
    // get status delivery
    await page.waitForSelector("div.shipment-delivery-status");
    let status = await page.evaluate(() => {
      let el = document.querySelector("div.shipment-delivery-status");
      return el ? el.innerText : "";
    });
    // get destination
    await page.waitForSelector("div.shipment-status-progress-step");
    let destination = await page.$$eval(
      "div.shipment-status-progress-step",
      (elements) =>
        elements[elements.length - 1].querySelector("div > div:nth-child(4)")
          .textContent
    );
    await axios.post(
      "https://cheapr.my.id/tracking/",
      {
        tracking_number: id,
        carrier: "FedEx",
        last_updated: "",
        activity_date: "",
        milestone_name: "",
        status: stts,
        location: "",
        est_delivery: "",
        address: destination,
        src_address: addr,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    await browser.close();
  } catch (e) {
    console.log(e);
    console.log("Amazon Aziz Error");
    await browser.close();
  }
};

module.exports = {
  tester,
};
