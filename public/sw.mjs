/* 
code mostly from ppt/tutorials
*/


import {
  keys,
  getMany,
  del,
} from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm";

const staticCacheName = "static-cache-v1";
const filesToCache = [
  "/",
  "/static/**/*",
  "manifest.json",
  "index.html",
  "offline.html",
  "404.html",
  "icon-192x192.png",
  "icon-256x256.png",
  "icon-384x384.png",
  "icon-512x512.png",
];

self.addEventListener("install", (event) => {
  console.log("Attempting to install service worker and cache static assets");
  event.waitUntil(
    caches.open(staticCacheName).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener("activate", (event) => {
  console.log("Activating new service worker...");

  const cacheWhitelist = [staticCacheName];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  //https://github.com/ilan-schemoul/meteor-service-worker/issues/23
  if (event.request.url.startsWith("http")) {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => {
          //pull everything from cache except getData
          //but if offline, getData is ok from cache
          if (response && !event.request.url.endsWith("getData")) {
            console.log("Found " + event.request.url + " in cache!");
            return response;
          } else if (
            event.request.url.endsWith("getData") &&
            !navigator.onLine
          ) {
            console.log(
              "Found " + event.request.url + " in cache while offline!"
            );
            return response;
          }
          return fetch(event.request).then((response) => {
            if (response.status === 404) {
              return caches.match("404.html");
            }
            return caches.open(staticCacheName).then((cache) => {
              console.log(">>> Caching: " + event.request.url);
              cache.put(event.request.url, response.clone());
              return response;
            });
          });
        })
        .catch((error) => {
          console.log("Error", event.request.url, error);
          return caches.match("offline.html");
        })
    );
  }
});

self.addEventListener("sync", function (event) {
  console.log("Background sync!", event);
  if (event.tag === "sync-new-items") {
    event.waitUntil(syncItems());
  } else if (event.tag === "sync-delete-items") {
    event.waitUntil(deleteItems());
  }
});

let syncItems = async function () {
  //entries() is not a function so i used keys() and getMany()
  keys().then((keys) => {
    console.log("Keys: ", keys);
    getMany(keys).then((entries) => {
      console.log("Entries: ", entries);
      entries.forEach((entry) => {
        if (entry.action === "add") {
          console.log("Entry add: ", entry);
          let body = {
            name: entry.newItem.name,
            expDate: entry.newItem.expDate.$d,
          };
          console.log("Body: ", body);
          fetch("/add", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          })
            .then(function (res) {
              if (res.ok) {
                res.json().then(function (data) {
                  console.log("Deleting from idb:", entry.newItem.name);
                  del("add-" + entry.newItem.name);
                });
              } else if (res.status === 409) {
                console.log("Name: ", entry.newItem.name, " already exists");
                del("add-" + entry.newItem.name);
              } else {
                console.log(res);
              }
            })
            .catch(function (error) {
              console.log(error);
            });
        }
      });
    });
  });
};

let deleteItems = async function () {
  //entries() is not a function so i used keys() and getMany()
  keys().then((keys) => {
    console.log("Keys: ", keys);
    getMany(keys).then((entries) => {
      console.log("Entries: ", entries);
      entries.forEach((entry) => {
        if (entry.action === "delete") {
          console.log("Entry delete: ", entry);
          fetch("/delete/" + entry.itemName, {
            method: "DELETE",
          })
            .then(function (res) {
              if (res.ok) {
                res.json().then(function (data) {
                  console.log("Deleting from idb:", entry.itemName);
                  del("delete-" + entry.itemName);
                });
              } else if (res.status === 404) {
                console.log("Name: ", entry.itemName, " not found");
                del("delete-" + entry.itemName);
              } else {
                console.log(res);
              }
            })
            .catch(function (error) {
              console.log(error);
            });
        }
      });
    });
  });
};

self.addEventListener("notificationclick", function (event) {
  let notification = event.notification;
  notification.close();
  console.log("notificationclick", notification);
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clis) {
        if (clis && clis.length > 0) {
          clis.forEach(async (client) => {
            await client.navigate(notification.data.redirectUrl);
            return client.focus();
          });
        } else if (clients.openWindow) {
          return clients
            .openWindow(notification.data.redirectUrl)
            .then((windowClient) =>
              windowClient ? windowClient.focus() : null
            );
        }
      })
  );
});

self.addEventListener("notificationclose", function (event) {
  console.log("notificationclose", event);
});

self.addEventListener("push", function (event) {
  console.log("push event", event);

  var data = { title: "title", body: "body", redirectUrl: "/" };

  if (event.data) {
    data = JSON.parse(event.data.text());
  }

  var options = {
    body: data.body,
    icon: "icon-192x192.png",
    badge: "icon-192x192.png",
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    data: {
      redirectUrl: data.redirectUrl,
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});
