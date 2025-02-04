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

const usps = async (tracks) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    // retryLimit: 10,
    // retryDelay: 50000,
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
    page.setDefaultTimeout(0);
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(
      `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${text}`,
      {
        waitUntil: "networkidle2",
      }
    );
    // get id
    await page.waitForSelector("span.tracking-number");
    let id = await page.evaluate(() => {
      let el = document.querySelector("span.tracking-number");
      return el ? el.innerText : "";
    });
    // get estimated delivery
    await page.waitForSelector("p.tb-status");
    let status = await page.evaluate(() => {
      let el = document.querySelector("p.tb-status");
      return el ? el.innerText : "";
    });
    // get destination
    // await page.waitForSelector("div.shipment-status-progress-step");
    // let destination = await page.$$eval(
    //   "div.shipment-status-progress-step",
    //   (elements) =>
    //     elements[elements.length - 1].querySelector("div > div:nth-child(4)")
    //       .textContent
    // );
    console.log(id, status);
    await axios.post(
      "https://cheapr.my.id/tracking/",
      {
        tracking_number: id,
        carrier: "USPS",
        last_updated: "",
        activity_date: "",
        milestone_name: status,
        location: "",
        est_delivery: "",
        address: "",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  });
  // let tracks = ["1Z7V38144202758397", "1Z7V38144234218553"];
  for (let i = 0; i < tracks.length; i++) {
    let data = tracks[i]["data"];
    for (let j = 0; j < data.length; j++) {
      if (!data[j].startsWith("1Z") && data[j].length >= 16) {
        cluster.queue(data[j]);
      }
    }
  }

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  usps,
};
