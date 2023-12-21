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

const ups = async (tracks) => {
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
      `https://www.ups.com/track?loc=en_US&tracknum=${text}&requester=ST/trackdetails`,
      {
        waitUntil: "networkidle2",
      }
    );
    // await page.goto(`https://www.ups.com/track?loc=en_US&requester=ST/`, {
    //   waitUntil: "networkidle2",
    // });
    // await page.waitForSelector("#stApp_trackingNumber");
    // await page.type("#stApp_trackingNumber", text);

    // await page.click("#stApp_btnTrack");
    // await page.waitForNavigation({ waitUntil: "networkidle2" });
    // get tracking number
    let [not_found] = await page.$x(
      '//span[contains(text(),"Please provide a tracking number.")]'
    );
    if (!not_found) {
      await page.waitForSelector("#stApp_trackingNumber");
      let trackingNumber = await page.evaluate(() => {
        let el = document.querySelector("#stApp_trackingNumber");
        return el ? el.innerText : "";
      });
      // get estimated delivery
      await page.waitForSelector("track-details-estimation");
      let estDelivery = await page.evaluate(() => {
        let el = document.querySelector("track-details-estimation");
        return el ? el.innerText : "";
      });
      let status = "Delivered";
      if (!estDelivery.includes("Delivered")) {
        await page.waitForSelector("tr.ups-progress_current_row");
        status = await page.evaluate(() => {
          let el = document.querySelector("tr.ups-progress_current_row > td");
          return el ? el.innerText.trim() : "";
        });
      }
      // get status delivery

      // get address
      await page.waitForSelector("#stApp_txtAddress");
      let address = await page.evaluate(() => {
        let el = document.querySelector("#stApp_txtAddress");
        return el ? el.innerText : "";
      });
      // get address country
      await page.waitForSelector("#stApp_txtCountry");

      let country = await page.evaluate(() => {
        let el = document.querySelector("#stApp_txtCountry");
        return el ? el.innerText : "";
      });

      // click view details
      // await page.waitForNavigation({ waitUntil: "networkidle2" });
      await page.waitForSelector("#st_App_View_Details");
      await page.evaluate(() => {
        let el = document.querySelector("#st_App_View_Details");
        el.click();
      });
      // click tab Shipment Progress
      await page.waitForSelector("#tab_1");
      await page.click("#tab_1");

      // get time activity
      await page.waitForSelector("#stApp_activitiesdateTime0");
      let activityDateTime = await page.evaluate(() => {
        let el = document.querySelector("#stApp_activitiesdateTime0");
        return el ? el.innerText.replace(/(\r\n|\n|\r)/gm, " ") : "";
      });

      // get milestone and location
      await page.waitForSelector("#stApp_milestoneActivityLocation0");
      let milestone = await page.evaluate(() => {
        let el = document.querySelector("#stApp_milestoneActivityLocation0");
        return el ? el.innerText : "";
      });

      // get last updated
      await page.waitForSelector(
        "#upsAng2Modal > div > div > div.modal-body.ups-form_wrap > div > div.ups-group"
      );
      let lastUpdated = await page.evaluate(() => {
        let el = document.querySelector(
          "#upsAng2Modal > div > div > div.modal-body.ups-form_wrap > div > div.ups-group"
        );
        return el ? el.innerText.replace("Last Updated:", "") : "";
      });

      if (trackingNumber !== "") {
        milestone = milestone.split("\n");
        let milestone_name = milestone[0];
        let location = milestone[1];

        await axios.post(
          "https://cheapr.my.id/tracking/",
          {
            tracking_number: trackingNumber,
            carrier: "UPS",
            last_updated: lastUpdated,
            activity_date: activityDateTime,
            milestone_name: milestone_name,
            location: location,
            est_delivery: estDelivery,
            address: address + " " + country,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        console.log("tracking Number => " + trackingNumber);
        console.log("est delivery  => " + estDelivery);
        console.log("address  => " + address + " " + country);
        console.log("activity Date  => " + activityDateTime);
        console.log("milestone name  => " + milestone_name);
        console.log("location  => " + location);
        console.log("last Updated  => " + lastUpdated);

        console.log(trackingNumber, status, address + ", " + country);
      } else {
        console.log("tracking Number not found!!!");
      }
    }
  });
  // let tracks = ["1Z7V38144202758397", "1Z7V38144234218553"];
  for (let i = 0; i < tracks.length; i++) {
    let data = tracks[i]["data"];
    for (let j = 0; j < data.length; j++) {
      if (data[j].startsWith("1Z")) {
        cluster.queue(data[j]);
      }
    }
  }

  await cluster.idle();
  await cluster.close();
};

module.exports = {
  ups,
};
