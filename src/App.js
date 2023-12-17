import React, { useState, useEffect } from "react";
import {
  Button,
  Container,
  CssBaseline,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoIcon from "@mui/icons-material/Info";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { get, set } from "idb-keyval";
import CircleNotificationsIcon from "@mui/icons-material/CircleNotifications";
import VibrationIcon from '@mui/icons-material/Vibration';

const App = () => {
  const [items, setItems] = useState([]);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemExpDate, setNewItemExpDate] = React.useState(dayjs());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkInfoDialogOpen, setNetworkInfoDialogOpen] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [upcInput, setUpcInput] = useState("");
  const [upcResult, setUpcResult] = useState(null);
  const [notificationPerm, setNotificationPerm] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  /* native api implementation - network info
  displaying some random fields to demonstrate functionalty, can be tested with "info" button on the footer
   */
  const handleNetworkInfoClick = () => {
    if ("connection" in navigator) {
      const networkInformation = navigator.connection;
      setNetworkInfo({
        downlink: networkInformation.downlink,
        downlinkMax: networkInformation.downlinkMax,
        effectiveType: networkInformation.effectiveType,
        type: networkInformation.type,
      });
      setNetworkInfoDialogOpen(true);
    }
  };

  /* 
  used for 2 things: first displaying popup message immediately after user goes offline, not after refresh
  and second is to fetch data from backend once user goes online again
  the problem i had here is when user would add some items while offline, sw would pick it up once user goes online, data would be added but my page would not refresh
  so i couldnt force page refresh in any way so i decided to call fetchData() on state change with timeout of 1.5s so all calls can be processed and then fetchData will get newest data
  */
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      setTimeout(() => {
        if (navigator.onLine) {
          fetchData();
        }
      }, 1500);
    };
    fetchData();

    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOnlineStatus);

    return () => {
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
    };
  }, []);



  /* 
  all handlers - nothing special just state changes
  */
  const handleOnlineStatus = () => {
    setIsOnline(navigator.onLine);
  };
  const handleNetworkInfoDialogClose = () => {
    setNetworkInfoDialogOpen(false);
  };
  const handleDateChange = (date) => {
    setNewItemExpDate(date);
  };
  const handleAddClick = () => {
    setOpenAddDialog(true);
  };
  const handleAddDialogClose = () => {
    setOpenAddDialog(false);
    setNewItemName("");
    setNewItemExpDate("");
  };
  //more important handlers with logic, adding, deleting, UPC lookup
  const handleAddItem = async () => {
    const newItem = {
      name: newItemName,
      expDate: newItemExpDate,
    };

    try {
      //if browser supports background sync and sync manager add item with it else call immediately
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        const action = "add";
        const id = `${action}-${newItem.name}`;
        set(id, { action, newItem });

        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register("sync-new-items");

        console.log("Queued for sync: ", newItem);
        handleAddDialogClose();
        //calling fetch data with timeout so my page is refreshed after item is added
        setTimeout(() => {
          try {
            fetchData();
          } catch (error) {
            console.error("Error fetching data:", error);
          }
        }, 1500);
      } else {
        console.log("Your browser does not support background sync.");
        const response = await fetch("/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newItem),
        });

        const result = await response.json();
        console.log(result);

        if (result.success) {
          setItems((prevItems) => [...prevItems, newItem]);
        }
        handleAddDialogClose();
      }
    } catch (error) {
      console.error("Error handling add item:", error);
    }
  };

  //same logic as addItem
  const handleDeleteItem = async (itemName) => {
    try {
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        const action = "delete";
        const id = `${action}-${itemName}`;
        set(id, { action, itemName });

        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register("sync-delete-items");

        console.log("Queued for sync: ", itemName);
        handleAddDialogClose();
        setTimeout(() => {
          try {
            fetchData();
          } catch (error) {
            console.error("Error fetching data:", error);
          }
        }, 1500);
      } else {
        console.log("Your browser does not support background sync.");
        const response = await fetch(`/delete/${itemName}`, {
          method: "DELETE",
        });

        const result = await response.json();
        console.log(result);

        if (result.success) {
          setItems((prevItems) =>
            prevItems.filter((item) => item.name !== itemName)
          );
        }
      }
    } catch (error) {
      console.error("Error handling delete item:", error);
    }
  };

  //fetching data from upc database api
  const handleUpcLookup = async () => {
    try {
      //call my backend as proxy to outside because of cors
      const response = await fetch(`/proxy/${upcInput}`);
      const data = await response.text();
      //public api returning non json data sometimes so this is way to get around that, sometimes links dont have json key, only value
      const sanitizedResponse = data.replace(/\\+/g, "");
      const sanitizedResponseWithoutHttp = sanitizedResponse.replace(
        /(?:,|^)\s*\"[^"]*http[^"]*\"\s*(?:,|$)/g,
        ""
      );

      const dataJson = JSON.parse(sanitizedResponseWithoutHttp);
      console.log("Data title:", dataJson.title);

      if (!response.ok) {
        console.error(`Error: ${response.statusText}`);
        return;
      }

      if (dataJson && dataJson.title) {
        console.log(dataJson.title);

        if (dataJson.title) {
          //here we are setting both upcResult and newItemName so name field is autofilled
          setUpcResult({ title: dataJson.title });
          setNewItemName(dataJson.title);
        } else {
          console.error("No data title found for the given UPC.");
        }
      } else {
        console.error("UPC lookup was not successful.");
      }
    } catch (error) {
      console.error("Error fetching UPC data:", error);
    }
  };



  //function for fetching data from backend
  const fetchData = async () => {
    try {
      const response = await fetch("/getData"); // Use the new endpoint
      const data = await response.json();
      setItems(data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };



  //if browser supports notifications and user didnt click yes or no yet, display the poppup and set states for checkingl ater
  const grantNotificationPermission = async () => {
    if (
      !notificationPerm &&
      "serviceWorker" in navigator &&
      "Notification" in window
    ) {
      const permission = await window.Notification.requestPermission();
      console.log("Notification permission:", permission);

      //user clicked popup, permission is no logner default
      if (permission !== "default") {
        setNotificationPerm(true);

        //if he clicked yes, and he is not subscribed yet, subscribe him
        if (permission === "granted" && !isSubscribed) {
          await setupPushSubscription();
        }
      }
    } else {
      console.error(
        "Notifications not supported or permission already granted."
      );
    }
  };
  //call this function only once on mount
  useEffect(() => {
    grantNotificationPermission();
  }, []);

  //function for converting base64 string to Uint8Array
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);

    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  //function for subscribing user to push notifications
  const setupPushSubscription = async () => {
    try {
      let reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (sub === null) {
        //move to process.env
        let publicKey =
          "BJaqsXSb7G69vY1yNQdvdy7Njk2trEUzVZiRBabTQ_gMGgXHEAqfDeIhhWCQ5lkRkEuQk6MYVteTmzv_BV60EbY";
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        setIsSubscribed(true);
        localStorage.setItem("isSubscribed", "true");

        let res = await fetch("/subscribe", {
          method: "POST",
          body: JSON.stringify(sub),
          headers: {
            "content-type": "application/json",
          },
        });

        if (res.ok) {
          alert(
            "You will now receive notifications when your food is about to expire."
          );
        }
      } else {
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error("Error setting up push subscription:", error);
    }
  };



  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <CssBaseline />
      {/* usable space - notif, items */}
      <Container
        component="main"
        maxWidth="xs"
        style={{ flex: 1, marginBottom: "60px" }}
      >
        {/* if user is ofline display the message */}
        {!isOnline && (
          <div>
            <Alert severity="warning">
              You are offline. All actions will be processed once you go online
              again.
            </Alert>
          </div>
        )}
        {/* show fridge items */}
        <List>
          {items.map((item) => (
            <ListItem key={item.name}>
              <ListItemText
                primaryTypographyProps={{ align: "center" }}
                secondaryTypographyProps={{ align: "center" }}
                primary={item.name}
                secondary={`Exp Date: ${item.expDate}`}
              />
              <IconButton
                edge="end"
                aria-label="delete"
                style={{ color: "red", fontSize: "1rem" }}
                onClick={() => handleDeleteItem(item.name)}
              >
                <DeleteIcon />
              </IconButton>
            </ListItem>
          ))}
        </List>
      </Container>
      {/* app footer - some app buttons */}
      <AppBar
        position="fixed"
        color="primary"
        style={{ top: "auto", bottom: 0, height: "60px" }}
      >
        <Toolbar>
          <div style={{ width: "100%", textAlign: "center" }}>
            <>
              {/* add new item */}
              <Button
                variant="contained"
                color="success"
                onClick={handleAddClick}
              >
                <AddIcon />
              </Button>
              {/* show network info - native api */}
              <Button
                variant="contained"
                color="info"
                onClick={handleNetworkInfoClick}
              >
                <InfoIcon />
              </Button>
              {/* if users device accepts notifications AND he still didnt click yes or no display this item so popup *do you want notifications* apears */}
              {!notificationPerm &&
              "serviceWorker" in navigator &&
              "SyncManager" in window ? (
                <Button
                  variant="contained"
                  color="info"
                  onClick={grantNotificationPermission}
                >
                  <CircleNotificationsIcon />
                </Button>
              ) : ("serviceWorker" in navigator &&
                  "vibrate" in window &&
                // just display vibration button if backsync is not supported (couldnt find browser that would support vibration on mobile so its just demonstration)
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => navigator.vibrate(500)}
                >
                  <VibrationIcon />
                </Button>
              )}
            </>
          </div>
        </Toolbar>
      </AppBar>

      {/* popup for adding new item */}
      <Dialog open={openAddDialog} onClose={handleAddDialogClose}>
        <DialogTitle>Add New Item</DialogTitle>
        {/* user can input UPC number to get item name
        idea was to implement native scan barcode api but it is not supported on any of my browsers, so instead of changing whole idea about fridge, i decided to use just input field
         */}
        <DialogContent>
          <TextField
            label="UPC"
            variant="outlined"
            fullWidth
            margin="normal"
            value={upcInput}
            onChange={(e) => setUpcInput(e.target.value)}
          />
          {/* clicking lookup request is sent to backend /proxy and the to upc database api */}
          <Button variant="contained" color="primary" onClick={handleUpcLookup}>
            Lookup UPC
          </Button>
          {/* if lookup was successful autofill item name - can be changed */}
          <TextField
            label="Name"
            required="true"
            variant="outlined"
            fullWidth
            margin="normal"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          {/* date picker to choose when does the produc expire */}
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <StaticDatePicker
              // disableing past so user cant put expired food into the fridge
              disablePast
              displayStaticWrapperAs="desktop"
              value={newItemExpDate}
              onChange={handleDateChange}
              renderInput={(props) => (
                <TextField
                  name="Expiration Date"
                  {...props}
                  fullWidth
                  margin="normal"
                  variant="outlined"
                  disabled
                  value={newItemExpDate}
                />
              )}
            />
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAddDialogClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleAddItem} color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* popup for network info - native api*/}
      <Dialog
        open={networkInfoDialogOpen}
        onClose={handleNetworkInfoDialogClose}
      >
        <DialogTitle>Network Information</DialogTitle>
        <DialogContent>
          {/* if browser supports network info api it will display the button */}
          {networkInfo && (
            // showing some random fields, to demonstrate
            <div>
              <p>Downlink: {networkInfo.downlink} Mbps</p>
              <p>Downlink Max: {networkInfo.downlinkMax} Mbps</p>
              <p>Effective Type: {networkInfo.effectiveType}</p>
              <p>Connection Type: {networkInfo.type}</p>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleNetworkInfoDialogClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default App;
