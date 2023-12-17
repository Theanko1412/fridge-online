# Fridge-online

## Description
This is a web application that allows users to keep track of the food in their fridge. Users can add items to their fridge, and remove them when they are used.
Application can send notifications to users when ingredients are added, expired or about to expire.

Application offers users to add items based on barcode, it will automatically fetch the name of the item. Initial idea was to use barcode scanner pwa api but its browser support is terrible, so I used regular input and api call instead.  

## Usage
Before running the application locally, make sure to override vars in code, currently hardcoded. (server.js file variables upcDatabaseToken, and setVapidDetails private and public tokens)

To run the application locally, run the following commands:
```
npm install
```
```
npm run build
```
```
node server.js
```

Or build docker image and run it:
```
docker build -t fridge-online .
```

Or 
```
npm run serve
```


## Features
Native-api (network-info) - just as demonstration, plan was to use barcode scanner api

Installable - PWA

Caching - all requests are cached and avaliable when offline

Offline - application is avaliable when offline, all requests are kept in indexeddb and sent when online

Background sync - all requests are sent when online

Push notifications - notifications are sent when item is added, expired or about to expire


## Some barcodes to test it out
```
4000539750007
7610400082549
5449000239280
5053990167845
8015997000201
5000159023283
```