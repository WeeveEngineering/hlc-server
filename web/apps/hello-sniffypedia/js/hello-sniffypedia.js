/**
 * Copyright reelyActive 2019
 * We believe in an open Internet of Things
 */


// Constants
const SNIFFYPEDIA_BASE_URL = 'https://sniffypedia.org/';


// DOM elements
let cards = document.querySelector('#cards');


// Other variables
let devices = {};
let urls = {};


// Connect to the socket.io stream and feed to beaver
let baseUrl = window.location.protocol + '//' + window.location.hostname +
              ':' + window.location.port;
let socket = io.connect(baseUrl);
beaver.listen(socket, true);

// Non-disappearance events
beaver.on([ 0, 1, 2, 3 ], function(raddec) {
  let isNewDevice = !devices.hasOwnProperty(raddec.transmitterId);
  let isValidUrl = !isNewDevice &&
                   (devices[raddec.transmitterId].url !== null);

  if(isNewDevice) {
    devices[raddec.transmitterId] = { url: null };
  }

  if(!isValidUrl) {
    let url = determineUrl(raddec.packets);

    if(url) {
      let isNewUrl = !urls.hasOwnProperty(url);

      if(isNewUrl) {
        urls[url] = { count: 0 };
        cormorant.retrieveStory(url, function(story) {
          let card = document.createElement('div');
          card.setAttribute('class', 'card');
          card.setAttribute('id', url);
          cuttlefish.render(story, card);
          cards.appendChild(card);
        });
      }

      urls[url].count++;
      devices[raddec.transmitterId].url = url;
    }
  }
});

// Disappearance events
beaver.on([ 4 ], function(raddec) {
  let isExistingDevice = devices.hasOwnProperty(raddec.transmitterId);

  if(isExistingDevice) {
    let url = devices[raddec.transmitterId].url;
    let isValidUrl = url && urls.hasOwnProperty(url);

    if(isValidUrl) {
      urls[url].count--;
    }

    delete devices[raddec.transmitterId];
  }
});


// Determine the URL associated with the given device
function determineUrl(packets) {
  let identifiers = {
      uuid16: [],
      uuid128: [],
      companyIdentifiers: []
  };

  packets.forEach(function(packet) {
    parsePacketIdentifiers(packet, identifiers);
  });

  return lookupIdentifiers(identifiers);
}

// Parse the given packets, extracting all identifiers
// TODO: in future this will be handled server-side, just a stopgap for now
function parsePacketIdentifiers(packet, identifiers) {
  let isTooShort = (packet.length <= 16);

  if(isTooShort) {
    return identifiers;
  }

  let length = parseInt(packet.substr(2,2),16) % 64;
  let isInvalidLength = (packet.length !== ((length + 2) * 2));

  if(isInvalidLength) {
    return identifiers;
  }

  let data = packet.substr(16);
  let dataLength = data.length;
  let index = 0;

  while(index < dataLength) {
    let length = parseInt(data.substr(index,2), 16) + 1;
    let dataType = data.substr(index + 2, (length + 1) * 2);
    parseDataType(dataType, identifiers);
    index += (length * 2);
  }

  return identifiers;
}


// Parse the data type at the given index, extracting any identifier(s)
function parseDataType(dataType, identifiers) {
  let gapType = parseInt(dataType.substr(0,2), 16);
  let identifier = '';

  switch(gapType) {
    case 0x02: // Incomplete list of 16-bit UUIDs
    case 0x03: // Complete list of 16-bit UUIDs
      for(let cByte = 2; cByte > 0; cByte--) {
        identifier += dataType.substr(cByte * 2, 2);
      }
      identifiers.uuid16.push(identifier);
      break;
    case 0x06: // Incomplete list of 128-bit UUIDs
    case 0x07: // Complete list of 128-bit UUIDs
      for(let cByte = 16; cByte > 0; cByte--) {
        identifier += dataType.substr(cByte * 2, 2);
      }
      identifiers.uuid128.push(identifier);
      break;
    case 0xff: // Manufacturer specific data
      identifier = dataType.substr(4,2) + dataType.substr(2,2);
      identifiers.companyIdentifiers.push(identifier);
      break;
  }
}


// Lookup in the Sniffypedia index the given identifiers, return URL
function lookupIdentifiers(identifiers) {
  let route;

  // Company identifiers have lowest precedence
  identifiers.companyIdentifiers.forEach(function(companyIdentifier) {
    if(ble.companyIdentifiers.hasOwnProperty(companyIdentifier)) {
      route = ble.companyIdentifiers[companyIdentifier];
    }
  });

  identifiers.uuid128.forEach(function(uuid128) {
    if(ble.uuid128.hasOwnProperty(uuid128)) {
      route = ble.uuid128[uuid128];
    }
  });

  // 16-bit UUIDs have highest precedence
  identifiers.uuid16.forEach(function(uuid16) {
    if(ble.uuid16.hasOwnProperty(uuid16)) {
      route = ble.uuid16[uuid16];
    }
  });

  if(route) {
    return SNIFFYPEDIA_BASE_URL + route;
  }

  return null;
}
