const { Cluster } = require("puppeteer-cluster");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath, KnownDevices } = require("puppeteer");
const axios = require("axios");
const { optimizePage } = require("./utils");
const moment = require("moment");
const iPhone = KnownDevices["iPhone X"];

const PUPPETEER_OPTIONS = {
  headless: false,
  args: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-first-run",
    "--no-sandbox",
    "--no-zygote",
    "--proxy-server=dc.smartproxy.com:10000",
  ],
  executablePath: executablePath(),
  // userDataDir: "./user_data",
};
let get_status = (text) => {
  if (text == "Delivered") {
    return "D";
  } else if (
    text == "Delivery exception" ||
    text == "Shipment exception" ||
    text == "Delay" ||
    text == "Alert" ||
    text == "Returned"
  ) {
    return "I";
  } else if (
    text == "In Transit" ||
    text == "In Transit from Origin Processing" ||
    text == "Out For Delivery" ||
    text == "On the Way" ||
    text == "Moving Through Network" ||
    text == "Delivery Attempt" ||
    text == "Second Delivery Attempted" ||
    text == "Processing at Destination"
  ) {
    return "T";
  } else {
    return "N";
  }
};
const alltrackers = async (pk, tracks) => {
  puppeteer.use(StealthPlugin());
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 2,
    puppeteer: puppeteer,
    puppeteerOptions: PUPPETEER_OPTIONS,
    monitor: true,
    retryLimit: 3,
    retryDelay: 5000,
    timeout: 60000,
  });
  cluster.on("taskerror", (err, data, willRetry) => {
    if (willRetry) {
      console.warn(
        `Encountered an error while crawling ${data.src}. ${err.message}\nThis job will be retried`
      );
    } else {
      console.error(`Failed to crawl ${data.src}: ${err.message}`);
    }
  });
  const ups = async function ({ page, data: data }) {
    let { src, addr } = data;
    let text = typeof src == "string" ? src.trim() : src.toString();
    let url = `https://www.ups.com/track?loc=en_US&tracknum=${text}&requester=ST/trackdetails`;
    await optimizePage(page);
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
    await page.goto(
      `https://www.ups.com/track?loc=en_US&tracknum=${text}&requester=ST/trackdetails`
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
      let estDelivery = await page.evaluate(() => {
        let el = document.querySelector("track-details-estimation");
        return el ? el.innerText : "";
      });
      let status = "Delivered";
      let eta_date = null;
      let delivery_date = null;
      console.log(estDelivery);
      if (estDelivery && estDelivery.includes("Pick up")) {
        status = await page.evaluate(() => {
          let el = document.querySelector("tr.ups-progress_current_row > td");
          return el ? el.innerText.trim() : "";
        });
      } else if (
        estDelivery &&
        estDelivery.includes("Estimated delivery") &&
        !estDelivery.includes(
          "The delivery date will be provided as soon as possible"
        )
      ) {
        status = await page.evaluate(() => {
          let el = document.querySelector("tr.ups-progress_current_row > td");
          return el ? el.innerText.trim() : "";
        });
        let month_date = estDelivery
          ?.split(",")[1]
          .split("by")[0]
          .split("at")[0]
          .trim();
        eta_date = moment(month_date, "MMMM D").format("YYYY-MM-DD");
      } else if (estDelivery && estDelivery.includes("Delivered")) {
        status = await page.evaluate(() => {
          let el = document.querySelector("tr.ups-progress_current_row > td");
          return el ? el.innerText.trim() : "";
        });
        let month_date = estDelivery
          ?.split(",")[1]
          .split("by")[0]
          .split("at")[0]
          .trim();
        delivery_date = moment(month_date, "MMMM D").format("YYYY-MM-DD");
      }
      // get status delivery
      // get address
      let address = await page.evaluate(() => {
        let el = document.querySelector("#stApp_txtAddress");
        return el ? el.innerText : "";
      });
      // get address country
      console.log(address);
      let country = await page.evaluate(() => {
        let el = document.querySelector("#stApp_txtCountry");
        return el ? el.innerText : "";
      });
      console.log("#tab_1 clicked");
      // click view details
      // await page.waitForNavigation({ waitUntil: "networkidle2" });
      await page.evaluate(() => {
        let el = document.querySelector("#st_App_View_Details");
        el.click();
      });
      // click tab Shipment Progress
      await page.waitForSelector("#tab_1");
      await page.click("#tab_1");
      console.log(country);
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
        milestone = milestone?.split("\n");
        let milestone_name = milestone[0];
        let location = milestone[1];
        let status = get_status(milestone_name);
        let payload = {
          tracking_number: trackingNumber,
          carrier: "UPS",
          last_updated: lastUpdated,
          status: status,
          activity_date: activityDateTime,
          milestone_name: milestone_name,
          location: location,
          est_delivery: estDelivery,
          address: address + " " + country,
          src_address: addr,
        };
        if (eta_date) {
          payload = { ...payload, eta_date: eta_date };
        }
        if (delivery_date) {
          payload = { ...payload, delivery_date: delivery_date };
        }
        await axios
          .get(
            `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
          )
          .then(async function (response) {
            console.log(response.data);
            let results = response.data.results;
            if (results.length == 0) {
              await axios
                .post("https://cheapr.my.id/tracking/", payload, {
                  headers: {
                    "Content-Type": "application/json",
                  },
                })
                .then(function (response) {
                  console.log(response.data);
                })
                .catch(function (error) {
                  console.log(error.response.data);
                });
            } else {
              await axios
                .patch(
                  `https://cheapr.my.id/tracking/${results[0].pk}/`,
                  payload,
                  {
                    headers: {
                      "Content-Type": "application/json",
                    },
                  }
                )
                .then(function (response) {
                  console.log(response.data);
                })
                .catch(function (error) {
                  console.log(error.response.data);
                });
            }
          })
          .catch(function (error) {
            console.log(error.response.data);
          });
      } else {
        console.log("tracking Number not found!!!");
      }
    } else {
      let payload = {
        tracking_number: text,
        carrier: "UPS",
        last_updated: "",
        status: "N",
        activity_date: "",
        milestone_name: "",
        location: "",
        est_delivery: "",
        address: "",
        src_address: "",
      };
      await axios
        .get(
          `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
        )
        .then(async function (response) {
          console.log(response.data);
          let results = response.data.results;
          if (results.length == 0) {
            await axios
              .post("https://cheapr.my.id/tracking/", payload, {
                headers: {
                  "Content-Type": "application/json",
                },
              })
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          } else {
            await axios
              .patch(
                `https://cheapr.my.id/tracking/${results[0].pk}/`,
                payload,
                {
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              )
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          }
        })
        .catch(function (error) {
          console.log(error.response.data);
        });
    }
  };
  const fedex = async function ({ page, data: data }) {
    let { src, addr } = data;
    let text = typeof src == "string" ? src.trim() : src.toString();
    await optimizePage(page);
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
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
    // await page.waitForSelector(
    //   "trk-shared-shipment-delivery-status > div:nth-child(2)"
    // );
    let status = await page.evaluate(() => {
      let el = document.querySelector(
        "trk-shared-shipment-delivery-status > div:nth-child(2)"
      );
      return el ? el.innerText : "";
    });
    // get destination
    // await page.waitForSelector("div.shipment-status-progress-step");
    let destination = await page.$$eval(
      "div.shipment-status-progress-step",
      (elements) =>
        elements[elements.length - 1].querySelector("div > div:nth-child(4)")
          .textContent
    );
    // get eta
    let eta_date = null;
    let delivery_date = null;
    // await page.waitForSelector("span.deliveryDateTextBetween");
    let estDelivery = await page.evaluate(() => {
      let el = document.querySelector("span.deliveryDateTextBetween");
      return el ? el.innerText : "";
    });

    if (estDelivery) {
      let month_date = estDelivery?.split("by")[0].split("at")[0].trim();
      if (status.trim() == "Delivered") {
        delivery_date = moment(month_date, "M/D/YYYY").format("YYYY-MM-DD");
      } else {
        eta_date = moment(month_date, "M/D/YYYY").format("YYYY-MM-DD");
      }
    }

    let stts = get_status(status);
    let payload = {
      tracking_number: id,
      carrier: "FedEx",
      last_updated: "",
      activity_date: "",
      milestone_name: status,
      status: stts,
      location: "",
      est_delivery: "",
      address: destination,
      src_address: addr,
    };
    if (eta_date) {
      payload = { ...payload, eta_date: eta_date };
    }
    if (delivery_date) {
      payload = { ...payload, delivery_date: delivery_date };
    }
    await axios
      .get(
        `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
      )
      .then(async function (response) {
        console.log(response.data);
        let results = response.data.results;
        if (results.length == 0) {
          await axios
            .post("https://cheapr.my.id/tracking/", payload, {
              headers: {
                "Content-Type": "application/json",
              },
            })
            .then(function (response) {
              console.log(response.data);
            })
            .catch(function (error) {
              console.log(error.response.data);
            });
        } else {
          await axios
            .patch(`https://cheapr.my.id/tracking/${results[0].pk}/`, payload, {
              headers: {
                "Content-Type": "application/json",
              },
            })
            .then(function (response) {
              console.log(response.data);
            })
            .catch(function (error) {
              console.log(error.response.data);
            });
        }
      })
      .catch(function (error) {
        console.log(error.response.data);
      });
  };
  const usps = async function ({ page, data: data }) {
    let { src, addr } = data;
    let text = typeof src == "string" ? src.trim() : src.toString();
    await optimizePage(page);
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
    await page.goto(
      `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${text}`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    await page.waitForSelector("h3.banner-header");
    let [not_found] = await page.$x(
      '//h3[contains(text(),"Please provide a tracking number.")]'
    );
    if (!not_found) {
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

      // get date
      await page.waitForSelector("p.tb-date");
      let tb_date = await page.$$eval("p.tb-date", (elements) =>
        elements[0] ? elements[0].innerText : ""
      );
      let eta_day = await page.evaluate(() => {
        let el = document.querySelector("span.eta_snip:nth-child(1) .day");
        return el ? el.innerText : "";
      });
      console.log("eta_day: ", eta_day);
      let eta_snip = await page.$$eval(
        "span.eta_snip:nth-child(1)",
        (elements, eta_day) =>
          elements[0]
            ? elements[0].innerText
                .replace(eta_day, "")
                .replace("Expected Delivery Date", "")
                .replace("Expected", "")
                .replace(
                  "delivery on the date provided is the latest information on when",
                  ""
                )
                .replace(
                  "the Postal Service™ expects to deliver your package.",
                  ""
                )
                .trim()
            : "",
        [eta_day]
      );
      console.log("eta_snip: ", eta_snip);
      let stts = get_status(status);

      let eta_date = null;
      let delivery_date = null;
      if (status.trim() == "Delivered") {
        delivery_date = moment(tb_date.trim(), "MMMM D, YYYY").format(
          "YYYY-MM-DD"
        );
      }
      if (eta_snip) {
        try {
          eta_date = moment(eta_snip.trim(), "D MMMM YYYY").format(
            "YYYY-MM-DD"
          );
        } catch {
          (err) => {
            console.log("eta_snip error: ", eta_snip);
          };
        }
      } else {
        eta_date = null;
      }
      let payload = {
        tracking_number: id,
        carrier: "USPS",
        last_updated: "",
        activity_date: "",
        milestone_name: status,
        status: stts,
        location: "",
        est_delivery: "",
        address: "",
        src_address: addr,
        eta_date: eta_date,
      };
      if (status == "Delivered") {
        payload = { ...payload, delivery_date: delivery_date };
      }
      await axios
        .get(
          `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
        )
        .then(async function (response) {
          console.log(response.data);
          let results = response.data.results;
          if (results.length == 0) {
            await axios
              .post("https://cheapr.my.id/tracking/", payload, {
                headers: {
                  "Content-Type": "application/json",
                },
              })
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          } else {
            await axios
              .patch(
                `https://cheapr.my.id/tracking/${results[0].pk}/`,
                payload,
                {
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              )
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          }
        })
        .catch(function (error) {
          console.log(error.response.data);
        });
    } else {
      let payload = {
        tracking_number: text,
        carrier: "USPS",
        last_updated: "",
        activity_date: "",
        milestone_name: "Label Created, not yet in system",
        status: "N",
        location: "",
        est_delivery: "",
        address: "",
        src_address: addr,
      };
      await axios
        .get(
          `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
        )
        .then(async function (response) {
          console.log(response.data);
          let results = response.data.results;
          if (results.length == 0) {
            await axios
              .post("https://cheapr.my.id/tracking/", payload, {
                headers: {
                  "Content-Type": "application/json",
                },
              })
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          } else {
            await axios
              .patch(
                `https://cheapr.my.id/tracking/${results[0].pk}/`,
                payload,
                {
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              )
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          }
        })
        .catch(function (error) {
          console.log(error.response.data);
        });
    }
  };
  const cpc = async function ({ page, data: data }) {
    let { src, addr } = data;
    let text = typeof src == "string" ? src.trim() : src.toString();
    let url = `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${text}`;
    await optimizePage(page);
    await page.authenticate({
      username: "spb4pudldd",
      password: "2selBrep0w0TmcgL5Y",
    });
    await page.goto(
      `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${text}`,
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
    await page.waitForSelector("#search_result");
    let trackingNumber = await page.evaluate(() => {
      let el = document.querySelector("#search_result > span");
      return el ? el.innerText : "";
    });
    let [not_found] = await page.$x(
      '//span[contains(text(),"We didn’t find an item associated with this number")]'
    );
    if (!not_found) {
      let status = await page.evaluate(() => {
        let el = document.querySelector(
          "track-expected-delivery > div.ed_summary.ng-star-inserted > div > span:nth-child(1)"
        );
        return el ? el.innerText : "";
      });

      let milestone = await page.evaluate(() => {
        let el = document.querySelector(
          "#progressRow:nth-child(1) > td:nth-child(3) > div:nth-child(1)"
        );
        return el ? el.innerText : "";
      });
      // get estimated delivery
      await page.waitForSelector(
        "track-expected-delivery > div.ed_summary.ng-star-inserted > div > span:nth-child(2)"
      );
      let estDelivery = await page.evaluate(() => {
        let el = document.querySelector(
          "track-expected-delivery > div.ed_summary.ng-star-inserted > div > span:nth-child(2)"
        );
        return el ? el.innerText : "";
      });
      let stts = "N";
      let eta_date = null;
      let delivery_date = null;
      if (milestone.includes("Delivered")) {
        stts = "D";
      }
      if (milestone.includes("Electronic information submitted by shipper")) {
        stts = "N";
      }
      if (estDelivery && status.trim() == "Delivered") {
        delivery_date = moment(estDelivery?.split("at")[0].trim()).format(
          "YYYY-MM-DD"
        );
      } else if (
        !milestone.includes("Electronic information submitted by shipper") &&
        !estDelivery.includes("Item delayed")
      ) {
        eta_date = moment(estDelivery?.split(",")[1].trim(), "MMM. D").format(
          "YYYY-MM-DD"
        );
        stts = "T";
      } else if (estDelivery.includes("Item delayed")) {
        stts = "I";
      }
      if (trackingNumber !== "") {
        let payload = {
          tracking_number: trackingNumber,
          carrier: "CPC",
          last_updated: "",
          status: stts,
          activity_date: "",
          milestone_name: milestone,
          location: "",
          est_delivery: estDelivery,
          address: "",
          src_address: addr,
        };
        if (eta_date) {
          payload = { ...payload, eta_date: eta_date };
        }
        if (delivery_date) {
          payload = { ...payload, delivery_date: delivery_date };
        }
        await axios
          .get(
            `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
          )
          .then(async function (response) {
            console.log(response.data);
            let results = response.data.results;
            if (results.length == 0) {
              await axios
                .post("https://cheapr.my.id/tracking/", payload, {
                  headers: {
                    "Content-Type": "application/json",
                  },
                })
                .then(function (response) {
                  console.log(response.data);
                })
                .catch(function (error) {
                  console.log(error.response.data);
                });
            } else {
              await axios
                .patch(
                  `https://cheapr.my.id/tracking/${results[0].pk}/`,
                  payload,
                  {
                    headers: {
                      "Content-Type": "application/json",
                    },
                  }
                )
                .then(function (response) {
                  console.log(response.data);
                })
                .catch(function (error) {
                  console.log(error.response.data);
                });
            }
          })
          .catch(function (error) {
            console.log(error.response.data);
          });
      } else {
        console.log("tracking Number not found!!!");
      }
    } else {
      let payload = {
        tracking_number: text,
        carrier: "UPS",
        last_updated: "",
        status: "N",
        activity_date: "",
        milestone_name: "",
        location: "",
        est_delivery: "",
        address: "",
        src_address: "",
      };
      await axios
        .get(
          `https://cheapr.my.id/tracking/?tracking_number=${payload.tracking_number}`
        )
        .then(async function (response) {
          console.log(response.data);
          let results = response.data.results;
          if (results.length == 0) {
            await axios
              .post("https://cheapr.my.id/tracking/", payload, {
                headers: {
                  "Content-Type": "application/json",
                },
              })
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          } else {
            await axios
              .patch(
                `https://cheapr.my.id/tracking/${results[0].pk}/`,
                payload,
                {
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              )
              .then(function (response) {
                console.log(response.data);
              })
              .catch(function (error) {
                console.log(error.response.data);
              });
          }
        })
        .catch(function (error) {
          console.log(error.response.data);
        });
    }
  };
  // let tracks = ["1Z7V38144202758397", "1Z7V38144234218553"];
  let not_criteria = [];
  for (let i = 0; i < tracks.length; i++) {
    let data = tracks[i]["data"];
    for (let j = 0; j < data.length; j++) {
      if (data[j].startsWith("1Z")) {
        cluster.queue({ src: data[j], addr: tracks[i]["addr"] }, ups);
      } else if (
        !data[j].startsWith("1Z") &&
        !data[j].startsWith("LA") &&
        data[j].length >= 12 &&
        data[j].length <= 14
      ) {
        cluster.queue({ src: data[j], addr: tracks[i]["addr"] }, fedex);
      } else if (
        !data[j].startsWith("1Z") &&
        data[j].length >= 16 &&
        !data[j].startsWith("LA")
      ) {
        cluster.queue({ src: data[j], addr: tracks[i]["addr"] }, usps);
      } else if (
        data[j].startsWith("LA") ||
        data[j].startsWith("CA") ||
        data[j].length == 16
      ) {
        cluster.queue({ src: data[j], addr: tracks[i]["addr"] }, cpc);
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
