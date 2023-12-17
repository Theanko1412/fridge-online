const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const app = express();
const axios = require("axios");
const webpush = require("web-push");
const publicPath = path.join(__dirname, "build");

app.use(express.static(publicPath));
app.use(express.json());

/* 
define file paths and lists to store data
 */
const dataFilePath = path.join(__dirname, "data.json");
const subsFilePath = path.join(__dirname, "subscriptions.json");

let items = [];
let subscriptions = [];
let aboutToExpireNotificationsSent = [];
let expiredNotificationsSent = [];


/* 
define bearer token for public upc api
*/
//TODO process env the token, doesnt matter now
const upcDatabaseToken = "09DF1B5CE1948D9B3200E80724FB987B";
if (!upcDatabaseToken) {
  console.error("UPC Database token not available.");
  return;
}

/* 
initial load of item and subscription data
*/
const loadData = async () => {
  try {
    const data = await fs.readFile(dataFilePath, "utf8");
    items = JSON.parse(data);
  } catch (error) {
    console.error("Error reading data from the file:", error);
  }
  try {
    const subs = await fs.readFile(subsFilePath, "utf8");
    subscriptions = JSON.parse(subs);
  } catch (error) {
    console.error("Error reading subscriptions from file:", error);
  }
};
loadData();

/* 
saving ingridients to data.json
*/
const saveData = async () => {
  try {
    await fs.writeFile(dataFilePath, JSON.stringify(items, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing data to the file:", error);
  }
};


/* 
backend endpoints
*/
//get all ingridients in the fridge
app.get("/getData", (req, res) => {
  res.json(items);
});

//add ingridient to the fridge
app.post("/add", (req, res) => {
  const newItem = req.body;

  //add only unique names
  const isNameUnique = items.every((item) => item.name !== newItem.name);

  if (!isNameUnique) {
    return res
      .status(409)
      .json({ success: false, message: "Name must be unique" });
  }

  items.push(newItem);
  saveData();

  res.json({ success: true, message: "Item added successfully" });
  sendNotification(newItem.name, "Item added!", "has been added to the fridge");
});

//delete ingridient from the fridge
app.delete("/delete/:name", (req, res) => {
  const itemName = req.params.name;

  const itemIndex = items.findIndex((item) => item.name === itemName);

  if (itemIndex !== -1) {
    items.splice(itemIndex, 1);
    saveData();

    res.json({ success: true, message: "Item deleted successfully" });
  } else {
    res.status(404).json({ success: false, message: "Item not found" });
  }
});

//proxy route to https://upcdatabase.org/api (max 100 calls(daily???) with given api key)
app.get("/proxy/:id", async (req, res) => {
  const upccode = req.params.id;

  try {
    const response = await axios.get(
      `https://api.upcdatabase.org/product/${upccode}`,
      {
        headers: {
          Authorization: `Bearer ${upcDatabaseToken}`,
        },
      }
    );
    res.header("Content-Type", "application/json");
    res.send(response.data);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//subscribe to notifications
app.post("/subscribe", (req, res) => {
  let sub = req.body;
  subscriptions.push(sub);
  try {
    fs.writeFile(subsFilePath, JSON.stringify(subscriptions, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing subscriptions to file:", error);
  }
  res.json({ success: true, message: "Subscription added successfully" });
});

// for any other route, redirect to 404.html
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "404.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


/* 
notifications
*/
function setVapidDetails() {
  webpush.setVapidDetails(
    "mailto:danko.curlin@fer.hr",
    // move to process.env
    "BJaqsXSb7G69vY1yNQdvdy7Njk2trEUzVZiRBabTQ_gMGgXHEAqfDeIhhWCQ5lkRkEuQk6MYVteTmzv_BV60EbY",
    "osaWnak4XjUiuHt6WIh0dj-pXOKIRwRA1ydRDLUIYa4"
  );
}

async function sendNotification(itemname, title, body) {
  setVapidDetails();

  subscriptions.forEach(async (sub) => {
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({
          title,
          body: `Your item ${itemname} ${body}`,
          redirectUrl: "/",
        })
      );
    } catch (error) {
      console.error("Error sending notification: ", error);
    }
  });
}

//logic when will ingridients expiry notifications be sent
//this function is called every 10 seconds with setInterval
setInterval(checkExpiryAndSendNotifications, 10000);

function checkExpiryAndSendNotifications() {
  const currentDate = new Date();
  items.forEach((item) => {
    const expDate = new Date(item.expDate);
    const timeDifference = expDate - currentDate;
    const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));

    if (daysDifference <= 2) {
      if (!aboutToExpireNotificationsSent.includes(item.name)) {
        if (expDate >= currentDate) {
          sendNotification(
            item.name,
            "Item is about to expire!",
            "is about to expire"
          );
          aboutToExpireNotificationsSent.push(item.name);
        }
      }
    }

    if (expDate < currentDate) {
      if (!expiredNotificationsSent.includes(item.name)) {
        sendNotification(item.name, "Item has expired!", "has expired");
        expiredNotificationsSent.push(item.name);
      }
    }
  });
}
