const moment = require("moment");

let estDelivery =
  "Delivered On\n\nMonday, February 27 at 12:22 P.M. at Receiver";
let month_date = estDelivery.split(",")[1].split("by")[0].split("at")[0].trim();
console.log(month_date);

eta = moment(month_date, "MMMM D");
console.log(eta);
