const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { optimizePage } = require("./utils");
const iPhone = KnownDevices["iPhone X"];

const PUPPETEER_OPTIONS = {
  headless: false,
  args: ["--no-sandbox", "--proxy-server=dc.smartproxy.com:10000"],
  executablePath: executablePath(),
  // userDataDir: "./user_data",
};

const alltrackers = async (pk, tracks) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    // retryLimit: 3,
    // retryDelay: 5000,
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
  const ups = async function ({ page, data: source }) {
    await optimizePage(page);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
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
    await page.waitForSelector("#stApp_trackingNumber");
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
      if (estDelivery.includes("Pick up")) {
        await page.waitForSelector("tr.ups-progress_current_row");
        status = await page.evaluate(() => {
          let el = document.querySelector("tr.ups-progress_current_row > td");
          return el ? el.innerText.trim() : "";
        });
      } else if (!estDelivery.includes("Delivered")) {
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
      let get_status = (text) => {
        if (text == "Delivered") {
          return "D";
        } else if (text == "Returned") {
          return "I";
        } else if (text == "Label Created") {
          return "N";
        } else {
          return "T";
        }
      };
      if (trackingNumber !== "") {
        milestone = milestone.split("\n");
        let milestone_name = milestone[0];
        let location = milestone[1];
        let status = get_status(milestone_name);
        await axios.post(
          "https://cheapr.my.id/tracking/",
          {
            tracking_number: trackingNumber,
            carrier: "UPS",
            last_updated: lastUpdated,
            status: status,
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
    } else {
      await axios.post(
        "https://cheapr.my.id/tracking/",
        {
          tracking_number: text,
          carrier: "UPS",
          last_updated: "",
          status: "N",
          activity_date: "",
          milestone_name: "",
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
    }
  };
  const fedex = async function ({ page, data: source }) {
    await optimizePage(page);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(
      `https://www.fedex.com/fedextrack/?trknbr=${text}&trkqual=`,
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
    console.log(id, status, destination);
    let get_status = (text) => {
      if (text == "Delivered") {
        return "D";
      } else if (text == "Delivery exception") {
        return "I";
      } else if (text == "Delay") {
        return "I";
      } else if (text == "Package Received By FedEx") {
        return "N";
      } else {
        return "T";
      }
    };
    let stts = get_status(status);
    await axios.post(
      "https://cheapr.my.id/tracking/",
      {
        tracking_number: id,
        carrier: "FedEx",
        last_updated: "",
        activity_date: "",
        milestone_name: status,
        status: stts,
        location: "",
        est_delivery: "",
        address: destination,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  };
  const usps = async function ({ page, data: source }) {
    await optimizePage(page);
    await page.authenticate({ username: "cheapr", password: "Cheapr2023!" });
    let text = typeof source == "string" ? source.trim() : source.toString();
    await page.goto(
      `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${text}`,
      {
        waitUntil: "networkidle2",
      }
    );
    let status = "Pre-Shipment";
    // get banner
    await page.waitForSelector("h3.banner-header");
    let banner = await page.evaluate(() => {
      let el = document.querySelector("h3.banner-header");
      return el ? el.innerText : "";
    });
    let substrings = ["Label Created", "USPS Currently Awaiting Package"];
    if (!substrings.some((v) => banner.includes(v))) {
      // get estimated delivery
      await page.waitForSelector("p.tb-status");
      status = await page.evaluate(() => {
        let el = document.querySelector("p.tb-status");
        return el ? el.innerText : "";
      });
    }
    // get id
    await page.waitForSelector("span.tracking-number");
    let id = await page.evaluate(() => {
      let el = document.querySelector("span.tracking-number");
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
    let get_status = (text) => {
      if (text == "Delivered") {
        return "D";
      } else if (text == "Alert") {
        return "I";
      } else if (text == "Pre-Shipment") {
        return "N";
      } else {
        return "T";
      }
    };
    let stts = get_status(status);
    console.log(id, status);
    await axios.post(
      "https://cheapr.my.id/tracking/",
      {
        tracking_number: id,
        carrier: "USPS",
        last_updated: "",
        activity_date: "",
        milestone_name: status,
        status: stts,
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
  };
  // let tracks = ["1Z7V38144202758397", "1Z7V38144234218553"];
  let not_criteria = [];
  for (let i = 0; i < tracks.length; i++) {
    let data = tracks[i]["data"];
    for (let j = 0; j < data.length; j++) {
      if (data[j].startsWith("1Z")) {
        cluster.queue(data[j], ups);
      } else if (
        !data[j].startsWith("1Z") &&
        data[j].length >= 12 &&
        data[j].length <= 14
      ) {
        cluster.queue(data[j], fedex);
      } else if (!data[j].startsWith("1Z") && data[j].length >= 16) {
        cluster.queue(data[j], usps);
      } else {
        not_criteria.push(data[j]);
      }
    }
  }
  console.log(not_criteria);
  await cluster.idle();
  await cluster.close();
  await axios.patch(`https://cheapr.my.id/scraping_status/${pk}/`, {
    status: "COMPLETED",
  });
};

module.exports = {
  alltrackers,
};
